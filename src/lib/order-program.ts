/**
 * 주문서(폴더) 규칙. 순수 함수 — 서버·화면·테스트가 함께 쓴다.
 *
 * 주문서 1개 = 품목·가격·안내문구 묶음([영업] 주문서 한 줄).
 * 회사마다 고객 링크를 하나씩 배포한다([영업] 주문 링크 한 줄, `주문서`로 묶임).
 * 고객이 링크로 보낸 주문은 견적요청 표에 `[주문 링크 <링크ID>]`로 시작하는 요청사항과 함께 쌓인다.
 */
// 값은 가져오지 않는다(타입만) — 테스트가 이 파일을 별칭(@/) 없이 바로 읽는다. 입력 검사·저장값 만들기는 order.ts에 있다.
import type { OrderGroup, Selection } from "@/lib/order";

export type LinkRow = [string, number | null, number, number, ...unknown[]];
export type LinkCard = { k: string; group: OrderGroup; rec: string; grp: string; name: string; unit?: string; rows: LinkRow[]; [extra: string]: unknown };
export type LinkPayload = { v: 1; items: LinkCard[]; [extra: string]: unknown };

export function parsePayload(raw: unknown): LinkPayload | null {
  if (typeof raw !== "string" || !raw.trim()) return null;
  try {
    const data = JSON.parse(raw) as LinkPayload;
    return data && data.v === 1 && Array.isArray(data.items) ? data : null;
  } catch {
    return null;
  }
}

export function parseSelection(raw: unknown): Selection | null {
  if (typeof raw !== "string" || !raw.trim()) return null;
  try {
    const s = JSON.parse(raw) as Selection;
    return s && s.v === 1 && s.qty && typeof s.qty === "object" ? s : null;
  } catch {
    return null;
  }
}

/** 공동수입처럼 웹사이트가 품목을 직접 읽는 링크(src가 있는 것)는 ERP가 품목을 쓰지 않는다. */
export const isManagedPayload = (p: LinkPayload | null) => !!p && !p.src;

/**
 * 주문 화면(품목 고르기)에서 다시 고칠 수 있는 품목인가: 모든 카드가 라인업 레코드(group·rec)를 가리킨다.
 * 사진·크레이트·설명을 손으로 넣은 주문서는 아니다 — 화면에서 다시 저장하면 그 정보가 사라진다.
 */
export const isPickerPayload = (p: LinkPayload | null) => !!p && !p.src && p.items.every((it) => typeof it.group === "string" && typeof it.rec === "string");

export const stockKey = (group: string, rec: string) => `${group}:${rec}`;

/**
 * 재고만 지금 값으로 바꾼다. 가격·이름·크레이트 같은 다른 칸은 그대로 둔다.
 * 재고를 못 읽은 품목(map에 없음)은 예전 값을 둔다.
 */
export function refreshStock(p: LinkPayload, stock: Map<string, number | null>): LinkPayload {
  return {
    ...p,
    items: p.items.map((it) => {
      const key = stockKey(it.group, it.rec);
      if (!stock.has(key)) return it;
      const s = stock.get(key) ?? null;
      return { ...it, rows: it.rows.map((r) => [r[0], s, ...r.slice(2)] as LinkRow) };
    }),
  };
}

export const payloadKeys = (p: LinkPayload) => [...new Set(p.items.map((it) => stockKey(it.group, it.rec)))];

/** 견적요청 한 건(링크로 들어온 주문) */
export type OrderRequest = { id: string; no: string; at: string; who: string; phone: string; memo: string; items: string; draft: string; status: string };
export type OrderedLine = { name: string; spec: string; qty: number; price: number };

export const linkTag = (linkId: string) => `[주문 링크 ${linkId}]`;
export const isFromLink = (memo: string, linkId: string) => memo.trimStart().startsWith(linkTag(linkId));

/** 견적요청 품목JSON(웹 접수 형식) → 줄. kname = `분류 이름 [n크레이트×m구] @₩단가 = ₩금액`, qty = 낱개 수. */
export function orderedLines(raw: string): OrderedLine[] {
  let list: unknown;
  try {
    list = JSON.parse(raw || "[]");
  } catch {
    return [];
  }
  if (!Array.isArray(list)) return [];
  return list.flatMap((x) => {
    const it = x as { kname?: unknown; size?: unknown; qty?: unknown };
    const kname = typeof it.kname === "string" ? it.kname.trim() : "";
    const m = kname.match(/^(.*?)\s*@\s*₩\s*([\d,]+)/);
    const qty = Math.max(0, Math.floor(Number(it.qty) || 0));
    if (!m || !qty) return [];
    return [{ name: stripCrate(m[1].trim()), spec: typeof it.size === "string" ? it.size.trim() : "", qty, price: Number(m[2].replace(/,/g, "")) || 0 }];
  });
}

