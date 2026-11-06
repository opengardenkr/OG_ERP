import "server-only";

import { selectRecords } from "@/lib/airtable/client";
import type { ClientDetail, ClientSummary, Photo, SalesLog } from "@/lib/client-types";
import { fail, ok, type Result } from "@/lib/result";

/**
 * 거래처 화면. 읽기 전용 — 고치는 건 아직 Airtable에서 한다.
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
    });
  } catch (e) {
    return fail(e instanceof Error ? e.message : "거래처를 불러오지 못했다");
  }
}

export const clientAirtableUrl = (id: string) => `https://airtable.com/appzLstFHtHcQlWSu/${CLIENTS}/${id}`;
