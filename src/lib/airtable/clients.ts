import "server-only";

import { getRecordFresh, selectRecords, updateRecord, uploadAttachment } from "@/lib/airtable/client";
import { bizNoDigits, formatBizNo, type ClientDetail, type ClientSummary, type FileRef, type Photo, type SalesLog } from "@/lib/client-types";
import { fail, ok, type Result } from "@/lib/result";

/**
 * 거래처 화면. 대부분 읽기 전용 — 고치는 건 Airtable에서 한다.
 * 예외(2026-11-10): 세금계산서용 사업자 정보(등록번호·상호·대표·주소·업태·종목·계산서 이메일)와
 * 사업자등록증 파일은 포털에서 적고 올린다.
 * 거래처 `tblTGohUQYwkdLjpV` + 영업 일지 `tblDvGoZtQb6QTczD`(거래처(연결)로 묶임).
 * 지자체 영업일지는 거래처와 링크가 없어 여기 나오지 않는다(CLAUDE.md §3).
 * 명함 사진 주소는 몇 시간 뒤 만료되므로 캐시는 2분.
 */
const CLIENTS = "tblTGohUQYwkdLjpV";
const LOGS = "tblDvGoZtQb6QTczD";

const C = {
  name: "fld0oPJPMU58dpZfI", ceo: "fldUwuq6l2pDIaszU", phone: "fldP6ssHWD4iWgGqx", email: "fldL5BCJRm7AIczQr",
  address: "fldNjXVenLjW63kSm", kind: "fldDqCDekofMx7tQR", card: "fldyvQ9LuPf2Ykvoj", notes: "fldLrdUr1Eagy7u40",
  online: "fldXpeaxqRuZg9qcw", bizNo: "fldplgj7eMD2ajIfN", manager: "fldwCIYsWxtXTxoCV",
  cert: "fldfqam4DLeGQugjv", bizName: "fldR1TgJUB2gG4DM9", bizType: "fld17GYyEh1ZngEI5", bizItem: "fldGNpuOyo2WfjdnT",
  invoiceEmail: "fldhp1995PZKtGobV",
} as const;
const L = {
  date: "fldxip8UFNSkC1xDf", client: "fldQvCa7RjkD8Q4Id", author: "fldt425G5F7o0YfOK", visit: "fld13m3NHUwdS1hdo",
  purpose: "fldEMYZfdSbek8Aok", pain: "fldx5rcJyhsXmBZNE", request: "fldf0bJPDH7UR2Xqq", interest: "fldRUKWQ4jhSi7TaP",
  next: "fld26LYuetyJ8SisK", sent: "fldtDkB30PbJBcudh", misc: "fldmhVWFQAf8LFtKY",
} as const;

type Row = Record<string, unknown>;

const text = (v: unknown): string => {
  if (typeof v === "string") return v.trim();
  if (v && typeof v === "object" && "name" in v) return String((v as { name: unknown }).name ?? "").trim();
  return "";
};
const links = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
const photos = (v: unknown): Photo[] =>
  (Array.isArray(v) ? v : []).flatMap((a) => {
    const x = a as { url?: string; filename?: string; thumbnails?: { large?: { url?: string }; small?: { url?: string } } };
    return x?.url ? [{ url: x.url, thumb: x.thumbnails?.large?.url || x.thumbnails?.small?.url || x.url, filename: x.filename || "명함" }] : [];
  });
const files = (v: unknown): FileRef[] =>
  (Array.isArray(v) ? v : []).flatMap((a) => {
    const x = a as { id?: string; url?: string; filename?: string; type?: string; thumbnails?: { large?: { url?: string }; small?: { url?: string } } };
    if (!x?.url || !x.id) return [];
    const isPdf = x.type === "application/pdf" || /\.pdf$/i.test(x.filename || "");
    // PDF는 썸네일이 늦게 생긴다. 없으면 빈 문자열 — 화면이 'PDF' 표시로 대신한다.
    const thumb = x.thumbnails?.large?.url || x.thumbnails?.small?.url || (isPdf ? "" : x.url);
    return [{ id: x.id, url: x.url, thumb, filename: x.filename || "사업자등록증", isPdf }];
  });

async function readLogs(): Promise<(SalesLog & { clients: string[] })[]> {
  const rows = await selectRecords<Row>(LOGS, { fields: Object.values(L), revalidate: 120, byId: true });
  return rows.map(({ id, fields: f }) => ({
    id, clients: links(f[L.client]), date: text(f[L.date]), author: text(f[L.author]), visit: text(f[L.visit]),
    purpose: text(f[L.purpose]), pain: text(f[L.pain]), request: text(f[L.request]), interest: text(f[L.interest]),
    next: text(f[L.next]), misc: text(f[L.misc]), proposalSent: f[L.sent] === true,
  }));
}

async function readClients() {
  return selectRecords<Row>(CLIENTS, { fields: Object.values(C), revalidate: 120, byId: true });
}

