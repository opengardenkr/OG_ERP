/** 거래처 화면이 쓰는 타입. 화면(클라이언트)도 가져다 쓰므로 server-only가 아니다. */

export type Photo = { url: string; thumb: string; filename: string };

export type ClientSummary = {
  id: string;
  name: string;
  kind: string;
  ceo: string;
  manager: string;
  phone: string;
  address: string;
  hasCard: boolean;
  logCount: number;
  lastLog: string; // YYYY-MM-DD, 없으면 ""
};

export type SalesLog = {
  id: string;
  date: string;
  author: string;
  visit: string;
  purpose: string;
  pain: string;
  request: string;
  interest: string;
  next: string;
  misc: string;
  proposalSent: boolean;
};

export type ClientDetail = ClientSummary & {
  email: string;
  bizNo: string;
  notes: string;
  online: boolean;
  cards: Photo[];
  logs: SalesLog[];
};

/** 전화번호 숫자만. tel: 링크와 같은 번호 찾기에 쓴다. */
export const phoneDigits = (value: string) => {
  let d = value.replace(/\D/g, "");
  if (d.startsWith("82")) d = "0" + d.slice(2);
  return d;
};

export function matchesClient(c: ClientSummary, query: string): boolean {
  const q = query.trim().toLowerCase().replace(/\s+/g, "");
  if (!q) return true;
  const digits = q.replace(/\D/g, "");
  const hay = [c.name, c.kind, c.ceo, c.manager, c.address].join(" ").toLowerCase().replace(/\s+/g, "");
  return hay.includes(q) || (digits.length >= 3 && phoneDigits(c.phone).includes(digits));
}
