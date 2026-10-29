/**
 * 속명 제안서의 조립 규칙. Airtable을 모른다 — 읽어 온 값만 받아 카드·차트·쪽을 만든다.
 * 서버·클라이언트·테스트가 함께 쓰므로 server-only를 붙이지 않는다.
 */

export type Hue = { month: string; color: string; name: string };

/** 라인업 표의 한 줄(규격 하나). 가격·재고의 원본. */
export type SourceRow = {
  id: string;
  sku: string;
  name: string;
  latin: string;
  size: string;
  price: number | null;
  stock: number | null;
  stockDate: string;
  masterId: string | null;
};

/** 식물 등록 마스터의 품종 정보. 같은 품종의 모든 규격이 함께 쓴다. */
export type MasterInfo = {
  id: string;
  name: string;
  latin: string;
  features: string[];
  sizeClass: string;
  heightMin: number | null;
  heightMax: number | null;
  width: number | null;
  hues: Hue[];
  award: string;
  series: string;
  photo: string;
  photoCredit: string;
  review: string;
};

export type SeriesTile = { value: string; label: string; note: string };

/** [영업] 제안서 조건의 한 줄. 시리즈가 비면 표 전체의 기본 문구. */
export type TermRow = { series: string; lines: string; legend: string; few: number | null; seriesTitle: string; seriesTiles: string };

export type Terms = {
  lines: string[];
  legend: string[];
  few: number;
  seriesTitle: string;
  seriesTiles: SeriesTile[];
};

export type CardRow = { sku: string; spec: string; specNote: string; stock: number; price: number | null; few: boolean };

export type Card = {
  key: string;
  name: string;
  genusLabel: string;
  latin: string;
  award: string;
  sizeClass: string;
  heightMin: number | null;
  heightMax: number | null;
  width: number | null;
  features: string[];
  hues: Hue[];
  photo: string;
  photoCredit: string;
  review: string;
  series: string;
  hasInfo: boolean;
  rows: CardRow[];
};

export type Slot = { kind: "card"; card: Card } | { kind: "chart" };
export type Page =
  | { kind: "cards"; rows: Slot[][] }
  | { kind: "info"; orderRows: OrderRow[]; first: boolean };
export type OrderRow = { sku: string; name: string; spec: string; stock: number; price: number | null; few: boolean };

export type Proposal = {
  genus: string;
  cards: Card[];
  pages: Page[];
  terms: Terms;
  stockDate: string;
  rowCount: number;
  missing: string[];
  needsCheck: string[];
  draft: number;
};

export const DEFAULT_FEW = 300;
const SIZE_ORDER = ["대형", "중형", "소형"];
const ROWS_PER_PAGE = 2;
const ORDER_ROWS_FIRST = 30;
const ORDER_ROWS_MORE = 60;

const KNOWN_HUES: Record<string, string> = {
  "#c7da9b": "연두", "#f7f1de": "크림", "#ffffff": "화이트", "#edc0cc": "연분홍", "#ddbac2": "연분홍",
  "#d56886": "핑크", "#d34e74": "진분홍", "#be0053": "진홍", "#9cbf21": "연두", "#96be4e": "그린", "#a8c36b": "라임",
};

/** 이름이 없는 색에 붙일 이름. 정확한 색명이 아니라 막대에 읽힐 정도면 된다. */
export function nameOfColor(hex: string): string {
  const known = KNOWN_HUES[hex.toLowerCase()];
  if (known) return known;
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2, d = max - min;
  if (d < 0.08) return l > 0.9 ? "화이트" : l > 0.5 ? "회색" : "검정";
  let h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h = (h * 60 + 360) % 360;
  if (h >= 40 && h < 70) return l > 0.85 ? "크림" : "노랑";
  if (h >= 70 && h < 170) return l > 0.75 ? "연두" : "그린";
  if (h >= 170 && h < 260) return l > 0.75 ? "하늘" : "파랑";
  if (h >= 260 && h < 300) return l > 0.75 ? "라벤더" : "보라";
  if (h >= 20 && h < 40) return l > 0.75 ? "살구" : "주황";
  return l > 0.8 ? "연분홍" : l > 0.6 ? "핑크" : "진홍";
}

