import "server-only";

import type { MemberName } from "@/config/users";
import { createRecord, deleteRecord, getRecord, getRecordFresh, selectRecordsFresh, updateRecord, updateRecords } from "@/lib/airtable/client";
import { loadDeal, type Customer } from "@/lib/airtable/order-deals";
import {
  L, LINKS, LINK_FIELDS, P, PROGRAMS, REC, ids, message, num, readLinks, readOrders, readPrograms, readStock, shownStock, supplierOf,
  text, toLink, type LinkInfo, type Row,
} from "@/lib/airtable/order-tables";
import { SUPPLIER_INFO, linkUrl, newLinkId, programPayloads, type OrderGroup, type ProgramInput, type Selection, type Supplier } from "@/lib/order";
import {
  allocRows, allocate, isPickerPayload, parsePayload, parseSelection, payloadKeys, proposalIds, refreshStock, seoulParts, stockKey,
  type AllocRow, type LinkPayload, type OrderedLine,
} from "@/lib/order-program";
import { fail, ok, type Result } from "@/lib/result";

/**
 * 주문서(폴더)의 Airtable 경계: 목록·상세·저장·재고 반영·회사 배포·옮기기·삭제.
 * 주문한 회사별 일(합산 견적·주문 변경·재고 차감)은 order-deals.ts. 표·필드는 order-tables.ts.
 */
export type ProgramSummary = { id: string; supplier: Supplier | null; name: string; status: string; items: number; links: number; orders: number; amount: number; modified: string };

export async function listPrograms(): Promise<Result<{ programs: ProgramSummary[]; loose: LinkInfo[] }>> {
  try {
    const [programs, links, orders] = await Promise.all([readPrograms(), readLinks(), readOrders()]);
    const linkInfos = links.map((r) => toLink(r.id, r.fields));
    const list = programs.map((r): ProgramSummary => {
      const mine = linkInfos.filter((l) => l.program === r.id);
      const ids = new Set(mine.map((l) => l.linkId));
      const props = new Set(proposalIds(parsePayload(r.fields[P.items]) ?? { v: 1, items: [] }));
      const got = orders.filter((o) => (o.source.kind === "link" ? ids.has(o.source.id) : props.has(o.source.id)));
      return {
        id: r.id, supplier: supplierOf(r.fields), name: text(r.fields[P.name]) || "이름 없는 주문서", status: text(r.fields[P.status]) || "사용",
        items: parsePayload(r.fields[P.items])?.items.length ?? 0, links: mine.length, orders: got.length,
        amount: got.reduce((a, o) => a + o.total, 0), modified: text(r.fields[P.modified]),
      };
    });
    list.sort((a, b) => Number(a.status === "보관") - Number(b.status === "보관") || b.modified.localeCompare(a.modified));
    return ok({ programs: list, loose: linkInfos.filter((l) => !l.program && l.status !== "마감") });
  } catch (e) {
    return fail(message(e, "주문서를 불러오지 못했다"));
  }
}

export type ProgramItem = { k: string; group: OrderGroup | ""; rec: string; grp: string; name: string; latin: string; unit: string; rows: { size: string; price: number; prefill: number; stock: number | string | null; pack: number }[] };
export type LinkDetail = LinkInfo & { orders: number; amount: number };
/** 배정 현황: 주문서 줄 × 주문한 회사 → 수량. 남음 = 확보 − 합계(음수면 초과). */
export type Allocation = { rows: (AllocRow & { byCustomer: number[]; total: number })[]; customers: { key: string; name: string }[]; unmatched: { customer: string; line: OrderedLine }[] };
export type ProgramDetail = {
  id: string; supplier: Supplier | null; name: string; status: string; min: number; memo: string; note: string; editable: boolean; source: string;
  items: ProgramItem[]; links: LinkDetail[]; customers: Customer[]; allocation: Allocation;
};

