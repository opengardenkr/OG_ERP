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

/** 첨부 파일 하나(사업자등록증 등). PDF도 Airtable이 첫 쪽 썸네일을 만들어 준다. */
export type FileRef = Photo & { id: string; isPdf: boolean };

export type ClientDetail = ClientSummary & {
  email: string;
  bizNo: string;
  notes: string;
  online: boolean;
  cards: Photo[];
  logs: SalesLog[];
  /** 세금계산서용. 비우면 거래처 이름·이메일을 쓴다. */
  bizName: string;
  bizType: string;
  bizItem: string;
  invoiceEmail: string;
  certs: FileRef[];
};

/** 사업자등록번호: 숫자만 남긴다. */
export const bizNoDigits = (value: string) => value.replace(/\D/g, "");

/** 10자리면 000-00-00000 모양으로. 아니면 적힌 그대로. */
export function formatBizNo(value: string): string {
  const d = bizNoDigits(value);
  return d.length === 10 ? `${d.slice(0, 3)}-${d.slice(3, 5)}-${d.slice(5)}` : value.trim();
}

/** 국세청 검증 규칙(가중치 1·3·7·1·3·7·1·3·5 + 9번째 자리×5의 십의 자리). 오타 경고에만 쓴다 — 막지는 않는다. */
export function bizNoValid(value: string): boolean {
  const d = bizNoDigits(value).split("").map(Number);
  if (d.length !== 10) return false;
  const w = [1, 3, 7, 1, 3, 7, 1, 3, 5];
  const sum = w.reduce((s, k, i) => s + d[i] * k, 0) + Math.floor((d[8] * 5) / 10);
  return (10 - (sum % 10)) % 10 === d[9];
}

export type TaxRow = { key: string; label: string; value: string };

/** 홈택스 [전자세금계산서 건별발급] 화면의 '공급받는자' 칸 순서. 복사해서 그대로 붙여넣는다. */
export function hometaxRows(c: Pick<ClientDetail, "name" | "bizNo" | "bizName" | "ceo" | "address" | "bizType" | "bizItem" | "invoiceEmail" | "email">): TaxRow[] {
  const address = /^https?:\/\//i.test(c.address) ? "" : c.address;
  return [
    { key: "bizNo", label: "등록번호", value: c.bizNo ? formatBizNo(c.bizNo) : "" },
    { key: "bizName", label: "상호", value: c.bizName || c.name },
    { key: "ceo", label: "성명(대표자)", value: c.ceo },
    { key: "address", label: "사업장 주소", value: address },
    { key: "bizType", label: "업태", value: c.bizType },
    { key: "bizItem", label: "종목", value: c.bizItem },
    { key: "invoiceEmail", label: "이메일", value: c.invoiceEmail || c.email },
  ];
}

/** 먼저 채워야 할 빈 칸(등록번호·상호·성명). 등록번호는 세금계산서 법정 필수 기재사항이다. */
export const missingRequired = (rows: TaxRow[]) =>
  rows.filter((r) => ["bizNo", "bizName", "ceo"].includes(r.key) && !r.value).map((r) => r.label);

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