function summary(id: string, f: Row, logs: SalesLog[]): ClientSummary {
  return {
    id, name: text(f[C.name]) || "이름 없는 거래처", kind: text(f[C.kind]), ceo: text(f[C.ceo]), manager: text(f[C.manager]),
    phone: text(f[C.phone]), address: text(f[C.address]), hasCard: photos(f[C.card]).length > 0,
    logCount: logs.length, lastLog: logs.reduce((m, l) => (l.date > m ? l.date : m), ""),
  };
}

const newestFirst = (a: SalesLog, b: SalesLog) => b.date.localeCompare(a.date);

export async function getClients(): Promise<Result<ClientSummary[]>> {
  try {
    const [clients, logs] = await Promise.all([readClients(), readLogs()]);
    const byClient = new Map<string, SalesLog[]>();
    for (const log of logs) for (const c of log.clients) byClient.set(c, [...(byClient.get(c) ?? []), log]);
    const list = clients.map(({ id, fields }) => summary(id, fields, byClient.get(id) ?? []));
    // 최근에 영업한 곳이 위로. 기록이 없으면 이름순.
    list.sort((a, b) => b.lastLog.localeCompare(a.lastLog) || a.name.localeCompare(b.name, "ko"));
    return ok(list);
  } catch (e) {
    return fail(e instanceof Error ? e.message : "거래처를 불러오지 못했다");
  }
}

export async function getClient(id: string): Promise<Result<ClientDetail | null>> {
  if (!/^rec[A-Za-z0-9]{14}$/.test(id)) return ok(null);
  try {
    const [clients, logs] = await Promise.all([readClients(), readLogs()]);
    const row = clients.find((r) => r.id === id);
    if (!row) return ok(null);
    const f = row.fields;
    const mine = logs.filter((l) => l.clients.includes(id)).sort(newestFirst);
    return ok({
      ...summary(id, f, mine), email: text(f[C.email]), bizNo: text(f[C.bizNo]), notes: text(f[C.notes]),
      online: f[C.online] === true, cards: photos(f[C.card]), logs: mine,
      bizName: text(f[C.bizName]), bizType: text(f[C.bizType]), bizItem: text(f[C.bizItem]),
      invoiceEmail: text(f[C.invoiceEmail]), certs: files(f[C.cert]).reverse(), // 최근에 올린 것이 앞
    });
  } catch (e) {
    return fail(e instanceof Error ? e.message : "거래처를 불러오지 못했다");
  }
}

export type TaxInput = { bizNo: string; bizName: string; ceo: string; address: string; bizType: string; bizItem: string; invoiceEmail: string };

/** 세금계산서용 사업자 정보 저장. 대표자·주소는 거래처의 원래 칸(하나뿐인 원천)을 그대로 고친다. 빈 칸은 null로 비운다. */
export async function saveTaxInfo(id: string, input: TaxInput): Promise<Result<null>> {
  try {
    const v = (s: string) => s || null;
    const digits = bizNoDigits(input.bizNo);
    await updateRecord<Row>(CLIENTS, id, {
      [C.bizNo]: v(digits.length === 10 ? formatBizNo(digits) : input.bizNo), [C.bizName]: v(input.bizName), [C.ceo]: v(input.ceo),
      [C.address]: v(input.address), [C.bizType]: v(input.bizType), [C.bizItem]: v(input.bizItem), [C.invoiceEmail]: v(input.invoiceEmail),
    });
    return ok(null);
  } catch (e) {
    return fail(e instanceof Error ? e.message : "저장하지 못했다");
  }
}

/** 사업자등록증 파일을 붙인다(사진·PDF). 원래 있던 파일 뒤에 더해진다. */
export async function addBizCert(id: string, file: File): Promise<Result<null>> {
  try {
    await uploadAttachment(CLIENTS, id, C.cert, file);
    return ok(null);
  } catch (e) {
    return fail(e instanceof Error ? e.message : "올리지 못했다");
  }
}

/** 잘못 올린 사업자등록증 하나를 뺀다. 남길 파일의 id만 다시 보낸다(Airtable 첨부 규칙). */
export async function removeBizCert(id: string, attachmentId: string): Promise<Result<null>> {
  try {
    const rec = await getRecordFresh<Row>(CLIENTS, id, true);
    if (!rec) return fail("거래처를 찾지 못했다");
    const keep = files((rec.fields as Row)[C.cert]).filter((x) => x.id !== attachmentId).map((x) => ({ id: x.id }));
    await updateRecord<Row>(CLIENTS, id, { [C.cert]: keep.length ? keep : null });
    return ok(null);
  } catch (e) {
    return fail(e instanceof Error ? e.message : "빼지 못했다");
  }
}

export const clientAirtableUrl = (id: string) => `https://airtable.com/appzLstFHtHcQlWSu/${CLIENTS}/${id}`;