function allocation(payload: LinkPayload, customers: Customer[]): Allocation {
  const rows = allocRows(payload);
  const per = customers.map((c) => allocate(payload, c.lines));
  return {
    customers: customers.map((c) => ({ key: c.key, name: c.company })),
    rows: rows.map((r) => {
      const byCustomer = per.map((a) => a.qty.get(r.key) ?? 0);
      return { ...r, byCustomer, total: byCustomer.reduce((x, y) => x + y, 0) };
    }),
    unmatched: per.flatMap((a, i) => a.unmatched.map((line) => ({ customer: customers[i].company, line }))),
  };
}

export async function getProgram(id: string): Promise<Result<ProgramDetail | null>> {
  if (!REC.test(id)) return ok(null);
  try {
    const deal = await loadDeal(id, false);
    if (!deal) return ok(null);
    const rec = await getRecord<Row>(PROGRAMS, id, 30, true);
    const f = (rec?.fields ?? {}) as Row;
    const payload = deal.payload;
    // 손으로 만든 주문서(사진·크레이트·"9,360+" 같은 재고 글자)는 적힌 재고를 그대로 둔다 — 라인업 재고 칸이 비어 있어 덮으면 사라진다
    const picker = isPickerPayload(payload);
    const live = shownStock(picker ? await readStock(payloadKeys(payload), false) : new Map<string, number | null>());
    const items: ProgramItem[] = payload.items.map((it) => ({
      k: it.k, group: it.group ?? "", rec: it.rec ?? "", grp: it.grp, name: it.name, latin: String(it.latin ?? ""), unit: String(it.unit ?? ""),
      rows: it.rows.map((r) => ({
        size: String(r[0]), price: Number(r[2]) || 0, prefill: Number(r[3]) || 0, pack: Number.isInteger(r[4]) ? (r[4] as number) : 0,
        stock: live.has(stockKey(it.group, it.rec)) ? live.get(stockKey(it.group, it.rec))! : typeof r[1] === "number" || typeof r[1] === "string" ? r[1] : null,
      })),
    }));
    const links: LinkDetail[] = deal.links.sort((a, b) => b.created.localeCompare(a.created)).map((l) => {
      const got = deal.customers.flatMap((c) => c.orders).filter((o) => o.source.kind === "link" && o.source.id === l.linkId);
      return { ...l, orders: got.length, amount: got.reduce((a, o) => a + o.total, 0) };
    });
    return ok({
      id, supplier: supplierOf(f), name: text(f[P.name]) || "이름 없는 주문서", status: text(f[P.status]) || "사용", min: num(f[P.min]),
      memo: text(f[P.memo]), note: text(f[P.note]), editable: !payload.src && (payload.items.length === 0 || picker),
      source: typeof payload.src === "string" ? payload.src : "", items, links, customers: deal.customers, allocation: allocation(payload, deal.customers),
    });
  } catch (e) {
    return fail(message(e, "주문서를 불러오지 못했다"));
  }
}

/** 주문 화면에서 다시 고칠 때: 이름·조건·선택 상태 */
export async function getProgramSelection(id: string): Promise<{ name: string; supplier: Supplier | null; minOrder: number; memo: string; selection: Selection | null; editable: boolean } | null> {
  if (!REC.test(id)) return null;
  const rec = await getRecordFresh<Row>(PROGRAMS, id, true);
  if (!rec) return null;
  const f = rec.fields as Row;
  const payload = parsePayload(f[P.items]);
  return {
    name: text(f[P.name]), supplier: supplierOf(f), minOrder: num(f[P.min]), memo: text(f[P.memo]), selection: parseSelection(f[P.selection]),
    editable: !payload?.src && (!payload?.items.length || isPickerPayload(payload)),
  };
}

// ── 쓰기 ──────────────────────────────────────────────

const today = () => seoulParts(new Date()).ymd;

