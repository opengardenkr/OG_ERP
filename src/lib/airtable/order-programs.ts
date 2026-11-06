import "server-only";

import type { MemberName } from "@/config/users";
import {
  createRecord, deleteRecord, getRecord, getRecordFresh, selectRecords, selectRecordsFresh, updateRecord, updateRecords,
} from "@/lib/airtable/client";
import {
  SUPPLIER_INFO, linkUrl, newLinkId, programPayloads, supplierByLabel, supplierOfGroup,
  type OrderGroup, type ProgramInput, type Selection, type Supplier,
} from "@/lib/order";
import {
  changeSummary, deductions, isFromLink, isManagedPayload, isPickerPayload, latestRevision, nextRevisionNo, quoteTotals, mergeLines, nextQuoteNo, orderTotal, orderedLines,
  parsePayload, parseSelection, payloadKeys, quoteSummary, refreshStock, seoulParts, stockKey,
  type EditLine, type LinkPayload, type OrderedLine,
} from "@/lib/order-program";
import { fail, ok, type Result } from "@/lib/result";
import { isSale, memoLine, prependMemo } from "@/lib/sales";

/**
 * 주문서(폴더)의 Airtable 경계.
 * 읽기: [영업] 주문서·[영업] 주문 링크·견적요청·견적서 발송 내역·라인업 4표(재고).
 * 쓰기: 주문서·주문 링크(품목·재고 동기화), 견적서 발송 내역(합산 견적 초안, 합친 초안 삭제함, 재고차감 시각),
 *       견적요청(견적서 초안 번호), 라인업 재고(수주 건 차감).
 * 필드는 ID로 부른다.
 */
const PROGRAMS = "tblCQzs3h453k911L"; // [영업] 주문서
const P = {
  name: "fldpkan9Y2YPm8kN9", status: "fldMyyuslFTwplwoX", items: "fldcMaKXHYYkW9ykt", selection: "fldT6jzNsuXJrfzr1",
  min: "fldC59ngAVAQ1DHRA", memo: "fldtKjMLeGZotXcTj", author: "fldV30NasryPsLfBK", note: "fldwSLvf7c38bveiL",
  modified: "fldPOuyEaEEWba151", supplier: "fldBjhYAiFOwXMzsA",
} as const;
const LINKS = "tbl93mrTsG1IsuFxQ"; // [영업] 주문 링크
const L = {
  id: "fldQCUWu9EOsbUiYh", title: "fldYfnhpKeszp9cQz", customer: "fldL7PcPMwAPfwJGu", phone: "fldiCkG6ut9h4O1Yv",
  items: "fldNQStXwVIQUHwwj", min: "fldhAQfABDEOjzb6Q", date: "flda0UPGBrXXhMRey", status: "fldwdqHacxGXwd6RT",
  author: "fldCVKViUNzQmuz19", memo: "fldt7o3g960vHTY2n", created: "fldX0AInVBF36L2lN", program: "fldGgMavCb01XxSBr",
  merged: "fldPBQSbr96ELJTIV",
} as const;
const REQUESTS = "tbllSGZWApKiMTNOK"; // 견적요청
const R = {
  no: "fldNOX7urTPifKrQf", who: "fldB2XhLjxxE5tHwx", memo: "fldNfM5HhjGT7Cdn7", json: "fldHLiEeCJRzfp0yw",
  status: "fldVZX9fp6ChmgYWP", at: "fldC1SMCKpKxqFGSx", phone: "fldxTgnEjQoJe02px", draft: "fldieREm87JD71wdA",
} as const;
const QUOTES = "tblj74vsSha7drqmj"; // 견적서 발송 내역
const Q = {
  number: "fldarqONAT0cvnlBc", issued: "fldtUJengZES1OG7a", at: "fldpFn5uuyn2ZqvLJ", author: "fldqoY2KHfFtg6HDR",
  revision: "fldBCiQRajD0cGraA", kind: "fldFtayOXs55xDwiq", count: "fldrJtvyQP6gPS1Cr", qty: "fldeW4RUyREuc2AER",
  supply: "fld70Zouk4tTQiew5", vat: "flddcbJgp1GHtYhDF", total: "fldskak7i2iuJOY8r", status: "fldMMWnoJNwVCeKvp",
  tax: "fldPash3mrMiuiIzq", taxReason: "flduifR1snmKhjfKQ", deal: "fldN2wuhNA6pXh3as", valid: "fld9Bb4HCympMYbsE",
  snap: "fldqTH5ObhUM1Hbei", items: "fld11Vy38j2SZgqIf", summary: "fld8BN5izEMtiJ6p6", remarks: "fldlnG4qhBzkhqsgH",
  company: "fldMruU9RhDA44EyD", person: "fldtinVuZGVJRmSPB", phone: "fld1Wn6pq9yiqEvFy", memo: "fldLHric3VonWTZNI",
  deleted: "fldUDwBfzwcnftVsa", deletedBy: "fldea1Ig4sqNSdtw1", deletedAt: "fldHrVPSYs8vWlCpV", deletedReason: "fldDzdTDIuDO4h9y3",
  deducted: "fld85qjebOSrZxPEH", source: "fldlXLdC4aMPZBF6I", shipment: "fldTXyNhrTdftt33A",
} as const;
/** 라인업 재고 칸. 주문 화면(order.ts)과 같은 칸이다. */
const STOCK: Record<OrderGroup, { table: string; field: string }> = {
  immediate: { table: "tblDMLlaBwkW1NfhU", field: "fldNMlilMRReYM5tn" },
  preorder: { table: "tblylbZq6PLfzH1Ol", field: "fldWsbfXjYE4al0rQ" },
  hoogenraad: { table: "tblVVRTKfyViCI1aW", field: "fldXhGrdwcxMMFQhF" },
  hbm: { table: "tblm8bjSeDCflcIzk", field: "fldKw75cYWnc4nSuW" },
};

