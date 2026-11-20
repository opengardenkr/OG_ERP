/**
 * 영문 발주서(Order inquiry / Purchase order) 규칙. 화면·서버가 같이 쓴다 — server-only 없음, Airtable 모름.
 * 발주서 한 장 = 공급업체 하나 + 통화 하나. 문서는 영어이고 품목·규격·수량·단가만 싣는다(2026-11-20 사용자:
 * "쓸데없는 글씨 너무 많아, 오더 인콰이어리하고 품목 규격 단가 수량만"). 단가를 비우면 "On request".
 */

export const CURRENCIES = ["EUR", "USD", "KRW", "JPY", "GBP", "CNY"] as const;
export type Currency = (typeof CURRENCIES)[number];

export const CURRENCY_LABEL: Record<Currency, string> = {
  EUR: "EUR · 유로",
  USD: "USD · 달러",
  KRW: "KRW · 원",
  JPY: "JPY · 엔",
  GBP: "GBP · 파운드",
  CNY: "CNY · 위안",
};

const DECIMALS: Record<Currency, number> = { EUR: 2, USD: 2, KRW: 0, JPY: 0, GBP: 2, CNY: 2 };

/** 문서 제목. 재고·가격 확인 먼저(inquiry), 확정 주문(order). */
export const PO_KINDS = ["inquiry", "order"] as const;
export type PoKind = (typeof PO_KINDS)[number];
export const PO_TITLE: Record<PoKind, string> = { inquiry: "ORDER INQUIRY", order: "PURCHASE ORDER" };
export const PO_KIND_LABEL: Record<PoKind, string> = { inquiry: "ORDER INQUIRY · 재고·가격 확인", order: "PURCHASE ORDER · 확정 주문" };

export const PO_STATUSES = ["작성", "발주완료", "공급업체확인", "부분입고", "입고완료", "취소"] as const;
export type PoStatus = (typeof PO_STATUSES)[number];

export type PoParty = { company: string; attn: string; address: string; phone: string; email: string; taxId: string };

/** 발주서를 받는 공급업체(거래처 구분 '공급업체'). 고르면 PoParty 칸을 채운다. */
export type PoSupplier = { id: string; name: string } & PoParty;

export type PoLine = {
  /** 공급업체의 품목 코드(예: COSWGOLD). 없으면 빈 문자열. */
  code: string;
  /** 영문 품명(예: Cornus sericea 'White Gold'). */
  description: string;
  size: string;
  qty: number;
  unit: string;
  /** null = On request(가격 문의). 합계에서 빠진다. */
  price: number | null;
};

/**
 * 발주내용JSON v1. 발행 당시 공급업체 정보까지 담는다 — 거래처를 나중에 고쳐도 문서는 그대로.
 * (첫 판에 있던 reference·납기·인도/결제 조건·ship to 칸은 2026-11-20에 뺐다. 옛 JSON에 남아 있어도 무시한다)
 */
export type PoDoc = {
  v: 1;
  kind: PoKind;
  currency: Currency;
  supplier: PoParty;
  lines: PoLine[];
  /** 적으면 표 아래 Note 한 칸으로 나온다. 비우면 아무것도 안 나온다. */
  remarks: string;
};

export const MAX_LINES = 200;

export const emptyParty = (): PoParty => ({ company: "", attn: "", address: "", phone: "", email: "", taxId: "" });

export const isCurrency = (v: unknown): v is Currency => (CURRENCIES as readonly unknown[]).includes(v);
export const isPoKind = (v: unknown): v is PoKind => (PO_KINDS as readonly unknown[]).includes(v);
export const isPoStatus = (v: unknown): v is PoStatus => (PO_STATUSES as readonly unknown[]).includes(v);

export const decimalsOf = (currency: Currency) => DECIMALS[currency];

function round(n: number, d: number): number {
  const f = 10 ** d;
  return Math.round((n + Number.EPSILON) * f) / f;
}

/** 줄 금액. 단가 미정이면 null. 통화 소수 자리에서 반올림한다(KRW·JPY는 정수). */
export function lineAmount(line: Pick<PoLine, "qty" | "price">, currency: Currency): number | null {
  if (line.price === null) return null;
  return round(line.qty * line.price, DECIMALS[currency]);
}

export type PoTotals = {
  lines: number;
  qty: number;
  /** 단가가 있는 줄만 더한 값. */
  total: number;
  /** 단가 미정 줄 번호(1부터). */
  onRequest: number[];
  /** 줄들이 쓴 단위(같으면 하나). 문서 합계 줄에 "1,003 pcs"처럼 붙인다. */
  units: string[];
};

