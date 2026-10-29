/** 속명 제안서 주소의 조건. 화면과 인쇄용 화면이 같은 주소 조건을 쓴다. */
export type GenusParams = { genus: string; q: string; all: boolean; title: string };

type SearchParams = Record<string, string | string[] | undefined>;

function one(value: string | string[] | undefined, max: number): string {
  const v = Array.isArray(value) ? value[0] : value;
  return (v || "").trim().slice(0, max);
}

export function readParams(sp: SearchParams): GenusParams {
  return { genus: one(sp.genus, 40), q: one(sp.q, 40), all: one(sp.all, 1) === "1", title: one(sp.title, 60) };
}

export function toQuery(p: GenusParams): string {
  const params = new URLSearchParams({ genus: p.genus });
  if (p.q) params.set("q", p.q);
  if (p.all) params.set("all", "1");
  if (p.title) params.set("title", p.title);
  return params.toString();
}

export function proposalTitle(p: GenusParams): string {
  if (p.title) return p.title;
  return `오픈가든 제안서 (${p.q ? `${p.genus} · ${p.q}` : p.genus})`;
}

/** 한국 시간 기준 오늘. 예: 2026. 10. 29 */
export function todayLabel(now = new Date()): string {
  return new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" })
    .format(now)
    .replace(/\.$/, "")
    .trim();
}