type Row = Record<string, unknown>;
const text = (v: unknown) => (typeof v === "string" ? v.trim() : v && typeof v === "object" && "name" in v ? String((v as { name: unknown }).name).trim() : "");
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
const ids = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
const message = (e: unknown, fallback: string) => (e instanceof Error ? e.message : fallback);
const REC = /^rec[A-Za-z0-9]{14}$/;

// ── 읽기 ──────────────────────────────────────────────

export type LinkInfo = {
  recId: string; linkId: string; url: string; title: string; customer: string; phone: string; status: string; created: string;
  program: string; merged: string; managed: boolean;
};
export type OrderInfo = { id: string; no: string; at: string; who: string; total: number; draft: string; lines: OrderedLine[] };

function toLink(id: string, f: Row): LinkInfo {
  const linkId = text(f[L.id]);
  return {
    recId: id, linkId, url: linkUrl(linkId), title: text(f[L.title]), customer: text(f[L.customer]), phone: text(f[L.phone]),
    status: text(f[L.status]) || "사용", created: text(f[L.created]).slice(0, 10), program: ids(f[L.program])[0] ?? "",
    merged: text(f[L.merged]), managed: isManagedPayload(parsePayload(f[L.items])),
  };
}

const LINK_FIELDS = [L.id, L.title, L.customer, L.phone, L.status, L.created, L.program, L.merged, L.items];
const readLinks = () => selectRecords<Row>(LINKS, { fields: LINK_FIELDS, revalidate: 30, byId: true });
const readPrograms = () => selectRecords<Row>(PROGRAMS, { fields: [P.name, P.status, P.items, P.modified, P.supplier], revalidate: 30, byId: true });

/** 업체 칸이 비어 있으면(옛 줄) 품목으로 짐작한다: 라인업 그룹, 없으면 크레이트 행이 있으면 HBM. */
function supplierOf(f: Row): Supplier | null {
  const set = supplierByLabel(text(f[P.supplier]));
  if (set) return set;
  const p = parsePayload(f[P.items]);
  if (p?.src === "hg-pool") return "hoogenraad"; // 호게나르드 DM 공동주문 품목을 웹이 직접 읽는다
  const g = p?.items.find((it) => typeof it.group === "string")?.group;
  if (g) return supplierOfGroup(g);
  return p?.items.some((it) => it.rows.some((r) => Number.isInteger(r[4]) && (r[4] as number) > 0)) ? "hbm" : null;
}

/** 링크로 들어온 주문만 남긴다(요청사항이 `[주문 링크 ` 로 시작). */
async function readOrders(fresh = false): Promise<(OrderInfo & { memo: string })[]> {
  const query = { fields: [R.no, R.who, R.memo, R.json, R.at, R.draft], byId: true };
  const rows = fresh ? await selectRecordsFresh<Row>(REQUESTS, query) : await selectRecords<Row>(REQUESTS, { ...query, revalidate: 60 });
  return rows.flatMap((r) => {
    const memo = text(r.fields[R.memo]);
    if (!memo.startsWith("[주문 링크 ")) return [];
    const lines = orderedLines(text(r.fields[R.json]));
    return [{ id: r.id, no: text(r.fields[R.no]), at: text(r.fields[R.at]), who: text(r.fields[R.who]), memo, total: orderTotal(lines), draft: text(r.fields[R.draft]), lines }];
  });
}

type QuoteLite = { id: string; number: string; status: string; deleted: boolean; total: number; deducted: string; at: string; lines: EditLine[]; memo: string };
async function readQuoteList(fresh = false): Promise<(QuoteLite & { fields: Row })[]> {
  const fields = Object.values(Q);
  const rows = fresh ? await selectRecordsFresh<Row>(QUOTES, { fields, byId: true }) : await selectRecords<Row>(QUOTES, { fields: [Q.number, Q.status, Q.deleted, Q.total, Q.deducted, Q.at, Q.items, Q.memo], revalidate: 60, byId: true });
  return rows.map((r) => ({
    id: r.id, number: text(r.fields[Q.number]), status: text(r.fields[Q.status]), deleted: r.fields[Q.deleted] === true,
    total: num(r.fields[Q.total]), deducted: text(r.fields[Q.deducted]), at: text(r.fields[Q.at]), fields: r.fields,
    lines: quoteLines(r.fields), memo: text(r.fields[Q.memo]),
  }));
}

/** 견적 품목JSON → 줄 */
function quoteLines(f: Row): EditLine[] {
  try {
    const data = JSON.parse(text(f[Q.items]) || "{}") as { items?: Partial<EditLine>[] };
    return (data.items ?? []).map((l) => ({ name: String(l.name ?? ""), spec: String(l.spec ?? ""), qty: Number(l.qty) || 0, price: Number(l.price) || 0 }));
  } catch {
    return [];
  }
}

