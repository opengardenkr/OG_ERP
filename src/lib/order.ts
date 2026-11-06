/**
 * '주문' 화면의 순수 규칙. 서버·화면·테스트가 함께 쓴다(server-only 아님).
 * 카탈로그 → 수량 입력 → (1) 주문서로 저장(회사별 링크 배포는 order-program.ts) / (2) 직원이 바로 주문 접수 / (3) 견적서로.
 */

export const ORDER_GROUPS = ["immediate", "preorder", "hoogenraad", "hbm"] as const;
export type OrderGroup = (typeof ORDER_GROUPS)[number];

/** 공급처별 표시 이름·수량 단위·+/− 한 번에 움직이는 수량 */
export const GROUP_INFO: Record<OrderGroup, { label: string; unit: string; step: number }> = {
  immediate: { label: "국내 농장", unit: "주", step: 10 },
  preorder: { label: "구근 라인업", unit: "구", step: 100 },
  hoogenraad: { label: "호게나르드", unit: "주", step: 10 },
  hbm: { label: "HBM", unit: "구", step: 100 },
};

export const PRICE_BASES = ["base", "air", "gov", "pre"] as const;
export type PriceBasis = (typeof PRICE_BASES)[number];
export const BASIS_LABEL: Record<PriceBasis, string> = {
  base: "기본가(도매·해상)", air: "항공판매가", gov: "관급가", pre: "사전예약가",
};
export type Prices = Partial<Record<PriceBasis, number>>;

export type OrderOption = { size: string; prices: Prices; stock: number | null };
export type OrderItem = {
  id: string; group: OrderGroup; source: string; cat: string; kname: string; sname: string;
  sku: string; image: string; options: OrderOption[];
};

/** 고른 가격 기준이 비어 있으면 기본가로. 기본가도 없으면 null(주문 불가) */
export function pickPrice(prices: Prices, basis: PriceBasis): { price: number | null; fallback: boolean } {
  const want = prices[basis];
  if (typeof want === "number" && want > 0) return { price: Math.round(want), fallback: false };
  const base = prices.base;
  if (typeof base === "number" && base > 0) return { price: Math.round(base), fallback: basis !== "base" };
  return { price: null, fallback: false };
}

/** 주문 링크 ID: 16바이트 무작위 → base64url 22자. 추측할 수 없어야 한다(가격이 보이는 페이지). */
export function newLinkId(): string {
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  let s = "";
  bytes.forEach((b) => (s += String.fromCharCode(b)));
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export const SITE = "https://open-garden.co.kr";
export const linkUrl = (id: string) => `${SITE}/o/${id}`;

/** 화면에서 보내오는 한 줄 */
export type OrderLine = {
  group: OrderGroup; id: string; kname: string; sname: string; cat: string; photo: boolean;
  size: string; price: number; stock: number | null; qty: number;
};

export type DirectInput = { customer: string; phone: string; memo: string; lines: OrderLine[] };

export type Check<T> = { ok: true; value: T } | { ok: false; message: string };

const str = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/[\x00-\x09\x0b-\x1f]/g, "").trim().slice(0, max) : "");
const intOr = (v: unknown, fallback: number | null) => (Number.isInteger(v) && (v as number) >= 0 ? (v as number) : fallback);

export function readLines(raw: unknown, needQty: boolean): Check<OrderLine[]> {
  if (!Array.isArray(raw) || raw.length === 0) return { ok: false, message: "품목을 하나 이상 골라 주세요." };
  if (raw.length > 120) return { ok: false, message: "한 번에 120개 규격까지 담을 수 있습니다." };
  const lines: OrderLine[] = [];
  for (const r of raw as Record<string, unknown>[]) {
    const group = r?.group as OrderGroup;
    if (!ORDER_GROUPS.includes(group) || typeof r.id !== "string" || !/^rec[A-Za-z0-9]{14}$/.test(r.id)) {
      return { ok: false, message: "품목 정보가 올바르지 않습니다. 새로고침 후 다시 시도해 주세요." };
    }
    const price = Number(r.price);
    const qty = intOr(r.qty, 0) as number;
    const line: OrderLine = {
      group, id: r.id, kname: str(r.kname, 80), sname: str(r.sname, 120), cat: str(r.cat, 30) || GROUP_INFO[group].label,
      photo: r.photo === true, size: str(r.size, 20), price: Number.isFinite(price) ? Math.round(price) : 0,
      stock: intOr(r.stock, null), qty: Math.min(qty, 1_000_000),
    };
    if (!line.kname || !line.size || line.price <= 0) return { ok: false, message: `${line.kname || "품목"}의 규격·가격을 확인해 주세요.` };
    if (needQty && line.qty <= 0) return { ok: false, message: "수량을 입력한 품목만 주문할 수 있습니다." };
    lines.push(line);
  }
  return { ok: true, value: lines };
}