export function poTotals(doc: Pick<PoDoc, "lines" | "currency">): PoTotals {
  const d = DECIMALS[doc.currency];
  let total = 0;
  let qty = 0;
  const onRequest: number[] = [];
  doc.lines.forEach((line, i) => {
    qty += line.qty;
    const amount = lineAmount(line, doc.currency);
    if (amount === null) onRequest.push(i + 1);
    else total += amount;
  });
  const units = [...new Set(doc.lines.map((l) => l.unit.trim()).filter(Boolean))];
  return { lines: doc.lines.length, qty: round(qty, 2), total: round(total, d), onRequest, units };
}

const en = (min: number, max: number) =>
  new Intl.NumberFormat("en-US", { minimumFractionDigits: min, maximumFractionDigits: max });

/** 금액: 통화 소수 자리 그대로(1,234.50 / 1,234,500). */
export const formatAmount = (n: number, currency: Currency) => en(DECIMALS[currency], DECIMALS[currency]).format(n);

/** 단가: 소수 통화는 셋째 자리까지 보인다(0.355). 정수 통화는 정수. */
export function formatPrice(n: number, currency: Currency): string {
  const d = DECIMALS[currency];
  return en(d, d === 0 ? 0 : d + 2).format(n);
}

export const formatQty = (n: number) => en(0, 2).format(n);

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** 2026-11-20 → 20 Nov 2026. 날짜 꼴이 아니면 그대로. */
export function formatDateEn(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  if (!m) return iso.trim();
  return `${+m[3]} ${MONTHS[+m[2] - 1]} ${m[1]}`;
}

/** 등록번호 칸 이름. 한국 사업자등록번호 꼴이면 Business Reg. No., 아니면 VAT No. */
export const taxLabel = (taxId: string) => (/^\d{3}-?\d{2}-?\d{5}$/.test(taxId.trim()) ? "Business Reg. No." : "VAT No.");

/** 발주번호 PO-YYYYMMDD-001. 그날 이미 쓴 번호 중 가장 큰 것 + 1. */
export function poNumber(date: string, existing: string[]): string {
  const day = date.replaceAll("-", "");
  const prefix = `PO-${day}-`;
  const max = existing.reduce((m, no) => {
    if (!no.startsWith(prefix)) return m;
    const n = Number.parseInt(no.slice(prefix.length), 10);
    return Number.isFinite(n) && n > m ? n : m;
  }, 0);
  return `${prefix}${String(max + 1).padStart(3, "0")}`;
}

/** A4 쪽 나누기. 첫 쪽은 To 줄이 있어 조금 적다. 빈 목록도 한 쪽. */
export function poPages<T>(lines: T[], first = 26, next = 30): T[][] {
  const pages: T[][] = [lines.slice(0, first)];
  for (let i = first; i < lines.length; i += next) pages.push(lines.slice(i, i + next));
  return pages;
}

/**
 * 인쇄할 쪽들. Note가 있는데 마지막 쪽에 자리가 없으면(첫 쪽 20줄, 다음 쪽 24줄 넘게)
 * Note만 다음 쪽으로 넘긴다 — 빈 품목 목록의 쪽이 하나 붙는다.
 */
export function poLayout<T>(lines: T[], hasNote = false): T[][] {
  const pages = poPages(lines);
  const room = pages.length === 1 ? 20 : 24;
  if (hasNote && (pages.at(-1)?.length ?? 0) > room) pages.push([]);
  return pages;
}

/** 작업메모·품목요약용 한 줄씩: "Cornus sericea 'White Gold' P9 × 50 pcs". */
export function lineSummary(doc: Pick<PoDoc, "lines">): string {
  return doc.lines
    .map((l) => `${[l.code, l.description, l.size].filter(Boolean).join(" ")} × ${formatQty(l.qty)}${l.unit ? ` ${l.unit}` : ""}`)
    .join("\n");
}

const HANGUL = /[ㄱ-ㆎ가-힣]/;