/** 라인업 재고. 키 = group:rec. 비어 있으면 null. */
async function readStock(keys: string[], fresh: boolean): Promise<Map<string, number | null>> {
  const byGroup = new Map<OrderGroup, string[]>();
  for (const k of keys) {
    const [group, rec] = k.split(":") as [OrderGroup, string];
    if (!STOCK[group] || !REC.test(rec)) continue;
    byGroup.set(group, [...(byGroup.get(group) ?? []), rec]);
  }
  const out = new Map<string, number | null>();
  for (const [group, recs] of byGroup) {
    for (let i = 0; i < recs.length; i += 40) {
      const chunk = recs.slice(i, i + 40);
      const query = { fields: [STOCK[group].field], filterByFormula: `OR(${chunk.map((id) => `RECORD_ID()='${id}'`).join(",")})`, byId: true };
      const rows = fresh ? await selectRecordsFresh<Row>(STOCK[group].table, query) : await selectRecords<Row>(STOCK[group].table, { ...query, revalidate: 60 });
      for (const r of rows) {
        const v = r.fields[STOCK[group].field];
        out.set(stockKey(group, r.id), typeof v === "number" && Number.isFinite(v) ? Math.floor(v) : null);
      }
    }
  }
  return out;
}

/** 링크 화면에 보일 재고: 0 이하는 null(재고 표시 없음) — 주문 화면과 같은 규칙. */
const shownStock = (m: Map<string, number | null>) => new Map([...m].map(([k, v]) => [k, v !== null && v > 0 ? v : null]));

export type ProgramSummary = { id: string; supplier: Supplier | null; name: string; status: string; items: number; links: number; orders: number; amount: number; modified: string };

export async function listPrograms(): Promise<Result<{ programs: ProgramSummary[]; loose: LinkInfo[] }>> {
  try {
    const [programs, links, orders] = await Promise.all([readPrograms(), readLinks(), readOrders()]);
    const linkInfos = links.map((r) => toLink(r.id, r.fields));
    const list = programs.map((r): ProgramSummary => {
      const mine = linkInfos.filter((l) => l.program === r.id);
      const got = orders.filter((o) => mine.some((l) => isFromLink(o.memo, l.linkId)));
      return {
        id: r.id, supplier: supplierOf(r.fields), name: text(r.fields[P.name]) || "이름 없는 주문서", status: text(r.fields[P.status]) || "사용",
        items: parsePayload(r.fields[P.items])?.items.length ?? 0, links: mine.length, orders: got.length,
        amount: got.reduce((a, o) => a + o.total, 0), modified: text(r.fields[P.modified]),
      };
    });
    list.sort((a, b) => Number(a.status === "보관") - Number(b.status === "보관") || b.modified.localeCompare(a.modified));
    return ok({ programs: list, loose: linkInfos.filter((l) => !l.program && l.status !== "마감") });
  } catch (e) {
    return fail(message(e, "주문서를 불러오지 못했다"));
  }
}

export type ProgramItem = { k: string; group: OrderGroup | ""; rec: string; grp: string; name: string; latin: string; unit: string; rows: { size: string; price: number; prefill: number; stock: number | string | null; pack: number }[] };
export type LinkDetail = LinkInfo & {
  orders: OrderInfo[]; amount: number;
  quote: { id: string; number: string; status: string; total: number; deducted: string; canDeduct: boolean; canEdit: boolean; lines: EditLine[]; changes: string[] } | null;
};
export type ProgramDetail = { id: string; supplier: Supplier | null; name: string; status: string; min: number; memo: string; note: string; editable: boolean; source: string; items: ProgramItem[]; links: LinkDetail[] };

export async function getProgram(id: string): Promise<Result<ProgramDetail | null>> {
  if (!REC.test(id)) return ok(null);
  try {
    const rec = await getRecord<Row>(PROGRAMS, id, 30, true);
    if (!rec) return ok(null);
    const f = rec.fields as Row;
    const payload = parsePayload(f[P.items]) ?? { v: 1 as const, items: [] };
    // 손으로 만든 주문서(사진·크레이트·"9,360+" 같은 재고 글자)는 적힌 재고를 그대로 둔다 — 라인업 재고 칸이 비어 있어 덮으면 사라진다
    const picker = isPickerPayload(payload);
    const [links, orders, quotes, stock] = await Promise.all([readLinks(), readOrders(), readQuoteList(), picker ? readStock(payloadKeys(payload), false) : Promise.resolve(new Map<string, number | null>())]);
    const live = shownStock(stock);
    // 손으로 만든 주문서는 재고 칸에 "9,360+" 같은 글자가 들어 있기도 하다 — 그대로 보여 준다
    const items: ProgramItem[] = payload.items.map((it) => ({
      k: it.k, group: it.group ?? "", rec: it.rec ?? "", grp: it.grp, name: it.name, latin: String(it.latin ?? ""), unit: String(it.unit ?? ""),
      rows: it.rows.map((r) => ({
        size: String(r[0]), price: Number(r[2]) || 0, prefill: Number(r[3]) || 0, pack: Number.isInteger(r[4]) ? (r[4] as number) : 0,
        stock: live.has(stockKey(it.group, it.rec)) ? live.get(stockKey(it.group, it.rec))! : typeof r[1] === "number" || typeof r[1] === "string" ? r[1] : null,
      })),
    }));
    const mine = links.map((r) => toLink(r.id, r.fields)).filter((l) => l.program === id)
      .sort((a, b) => b.created.localeCompare(a.created))
      .map((l): LinkDetail => {
        const got = orders.filter((o) => isFromLink(o.memo, l.linkId)).sort((a, b) => b.at.localeCompare(a.at));
        const q = l.merged ? latestRevision(quotes.filter((x) => !x.deleted), l.merged) : null;
        return {
          ...l, orders: got, amount: got.reduce((a, o) => a + o.total, 0),
          quote: q ? {
            id: q.id, number: q.number, status: q.status, total: q.total, deducted: q.deducted, canDeduct: isSale(q.status) && !q.deducted,
            canEdit: !isSale(q.status) && !q.deducted, lines: q.lines,
            // 같은 견적 묶음(기준 번호·수정본)의 '주문변경' 기록, 최신이 위
            changes: quotes.filter((x) => x.number === l.merged || x.number.startsWith(`${l.merged}-R`))
              .flatMap((x) => x.memo.split("\n")).filter((m) => m.includes(" · 주문변경 · ")).sort().reverse().slice(0, 5),
          } : null,
        };
      });
    return ok({
      id, supplier: supplierOf(f), name: text(f[P.name]) || "이름 없는 주문서", status: text(f[P.status]) || "사용", min: num(f[P.min]),
      memo: text(f[P.memo]), note: text(f[P.note]), editable: !payload.src && (payload.items.length === 0 || isPickerPayload(payload)), source: typeof payload.src === "string" ? payload.src : "", items, links: mine,
    });
  } catch (e) {
    return fail(message(e, "주문서를 불러오지 못했다"));
  }
}

