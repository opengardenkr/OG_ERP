/**
 * 매출 화면(미수금·마진)의 규칙. 순수 함수 — 서버·화면·테스트 어디서나 쓴다.
 * 판매 = `견적서 발송 내역`의 견적 묶음(기준 번호 + 수정본) 하나. 돈은 `[영업] 입금` 장부가 원천이다(2026-11-07):
 * 한 줄 = 입금 / 환불 / 조정 한 번. 나눠 받기·차액 돌려주기·끝전 깎기가 모두 줄을 더하는 일이다.
 * 장부는 묶음 번호로 묶어서, 수정본(-R2…)이 새로 나와도 받은 돈이 따라간다.
 */

/** 판매로 보는 상태. 발송·작성·수정됨 같은 견적 단계는 빠진다. */
export const SALE_STATES = ["수주확정", "입고대기", "출고대기", "출하완료", "완료"] as const;

export type QuoteLine = { name: string; spec: string; qty: number; price: number };

export type Sale = {
  id: string;
  number: string;
  issued: string; // 발행일
  ordered: string; // 수주일
  company: string;
  status: string;
  dealType: string;
  total: number; // 합계(부가세 포함)
  supply: number; // 공급가액
  paid: number; // 받은 돈(입금 − 환불). 장부가 없으면 옛 칸 입금액
  paidOn: string; // 마지막 입금일
  payState: string; // 입금상태(옛 칸)
  lines: QuoteLine[];
  costs: Record<string, number>; // 원가JSON.lines
  adjusted: number; // 조정(안 받기로 한 금액)
  ledger: boolean; // 장부 줄이 있다(있으면 옛 칸을 보지 않는다)
  entries: Payment[]; // 이 묶음의 장부 줄(취소 포함, 최근 순)
};

export const PAY_KINDS = ["입금", "환불", "조정"] as const;
export type PayKind = (typeof PAY_KINDS)[number];
export const PAY_METHODS = ["계좌이체", "카드", "현금", "기타"] as const;

/** `[영업] 입금` 한 줄. 금액은 늘 양수 — 방향은 구분이 정한다. */
export type Payment = {
  id: string; base: string; kind: PayKind; amount: number; date: string; method: string;
  company: string; memo: string; who: string; at: string; canceled: boolean;
};

export const isSale = (status: string) => (SALE_STATES as readonly string[]).includes(status);

type Money = Pick<Sale, "paid" | "payState" | "total"> & Partial<Pick<Sale, "adjusted" | "ledger">>;

/** 받은 돈. 장부가 있으면 장부(입금 − 환불). 없으면 옛 칸: 입금액, 그것도 없이 '완납'만 찍어 둔 건은 다 받은 것으로 본다. */
export function paidOf(s: Money): number {
  if (s.ledger) return s.paid;
  if (s.paid > 0) return s.paid;
  return s.payState === "완납" ? s.total : 0;
}

/** 받을 돈 = 합계 − 받은 돈 − 조정. 0 아래로는 안 내려간다(그건 돌려줄 돈). */
export const balanceOf = (s: Money) => Math.max(0, s.total - paidOf(s) - (s.adjusted ?? 0));
/** 돌려줄 돈: 받은 돈이 합계보다 많다(수정본으로 금액이 줄었거나 더 받았다). */
export const overpaidOf = (s: Money) => Math.max(0, paidOf(s) + (s.adjusted ?? 0) - s.total);

/** 장부 줄 합계. 취소한 줄은 빠진다. */
export function ledgerSum(entries: Payment[]) {
  const live = entries.filter((e) => !e.canceled);
  const sum = (k: PayKind) => live.filter((e) => e.kind === k).reduce((a, e) => a + e.amount, 0);
  const received = sum("입금"), refunded = sum("환불"), adjusted = sum("조정");
  const lastDate = live.filter((e) => e.kind === "입금" && e.date).map((e) => e.date).sort().pop() ?? "";
  return { received, refunded, adjusted, net: received - refunded, lastDate };
}

/** 판매(견적 한 장)에 그 묶음의 장부를 붙인다. */
export function withLedger<T extends Sale>(s: T, payments: Payment[]): T {
  const entries = payments.filter((p) => p.base === chainOf(s.number))
    .sort((a, b) => (b.date || b.at.slice(0, 10)).localeCompare(a.date || a.at.slice(0, 10)) || b.at.localeCompare(a.at));
  if (!entries.length) return { ...s, entries: [], ledger: false, adjusted: 0 };
  const sum = ledgerSum(entries);
  return { ...s, entries, ledger: true, paid: sum.net, adjusted: sum.adjusted, paidOn: sum.lastDate };
}