/** 크레이트 행은 이름 뒤에 `3크레이트×100구`가 붙는다. 같은 품목으로 합치려고 뗀다(수량은 이미 낱개). */
export const stripCrate = (name: string) => name.replace(/\s*[\d,]+크레이트×[\d,]+구$/, "").trim();

/** 여러 주문을 한 견적으로: 이름·규격·단가가 같으면 수량을 더한다. 처음 나온 순서를 지킨다. */
export function mergeLines(groups: OrderedLine[][]): OrderedLine[] {
  const out = new Map<string, OrderedLine>();
  for (const lines of groups) {
    for (const l of lines) {
      const key = `${l.name}|${l.spec}|${l.price}`;
      const cur = out.get(key);
      if (cur) cur.qty += l.qty;
      else out.set(key, { ...l });
    }
  }
  return [...out.values()];
}

export const orderTotal = (lines: OrderedLine[]) => lines.reduce((a, l) => a + l.qty * l.price, 0);

const norm = (s: string) => s.toLowerCase().replace(/[\s'"‘’“”`´()[\]·.,-]/g, "");

export type Deduction = { group: OrderGroup; rec: string; name: string; spec: string; qty: number };

/**
 * 견적 줄 → 라인업 레코드. 주문 페이지가 견적 품목명을 `분류 이름`으로 만들므로 같은 모양으로 맞춘다.
 * 분류 없이 이름만 적힌 줄(견적서에서 고친 경우)도 받는다. 못 찾은 줄은 unmatched로 돌려준다.
 */
export function deductions(lines: OrderedLine[], p: LinkPayload): { list: Deduction[]; unmatched: OrderedLine[] } {
  const byName = new Map<string, LinkCard[]>();
  for (const it of p.items) {
    for (const key of [norm(`${it.grp} ${it.name}`), norm(it.name)]) byName.set(key, [...(byName.get(key) ?? []), it]);
  }
  const list: Deduction[] = [];
  const unmatched: OrderedLine[] = [];
  for (const l of lines) {
    const cards = byName.get(norm(stripCrate(l.name))) ?? [];
    const card = cards.find((c) => c.rows.some((r) => norm(r[0]) === norm(l.spec))) ?? (cards.length === 1 ? cards[0] : undefined);
    if (!card || l.qty <= 0) {
      if (l.qty > 0) unmatched.push(l);
      continue;
    }
    const prev = list.find((d) => d.group === card.group && d.rec === card.rec);
    if (prev) prev.qty += l.qty;
    else list.push({ group: card.group, rec: card.rec, name: l.name, spec: l.spec, qty: l.qty });
  }
  return { list, unmatched };
}

/** 견적번호: 견적서 생성기·자동 초안과 같은 규칙. OG-YYYYMMDD-(오늘 가장 큰 번호+1, 3자리) */
export function nextQuoteNo(numbers: string[], compact: string): string {
  let max = 0;
  for (const n of numbers) {
    const m = n.match(/^OG-(\d{8})-(\d+)(?:-R\d+)?$/);
    if (m && m[1] === compact) max = Math.max(max, Number(m[2]));
  }
  return `OG-${compact}-${String(max + 1).padStart(3, "0")}`;
}

/** 수정본까지 따라가 가장 최근 번호를 고른다: 기준 번호 또는 기준-R2, -R3… */
export function latestRevision<T extends { number: string }>(rows: T[], base: string): T | null {
  const rev = (n: string) => (n === base ? 1 : Number(n.slice(base.length).match(/^-R(\d+)$/)?.[1] ?? 0));
  return rows.filter((r) => rev(r.number) > 0).sort((a, b) => rev(b.number) - rev(a.number))[0] ?? null;
}

/** 한국 시각 조각 */
export function seoulParts(now: Date) {
  const k = new Date(now.getTime() + 9 * 3600_000);
  const p2 = (n: number) => String(n).padStart(2, "0");
  const Y = k.getUTCFullYear(), M = k.getUTCMonth() + 1, D = k.getUTCDate();
  const ymd = `${Y}-${p2(M)}-${p2(D)}`;
  const vu = new Date(Date.UTC(Y, M - 1, D + 14));
  return {
    ymd, compact: ymd.replace(/-/g, ""), hm: `${p2(k.getUTCHours())}:${p2(k.getUTCMinutes())}`,
    issuedAt: `${ymd}T${p2(k.getUTCHours())}:${p2(k.getUTCMinutes())}:${p2(k.getUTCSeconds())}+09:00`,
    label: `${Y}. ${M}. ${D}.`, validUntil: `${vu.getUTCFullYear()}-${p2(vu.getUTCMonth() + 1)}-${p2(vu.getUTCDate())}`,
  };
}

const won = (n: number) => Math.round(n).toLocaleString("en-US");
export const quoteSummary = (lines: OrderedLine[]) =>
  lines.map((it, i) => `${i + 1}. ${it.name}${it.spec ? ` (${it.spec})` : ""} ${won(it.qty)} × ${won(it.price)} = ${won(it.qty * it.price)}`).join("\n");