/** 주문 화면에서 다시 고칠 때: 이름·조건·선택 상태 */
export async function getProgramSelection(id: string): Promise<{ name: string; supplier: Supplier | null; minOrder: number; memo: string; selection: Selection | null; editable: boolean } | null> {
  if (!REC.test(id)) return null;
  const rec = await getRecordFresh<Row>(PROGRAMS, id, true);
  if (!rec) return null;
  const f = rec.fields as Row;
  const payload = parsePayload(f[P.items]);
  return {
    name: text(f[P.name]), supplier: supplierOf(f), minOrder: num(f[P.min]), memo: text(f[P.memo]), selection: parseSelection(f[P.selection]),
    editable: !payload?.src && (!payload?.items.length || isPickerPayload(payload)),
  };
}

// ── 쓰기 ──────────────────────────────────────────────

const today = () => seoulParts(new Date()).ymd;

/** 주문서의 품목을 지금 재고로 다시 써서 묶인 링크 전부에 넣는다(공동수입처럼 웹이 직접 읽는 링크는 빼고). */
async function syncLinks(programId: string, payload: LinkPayload, extra: { min?: number; memo?: string } = {}) {
  const links = (await selectRecordsFresh<Row>(LINKS, { fields: LINK_FIELDS, byId: true }))
    .map((r) => toLink(r.id, r.fields)).filter((l) => l.program === programId && l.managed);
  const body = JSON.stringify(payload);
  await updateRecords<Row>(LINKS, links.map((l) => ({
    id: l.recId,
    fields: {
      [L.items]: body, [L.date]: today(),
      ...(extra.min !== undefined ? { [L.min]: extra.min || null } : {}),
      ...(extra.memo !== undefined ? { [L.memo]: extra.memo || null } : {}),
    },
  })));
  return links.length;
}

export async function saveProgram(input: ProgramInput, author: MemberName): Promise<{ id: string; links: number }> {
  if (JSON.stringify(input.lines).length > 80_000) throw new Error("품목이 너무 많습니다. 주문서를 나눠 주세요.");
  const { items, selection } = programPayloads(input);
  const fresh = refreshStock(items as LinkPayload, shownStock(await readStock(payloadKeys(items as LinkPayload), true)));
  const fields = {
    [P.name]: input.name, [P.items]: JSON.stringify(fresh), [P.selection]: JSON.stringify(selection),
    [P.min]: input.minOrder || null, [P.memo]: input.memo || null, [P.supplier]: SUPPLIER_INFO[input.supplier].label,
  };
  if (!input.id) {
    const rec = await createRecord<Row>(PROGRAMS, { ...fields, [P.status]: "사용", [P.author]: author });
    return { id: rec.id, links: 0 };
  }
  const exists = await getRecordFresh<Row>(PROGRAMS, input.id, true);
  if (!exists) throw new Error("주문서를 찾지 못했습니다. 새로고침해 주세요.");
  const before = parsePayload((exists.fields as Row)[P.items]);
  if (before?.src) throw new Error("웹사이트가 품목을 직접 읽는 주문서(공동수입)라 여기서 고치지 않습니다. 품목은 호게나르드 DM의 공동주문 칸으로 고릅니다.");
  if (before?.items.length && !isPickerPayload(before)) {
    throw new Error("사진·크레이트를 손으로 넣은 주문서라 이 화면에서 고치면 그 정보가 사라집니다. 새 주문서로 저장해 주세요.");
  }
  await updateRecord<Row>(PROGRAMS, input.id, fields);
  return { id: input.id, links: await syncLinks(input.id, fresh, { min: input.minOrder, memo: input.memo }) };
}

/** 재고만 새로 읽어 주문서와 링크에 반영 */
export async function refreshProgram(programId: string): Promise<Result<number>> {
  try {
    const rec = await getRecordFresh<Row>(PROGRAMS, programId, true);
    const payload = rec ? parsePayload((rec.fields as Row)[P.items]) : null;
    if (!rec || !payload) return fail("주문서를 찾지 못했습니다.");
    if (!isPickerPayload(payload)) return ok(0); // 손으로 만든·공동수입 주문서는 재고를 적힌 대로 둔다
    const fresh = refreshStock(payload, shownStock(await readStock(payloadKeys(payload), true)));
    await updateRecord<Row>(PROGRAMS, programId, { [P.items]: JSON.stringify(fresh) });
    return ok(await syncLinks(programId, fresh));
  } catch (e) {
    return fail(message(e, "재고를 반영하지 못했다"));
  }
}