/** 주문서의 품목을 지금 재고로 다시 써서 묶인 링크 전부에 넣는다(공동수입처럼 웹이 직접 읽는 링크는 빼고). */
async function syncLinks(programId: string, payload: LinkPayload, extra: { min?: number; memo?: string } = {}) {
  const links = (await selectRecordsFresh<Row>(LINKS, { fields: LINK_FIELDS, byId: true }))
    .map((r) => toLink(r.id, r.fields)).filter((l) => l.program === programId && l.managed);
  const body = JSON.stringify(payload);
  await updateRecords<Row>(LINKS, links.map((l) => ({
    id: l.recId,
    fields: {
      [L.items]: body, [L.date]: today(),
      ...(extra.min !== undefined ? { [L.min]: extra.min || null } : {}),
      ...(extra.memo !== undefined ? { [L.memo]: extra.memo || null } : {}),
    },
  })));
  return links.length;
}

export async function saveProgram(input: ProgramInput, author: MemberName): Promise<{ id: string; links: number }> {
  if (JSON.stringify(input.lines).length > 80_000) throw new Error("품목이 너무 많습니다. 주문서를 나눠 주세요.");
  const { items, selection } = programPayloads(input);
  const fresh = refreshStock(items as LinkPayload, shownStock(await readStock(payloadKeys(items as LinkPayload), true)));
  const fields = {
    [P.name]: input.name, [P.items]: JSON.stringify(fresh), [P.selection]: JSON.stringify(selection),
    [P.min]: input.minOrder || null, [P.memo]: input.memo || null, [P.supplier]: SUPPLIER_INFO[input.supplier].label,
  };
  if (!input.id) {
    const rec = await createRecord<Row>(PROGRAMS, { ...fields, [P.status]: "사용", [P.author]: author });
    return { id: rec.id, links: 0 };
  }
  const exists = await getRecordFresh<Row>(PROGRAMS, input.id, true);
  if (!exists) throw new Error("주문서를 찾지 못했습니다. 새로고침해 주세요.");
  const before = parsePayload((exists.fields as Row)[P.items]);
  if (before?.src) throw new Error("웹사이트가 품목을 직접 읽는 주문서(공동수입)라 여기서 고치지 않습니다. 품목은 호게나르드 DM의 공동주문 칸으로 고릅니다.");
  if (before?.items.length && !isPickerPayload(before)) {
    throw new Error("사진·크레이트를 손으로 넣은 주문서라 이 화면에서 고치면 그 정보가 사라집니다. 새 주문서로 저장해 주세요.");
  }
  await updateRecord<Row>(PROGRAMS, input.id, fields);
  return { id: input.id, links: await syncLinks(input.id, fresh, { min: input.minOrder, memo: input.memo }) };
}

/** 재고만 새로 읽어 주문서와 링크에 반영 */
export async function refreshProgram(programId: string): Promise<Result<number>> {
  try {
    const rec = await getRecordFresh<Row>(PROGRAMS, programId, true);
    const payload = rec ? parsePayload((rec.fields as Row)[P.items]) : null;
    if (!rec || !payload) return fail("주문서를 찾지 못했습니다.");
    if (!isPickerPayload(payload)) return ok(0); // 손으로 만든·공동수입 주문서는 재고를 적힌 대로 둔다
    const fresh = refreshStock(payload, shownStock(await readStock(payloadKeys(payload), true)));
    await updateRecord<Row>(PROGRAMS, programId, { [P.items]: JSON.stringify(fresh) });
    return ok(await syncLinks(programId, fresh));
  } catch (e) {
    return fail(message(e, "재고를 반영하지 못했다"));
  }
}

export async function setProgramStatus(id: string, status: "사용" | "보관"): Promise<Result<null>> {
  try {
    await updateRecord<Row>(PROGRAMS, id, { [P.status]: status });
    return ok(null);
  } catch (e) {
    return fail(message(e, "상태를 바꾸지 못했다"));
  }
}

export async function setLinkStatus(recId: string, status: "사용" | "마감"): Promise<Result<null>> {
  try {
    await updateRecord<Row>(LINKS, recId, { [L.status]: status });
    return ok(null);
  } catch (e) {
    return fail(message(e, "링크 상태를 바꾸지 못했다"));
  }
}

