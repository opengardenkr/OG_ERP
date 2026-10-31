import "server-only";

import { unstable_cache } from "next/cache";
import {
  GROUP_INFO, ORDER_GROUPS, SITE, linkPayload, linkUrl, newLinkId, orderSummary, requestNo, lineAmount,
  type DirectInput, type LinkInput, type OrderGroup, type OrderItem, type Prices,
} from "@/lib/order";
import type { MemberName } from "@/config/users";

/**
 * '주문' 화면의 Airtable 경계.
 * - 품목 목록·사진은 웹사이트 카탈로그 API(공개 품목만, 가격 없음)를 그대로 쓴다 — 카탈로그 선택과 같은 원천.
 * - 가격·재고는 여기서 라인업 표 4개를 직접 읽어 레코드 ID로 붙인다. 로그인한 직원 화면에만 나간다.
 * - 쓰기는 2곳: [영업] 주문 링크(고객 링크), 견적요청(직원 직접 접수).
 * 필드는 ID로 부른다 — 여러 표의 SKU 이름 앞에 보이지 않는 BOM 문자가 있다.
 */

type PriceSource = { table: string; formula?: string; base: string; air?: string; gov?: string; pre?: string; stock: string };
const PRICE_SOURCES: Record<OrderGroup, PriceSource> = {
  // 국내 라인업: 도매가 / 관급가 / 재고(본·구)
  immediate: { table: "tblDMLlaBwkW1NfhU", base: "fldCjIpc6W8GzdXjm", gov: "fldi11jiWAIbIG0yG", stock: "fldNMlilMRReYM5tn" },
  // 구근 라인업: 해상판매가(기본) / 항공판매가 / 관급가 / 재고(구)
  preorder: { table: "tblylbZq6PLfzH1Ol", base: "fldJD6KCwjUUfQIiu", air: "fldP1ClP53qn5GLhZ", gov: "fldQo3P5lI5yoCY97", stock: "fldWsbfXjYE4al0rQ" },
  // 호게나르드 DM: 도매가(₩) / 사전예약가 / 현지재고
  hoogenraad: { table: "tblVVRTKfyViCI1aW", formula: "NOT({노출제외})", base: "flddWryT0w8bnvmis", pre: "fld7phSyk71vg8cTj", stock: "fldXhGrdwcxMMFQhF" },
  // Master DB(HBM 확정분): 단가_WON / 재고
  hbm: { table: "tblm8bjSeDCflcIzk", formula: '{Status}="공급확정(260713 HBM 회신)"', base: "fldxHd06Gupotaj6N", stock: "fldKw75cYWnc4nSuW" },
};

const LINK_TABLE = "tbl93mrTsG1IsuFxQ"; // [영업] 주문 링크
const L = {
  id: "fldQCUWu9EOsbUiYh", title: "fldYfnhpKeszp9cQz", customer: "fldL7PcPMwAPfwJGu", phone: "fldiCkG6ut9h4O1Yv",
  items: "fldNQStXwVIQUHwwj", min: "fldhAQfABDEOjzb6Q", date: "flda0UPGBrXXhMRey", status: "fldwdqHacxGXwd6RT",
  author: "fldCVKViUNzQmuz19", memo: "fldt7o3g960vHTY2n",
};
const QUOTE_TABLE = "tbllSGZWApKiMTNOK"; // 견적요청 (웹 접수와 같은 표)
const Q = {
  no: "fldNOX7urTPifKrQf", name: "fldB2XhLjxxE5tHwx", memo: "fldNfM5HhjGT7Cdn7", summary: "fldxxk1XNpWGP7p3K",
  json: "fldHLiEeCJRzfp0yw", status: "fldVZX9fp6ChmgYWP", at: "fldC1SMCKpKxqFGSx", phone: "fldxTgnEjQoJe02px",
};

type Raw = { id: string; fields: Record<string, unknown> };

function env() {
  const token = process.env.AIRTABLE_TOKEN?.trim(), base = process.env.AIRTABLE_BASE_ID?.trim();
  if (!token || !base) throw new Error("Airtable 연결 설정(AIRTABLE_TOKEN, AIRTABLE_BASE_ID)을 확인해 주세요.");
  return { token, base };
}
function explain(status: number, what: string) {
  if (status === 403) return `${what} 권한이 없습니다. 포털 토큰의 접근 범위(쓰기 포함)를 확인해 주세요.`;
  if (status === 422) return `${what}: Airtable이 값을 거절했습니다(422).`;
  if (status === 429) return "요청이 많습니다. 잠시 후 다시 시도해 주세요.";
  return `${what}에 실패했습니다 (${status}).`;
}

async function readAll(table: string, fields: string[], formula?: string): Promise<Raw[]> {
  const { token, base } = env();
  const out: Raw[] = [];
  let offset = "";
  for (let page = 0; page < 10; page += 1) {
    const params = new URLSearchParams({ pageSize: "100", returnFieldsByFieldId: "true" });
    fields.forEach((f) => params.append("fields[]", f));
    if (formula) params.set("filterByFormula", formula);
    if (offset) params.set("offset", offset);
    const response = await fetch(`https://api.airtable.com/v0/${base}/${table}?${params}`, {
      headers: { Authorization: `Bearer ${token}` }, cache: "no-store", signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) throw new Error(explain(response.status, "가격·재고 조회"));
    const data = (await response.json()) as { records: Raw[]; offset?: string };
    out.push(...data.records);
    offset = data.offset || "";
    if (!offset) break;
  }
  return out;
}

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : undefined);