export async function setProgramStatus(id: string, status: "사용" | "보관"): Promise<Result<null>> {
  try {
    await updateRecord<Row>(PROGRAMS, id, { [P.status]: status });
    return ok(null);
  } catch (e) {
    return fail(message(e, "상태를 바꾸지 못했다"));
  }
}

export async function setLinkStatus(recId: string, status: "사용" | "마감"): Promise<Result<null>> {
  try {
    await updateRecord<Row>(LINKS, recId, { [L.status]: status });
    return ok(null);
  } catch (e) {
    return fail(message(e, "링크 상태를 바꾸지 못했다"));
  }
}

/** 회사 하나에 링크 배포: 주문서 품목(지금 재고)으로 [영업] 주문 링크 한 줄 */
export async function deployLink(programId: string, input: { customer: string; phone: string; title: string }, author: MemberName): Promise<Result<{ url: string }>> {
  try {
    const rec = await getRecordFresh<Row>(PROGRAMS, programId, true);
    const f = (rec?.fields ?? {}) as Row;
    const payload = parsePayload(f[P.items]);
    if (!rec || !payload || (!payload.items.length && !payload.src)) return fail("주문서에 품목이 없습니다. [품목 고치기]에서 먼저 고르세요.");
    const fresh = isPickerPayload(payload) ? refreshStock(payload, shownStock(await readStock(payloadKeys(payload), true))) : payload;
    const id = newLinkId();
    await createRecord<Row>(LINKS, {
      [L.id]: id, [L.title]: input.title || `${input.customer ? input.customer + " " : ""}${text(f[P.name])}`.slice(0, 60),
      [L.customer]: input.customer || null, [L.phone]: input.phone || null, [L.items]: JSON.stringify(fresh),
      [L.min]: num(f[P.min]) || null, [L.date]: today(), [L.status]: "사용", [L.author]: author,
      [L.memo]: text(f[P.memo]) || null, [L.program]: [programId],
    });
    return ok({ url: linkUrl(id) });
  } catch (e) {
    return fail(message(e, "링크를 만들지 못했다"));
  }
}

/**
 * 링크 하나로 들어온 주문을 견적서 초안 하나로 합친다.
 * - 견적이 이미 진행된 주문(초안 상태가 '작성'이 아님)은 건드리지 않는다 — 두 번 청구하지 않게.
 * - 합칠 것이 하나뿐이면 새로 만들지 않고 그 초안을 쓴다.
 * - 새 합산 초안을 만들면 합쳐진 옛 초안(상태 '작성')은 삭제함으로 숨긴다(되살릴 수 있다).
 */
