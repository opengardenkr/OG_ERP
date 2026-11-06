/**
 * 매출 화면(미수금·마진)의 규칙. 순수 함수 — 서버·화면·테스트 어디서나 쓴다.
 * 원천은 `견적서 발송 내역` 한 표다. 판매 1건 = 판매 상태인 견적 1장.
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
  paid: number; // 입금액 누계
  paidOn: string; // 입금일
  payState: string; // 입금상태(옛 칸)
  lines: QuoteLine[];
  costs: Record<string, number>; // 원가JSON.lines
};

export const isSale = (status: string) => (SALE_STATES as readonly string[]).includes(status);

/** 받은 돈. 금액 칸이 생기기 전에 '완납'만 찍어 둔 건은 다 받은 것으로 본다. */
export function paidOf(s: Pick<Sale, "paid" | "payState" | "total">): number {
  if (s.paid > 0) return s.paid;
  return s.payState === "완납" ? s.total : 0;
}

export const balanceOf = (s: Pick<Sale, "paid" | "payState" | "total">) => Math.max(0, s.total - paidOf(s));

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

/** 입금 기록 결과. 금액이 잔액을 넘으면 거절한다(오타로 0 하나 더 붙이는 일이 흔하다). */
export function applyPayment(s: Pick<Sale, "paid" | "payState" | "total">, amount: number):
  { ok: true; paid: number; payState: "선금" | "완납" } | { ok: false; error: string } {
  if (!Number.isFinite(amount) || amount <= 0 || !Number.isInteger(amount)) return { ok: false, error: "입금액을 원 단위 숫자로 적어 주세요." };
  const balance = balanceOf(s);
  if (balance <= 0) return { ok: false, error: "이미 다 받은 건입니다." };
  if (amount > balance) return { ok: false, error: `잔액(${won(balance)})보다 큽니다. 금액을 확인해 주세요.` };
  const paid = paidOf(s) + amount;
  return { ok: true, paid, payState: paid >= s.total ? "완납" : "선금" };
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
