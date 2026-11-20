import "server-only";

import {
  AirtableError,
  createRecord,
  getRecordFresh,
  selectRecords,
  selectRecordsFresh,
  updateRecord,
} from "@/lib/airtable/client";
import {
  isCurrency,
  isPoStatus,
  lineSummary,
  parsePoDoc,
  poNumber,
  poTotals,
  type Currency,
  type PoDoc,
  type PoInput,
  type PoStatus,
  type PoSupplier,
} from "@/lib/purchase-order";
import { fail, ok, type Result } from "@/lib/result";

/**
 * 영문 발주서. `발주서` 표(tblzBOnPGISrYOq58) — 견적서 생성기의 발주서는 저장하지 않으므로 포털만 쓴다.
 * 문서 내용은 `발주내용JSON`(PoDoc v1)이 원천이고, 나머지 칸은 Airtable에서 표로 보기 좋게 같이 적는 사본이다.
 * 공급업체 목록 = `거래처`에서 구분이 '공급업체'인 줄(2026-11-20: 호게나르드·HBM·IDeL·청림원예·다원식물원).
 */
const PO_TABLE = "tblzBOnPGISrYOq58";
const CLIENTS = "tblTGohUQYwkdLjpV";

const F = {
  number: "fld37hhCm9USYhOGz", date: "fldu3Es8BXkWqGznf", company: "fldhunpdvtNJmsSJu", attn: "fld1ts48c5YAyDc7e",
  contact: "fldsEU6aaBXMFkeWT", taxId: "fldYCl3iFe6Yh144j", address: "fldCxWPiuKndqsJBq", due: "fldoacZHPjw51WZBL",
  shipTo: "fldBAJblgirtKsuLV", count: "fldyRzvIj9ojg79AJ", qty: "fldWXcxakuzPoiADM", supply: "fldgYGAcFlmzGht9f",
  vat: "fldYNT88Fw5LU6uk8", krwTotal: "fld2ueIa9QetFAY4q", status: "fldK9Pk6Ug0CbJ3ik", summary: "fldtzF1Uv7R5fjqnT",
  json: "fldg4lrx9ACs6h6Ra", remarks: "fldtq5dxjP4jSOLMX", author: "fld59GRpdOPFR8DfN", createdAt: "fldVdKsGIRERFEJ13",
  confirmed: "fldJIKXqkZD94QdD3", received: "fldm0thPe0v1Ytz61", memo: "fldjprX7pQ0Ok3QLp", deleted: "fldkmUqprMmf3enSH",
  currency: "fldk7FsTyRBrFxB3e", total: "fld7qyBNRPuzpMXfF", supplier: "fldUloqDkGUnDmqfp",
} as const;

const C = {
  name: "fld0oPJPMU58dpZfI", phone: "fldP6ssHWD4iWgGqx", email: "fldL5BCJRm7AIczQr", address: "fldNjXVenLjW63kSm",
  kind: "fldDqCDekofMx7tQR", bizNo: "fldplgj7eMD2ajIfN", vat: "fld8C29xKcOGrfwNG", attn: "fldcjf6uQmNQKxSvB",
} as const;

type Row = Record<string, unknown>;

const text = (v: unknown): string => {
  if (typeof v === "string") return v.trim();
  if (v && typeof v === "object" && "name" in v) return String((v as { name: unknown }).name ?? "").trim();
  return "";
};
const numberOf = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

export type PurchaseOrderSummary = {
  id: string;
  number: string;
  date: string;
  supplier: string;
  status: PoStatus;
  currency: Currency;
  total: number | null;
  count: number;
  author: string;
};

export type PurchaseOrder = PurchaseOrderSummary & { supplierId: string | null; doc: PoDoc | null; memo: string };