export async function mergeOrders(linkRecId: string, who: MemberName): Promise<Result<{ number: string; created: boolean; orders: number }>> {
  try {
    const link = await getRecordFresh<Row>(LINKS, linkRecId, true);
    if (!link) return fail("링크를 찾지 못했습니다.");
    const info = toLink(link.id, link.fields as Row);
    const [orders, quotes] = await Promise.all([readOrders(true), readQuoteList(true)]);
    const mine = orders.filter((o) => isFromLink(o.memo, info.linkId)).sort((a, b) => a.at.localeCompare(b.at));
    if (!mine.length) return fail("이 링크로 들어온 주문이 없습니다.");
    const byNo = new Map(quotes.map((q) => [q.number, q]));
    const open = (no: string) => {
      const q = no ? byNo.get(no) : undefined;
      return !q || q.status === "작성";
    };
    const mergeable = mine.filter((o) => open(o.draft));
    if (!mergeable.length) return fail("모든 주문이 이미 견적으로 진행됐습니다. 견적서에서 확인해 주세요.");
    const drafts = [...new Set(mergeable.map((o) => o.draft).filter(Boolean))];

    // 이미 합산 견적이 있고 아직 '작성'이면 새 주문만 그 견적에 더한다 — [주문 내용 고치기]로 바꾼 줄을 지우지 않게
    const current = info.merged ? latestRevision(quotes.filter((q) => !q.deleted), info.merged) : null;
    if (current && current.status === "작성") {
      const inChain = (no: string) => !!no && (no === info.merged || no.startsWith(`${info.merged}-R`));
      const added = mergeable.filter((o) => !inChain(o.draft));
      if (!added.length) return ok({ number: current.number, created: false, orders: mergeable.length });
      const lines = mergeLines([current.lines, ...added.map((o) => o.lines)]);
      const f = current.fields;
      const totals = quoteTotals(lines, text(f[Q.tax]) === "과세" ? "과세" : "면세");
      let snap: Record<string, unknown> = {};
      try { snap = JSON.parse(text(f[Q.snap]) || "{}"); } catch { snap = {}; }
      let itemsJson: Record<string, unknown> = {};
      try { itemsJson = JSON.parse(text(f[Q.items]) || "{}"); } catch { itemsJson = {}; }
      await updateRecord<Row>(QUOTES, current.id, {
        [Q.count]: totals.count, [Q.qty]: totals.qty, [Q.supply]: totals.supply, [Q.vat]: totals.vat, [Q.total]: totals.total,
        [Q.summary]: quoteSummary(lines), [Q.items]: JSON.stringify({ ...itemsJson, items: lines }),
        [Q.snap]: JSON.stringify({ ...snap, items: lines, totals }),
        [Q.memo]: prependMemo(text(f[Q.memo]), memoLine(new Date(), who, "합산추가", `주문 ${added.length}건(${added.map((o) => o.no).join(", ")}) 더함 · ERP 주문서`)),
      });
      const hide = [...new Set(added.map((o) => o.draft).filter(Boolean))].map((n) => byNo.get(n))
        .filter((q): q is NonNullable<typeof q> => !!q && q.status === "작성" && !q.deleted && q.id !== current.id);
      await updateRecords<Row>(QUOTES, hide.map((q) => ({
        id: q.id,
        fields: {
          [Q.deleted]: true, [Q.deletedBy]: who, [Q.deletedAt]: new Date().toISOString(), [Q.deletedReason]: `합산 견적 ${current.number}에 더함`,
          [Q.memo]: prependMemo(text(q.fields[Q.memo]), memoLine(new Date(), who, "합산", `${current.number}에 더함 · 삭제함`)),
        },
      })));
      await updateRecords<Row>(REQUESTS, added.map((o) => ({ id: o.id, fields: { [R.draft]: current.number } })));
      return ok({ number: current.number, created: false, orders: mergeable.length });
    }

    // 이미 하나로 합쳐져 있으면(또는 주문이 하나뿐이면) 그 초안을 쓴다
    if (drafts.length === 1 && mergeable.every((o) => o.draft === drafts[0]) && byNo.get(drafts[0]) && !byNo.get(drafts[0])!.deleted) {
      if (info.merged !== drafts[0]) await updateRecord<Row>(LINKS, linkRecId, { [L.merged]: drafts[0] });
      return ok({ number: drafts[0], created: false, orders: mergeable.length });
    }

    const lines = mergeLines(mergeable.map((o) => o.lines));
    if (!lines.length) return fail("주문 품목을 읽지 못했습니다.");
    // 공급자·계좌·고객·과세는 가장 최근 초안의 스냅샷을 이어 쓴다
    const baseQuote = [...drafts].map((n) => byNo.get(n)).filter(Boolean).sort((a, b) => b!.at.localeCompare(a!.at))[0]
      ?? [...quotes].filter((q) => text(q.fields[Q.snap])).sort((a, b) => b.at.localeCompare(a.at))[0];
    let snap: Record<string, unknown> = {};
    try { snap = JSON.parse(text(baseQuote?.fields[Q.snap]) || "{}"); } catch { snap = {}; }
    const t = seoulParts(new Date());
    const number = nextQuoteNo(quotes.map((q) => q.number), t.compact);
    const taxType = snap.taxType === "과세" ? "과세" : "면세";
    const supply = lines.reduce((a, l) => a + l.qty * l.price, 0);
    const vat = taxType === "과세" ? Math.round(supply * 0.1) : 0;
    const totals = { count: lines.length, qty: lines.reduce((a, l) => a + l.qty, 0), supply, vat, total: supply + vat };
    const client = (snap.client ?? { company: info.customer, name: "", phone: info.phone }) as Record<string, unknown>;
    const remarks = [`주문 링크 합산: ${mergeable.map((o) => o.no).join(", ")}`, `${info.title} (${info.linkId})`].join("\n");
    const snapshot = {
      ...snap, kind: "plant", taxType, dealType: "일반", discountRate: 0, client, remarks, items: lines, totals,
      validDays: 14, validUntil: t.validUntil, quoteNo: number, issuedDate: t.ymd, issuedDateLabel: t.label,
      v: 1, issuedAt: t.issuedAt, author: who, revision: 1, sourceQuoteNo: "",
    };
    const company = text(client.company) || info.customer;
    await createRecord<Row>(QUOTES, {
      [Q.number]: number, [Q.issued]: t.ymd, [Q.at]: new Date().toISOString(), [Q.author]: who, [Q.revision]: 1,
      [Q.kind]: "식물 도매", [Q.count]: totals.count, [Q.qty]: totals.qty, [Q.supply]: supply, [Q.vat]: vat, [Q.total]: totals.total,
      [Q.status]: "작성", [Q.tax]: taxType, [Q.taxReason]: text(snap.taxReason) || null, [Q.deal]: "일반", [Q.valid]: t.validUntil,
      [Q.snap]: JSON.stringify(snapshot), [Q.items]: JSON.stringify({ kind: "plant", client, remarks, items: lines }),
      [Q.summary]: quoteSummary(lines), [Q.remarks]: remarks, [Q.company]: company, [Q.person]: text(client.name) || null,
      [Q.phone]: text(client.phone) || info.phone || null,
      [Q.memo]: memoLine(new Date(), who, "합산견적", `주문 ${mergeable.length}건(${mergeable.map((o) => o.no).join(", ")}) 합침 · ERP 주문서`),
    });
    // 합쳐진 옛 초안 숨기기(삭제함 — 지우지 않는다) + 주문마다 새 초안 번호
    const hide = drafts.map((n) => byNo.get(n)).filter((q): q is NonNullable<typeof q> => !!q && q.status === "작성" && !q.deleted);
    await updateRecords<Row>(QUOTES, hide.map((q) => ({
      id: q.id,
      fields: {
        [Q.deleted]: true, [Q.deletedBy]: who, [Q.deletedAt]: new Date().toISOString(), [Q.deletedReason]: `합산 견적 ${number}로 합침`,
        [Q.memo]: prependMemo(text(q.fields[Q.memo]), memoLine(new Date(), who, "합산", `${number}로 합침 · 삭제함`)),
      },
    })));
    await updateRecords<Row>(REQUESTS, mergeable.map((o) => ({ id: o.id, fields: { [R.draft]: number } })));
    await updateRecord<Row>(LINKS, linkRecId, { [L.merged]: number });
    return ok({ number, created: true, orders: mergeable.length });
  } catch (e) {
    return fail(message(e, "견적을 합치지 못했다"));
  }
}