/** 입금상태(옛 칸) 거울: 장부를 적을 때 견적에도 같이 적어 둔다 — 견적서 화면에서도 보이게. */
export function payStateOf(s: Money): "미입금" | "선금" | "완납" {
  const paid = paidOf(s);
  if (paid > 0 && balanceOf(s) === 0) return "완납";
  return paid > 0 ? "선금" : "미입금";
}

export type EntryCheck = { ok: true; paid: number; adjusted: number; balance: number; overpaid: number } | { ok: false; error: string };

/**
 * 장부 한 줄을 더해도 되나. 오타(0 하나 더)를 막는 게 목적이라 넘치는 금액은 거절하고,
 * 실제로 더 받았거나 더 돌려준 경우만 `over`(화면의 확인 체크)로 통과시킨다.
 * - 입금: 받을 돈까지. 넘치면 돌려줄 돈으로 남는다.
 * - 환불: 받은 돈까지(over 없이 돌려줄 돈까지). 반품·취소면 견적서 수정본으로 금액부터 줄인다.
 * - 조정: 받을 돈까지(끝전·에누리·대손). over 없음.
 */
export function checkEntry(s: Money, kind: PayKind, amount: number, over = false): EntryCheck {
  if (!Number.isInteger(amount) || amount <= 0) return { ok: false, error: "금액을 원 단위 숫자로 적어 주세요." };
  const paid = paidOf(s), adjusted = s.adjusted ?? 0, balance = balanceOf(s), overpaid = overpaidOf(s);
  let nextPaid = paid, nextAdj = adjusted;
  if (kind === "입금") {
    if (amount > balance && !over) {
      return { ok: false, error: balance > 0 ? `받을 돈(${won(balance)})보다 큽니다. 실제로 더 받았으면 '더 받음'에 체크하세요.` : "받을 돈이 없습니다. 실제로 더 받았으면 '더 받음'에 체크하세요." };
    }
    nextPaid = paid + amount;
  } else if (kind === "환불") {
    if (amount > paid) return { ok: false, error: `받은 돈(${won(paid)})보다 많이 돌려줄 수 없습니다.` };
    if (amount > overpaid && !over) {
      return { ok: false, error: overpaid > 0 ? `돌려줄 돈(${won(overpaid)})보다 큽니다. 반품·취소면 견적서에서 수정본으로 금액을 먼저 줄이세요. 그래도 맞으면 체크하세요.` : "돌려줄 돈이 없습니다. 반품·취소면 견적서에서 수정본으로 금액을 먼저 줄이세요. 그래도 맞으면 체크하세요." };
    }
    nextPaid = paid - amount;
  } else {
    if (amount > balance) return { ok: false, error: `받을 돈(${won(balance)})까지만 조정할 수 있습니다.` };
    nextAdj = adjusted + amount;
  }
  const next = { ...s, ledger: true, paid: nextPaid, adjusted: nextAdj };
  return { ok: true, paid: nextPaid, adjusted: nextAdj, balance: balanceOf(next), overpaid: overpaidOf(next) };
}

/** 경과일의 기준일: 수주일, 없으면 발행일. */
export const sinceOf = (s: Pick<Sale, "ordered" | "issued">) => s.ordered || s.issued;

export function daysBetween(from: string, to: string): number {
  if (!from) return 0;
  return Math.max(0, Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000));
}

export type ReceivableGroup = { company: string; balance: number; oldest: number; sales: (Sale & { balance: number; age: number })[] };

/** 잔액이 남은 판매만 거래처별로 묶는다. 잔액 큰 거래처가 위. */
export function groupReceivables(sales: Sale[], today: string): ReceivableGroup[] {
  const map = new Map<string, ReceivableGroup>();
  for (const s of sales) {
    const balance = balanceOf(s);
    if (balance <= 0) continue;
    const age = daysBetween(sinceOf(s), today);
    const key = s.company.trim() || "거래처 없음";
    const g = map.get(key) ?? { company: key, balance: 0, oldest: 0, sales: [] };
    g.balance += balance;
    g.oldest = Math.max(g.oldest, age);
    g.sales.push({ ...s, balance, age });
    map.set(key, g);
  }
  const groups = [...map.values()];
  for (const g of groups) g.sales.sort((a, b) => b.age - a.age);
  return groups.sort((a, b) => b.balance - a.balance);
}

export const won = (n: number) => `₩${Math.round(n).toLocaleString("ko-KR")}`;

/** 작업메모 맨 위에 붙일 한 줄. 견적서 도구와 같은 모양: `YYYY-MM-DD HH:mm · 이름 · 일 · 내용` */
export function memoLine(now: Date, who: string, what: string, detail: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(now);
  const p = (t: string) => parts.find((x) => x.type === t)?.value ?? "";
  return `${p("year")}-${p("month")}-${p("day")} ${p("hour")}:${p("minute")} · ${who} · ${what} · ${detail}`;
}