function summaryOf(id: string, f: Row): PurchaseOrderSummary {
  const status = text(f[F.status]);
  const currency = text(f[F.currency]);
  return {
    id,
    number: text(f[F.number]) || "(번호 없음)",
    date: text(f[F.date]),
    supplier: text(f[F.company]),
    status: isPoStatus(status) ? status : "작성",
    currency: isCurrency(currency) ? currency : "KRW",
    total: numberOf(f[F.total]) ?? numberOf(f[F.krwTotal]),
    count: numberOf(f[F.count]) ?? 0,
    author: text(f[F.author]),
  };
}

const wrap = async <T>(run: () => Promise<T>): Promise<Result<T>> => {
  try {
    return ok(await run());
  } catch (error) {
    if (error instanceof AirtableError) return fail(error.message);
    throw error;
  }
};

/** 발주서 목록(삭제함 제외, 최근 번호 먼저). 캐시 60초 — 쓰면 바로 버려진다. */
export function getPurchaseOrders(): Promise<Result<PurchaseOrderSummary[]>> {
  return wrap(async () => {
    const rows = await selectRecords<Row>(PO_TABLE, {
      fields: [F.number, F.date, F.company, F.status, F.currency, F.total, F.krwTotal, F.count, F.author, F.deleted],
      revalidate: 60,
      byId: true,
    });
    return rows
      .filter((r) => r.fields[F.deleted] !== true)
      .map((r) => summaryOf(r.id, r.fields))
      .sort((a, b) => b.date.localeCompare(a.date) || b.number.localeCompare(a.number));
  });
}

/** 발주서 하나. 고치기·인쇄가 쓰므로 캐시 없이 읽는다(방금 저장한 내용이 바로 보여야 한다). */
export function getPurchaseOrder(id: string): Promise<Result<PurchaseOrder | null>> {
  return wrap(async () => {
    const record = await getRecordFresh<Row>(PO_TABLE, id, true);
    if (!record || record.fields[F.deleted] === true) return null;
    const f = record.fields;
    const links = Array.isArray(f[F.supplier]) ? (f[F.supplier] as unknown[]).filter((x): x is string => typeof x === "string") : [];
    return {
      ...summaryOf(record.id, f),
      supplierId: links[0] ?? null,
      doc: parsePoDoc(text(f[F.json])),
      memo: text(f[F.memo]),
    };
  });
}

/** 발주서를 받는 공급업체(거래처 구분 '공급업체'). 캐시 2분. */
export function getSuppliers(): Promise<Result<PoSupplier[]>> {
  return wrap(async () => {
    const rows = await selectRecords<Row>(CLIENTS, { fields: Object.values(C), revalidate: 120, byId: true });
    return rows
      .filter((r) => text(r.fields[C.kind]) === "공급업체")
      .map(({ id, fields: f }) => ({
        id,
        name: text(f[C.name]),
        company: text(f[C.name]),
        attn: text(f[C.attn]),
        address: text(f[C.address]),
        phone: text(f[C.phone]),
        email: text(f[C.email]),
        taxId: text(f[C.vat]) || text(f[C.bizNo]),
      }))
      .filter((s) => s.name)
      .sort((a, b) => a.name.localeCompare(b.name, "ko"));
  });
}

const nowSeoul = () => new Date().toLocaleString("sv-SE", { timeZone: "Asia/Seoul" }).slice(0, 16);

/** 작업메모 맨 위에 한 줄. */
const withMemo = (memo: string, member: string, what: string) => [`${nowSeoul()} · ${member} · ${what}`, memo].filter(Boolean).join("\n");