/**
 * 수주한 합산 견적의 수량을 라인업 재고에서 뺀다. 견적의 최신 수정본 품목 기준.
 * 견적에 `재고차감` 시각이 있으면 다시 빼지 않는다. 끝나면 주문서·링크 재고도 새로 반영한다.
 */
export async function deductStock(linkRecId: string, who: MemberName): Promise<Result<{ lines: number; unmatched: string[] }>> {
  try {
    const link = await getRecordFresh<Row>(LINKS, linkRecId, true);
    if (!link) return fail("링크를 찾지 못했습니다.");
    const lf = link.fields as Row;
    const info = toLink(link.id, lf);
    const payload = parsePayload(lf[L.items]);
    if (!info.merged || !payload) return fail("먼저 [합산 견적서]를 만들어 주세요.");
    const quotes = (await readQuoteList(true)).filter((q) => !q.deleted);
    const quote = latestRevision(quotes, info.merged);
    if (!quote) return fail(`견적 ${info.merged}을 찾지 못했습니다.`);
    if (!isSale(quote.status)) return fail(`견적 ${quote.number}이 아직 판매 상태가 아닙니다(${quote.status}). 견적서에서 수주확정한 뒤 빼세요.`);
    if (quote.deducted) return fail(`이미 ${quote.deducted.slice(0, 16).replace("T", " ")}에 뺐습니다.`);

    let items: OrderedLine[] = [];
    try {
      const data = JSON.parse(text(quote.fields[Q.items]) || "{}") as { items?: OrderedLine[] };
      items = (data.items ?? []).map((l) => ({ name: String(l.name ?? ""), spec: String(l.spec ?? ""), qty: Number(l.qty) || 0, price: Number(l.price) || 0 }));
    } catch { items = []; }
    const { list, unmatched } = deductions(items, payload);
    if (!list.length) return fail("라인업 품목과 맞는 줄이 없습니다. 견적 품목명을 확인해 주세요.");

    const stock = await readStock(list.map((d) => stockKey(d.group, d.rec)), true);
    const byGroup = new Map<OrderGroup, { id: string; fields: Row }[]>();
    const done: string[] = [];
    for (const d of list) {
      const cur = stock.get(stockKey(d.group, d.rec));
      if (cur === undefined || cur === null) continue; // 재고 칸이 비어 있는 품목은 건드리지 않는다
      byGroup.set(d.group, [...(byGroup.get(d.group) ?? []), { id: d.rec, fields: { [STOCK[d.group].field]: Math.max(0, cur - d.qty) } }]);
      done.push(`${d.name} ${d.spec} ${cur}→${Math.max(0, cur - d.qty)}`);
    }
    for (const [group, records] of byGroup) await updateRecords<Row>(STOCK[group].table, records);
    const skipped = unmatched.map((l) => `${l.name} ${l.spec}`.trim());
    await updateRecord<Row>(QUOTES, quote.id, {
      [Q.deducted]: new Date().toISOString(),
      [Q.memo]: prependMemo(text(quote.fields[Q.memo]), memoLine(new Date(), who, "재고차감", `${done.length}품목${skipped.length ? ` · 못 맞춘 줄 ${skipped.length}` : ""} · ERP 주문서`)),
    });
    if (info.program) await refreshProgram(info.program);
    return ok({ lines: done.length, unmatched: skipped });
  } catch (e) {
    return fail(message(e, "재고를 빼지 못했다"));
  }
}

/**
 * 주문서에 안 묶인 링크(예전에 만든 것, 손으로 만든 것)를 그대로 주문서로 만든다.
 * 품목JSON은 글자 하나 안 바꾸고 옮긴다 — 사진·크레이트 정보가 그대로 남는다.
 */
export async function adoptLink(linkRecId: string, who: MemberName): Promise<Result<{ id: string }>> {
  try {
    const link = await getRecordFresh<Row>(LINKS, linkRecId, true);
    if (!link) return fail("링크를 찾지 못했습니다.");
    const f = link.fields as Row;
    if (ids(f[L.program]).length) return fail("이미 주문서에 묶인 링크입니다.");
    const raw = text(f[L.items]);
    if (!parsePayload(raw)) return fail("링크 품목을 읽지 못했습니다.");
    const guess = supplierOf({ [P.items]: raw });
    const rec = await createRecord<Row>(PROGRAMS, {
      [P.name]: text(f[L.title]) || "옮겨 온 주문서", [P.status]: "사용", [P.items]: raw, [P.min]: num(f[L.min]) || null,
      [P.supplier]: guess ? SUPPLIER_INFO[guess].label : null,
      [P.memo]: text(f[L.memo]) || null, [P.author]: who, [P.note]: `${today()} 주문 링크 ${text(f[L.id])}에서 옮김`,
    });
    await updateRecord<Row>(LINKS, linkRecId, { [L.program]: [rec.id] });
    return ok({ id: rec.id });
  } catch (e) {
    return fail(message(e, "주문서로 옮기지 못했다"));
  }
}

/**
 * 주문 뒤 카톡·전화로 바뀐 내용을 그 회사 견적에 반영한다. 판매 상태(수주확정 이후) 전까지만.
 * - 견적이 아직 '작성'(고객에게 안 나감)이면 그 견적을 그대로 고친다.
 * - 이미 보냈으면 수정본(-R2, -R3…)을 '작성'으로 새로 만든다 — 견적서 생성기의 수정본 규칙과 같다(옛 견적은 그대로 남는다).
 * 포털의 재고 차감·미수금·마진은 언제나 가장 최근 수정본을 따른다. 바꾼 이유는 작업메모에 '주문변경'으로 남는다.
 */
