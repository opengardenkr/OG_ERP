import "server-only";

import { selectRecords, selectRecordsFresh } from "@/lib/airtable/client";
import { linkUrl, supplierByLabel, supplierOfGroup, type OrderGroup, type Supplier } from "@/lib/order";
import {
  isManagedPayload, orderSource, orderTotal, orderedLines, parsePayload, stockKey,
  type EditLine, type OrderedLine,
} from "@/lib/order-program";

/**
 * 주문서·주문 링크·견적요청·견적서·라인업 재고 — 주문 화면이 쓰는 표의 필드 ID와 읽기 함수.
 * 주문서(order-programs.ts)와 주문한 회사별 처리(order-deals.ts)가 함께 쓴다.
 */
export const PROGRAMS = "tblCQzs3h453k911L"; // [영업] 주문서
export const P = {
  name: "fldpkan9Y2YPm8kN9", status: "fldMyyuslFTwplwoX", items: "fldcMaKXHYYkW9ykt", selection: "fldT6jzNsuXJrfzr1",
  min: "fldC59ngAVAQ1DHRA", memo: "fldtKjMLeGZotXcTj", author: "fldV30NasryPsLfBK", note: "fldwSLvf7c38bveiL",
  modified: "fldPOuyEaEEWba151", supplier: "fldBjhYAiFOwXMzsA",
} as const;
export const LINKS = "tbl93mrTsG1IsuFxQ"; // [영업] 주문 링크
export const L = {
  id: "fldQCUWu9EOsbUiYh", title: "fldYfnhpKeszp9cQz", customer: "fldL7PcPMwAPfwJGu", phone: "fldiCkG6ut9h4O1Yv",
  items: "fldNQStXwVIQUHwwj", min: "fldhAQfABDEOjzb6Q", date: "flda0UPGBrXXhMRey", status: "fldwdqHacxGXwd6RT",
  author: "fldCVKViUNzQmuz19", memo: "fldt7o3g960vHTY2n", created: "fldX0AInVBF36L2lN", program: "fldGgMavCb01XxSBr",
  merged: "fldPBQSbr96ELJTIV",
} as const;
export const REQUESTS = "tbllSGZWApKiMTNOK"; // 견적요청
export const R = {
  no: "fldNOX7urTPifKrQf", who: "fldB2XhLjxxE5tHwx", memo: "fldNfM5HhjGT7Cdn7", json: "fldHLiEeCJRzfp0yw",
  status: "fldVZX9fp6ChmgYWP", at: "fldC1SMCKpKxqFGSx", phone: "fldxTgnEjQoJe02px", draft: "fldieREm87JD71wdA",
} as const;
export const QUOTES = "tblj74vsSha7drqmj"; // 견적서 발송 내역
export const Q = {
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
export const STOCK: Record<OrderGroup, { table: string; field: string }> = {
  immediate: { table: "tblDMLlaBwkW1NfhU", field: "fldNMlilMRReYM5tn" },
  preorder: { table: "tblylbZq6PLfzH1Ol", field: "fldWsbfXjYE4al0rQ" },
  hoogenraad: { table: "tblVVRTKfyViCI1aW", field: "fldXhGrdwcxMMFQhF" },
  hbm: { table: "tblm8bjSeDCflcIzk", field: "fldKw75cYWnc4nSuW" },
};

export type Row = Record<string, unknown>;
export const text = (v: unknown) => (typeof v === "string" ? v.trim() : v && typeof v === "object" && "name" in v ? String((v as { name: unknown }).name).trim() : "");
export const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
export const ids = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
export const message = (e: unknown, fallback: string) => (e instanceof Error ? e.message : fallback);
export const REC = /^rec[A-Za-z0-9]{14}$/;

// ── 읽기 ──────────────────────────────────────────────

export type LinkInfo = {
  recId: string; linkId: string; url: string; title: string; customer: string; phone: string; status: string; created: string;
  program: string; merged: string; managed: boolean;
};
export type OrderInfo = {
  id: string; no: string; at: string; who: string; phone: string; memo: string;
  source: { kind: "link" | "proposal"; id: string }; total: number; draft: string; lines: OrderedLine[];
};

export function toLink(id: string, f: Row): LinkInfo {
  const linkId = text(f[L.id]);
  return {
    recId: id, linkId, url: linkUrl(linkId), title: text(f[L.title]), customer: text(f[L.customer]), phone: text(f[L.phone]),
    status: text(f[L.status]) || "사용", created: text(f[L.created]).slice(0, 10), program: ids(f[L.program])[0] ?? "",
    merged: text(f[L.merged]), managed: isManagedPayload(parsePayload(f[L.items])),
  };
}

export const LINK_FIELDS = [L.id, L.title, L.customer, L.phone, L.status, L.created, L.program, L.merged, L.items];
export const readLinks = () => selectRecords<Row>(LINKS, { fields: LINK_FIELDS, revalidate: 30, byId: true });
export const readPrograms = () => selectRecords<Row>(PROGRAMS, { fields: [P.name, P.status, P.items, P.modified, P.supplier], revalidate: 30, byId: true });

/** 업체 칸이 비어 있으면(옛 줄) 품목으로 짐작한다: 라인업 그룹, 없으면 크레이트 행이 있으면 HBM. */
export function supplierOf(f: Row): Supplier | null {
  const set = supplierByLabel(text(f[P.supplier]));
  if (set) return set;
  const p = parsePayload(f[P.items]);
  if (p?.src === "hg-pool") return "hoogenraad"; // 호게나르드 DM 공동주문 품목을 웹이 직접 읽는다
  const g = p?.items.find((it) => typeof it.group === "string")?.group;
  if (g) return supplierOfGroup(g);
  return p?.items.some((it) => it.rows.some((r) => Number.isInteger(r[4]) && (r[4] as number) > 0)) ? "hbm" : null;
}

/** 주문 링크(/o/)·주문형 제안서(/p/)로 들어온 주문만 남긴다(요청사항 첫머리 `[주문 링크 …]`·`[제안서 …]`). */
export async function readOrders(fresh = false): Promise<OrderInfo[]> {
  const query = { fields: [R.no, R.who, R.memo, R.json, R.at, R.draft, R.phone], byId: true };
  const rows = fresh ? await selectRecordsFresh<Row>(REQUESTS, query) : await selectRecords<Row>(REQUESTS, { ...query, revalidate: 60 });
  return rows.flatMap((r) => {
    const memo = text(r.fields[R.memo]);
    const source = orderSource(memo);
    if (!source) return [];
    const lines = orderedLines(text(r.fields[R.json]));
    return [{
      id: r.id, no: text(r.fields[R.no]), at: text(r.fields[R.at]), who: text(r.fields[R.who]), phone: text(r.fields[R.phone]),
      memo, source, total: orderTotal(lines), draft: text(r.fields[R.draft]), lines,
    }];
  });
}

export type QuoteLite = { id: string; number: string; status: string; deleted: boolean; total: number; deducted: string; at: string; lines: EditLine[]; memo: string };
export async function readQuoteList(fresh = false): Promise<(QuoteLite & { fields: Row })[]> {
  const fields = Object.values(Q);
  const rows = fresh ? await selectRecordsFresh<Row>(QUOTES, { fields, byId: true }) : await selectRecords<Row>(QUOTES, { fields: [Q.number, Q.status, Q.deleted, Q.total, Q.deducted, Q.at, Q.items, Q.memo, Q.phone, Q.company, Q.issued], revalidate: 60, byId: true });
  return rows.map((r) => ({
    id: r.id, number: text(r.fields[Q.number]), status: text(r.fields[Q.status]), deleted: r.fields[Q.deleted] === true,
    total: num(r.fields[Q.total]), deducted: text(r.fields[Q.deducted]), at: text(r.fields[Q.at]), fields: r.fields,
    lines: quoteLines(r.fields), memo: text(r.fields[Q.memo]),
  }));
}

/** 견적 품목JSON → 줄 */
export function quoteLines(f: Row): EditLine[] {
  try {
    const data = JSON.parse(text(f[Q.items]) || "{}") as { items?: Partial<EditLine>[] };
    return (data.items ?? []).map((l) => ({ name: String(l.name ?? ""), spec: String(l.spec ?? ""), qty: Number(l.qty) || 0, price: Number(l.price) || 0 }));
  } catch {
    return [];
  }
}

/** 라인업 재고. 키 = group:rec. 비어 있으면 null. */
export async function readStock(keys: string[], fresh: boolean): Promise<Map<string, number | null>> {
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
export const shownStock = (m: Map<string, number | null>) => new Map([...m].map(([k, v]) => [k, v !== null && v > 0 ? v : null]));