async function readPrices(group: OrderGroup) {
  const s = PRICE_SOURCES[group];
  const fields = [s.base, s.air, s.gov, s.pre, s.stock].filter((f): f is string => Boolean(f));
  const rows = await readAll(s.table, fields, s.formula);
  const map = new Map<string, { prices: Prices; stock: number | null }>();
  for (const r of rows) {
    const f = r.fields;
    const prices: Prices = {};
    if (num(f[s.base])) prices.base = num(f[s.base]);
    if (s.air && num(f[s.air])) prices.air = num(f[s.air]);
    if (s.gov && num(f[s.gov])) prices.gov = num(f[s.gov]);
    if (s.pre && num(f[s.pre])) prices.pre = num(f[s.pre]);
    const stock = num(f[s.stock]);
    map.set(r.id, { prices, stock: stock !== undefined && stock > 0 ? Math.floor(stock) : null });
  }
  return map;
}

type SiteItem = { id: string; kname?: string; sname?: string; size?: string | string[]; cat?: string[]; sku?: string; image?: string | null; source?: string };

async function readSite(group: OrderGroup): Promise<SiteItem[]> {
  const response = await fetch(`${SITE}/api/catalog?group=${group}`, { cache: "no-store", signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error("웹 카탈로그를 불러오지 못했습니다. 잠시 뒤 다시 시도해 주세요.");
  return ((await response.json()) as { items?: SiteItem[] }).items || [];
}

async function loadCatalog(): Promise<OrderItem[]> {
  const lists = await Promise.all(ORDER_GROUPS.map(async (group) => {
    const [site, prices] = await Promise.all([readSite(group), readPrices(group)]);
    return site.map((p): OrderItem => {
      const extra = prices.get(p.id) || { prices: {}, stock: null };
      const sizes = (Array.isArray(p.size) ? p.size : [p.size]).filter((x): x is string => typeof x === "string" && x.trim() !== "");
      return {
        id: p.id, group, source: p.source || GROUP_INFO[group].label, cat: (p.cat || []).find(Boolean) || "",
        kname: p.kname || p.sname || "", sname: p.sname || "", sku: p.sku || "",
        image: p.image ? `${SITE}/api/plant-image?group=${group}&id=${encodeURIComponent(p.id)}&index=0&w=520` : "",
        options: sizes.map((size) => ({ size: size.replace(/\s*규격$/, ""), prices: extra.prices, stock: extra.stock })),
      };
    }).filter((it) => it.kname && it.options.length);
  }));
  return lists.flat();
}

/** 성공한 결과만 5분 캐시. 실패는 던져서 캐시되지 않게 한다(CLAUDE.md §6). */
export const getOrderCatalog = unstable_cache(loadCatalog, ["order-catalog-v1"], { revalidate: 300 });

async function create(table: string, fields: Record<string, unknown>, what: string) {
  const { token, base } = env();
  const response = await fetch(`https://api.airtable.com/v0/${base}/${table}`, {
    method: "POST", cache: "no-store", signal: AbortSignal.timeout(15000),
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ records: [{ fields }] }),
  });
  if (!response.ok) throw new Error(explain(response.status, what));
  return ((await response.json()) as { records: Raw[] }).records[0];
}

export async function createOrderLink(input: LinkInput, author: MemberName) {
  const id = newLinkId();
  const payload = JSON.stringify(linkPayload(input.lines, input.prefill));
  if (payload.length > 90_000) throw new Error("품목이 너무 많습니다. 나눠서 링크를 만들어 주세요.");
  await create(LINK_TABLE, {
    [L.id]: id, [L.title]: input.title, [L.customer]: input.customer || null, [L.phone]: input.phone || null,
    [L.items]: payload, [L.min]: input.minOrder || null, [L.date]: input.basisDate || null, [L.status]: "사용",
    [L.author]: author, [L.memo]: input.memo || null,
  }, "주문 링크 저장");
  return { id, url: linkUrl(id) };
}

export async function createDirectOrder(input: DirectInput, author: MemberName) {
  const no = requestNo(new Date());
  const total = input.lines.reduce((s, l) => s + lineAmount(l), 0);
  const memo = `[ERP 직접 접수 · ${author}] 합계 ₩${total.toLocaleString("en-US")} (VAT 별도)` + (input.memo.trim() ? `\n메모: ${input.memo.trim()}` : "");
  await create(QUOTE_TABLE, {
    [Q.no]: no, [Q.name]: input.customer, [Q.phone]: input.phone || null, [Q.memo]: memo,
    [Q.summary]: orderSummary(input.lines),
    [Q.json]: JSON.stringify(input.lines.map((l) => ({ sku: `${l.group}:${l.id}`, kname: l.kname, size: l.size, qty: l.qty, price: l.price }))),
    [Q.status]: "신규", [Q.at]: new Date().toISOString(),
  }, "주문 접수");
  return { requestNo: no, total };
}