export async function editOrderQuote(linkRecId: string, lines: EditLine[], reason: string, who: MemberName): Promise<Result<{ number: string; created: boolean }>> {
  try {
    const link = await getRecordFresh<Row>(LINKS, linkRecId, true);
    if (!link) return fail("링크를 찾지 못했습니다.");
    const info = toLink(link.id, link.fields as Row);
    if (!info.merged) return fail("먼저 [합산 견적서 만들기]로 견적을 만드세요.");
    const quotes = (await readQuoteList(true)).filter((q) => !q.deleted);
    const q = latestRevision(quotes, info.merged);
    if (!q) return fail(`견적 ${info.merged}을 찾지 못했습니다.`);
    if (isSale(q.status) || q.deducted) return fail(`견적 ${q.number}은 이미 ${q.status}입니다. 수주확정 뒤 변경은 견적서 생성기에서 수정본으로 고쳐 주세요.`);
    const f = q.fields;
    const taxType = text(f[Q.tax]) === "과세" ? "과세" : "면세";
    const totals = quoteTotals(lines, taxType);
    const before = quoteLines(f);
    const detail = `${reason} · ${changeSummary(before, lines)} · 합계 ₩${num(f[Q.total]).toLocaleString("en-US")}→₩${totals.total.toLocaleString("en-US")}`;
    let snap: Record<string, unknown> = {};
    try { snap = JSON.parse(text(f[Q.snap]) || "{}"); } catch { snap = {}; }
    let itemsJson: Record<string, unknown> = {};
    try { itemsJson = JSON.parse(text(f[Q.items]) || "{}"); } catch { itemsJson = {}; }
    const money = {
      [Q.count]: totals.count, [Q.qty]: totals.qty, [Q.supply]: totals.supply, [Q.vat]: totals.vat, [Q.total]: totals.total,
      [Q.summary]: quoteSummary(lines), [Q.items]: JSON.stringify({ ...itemsJson, kind: itemsJson.kind ?? "plant", items: lines }),
    };

    if (q.status === "작성") {
      await updateRecord<Row>(QUOTES, q.id, {
        ...money, [Q.snap]: JSON.stringify({ ...snap, items: lines, totals }),
        [Q.memo]: prependMemo(text(f[Q.memo]), memoLine(new Date(), who, "주문변경", detail)),
      });
      return ok({ number: q.number, created: false });
    }

    const t = seoulParts(new Date());
    const base = info.merged.replace(/-R\d+$/, "");
    const next = nextRevisionNo(quotes.map((x) => x.number), base);
    await createRecord<Row>(QUOTES, {
      ...money,
      [Q.number]: next.number, [Q.revision]: next.revision, [Q.source]: base, [Q.issued]: t.ymd, [Q.at]: new Date().toISOString(),
      [Q.author]: who, [Q.kind]: text(f[Q.kind]) || "식물 도매", [Q.status]: "작성", [Q.tax]: taxType, [Q.taxReason]: text(f[Q.taxReason]) || null,
      [Q.deal]: text(f[Q.deal]) || "일반", [Q.valid]: t.validUntil, [Q.remarks]: text(f[Q.remarks]) || null,
      [Q.company]: text(f[Q.company]) || null, [Q.person]: text(f[Q.person]) || null, [Q.phone]: text(f[Q.phone]) || null,
      ...(ids(f[Q.shipment]).length ? { [Q.shipment]: ids(f[Q.shipment]) } : {}),
      [Q.snap]: JSON.stringify({
        ...snap, items: lines, totals, quoteNo: next.number, revision: next.revision, sourceQuoteNo: base,
        issuedDate: t.ymd, issuedDateLabel: t.label, issuedAt: t.issuedAt, validUntil: t.validUntil, author: who,
      }),
      [Q.memo]: memoLine(new Date(), who, "주문변경", `${q.number}의 수정본 · ${detail}`),
    });
    await updateRecord<Row>(QUOTES, q.id, { [Q.memo]: prependMemo(text(f[Q.memo]), memoLine(new Date(), who, "수정본", `${next.number} 작성(주문변경)`)) });
    return ok({ number: next.number, created: true });
  } catch (e) {
    return fail(message(e, "주문 변경을 저장하지 못했다"));
  }
}

/**
 * 보관한 주문서를 지운다. 배포한 링크는 닫고(마감) 남긴다 — 고객이 받은 주소가 열려 있으면 안 되고,
 * 받은 주문(견적요청)·견적은 거래 기록이라 지우지 않는다.
 */
export async function deleteProgram(id: string): Promise<Result<{ closed: number }>> {
  try {
    const rec = await getRecordFresh<Row>(PROGRAMS, id, true);
    if (!rec) return fail("주문서를 찾지 못했습니다.");
    if (text((rec.fields as Row)[P.status]) !== "보관") return fail("보관한 주문서만 지울 수 있습니다. 먼저 [보관]을 누르세요.");
    const links = (await selectRecordsFresh<Row>(LINKS, { fields: LINK_FIELDS, byId: true })).map((r) => toLink(r.id, r.fields)).filter((l) => l.program === id);
    await updateRecords<Row>(LINKS, links.filter((l) => l.status !== "마감").map((l) => ({ id: l.recId, fields: { [L.status]: "마감" } })));
    await deleteRecord(PROGRAMS, id);
    return ok({ closed: links.length });
  } catch (e) {
    return fail(message(e, "주문서를 지우지 못했다"));
  }
}