/** "7월 #edc0cc, 8월 #d56886 핑크" → 월·색·이름. 형식이 틀린 칸은 버린다. */
export function parseHues(text: string): Hue[] {
  return text
    .split(/[,\n]/)
    .map((part) => part.trim().match(/^(\S+)\s+(#[0-9a-fA-F]{6})(?:\s+(.+))?$/))
    .filter((m): m is RegExpMatchArray => m !== null)
    .map((m) => ({ month: m[1], color: m[2].toLowerCase(), name: (m[3] || "").trim() || nameOfColor(m[2]) }));
}

/** "목수국 '리빙 핑크 앤 로즈'" → 속 이름과 품종 이름 */
export function splitName(name: string): { genusLabel: string; cultivar: string } {
  const m = name.trim().match(/^(.+?)\s*['‘’"“]\s*(.+?)\s*['‘’"”]\s*$/);
  return m ? { genusLabel: m[1], cultivar: m[2] } : { genusLabel: "", cultivar: name.trim() };
}

/** 라인업 표 학명의 공급사 꼬리표(NEW, NEW24)를 뗀다 */
export function cleanLatin(latin: string): string {
  return latin.replace(/\s+NEW\d*\s*$/i, "").trim();
}

/** "P12 (컬러팟)" → P12 + 컬러팟 */
export function splitSpec(size: string): { spec: string; specNote: string } {
  const m = size.trim().match(/^(\S+)\s*\((.+)\)$/);
  return m ? { spec: m[1], specNote: m[2] } : { spec: size.trim(), specNote: "" };
}

/** **굵게** → 조각 목록. 화면은 이걸 그대로 그린다(HTML 문자열을 만들지 않는다). */
export function boldParts(line: string): { text: string; bold: boolean }[] {
  return line.split(/(\*\*[^*]+\*\*)/).filter(Boolean).map((part) =>
    part.startsWith("**") && part.endsWith("**") ? { text: part.slice(2, -2), bold: true } : { text: part, bold: false },
  );
}

export function parseTiles(text: string): SeriesTile[] {
  return text
    .split("\n")
    .map((line) => line.split("|").map((s) => s.trim()))
    .filter((parts) => parts.length >= 2 && parts[0])
    .map(([value, label, note = ""]) => ({ value, label, note }));
}

function rank(card: Card): number {
  const i = SIZE_ORDER.indexOf(card.sizeClass);
  return i === -1 ? SIZE_ORDER.length : i;
}

/** 슬롯을 3칸 줄로 채운다. 차트는 2칸이 필요하다. */
function packRows(slots: Slot[]): Slot[][] {
  const rows: Slot[][] = [];
  let row: Slot[] = [], used = 0;
  for (const slot of slots) {
    const span = slot.kind === "chart" ? 2 : 1;
    if (used + span > 3) { rows.push(row); row = []; used = 0; }
    row.push(slot); used += span;
  }
  if (row.length) rows.push(row);
  return rows;
}

export type BuildOptions = { genus: string; query?: string; onlyInStock?: boolean };

export function buildProposal(
  sourceRows: SourceRow[],
  masters: MasterInfo[],
  termRows: TermRow[],
  options: BuildOptions,
): Proposal {
  const byMaster = new Map(masters.map((m) => [m.id, m]));
  const groups = new Map<string, SourceRow[]>();

  for (const row of sourceRows) {
    if (options.onlyInStock !== false && !(typeof row.stock === "number" && row.stock > 0)) continue;
    const key = row.masterId && byMaster.has(row.masterId) ? row.masterId : `name:${row.name.trim()}`;
    groups.set(key, [...(groups.get(key) || []), row]);
  }

  let cards: Card[] = [...groups.entries()].map(([key, rows]) => {
    const master = byMaster.get(key);
    const first = rows[0];
    const { genusLabel, cultivar } = splitName(master?.name || first.name);
    const cardRows = rows
      .map((r) => ({ sku: r.sku, ...splitSpec(r.size), stock: r.stock ?? 0, price: r.price, few: false }))
      .sort((a, b) => (a.price ?? 0) - (b.price ?? 0) || a.spec.localeCompare(b.spec));
    const features = master?.features.filter(Boolean) ?? [];
    return {
      key,
      name: cultivar,
      genusLabel: genusLabel || options.genus,
      latin: master?.latin || cleanLatin(first.latin),
      award: master?.award || "",
      sizeClass: master?.sizeClass || "",
      heightMin: master?.heightMin ?? null,
      heightMax: master?.heightMax ?? master?.heightMin ?? null,
      width: master?.width ?? null,
      features,
      hues: master?.hues ?? [],
      photo: master?.photo || "",
      photoCredit: master?.photoCredit || "",
      review: master?.review || "",
      series: master?.series || "",
      hasInfo: Boolean(master) && features.length > 0,
      rows: cardRows,
    };
  });

  const query = options.query?.trim().toLowerCase();
  if (query) cards = cards.filter((c) => `${c.name} ${c.latin}`.toLowerCase().includes(query));

  const terms = mergeTerms(termRows, cards.map((c) => c.series));
  const few = terms.few > 0 ? terms.few : DEFAULT_FEW;
  for (const card of cards) for (const row of card.rows) row.few = row.stock < few;

  cards.sort((a, b) =>
    rank(a) - rank(b) ||
    (b.heightMax ?? 0) - (a.heightMax ?? 0) ||
    (b.heightMin ?? 0) - (a.heightMin ?? 0) ||
    a.name.localeCompare(b.name, "ko"),
  );

  const slots: Slot[] = cards.map((card) => ({ kind: "card", card }));
  if (cards.filter((c) => c.heightMax !== null).length >= 2) slots.push({ kind: "chart" });
  const rows = packRows(slots);
  const pages: Page[] = [];
  for (let i = 0; i < rows.length; i += ROWS_PER_PAGE) pages.push({ kind: "cards", rows: rows.slice(i, i + ROWS_PER_PAGE) });

  const orderRows: OrderRow[] = cards.flatMap((c) =>
    c.rows.map((r) => ({ sku: r.sku, name: c.name, spec: r.specNote ? `${r.spec} ${r.specNote}` : r.spec, stock: r.stock, price: r.price, few: r.few })),
  );
  pages.push({ kind: "info", orderRows: orderRows.slice(0, ORDER_ROWS_FIRST), first: true });
  for (let i = ORDER_ROWS_FIRST; i < orderRows.length; i += ORDER_ROWS_MORE) {
    pages.push({ kind: "info", orderRows: orderRows.slice(i, i + ORDER_ROWS_MORE), first: false });
  }

  const dates = sourceRows.map((r) => r.stockDate).filter(Boolean).sort();
  return {
    genus: options.genus,
    cards,
    pages,
    terms: { ...terms, few },
    stockDate: dates[dates.length - 1] || "",
    rowCount: orderRows.length,
    missing: cards.filter((c) => !c.hasInfo).map((c) => c.name),
    needsCheck: cards.filter((c) => c.review === "확인 필요").map((c) => c.name),
    draft: cards.filter((c) => c.review === "AI 초안").length,
  };
}

/** 같은 표의 기본 문구 + (품종이 모두 한 시리즈면) 시리즈 문구 */
export function mergeTerms(rows: TermRow[], seriesOfCards: string[]): Terms {
  const base = rows.find((r) => !r.series);
  const only = new Set(seriesOfCards.filter(Boolean));
  const series = seriesOfCards.length > 0 && seriesOfCards.every(Boolean) && only.size === 1
    ? rows.find((r) => r.series && only.has(r.series))
    : undefined;
  const lines = [base?.lines, series?.lines].filter(Boolean).join("\n").split("\n").map((s) => s.trim()).filter(Boolean);
  return {
    lines,
    legend: (base?.legend || "").split("|").map((s) => s.trim()).filter(Boolean),
    few: series?.few ?? base?.few ?? DEFAULT_FEW,
    seriesTitle: series?.seriesTitle || "",
    seriesTiles: parseTiles(series?.seriesTiles || ""),
  };
}

/** 따옴표·역슬래시가 Airtable 수식으로 새지 않게 JSON 문자열로 넣는다 */
export function literal(value: string): string {
  return JSON.stringify(value);
}

/** 라인업 표에서 한 속(세부분류)의 노출 가능한 행 */
export function genusFormula(genus: string): string {
  return `AND({세부분류}=${literal(genus)},NOT({노출제외}))`;
}

export function formatWon(n: number | null): string {
  return n === null ? "별도 안내" : `₩${n.toLocaleString("ko-KR")}`;
}

/** 카드 꽃색 막대 글자색. 어두운 칸에는 흰 글자. */
export function inkOn(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  const lum = 0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255);
  return lum < 150 ? "#ffffff" : "#2e3a28";
}