export const prependMemo = (memo: string, line: string) => (memo.trim() ? `${line}\n${memo}` : line);

/** 품목JSON → 줄. 깨진 줄은 버린다. */
export function parseLines(raw: unknown): QuoteLine[] {
  if (typeof raw !== "string" || !raw.trim()) return [];
  try {
    const data = JSON.parse(raw) as { items?: unknown };
    if (!Array.isArray(data.items)) return [];
    return data.items.flatMap((it) => {
      const x = it as Record<string, unknown>;
      const name = typeof x.name === "string" ? x.name.trim() : "";
      const qty = Number(x.qty), price = Number(x.price);
      if (!name || !Number.isFinite(qty) || !Number.isFinite(price)) return [];
      return [{ name, spec: typeof x.spec === "string" ? x.spec.trim() : "", qty, price }];
    });
  } catch {
    return [];
  }
}

export function parseCosts(raw: unknown): Record<string, number> {
  if (typeof raw !== "string" || !raw.trim()) return {};
  try {
    const data = JSON.parse(raw) as { v?: number; lines?: Record<string, unknown> };
    const out: Record<string, number> = {};
    for (const [k, v] of Object.entries(data.lines ?? {})) if (typeof v === "number" && Number.isFinite(v) && v >= 0) out[k] = v;
    return out;
  } catch {
    return {};
  }
}