/** 문서에서 표 칸으로 옮겨 적는 값(만들기·고치기 공통). */
function fieldsOf(input: PoInput): Row {
  const { doc } = input;
  const t = poTotals(doc);
  const krw = doc.currency === "KRW" ? t.total : null;
  return {
    [F.date]: input.date,
    [F.supplier]: input.supplierId ? [input.supplierId] : null,
    [F.company]: doc.supplier.company,
    [F.attn]: doc.supplier.attn || null,
    [F.contact]: [doc.supplier.phone, doc.supplier.email].filter(Boolean).join(" · ") || null,
    [F.taxId]: doc.supplier.taxId || null,
    [F.address]: doc.supplier.address || null,
    // 납기·납품장소는 문서에서 뺐다(2026-11-20). 옛 값이 남지 않게 비운다.
    [F.due]: null,
    [F.shipTo]: null,
    [F.count]: t.lines,
    [F.qty]: t.qty,
    [F.currency]: doc.currency,
    [F.total]: t.total,
    // ₩ 칸은 원화 발주서만. 다른 통화를 원으로 바꿔 적지 않는다(환율이 섞이면 숫자를 못 믿는다).
    [F.supply]: krw,
    [F.krwTotal]: krw,
    [F.vat]: null,
    [F.summary]: lineSummary(doc),
    [F.json]: JSON.stringify(doc),
    [F.remarks]: doc.remarks || null,
  };
}

/** 새 발주서. 번호는 캐시 없이 읽은 그날 번호 + 1. */
export async function createPurchaseOrder(input: PoInput, member: string): Promise<string> {
  const existing = await selectRecordsFresh<Row>(PO_TABLE, { fields: [F.number], byId: true });
  const number = poNumber(input.date, existing.map((r) => text(r.fields[F.number])));
  const record = await createRecord<Row>(PO_TABLE, {
    ...fieldsOf(input),
    [F.number]: number,
    [F.status]: "작성",
    [F.author]: member,
    [F.createdAt]: new Date().toISOString(),
    [F.memo]: withMemo("", member, `작성 · ${input.doc.currency} ${poTotals(input.doc).total}`),
  });
  return record.id;
}

/** 내용 고치기. 번호·상태는 그대로. 작업메모는 캐시 없이 다시 읽어 덧붙인다. */
export async function updatePurchaseOrder(id: string, input: PoInput, member: string): Promise<boolean> {
  const current = await getRecordFresh<Row>(PO_TABLE, id, true);
  if (!current || current.fields[F.deleted] === true) return false;
  await updateRecord<Row>(PO_TABLE, id, {
    ...fieldsOf(input),
    [F.memo]: withMemo(text(current.fields[F.memo]), member, `수정 · ${input.doc.currency} ${poTotals(input.doc).total}`),
  });
  return true;
}

/** 상태 바꾸기. 공급업체확인·입고완료로 처음 바꿀 때 그 날짜를 찍는다. */
export async function setPurchaseStatus(id: string, status: PoStatus, member: string): Promise<boolean> {
  const current = await getRecordFresh<Row>(PO_TABLE, id, true);
  if (!current || current.fields[F.deleted] === true) return false;
  const f = current.fields;
  const today = nowSeoul().slice(0, 10);
  await updateRecord<Row>(PO_TABLE, id, {
    [F.status]: status,
    ...(status === "공급업체확인" && !text(f[F.confirmed]) ? { [F.confirmed]: today } : {}),
    ...(status === "입고완료" && !text(f[F.received]) ? { [F.received]: today } : {}),
    [F.memo]: withMemo(text(f[F.memo]), member, `상태 ${text(f[F.status]) || "작성"} → ${status}`),
  });
  return true;
}

/** 삭제함으로(목록에서 숨김). Airtable에서 체크를 풀면 되살아난다. */
export async function trashPurchaseOrder(id: string, member: string): Promise<boolean> {
  const current = await getRecordFresh<Row>(PO_TABLE, id, true);
  if (!current) return false;
  await updateRecord<Row>(PO_TABLE, id, {
    [F.deleted]: true,
    [F.memo]: withMemo(text(current.fields[F.memo]), member, "삭제함"),
  });
  return true;
}

export const purchaseAirtableUrl = (id: string) => `https://airtable.com/appzLstFHtHcQlWSu/${PO_TABLE}/${id}`;