export function readDirectInput(raw: unknown): Check<DirectInput> {
  const b = (raw ?? {}) as Record<string, unknown>;
  const lines = readLines(b.lines, true);
  if (!lines.ok) return lines;
  const customer = str(b.customer, 100);
  if (!customer) return { ok: false, message: "거래처명을 입력해 주세요." };
  const phone = str(b.phone, 30);
  if (phone && phone.replace(/\D/g, "").length < 9) return { ok: false, message: "연락처를 확인해 주세요." };
  return { ok: true, value: { customer, phone, memo: typeof b.memo === "string" ? b.memo.slice(0, 800) : "", lines: lines.value } };
}

/**
 * 웹사이트 /o/ 페이지가 읽는 품목JSON(v1). 같은 품종의 규격은 한 카드로 묶는다.
 * rows = [규격, 재고|null, 단가, 미리 채울 수량]
 */
export function linkPayload(lines: OrderLine[], prefill: boolean) {
  const cards = new Map<string, { k: string; group: OrderGroup; rec: string; photo: boolean; grp: string; name: string; latin: string; unit: string; step: number; rows: [string, number | null, number, number][] }>();
  for (const l of lines) {
    const key = l.group + ":" + l.id;
    let card = cards.get(key);
    if (!card) {
      card = { k: "i" + cards.size.toString(36), group: l.group, rec: l.id, photo: l.photo, grp: l.cat, name: l.kname, latin: l.sname,
        unit: GROUP_INFO[l.group].unit, step: GROUP_INFO[l.group].step, rows: [] };
      cards.set(key, card);
    }
    if (!card.rows.some((r) => r[0] === l.size)) card.rows.push([l.size, l.stock, l.price, prefill ? l.qty : 0]);
  }
  return { v: 1 as const, items: [...cards.values()] };
}

const won = (n: number) => n.toLocaleString("en-US");
export const lineAmount = (l: OrderLine) => l.price * l.qty;

/** 견적요청 표의 품목요약 — 웹 접수와 같은 모양에 단가·금액을 더한다 */
export function orderSummary(lines: OrderLine[]): string {
  return lines.map((l, i) => `${i + 1}. ${l.cat} ${l.kname} @₩${won(l.price)} = ₩${won(lineAmount(l))} · ${l.size} · ${l.qty}${GROUP_INFO[l.group].unit}`).join("\n");
}

/** 요청번호 Q-YYYYMMDD-XXX (한국 날짜). 웹 접수(api/quote.js)와 같은 형식 */
export function requestNo(now: Date, random: () => number = Math.random): string {
  const kst = new Date(now.getTime() + 9 * 3600_000).toISOString().slice(0, 10).replace(/-/g, "");
  return `Q-${kst}-${random().toString(36).slice(2, 5).toUpperCase().padEnd(3, "0")}`;
}

/** 주문서(폴더) 저장 입력. 주문 화면 → POST /api/order/programs */
export type ProgramInput = { id: string; name: string; minOrder: number; memo: string; prefill: boolean; basis: PriceBasis; lines: OrderLine[] };
/** 주문 화면에서 다시 고칠 때 쓰는 선택 상태. qty 키는 주문 화면과 같다: `group:rec|규격` */
export type Selection = { v: 1; basis: PriceBasis; prefill: boolean; qty: Record<string, number> };

export function readProgramInput(raw: unknown): Check<ProgramInput> {
  const b = (raw ?? {}) as Record<string, unknown>;
  const lines = readLines(b.lines, false);
  if (!lines.ok) return lines;
  const id = typeof b.id === "string" && /^rec[A-Za-z0-9]{14}$/.test(b.id) ? b.id : "";
  const name = str(b.name, 60);
  if (!name) return { ok: false, message: "주문서 이름을 적어 주세요." };
  const min = Number(b.minOrder);
  return {
    ok: true,
    value: {
      id, name, minOrder: Number.isInteger(min) && min > 0 ? Math.min(min, 10_000_000_000) : 0,
      memo: typeof b.memo === "string" ? b.memo.slice(0, 1000) : "", prefill: b.prefill === true,
      basis: (PRICE_BASES as readonly string[]).includes(String(b.basis)) ? (b.basis as PriceBasis) : "base", lines: lines.value,
    },
  };
}

/** 링크가 읽는 품목JSON + 다시 고칠 때 쓸 선택 상태. 수량 0으로 고른 줄은 없다(화면이 수량으로 고른다) — 최소 1로 둔다. */
export function programPayloads(input: ProgramInput): { items: ReturnType<typeof linkPayload>; selection: Selection } {
  const qty: Record<string, number> = {};
  for (const l of input.lines) qty[`${l.group}:${l.id}|${l.size}`] = Math.max(1, l.qty);
  return { items: linkPayload(input.lines, input.prefill), selection: { v: 1, basis: input.basis, prefill: input.prefill, qty } };
}