/** 품목 이름·규격 비교용. 띄어쓰기·따옴표·괄호·'규격' 글자를 없앤다. */
export const normName = (s: string) => s.toLowerCase().replace(/[\s'"‘’“”`´()[\]·・.,-]/g, "");
export const normSpec = (s: string) => s.toLowerCase().replace(/규격/g, "").replace(/[\s'"()]/g, "");
export const lineKey = (l: Pick<QuoteLine, "name" | "spec">) => `${l.name}|${l.spec}`;
export const matchKey = (name: string, spec: string) => `${normName(name)}|${normSpec(spec)}`;

export type CostSource = "직접" | "총원가" | "다른 건";
export type CostedLine = QuoteLine & { key: string; revenue: number; unitCost: number | null; source: CostSource | null };

/**
 * 줄마다 원가를 찾는다. 순서: 이 건에 직접 적은 값 → 라인업 표의 원가(호게나르드 총원가) → 다른 판매건에 적은 값.
 * 못 찾으면 null — 0으로 두면 마진이 부풀려 보인다.
 */
export function costLines(sale: Pick<Sale, "lines" | "costs">, catalog: Map<string, number>, learned: Map<string, number>): CostedLine[] {
  return sale.lines.map((l) => {
    const key = lineKey(l), mk = matchKey(l.name, l.spec);
    const own = sale.costs[key];
    const [unitCost, source]: [number | null, CostSource | null] =
      own !== undefined ? [own, "직접"]
        : catalog.has(mk) ? [catalog.get(mk)!, "총원가"]
        : learned.has(mk) ? [learned.get(mk)!, "다른 건"]
        : l.price === 0 ? [0, "직접"] // 무상·대여 줄은 매출도 원가도 없다
        : [null, null];
    return { ...l, key, revenue: l.qty * l.price, unitCost, source };
  });
}

export type Margin = { revenue: number; cost: number; margin: number; rate: number | null; missing: number };

/** 매출은 공급가액(할인 반영, 부가세 제외). 공급가액이 없으면 줄 합계. 원가를 모르는 줄은 원가에서 빠지고 missing에 센다. */
export function marginOf(sale: Pick<Sale, "supply">, lines: CostedLine[]): Margin {
  const revenue = sale.supply > 0 ? sale.supply : lines.reduce((a, l) => a + l.revenue, 0);
  const cost = lines.reduce((a, l) => a + (l.unitCost ?? 0) * l.qty, 0);
  const missing = lines.filter((l) => l.unitCost === null).length;
  const margin = revenue - cost;
  return { revenue, cost, margin, rate: revenue > 0 && missing === 0 ? margin / revenue : null, missing };
}

/** 다른 판매건에 적어 둔 원가. 같은 품목이 여러 건이면 최근(목록 앞쪽) 값. */
export function learnedCosts(sales: Sale[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const s of sales) {
    for (const [k, v] of Object.entries(s.costs)) {
      const [name, spec = ""] = k.split("|");
      const mk = matchKey(name, spec);
      if (!out.has(mk)) out.set(mk, v);
    }
  }
  return out;
}

/** 원가 입력값 → 원가JSON. 빈 칸은 뺀다. 이 건의 줄이 아닌 키는 버린다. */
export function costsPayload(lines: QuoteLine[], input: Record<string, string>): { v: 1; lines: Record<string, number> } | { error: string } {
  const keys = new Set(lines.map(lineKey));
  const out: Record<string, number> = {};
  for (const [k, raw] of Object.entries(input)) {
    if (!keys.has(k)) continue;
    const t = raw.replace(/[,\s₩원]/g, "");
    if (!t) continue;
    const n = Number(t);
    if (!Number.isFinite(n) || n < 0) return { error: `'${k.split("|")[0]}' 원가가 숫자가 아닙니다.` };
    out[k] = n;
  }
  return { v: 1, lines: out };
}

/** 거래처 이름 비교(거래처 화면 ↔ 견적서의 거래처명). */
export const sameCompany = (a: string, b: string) => {
  const n = (s: string) => s.replace(/\(주\)|㈜|주식회사|\s/g, "").toLowerCase();
  return n(a) !== "" && n(a) === n(b);
};

export type MonthRow = { month: string; count: number; supply: number; vat: number; total: number; related: number; paid: number; due: number };

/** 판매의 달 = 수주일(없으면 발행일)의 YYYY-MM */
export const monthOf = (s: Pick<Sale, "ordered" | "issued">) => sinceOf(s).slice(0, 7);

/** 월별 매출. 최근 달이 위. 관계사 거래는 합계에 들고 따로도 보인다(거래구분 = 관계사). */
export function monthlySummary(sales: Sale[]): MonthRow[] {
  const map = new Map<string, MonthRow>();
  for (const s of sales) {
    const month = monthOf(s);
    if (!/^\d{4}-\d{2}$/.test(month)) continue;
    const r = map.get(month) ?? { month, count: 0, supply: 0, vat: 0, total: 0, related: 0, paid: 0, due: 0 };
    r.count += 1;
    r.supply += s.supply;
    r.vat += Math.max(0, s.total - s.supply);
    r.total += s.total;
    if (s.dealType === "관계사") r.related += s.total;
    r.paid += paidOf(s);
    r.due += balanceOf(s);
    map.set(month, r);
  }
  return [...map.values()].sort((a, b) => b.month.localeCompare(a.month));
}

// ── 견적 묶음(기준 번호 + 수정본 -R2…) ─────────────────────

export const chainOf = (number: string) => number.replace(/-R\d+$/, "");
const revOf = (number: string) => Number(number.match(/-R(\d+)$/)?.[1] ?? 1);

/** 판매는 묶음마다 한 건: 판매 상태인 수정본 중 가장 최근 것. 수정본마다 수주확정해도 두 번 세지 않는다. */
export function oneSalePerChain<T extends Pick<Sale, "number" | "status">>(quotes: T[]): T[] {
  const best = new Map<string, T>();
  for (const q of quotes) {
    if (!isSale(q.status)) continue;
    const k = chainOf(q.number), cur = best.get(k);
    if (!cur || revOf(q.number) > revOf(cur.number)) best.set(k, q);
  }
  return [...best.values()];
}

/** 보냈는데 판매로 안 바뀐 견적의 상태. 작성(안 보냄)·거절·만료·취소·수정됨은 뺀다. */
export const OPEN_STATES = ["발송", "수락", "보류", "발송보류"] as const;

/**
 * 판매로 안 잡힌 견적: 묶음의 최신 수정본이 보낸 상태이고, 묶음 어디에도 판매 상태가 없는 것.
 * 실제로 판매했는데 견적서에서 상태를 안 바꾼 건을 찾는 목록이다.
 */
export function openQuotes<T extends Pick<Sale, "number" | "status" | "issued">>(quotes: T[]): T[] {
  const chains = new Map<string, T[]>();
  for (const q of quotes) chains.set(chainOf(q.number), [...(chains.get(chainOf(q.number)) ?? []), q]);
  const out: T[] = [];
  for (const list of chains.values()) {
    if (list.some((q) => isSale(q.status))) continue;
    const latest = [...list].sort((a, b) => revOf(b.number) - revOf(a.number))[0];
    if ((OPEN_STATES as readonly string[]).includes(latest.status)) out.push(latest);
  }
  return out.sort((a, b) => b.issued.localeCompare(a.issued));
}

/** 묶음에서 돈을 붙일 견적: 판매 상태인 최신 수정본, 없으면 최신 수정본. */
export function chainTarget<T extends Pick<Sale, "number" | "status">>(quotes: T[], base: string): T | null {
  const list = quotes.filter((q) => chainOf(q.number) === base);
  const pick = (xs: T[]) => [...xs].sort((a, b) => revOf(b.number) - revOf(a.number))[0] ?? null;
  return pick(list.filter((q) => isSale(q.status))) ?? pick(list);
}

/** 장부 한 줄을 받을 수 있는 견적 상태: 판매 + 보낸 견적(판매 전 선금) */
export const canTakePayment = (status: string) => isSale(status) || (OPEN_STATES as readonly string[]).includes(status);