/** 회사 하나에 링크 배포: 주문서 품목(지금 재고)으로 [영업] 주문 링크 한 줄 */
export async function deployLink(programId: string, input: { customer: string; phone: string; title: string }, author: MemberName): Promise<Result<{ url: string }>> {
  try {
    const rec = await getRecordFresh<Row>(PROGRAMS, programId, true);
    const f = (rec?.fields ?? {}) as Row;
    const payload = parsePayload(f[P.items]);
    if (!rec || !payload || (!payload.items.length && !payload.src)) return fail("주문서에 품목이 없습니다. [품목 고치기]에서 먼저 고르세요.");
    const fresh = isPickerPayload(payload) ? refreshStock(payload, shownStock(await readStock(payloadKeys(payload), true))) : payload;
    const id = newLinkId();
    await createRecord<Row>(LINKS, {
      [L.id]: id, [L.title]: input.title || `${input.customer ? input.customer + " " : ""}${text(f[P.name])}`.slice(0, 60),
      [L.customer]: input.customer || null, [L.phone]: input.phone || null, [L.items]: JSON.stringify(fresh),
      [L.min]: num(f[P.min]) || null, [L.date]: today(), [L.status]: "사용", [L.author]: author,
      [L.memo]: text(f[P.memo]) || null, [L.program]: [programId],
    });
    return ok({ url: linkUrl(id) });
  } catch (e) {
    return fail(message(e, "링크를 만들지 못했다"));
  }
}

/**
 * 주문서에 안 묶인 링크(예전에 만든 것, 손으로 만든 것)를 그대로 주문서로 만든다.
 * 품목JSON은 글자 하나 안 바꾸고 옮긴다 — 사진·크레이트 정보가 그대로 남는다.
 */
export async function adoptLink(linkRecId: string, who: MemberName): Promise<Result<{ id: string }>> {
  try {
    const link = await getRecordFresh<Row>(LINKS, linkRecId, true);
    if (!link) return fail("링크를 찾지 못했습니다.");
    const f = link.fields as Row;
    if (ids(f[L.program]).length) return fail("이미 주문서에 묶인 링크입니다.");
    const raw = text(f[L.items]);
    if (!parsePayload(raw)) return fail("링크 품목을 읽지 못했습니다.");
    const guess = supplierOf({ [P.items]: raw });
    const rec = await createRecord<Row>(PROGRAMS, {
      [P.name]: text(f[L.title]) || "옮겨 온 주문서", [P.status]: "사용", [P.items]: raw, [P.min]: num(f[L.min]) || null,
      [P.supplier]: guess ? SUPPLIER_INFO[guess].label : null,
      [P.memo]: text(f[L.memo]) || null, [P.author]: who, [P.note]: `${today()} 주문 링크 ${text(f[L.id])}에서 옮김`,
    });
    await updateRecord<Row>(LINKS, linkRecId, { [L.program]: [rec.id] });
    return ok({ id: rec.id });
  } catch (e) {
    return fail(message(e, "주문서로 옮기지 못했다"));
  }
}

/**
 * 보관한 주문서를 지운다. 배포한 링크는 닫고(마감) 남긴다 — 고객이 받은 주소가 열려 있으면 안 되고,
 * 받은 주문(견적요청)·견적은 거래 기록이라 지우지 않는다.
 */
export async function deleteProgram(id: string): Promise<Result<{ closed: number }>> {
  try {
    const rec = await getRecordFresh<Row>(PROGRAMS, id, true);
    if (!rec) return fail("주문서를 찾지 못했습니다.");
    if (text((rec.fields as Row)[P.status]) !== "보관") return fail("보관한 주문서만 지울 수 있습니다. 먼저 [보관]을 누르세요.");
    const links = (await selectRecordsFresh<Row>(LINKS, { fields: LINK_FIELDS, byId: true })).map((r) => toLink(r.id, r.fields)).filter((l) => l.program === id);
    await updateRecords<Row>(LINKS, links.filter((l) => l.status !== "마감").map((l) => ({ id: l.recId, fields: { [L.status]: "마감" } })));
    await deleteRecord(PROGRAMS, id);
    return ok({ closed: links.length });
  } catch (e) {
    return fail(message(e, "주문서를 지우지 못했다"));
  }
}
