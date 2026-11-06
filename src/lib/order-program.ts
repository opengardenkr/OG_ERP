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
    if (!data || data.v !== 1) return null;
    // 공동수입(src: "hg-pool")처럼 웹사이트가 품목을 직접 읽는 링크는 items가 없다 — 빈 목록으로 받는다
    if (Array.isArray(data.items)) return data;
    return typeof data.src === "string" && data.src ? { ...data, items: [] } : null;
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

// ── 주문 뒤 바뀐 내용(카톡·전화) ─────────────────────────

export type EditLine = { name: string; spec: string; qty: number; price: number };

/** 화면에서 고친 줄. 수량 0인 줄은 뺀다(지운 것). 한 줄도 안 남으면 거절. */
export function readEditLines(raw: unknown): { ok: true; lines: EditLine[] } | { ok: false; message: string } {
  if (!Array.isArray(raw)) return { ok: false, message: "품목을 읽지 못했습니다." };
  if (raw.length > 200) return { ok: false, message: "한 번에 200줄까지 고칠 수 있습니다." };
  const lines: EditLine[] = [];
  for (const r of raw as Record<string, unknown>[]) {
    const name = typeof r?.name === "string" ? r.name.replace(/[\x00-\x1f]/g, "").trim().slice(0, 80) : "";
    const spec = typeof r?.spec === "string" ? r.spec.replace(/[\x00-\x1f]/g, "").trim().slice(0, 30) : "";
    const qty = Number(r?.qty), price = Number(r?.price);
    if (!name && !qty) continue; // 빈 줄
    if (!name) return { ok: false, message: "품목 이름이 빈 줄이 있습니다." };
    if (!Number.isInteger(qty) || qty < 0 || qty > 1_000_000) return { ok: false, message: `${name} 수량을 확인해 주세요.` };
    if (!Number.isFinite(price) || price < 0 || price > 100_000_000) return { ok: false, message: `${name} 단가를 확인해 주세요.` };
    if (qty > 0) lines.push({ name, spec, qty, price: Math.round(price) });
  }
  if (!lines.length) return { ok: false, message: "남는 품목이 없습니다. 주문 취소라면 견적서에서 상태를 바꿔 주세요." };
  return { ok: true, lines };
}

/** 다음 수정본 번호: 기준-R(가장 큰 개정+1). 기준 번호만 있으면 -R2. */
export function nextRevisionNo(numbers: string[], base: string): { number: string; revision: number } {
  let max = 1;
  for (const n of numbers) {
    if (n === base) continue;
    const m = n.startsWith(base) ? n.slice(base.length).match(/^-R(\d+)$/) : null;
    if (m) max = Math.max(max, Number(m[1]));
  }
  return { number: `${base}-R${max + 1}`, revision: max + 1 };
}

export function quoteTotals(lines: EditLine[], taxType: string) {
  const supply = lines.reduce((a, l) => a + l.qty * l.price, 0);
  const vat = taxType === "과세" ? Math.round(supply * 0.1) : 0;
  return { count: lines.length, qty: lines.reduce((a, l) => a + l.qty, 0), supply, vat, total: supply + vat };
}

/** 작업메모용 한 줄 요약: 바뀐 수량·단가, 더한 줄, 뺀 줄 */
export function changeSummary(before: EditLine[], after: EditLine[]): string {
  const key = (l: EditLine) => `${l.name}|${l.spec}`;
  const fmt = (n: number) => n.toLocaleString("en-US");
  const old = new Map(before.map((l) => [key(l), l]));
  const out: string[] = [];
  for (const l of after) {
    const o = old.get(key(l));
    if (!o) out.push(`+${l.name}${l.spec ? ` ${l.spec}` : ""} ${fmt(l.qty)}`);
    else {
      if (o.qty !== l.qty) out.push(`${l.name} ${fmt(o.qty)}→${fmt(l.qty)}`);
      if (o.price !== l.price) out.push(`${l.name} 단가 ${fmt(o.price)}→${fmt(l.price)}`);
      old.delete(key(l));
    }
  }
  for (const l of old.values()) out.push(`−${l.name}${l.spec ? ` ${l.spec}` : ""}`);
  return out.join(", ") || "내용 그대로";
}

// ── 주문한 회사별로 묶기 ─────────────────────────────