/** 한글이 든 칸 이름(화면 경고용). 영문 문서라 외국 업체가 못 읽는다 — 막지는 않는다(국내 공급업체 상호 등). */
export function hangulFields(doc: PoDoc): string[] {
  const out: string[] = [];
  // 문서에 찍히는 칸만 본다: To 줄(상호·담당자), 품목 줄, Note.
  if (HANGUL.test(doc.supplier.company)) out.push("공급업체 상호");
  if (HANGUL.test(doc.supplier.attn)) out.push("담당자");
  doc.lines.forEach((l, i) => {
    if ([l.description, l.size, l.unit].some((v) => HANGUL.test(v))) out.push(`${i + 1}번째 줄`);
  });
  if (HANGUL.test(doc.remarks)) out.push("Note");
  return out;
}

// ── 입력 검사 ─────────────────────────────────────────────

const str = (v: unknown, max = 300): string => (typeof v === "string" ? v.trim().slice(0, max) : "");

/** "1,003" → 1003. 비었거나 숫자가 아니면 NaN. */
function num(v: unknown): number {
  if (typeof v === "number") return v;
  if (typeof v !== "string") return Number.NaN;
  const t = v.replaceAll(",", "").trim();
  return t === "" ? Number.NaN : Number(t);
}

function party(v: unknown): PoParty {
  const o = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  return {
    company: str(o.company, 200),
    attn: str(o.attn, 200),
    address: str(o.address, 500),
    phone: str(o.phone, 100),
    email: str(o.email, 200),
    taxId: str(o.taxId, 60),
  };
}

const blankLine = (o: Record<string, unknown>) =>
  !str(o.code) && !str(o.description) && !str(o.size) && !(num(o.qty) > 0) && (o.price === null || o.price === undefined || o.price === "");

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const RECORD_ID = /^rec[A-Za-z0-9]{14}$/;

export type PoInput = { date: string; supplierId: string | null; doc: PoDoc };

/**
 * 화면에서 받은 값 검사. 완전히 빈 줄은 버린다.
 * 단가 칸이 비면 On request(null), 0은 0(무상)으로 둔다.
 */
export function checkPoInput(raw: unknown): { error: string } | PoInput {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const date = str(o.date, 10);
  if (!DATE.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00Z`))) return { error: "발주일을 확인해라." };
  const supplierId = typeof o.supplierId === "string" && RECORD_ID.test(o.supplierId) ? o.supplierId : null;

  const d = (o.doc && typeof o.doc === "object" ? o.doc : {}) as Record<string, unknown>;
  if (!isCurrency(d.currency)) return { error: "통화를 골라라." };
  const supplier = party(d.supplier);
  if (!supplier.company) return { error: "공급업체 상호(영문)를 적어라." };

  const rawLines = (Array.isArray(d.lines) ? d.lines : []).map((l) => (l && typeof l === "object" ? l : {}) as Record<string, unknown>);
  const kept = rawLines.filter((l) => !blankLine(l));
  if (kept.length === 0) return { error: "품목을 한 줄 이상 적어라." };
  if (kept.length > MAX_LINES) return { error: `품목은 ${MAX_LINES}줄까지다.` };

  const lines: PoLine[] = [];
  for (const [i, l] of kept.entries()) {
    const at = `${i + 1}번째 줄`;
    const description = str(l.description, 300);
    if (!description) return { error: `${at}: 품명(영문)을 적어라.` };
    const qty = num(l.qty);
    if (!Number.isFinite(qty) || qty <= 0) return { error: `${at}: 수량을 확인해라.` };
    let price: number | null = null;
    if (!(l.price === null || l.price === undefined || l.price === "")) {
      price = num(l.price);
      if (!Number.isFinite(price) || price < 0) return { error: `${at}: 단가를 확인해라(가격 문의는 비워 둔다).` };
    }
    lines.push({ code: str(l.code, 60), description, size: str(l.size, 60), qty, unit: str(l.unit, 20), price });
  }

  return {
    date,
    supplierId,
    // 제목이 없는 옛 문서는 PURCHASE ORDER(처음 만든 양식의 제목)
    doc: { v: 1, kind: isPoKind(d.kind) ? d.kind : "order", currency: d.currency, supplier, lines, remarks: str(d.remarks, 4000) },
  };
}

/** 저장된 발주내용JSON 읽기. 깨졌으면 null. */
export function parsePoDoc(json: string | undefined | null): PoDoc | null {
  if (!json) return null;
  try {
    const raw = JSON.parse(json) as Record<string, unknown>;
    if (raw?.v !== 1) return null;
    const checked = checkPoInput({ date: "2000-01-01", doc: raw });
    return "error" in checked ? null : checked.doc;
  } catch {
    return null;
  }
}