/** 주문이 어디서 왔나: 주문 링크(/o/<ID>) 또는 주문형 제안서(/p/<ID>). 요청사항 첫머리로 안다. */
export function orderSource(memo: string): { kind: "link" | "proposal"; id: string } | null {
  const m = memo.trimStart().match(/^\[(주문 링크|제안서) ([A-Za-z0-9_-]{6,64})\]/);
  return m ? { kind: m[1] === "주문 링크" ? "link" : "proposal", id: m[2] } : null;
}

/**
 * 손으로 만든 주문서는 사진 주소가 `/p/<제안서ID>/img/…`다 — 같은 물건을 먼저 카톡 제안서(/p/)로 돌렸다는 뜻.
 * 그 제안서로 들어온 주문도 이 주문서의 주문으로 본다(예: 항공 구근 — 유니크가든은 제안서로, 금성농원은 링크로 주문).
 */
export function proposalIds(p: LinkPayload): string[] {
  const out = new Set<string>();
  for (const it of p.items) {
    const m = typeof it.img === "string" ? it.img.match(/^\/p\/([a-z0-9-]{8,64})\/img\//) : null;
    if (m) out.add(m[1]);
  }
  return [...out];
}

/** 주문 양식의 '상호 / 성함' 한 칸 — 앞이 상호다. (웹 견적 자동 초안은 반대로 읽어 상호·담당자가 뒤바뀌었다) */
export function splitRequester(who: string): { company: string; person: string } {
  const parts = who.split("/").map((s) => s.trim()).filter(Boolean);
  if (parts.length >= 2) return { company: parts[0], person: parts.slice(1).join(" ") };
  return { company: who.trim(), person: "" };
}

const digits = (s: string) => {
  let d = s.replace(/\D/g, "");
  if (d.startsWith("82")) d = "0" + d.slice(2);
  return d;
};
export const phoneKey = digits;

/** 같은 회사 = 같은 전화번호. 번호가 없으면 이름. */
export const customerKey = (phone: string, who: string) => {
  const d = digits(phone);
  return d.length >= 9 ? `t${d}` : `n${norm(who)}`;
};

/** 제안서 주문의 요청사항에 붙는 "· ○○ 전용" */
export const exclusiveFor = (memo: string) => (memo.split("\n")[0].match(/·\s*(.+?)\s*전용\s*$/) ?? [])[1] ?? "";

export const quoteBase = (no: string) => no.replace(/-R\d+$/, "");

// ── 배정 현황: 확보 수량을 누가 얼마나 가져가나 ─────────

export type AllocRow = { key: string; label: string; size: string; stock: number | null; approx: boolean };

/** 주문서의 줄(품목 × 규격). 재고 칸의 "9,360+"는 숫자로 읽고 '이상'으로 표시한다. */
export function allocRows(p: LinkPayload): AllocRow[] {
  return p.items.flatMap((it) => it.rows.map((r) => {
    const raw = r[1] as unknown;
    const n = typeof raw === "number" ? raw : typeof raw === "string" ? Number(raw.replace(/[^\d]/g, "")) : NaN;
    return { key: `${it.k}|${r[0]}`, label: `${it.grp} ${it.name}`.trim(), size: String(r[0]), stock: Number.isFinite(n) && n > 0 ? n : null, approx: typeof raw === "string" && raw.includes("+") };
  }));
}

const baseSpec = (s: string) => norm(s.replace(/잔량/g, ""));

/** 견적(또는 주문) 줄 → 주문서 줄. 이름은 `분류 이름` 또는 이름, 규격은 같은 것 → 잔량 뺀 규격 → 줄이 하나뿐이면 그 줄. */
export function allocate(p: LinkPayload, lines: OrderedLine[]): { qty: Map<string, number>; unmatched: OrderedLine[] } {
  const qty = new Map<string, number>();
  const unmatched: OrderedLine[] = [];
  for (const l of lines) {
    const name = norm(stripCrate(l.name));
    const card = p.items.find((it) => norm(`${it.grp} ${it.name}`) === name || norm(it.name) === name);
    const row = card && (card.rows.find((r) => norm(String(r[0])) === norm(l.spec)) ?? card.rows.find((r) => baseSpec(String(r[0])) === baseSpec(l.spec))
      ?? (card.rows.length === 1 ? card.rows[0] : undefined));
    if (!card || !row) { if (l.qty > 0) unmatched.push(l); continue; }
    const key = `${card.k}|${row[0]}`;
    qty.set(key, (qty.get(key) ?? 0) + l.qty);
  }
  return { qty, unmatched };
}
