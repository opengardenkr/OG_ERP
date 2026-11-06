import "server-only";

import type { MemberName } from "@/config/users";
import { createRecord, getRecord, getRecordFresh, updateRecord, updateRecords } from "@/lib/airtable/client";
import type { ClientSummary } from "@/lib/client-types";
import { getClients } from "@/lib/airtable/clients";
import {
  LINKS, LINK_FIELDS, P, PROGRAMS, Q, QUOTES, R, REQUESTS, STOCK, ids, message, readLinks, readOrders, readQuoteList,
  readStock, text, toLink, type LinkInfo, type OrderInfo, type QuoteLite, type Row,
} from "@/lib/airtable/order-tables";
import { selectRecordsFresh } from "@/lib/airtable/client";
import type { OrderGroup } from "@/lib/order";
import {
  customerKey, deductions, exclusiveFor, followQuote, mergeLines, nextQuoteNo, nextRevisionNo, parsePayload, pendingOrders,
  phoneKey, proposalIds, quoteBase, quoteSummary, quoteTotals, seoulParts, splitRequester, stockKey,
  type EditLine, type LinkPayload, type OrderedLine,
} from "@/lib/order-program";
import { fail, ok, type Result } from "@/lib/result";
import { isSale, memoLine, prependMemo } from "@/lib/sales";

/**
 * 주문서 하나로 들어온 주문을 **주문한 회사별로** 묶는다(2026-11-06 — 링크 하나를 여러 곳에 돌리면 주문이 섞였다).
 * - 주문의 출처: 이 주문서에 묶인 주문 링크(/o/) + 이 주문서 사진이 가리키는 주문형 제안서(/p/).
 * - 같은 회사 = 같은 전화번호(없으면 이름). 회사 이름은 거래처 표(전화번호) → 제안서 "○○ 전용" → '상호 / 성함'의 앞.
 * - 회사의 주문 = 그 회사의 **최신 견적**(`followQuote`). 주문 뒤 바뀐 내용은 견적서(생성기)에서만 고친다 —
 *   여기는 고치는 창구가 아니다. 여기서 하는 쓰기는 견적 만들기·모으기, 안 쓰는 초안 숨기기, 재고 차감뿐.
 */

type Quote = QuoteLite & { fields: Row };

export type CustomerQuote = {
  id: string; number: string; status: string; total: number; deducted: string; at: string;
  /** 판매 상태 전이라 새 주문을 더할 수 있다 */
  canAdd: boolean; canDeduct: boolean; lines: EditLine[];
};
export type OtherQuote = { id: string; number: string; status: string; total: number; issued: string; auto: boolean };
export type Customer = {
  key: string; company: string; person: string; phone: string; via: string[];
  orders: OrderInfo[];
  /** 지금 금액: 견적이 있으면 견적 합계, 없으면 받은 주문 합 */
  amount: number;
  quote: CustomerQuote | null;
  /** 따라가지 않는 다른 견적(자동 초안·옛 견적) */
  others: OtherQuote[];
  /** 견적에 아직 안 들어간 주문 */
  pendingIds: string[];
  /** 배정 현황 계산용: 견적이 있으면 견적 줄, 없으면 주문 줄 합 */
  lines: OrderedLine[];
};
export type Deal = { programId: string; payload: LinkPayload; links: LinkInfo[]; customers: Customer[] };

const ref = (q: Quote) => ({
  ...q, phone: text(q.fields[Q.phone]), company: text(q.fields[Q.company]), issued: text(q.fields[Q.issued]), deal: text(q.fields[Q.deal]),
});

/** 주문서 하나의 회사별 묶음. 목록 화면(합계)과 상세 화면이 같이 쓴다. */
export function buildCustomers(payload: LinkPayload, links: LinkInfo[], orders: OrderInfo[], quotes: Quote[], clients: Pick<ClientSummary, "name" | "ceo" | "phone">[]): Customer[] {
  const linkIds = new Set(links.map((l) => l.linkId));
  const props = new Set(proposalIds(payload));
  const mine = orders.filter((o) => (o.source.kind === "link" ? linkIds.has(o.source.id) : props.has(o.source.id)));
  const byPhone = new Map(clients.map((c) => [phoneKey(c.phone), c] as const));
  const refs = quotes.map(ref);

  const groups = new Map<string, OrderInfo[]>();
  for (const o of [...mine].sort((a, b) => a.at.localeCompare(b.at))) {
    const key = customerKey(o.phone, o.who);
    groups.set(key, [...(groups.get(key) ?? []), o]);
  }
  const customers = [...groups].map(([key, list]): Customer => {
    const last = list[list.length - 1];
    const client = byPhone.get(phoneKey(last.phone));
    const req = splitRequester(last.who);
    const company = client?.name || exclusiveFor(last.memo) || req.company || "이름 없는 주문";
    const person = req.person || (req.company !== company ? req.company : "") || client?.ceo || "";
    const f = followQuote(refs, { phone: last.phone, company, drafts: list.map((o) => o.draft), since: list[0].at.slice(0, 10) }, payload);
    const q = f.current;
    const quote: CustomerQuote | null = q ? {
      id: q.id, number: q.number, status: q.status, total: q.total, deducted: q.deducted, at: q.at, lines: q.lines,
      canAdd: !isSale(q.status) && !q.deducted, canDeduct: isSale(q.status) && !q.deducted,
    } : null;
    const own = new Set(list.map((o) => quoteBase(o.draft)).filter(Boolean));
    return {
      key, company, person, phone: last.phone,
      via: [...new Set(list.map((o) => (o.source.kind === "link" ? links.find((l) => l.linkId === o.source.id)?.title || "주문 링크" : "카톡 제안서")))],
      orders: list, amount: quote ? quote.total : list.reduce((a, o) => a + o.total, 0), quote,
      others: f.others.map((x) => ({ id: x.id, number: x.number, status: x.status, total: x.total, issued: x.issued, auto: x.status === "작성" && own.has(x.number) })),
      pendingIds: pendingOrders(list, q, f.auto).map((o) => o.id),
      lines: quote ? quote.lines : mergeLines(list.map((o) => o.lines)),
    };
  });
  return customers.sort((a, b) => b.orders[b.orders.length - 1].at.localeCompare(a.orders[a.orders.length - 1].at));
}

export async function loadDeal(programId: string, fresh: boolean): Promise<Deal | null> {
  // 화면 표시는 캐시(호출 한도), 쓰기 직전에는 캐시 없이 다시 읽는다
  const rec = fresh ? await getRecordFresh<Row>(PROGRAMS, programId, true) : await getRecord<Row>(PROGRAMS, programId, 30, true);
  if (!rec) return null;
  const payload = parsePayload((rec.fields as Row)[P.items]) ?? { v: 1 as const, items: [] };
  const [linkRows, orders, quotes, clients] = await Promise.all([
    fresh ? selectRecordsFresh<Row>(LINKS, { fields: LINK_FIELDS, byId: true }) : readLinks(), readOrders(fresh), readQuoteList(fresh), getClients(),
  ]);
  const links = linkRows.map((r) => toLink(r.id, r.fields)).filter((l) => l.program === programId);
  return { programId, payload, links, customers: buildCustomers(payload, links, orders, quotes, clients.ok ? clients.data : []) };
}

async function freshCustomer(programId: string, key: string) {
  const deal = await loadDeal(programId, true);
  if (!deal) return { error: "주문서를 찾지 못했습니다." } as const;
  const c = deal.customers.find((x) => x.key === key);
  if (!c) return { error: "주문한 회사를 찾지 못했습니다. 새로고침해 주세요." } as const;
  const quotes = await readQuoteList(true);
  return { deal, c, quotes } as const;
}

/** 견적의 거래처·담당자가 이 회사와 다르면 바로잡는다(자동 초안이 '상호 / 성함'을 반대로 읽었다). */
function clientFix(q: Quote, c: Customer): Row {
  if (text(q.fields[Q.company]) === c.company) return {};
  let snap: Record<string, unknown> = {};
  try { snap = JSON.parse(text(q.fields[Q.snap]) || "{}"); } catch { snap = {}; }
  let items: Record<string, unknown> = {};
  try { items = JSON.parse(text(q.fields[Q.items]) || "{}"); } catch { items = {}; }
  const fix = (cl: unknown) => ({ ...((cl as Record<string, unknown>) ?? {}), company: c.company, name: c.person });
  return {
    [Q.company]: c.company, [Q.person]: c.person || null,
    [Q.snap]: JSON.stringify({ ...snap, client: fix(snap.client) }), [Q.items]: JSON.stringify({ ...items, client: fix(items.client) }),
  };
}

const moneyFields = (q: Quote, lines: EditLine[], extraSnap: Record<string, unknown> = {}) => {
  const totals = quoteTotals(lines, text(q.fields[Q.tax]) === "과세" ? "과세" : "면세");
  let snap: Record<string, unknown> = {};
  try { snap = JSON.parse(text(q.fields[Q.snap]) || "{}"); } catch { snap = {}; }
  let items: Record<string, unknown> = {};
  try { items = JSON.parse(text(q.fields[Q.items]) || "{}"); } catch { items = {}; }
  return {
    totals,
    fields: {
      [Q.count]: totals.count, [Q.qty]: totals.qty, [Q.supply]: totals.supply, [Q.vat]: totals.vat, [Q.total]: totals.total,
      [Q.summary]: quoteSummary(lines), [Q.items]: JSON.stringify({ ...items, kind: items.kind ?? "plant", items: lines }),
      [Q.snap]: JSON.stringify({ ...snap, items: lines, totals, ...extraSnap }),
    } as Row,
  };
};

/** 보낸 견적 → 수정본(-R…) '작성'으로. 견적서 생성기 규칙과 같다(원본견적번호·개정번호·선적차수, 옛 견적은 그대로). */
async function createRevision(q: Quote, quotes: Quote[], lines: EditLine[], who: MemberName, what: string, detail: string, c: Customer) {
  const t = seoulParts(new Date());
  const base = quoteBase(q.number);
  const next = nextRevisionNo(quotes.map((x) => x.number), base);
  const m = moneyFields(q, lines, {
    quoteNo: next.number, revision: next.revision, sourceQuoteNo: base, issuedDate: t.ymd, issuedDateLabel: t.label,
    issuedAt: t.issuedAt, validUntil: t.validUntil, author: who,
  });
  const fixed = clientFix(q, c);
  await createRecord<Row>(QUOTES, {
    ...m.fields, ...fixed,
    [Q.number]: next.number, [Q.revision]: next.revision, [Q.source]: base, [Q.issued]: t.ymd, [Q.at]: new Date().toISOString(),
    [Q.author]: who, [Q.kind]: text(q.fields[Q.kind]) || "식물 도매", [Q.status]: "작성", [Q.tax]: text(q.fields[Q.tax]) || "면세",
    [Q.taxReason]: text(q.fields[Q.taxReason]) || null, [Q.deal]: text(q.fields[Q.deal]) || "일반", [Q.valid]: t.validUntil,
    [Q.remarks]: text(q.fields[Q.remarks]) || null,
    ...(fixed[Q.company] ? {} : { [Q.company]: text(q.fields[Q.company]) || null, [Q.person]: text(q.fields[Q.person]) || null }),
    [Q.phone]: text(q.fields[Q.phone]) || c.phone || null,
    ...(ids(q.fields[Q.shipment]).length ? { [Q.shipment]: ids(q.fields[Q.shipment]) } : {}),
    [Q.memo]: memoLine(new Date(), who, what, `${q.number}의 수정본 · ${detail}`),
  });
  await updateRecord<Row>(QUOTES, q.id, { [Q.memo]: prependMemo(text(q.fields[Q.memo]), memoLine(new Date(), who, "수정본", `${next.number} 작성(${what})`)) });
  return next.number;
}

const hideDrafts = (drafts: Quote[], target: string, who: MemberName) => updateRecords<Row>(QUOTES, drafts.map((q) => ({
  id: q.id,
  fields: {
    [Q.deleted]: true, [Q.deletedBy]: who, [Q.deletedAt]: new Date().toISOString(), [Q.deletedReason]: `합산 견적 ${target}로 합침`,
    [Q.memo]: prependMemo(text(q.fields[Q.memo]), memoLine(new Date(), who, "합산", `${target}로 합침 · 삭제함`)),
  },
})));

/**
 * 회사 하나의 주문을 견적 하나로 모은다.
 * - 견적이 있고 '작성'이면 새 주문 줄만 더한다(고친 줄을 지우지 않게). 이미 보냈으면 새 주문을 더한 수정본을 만든다.
 * - 견적이 없으면: 주문이 하나뿐이고 자동 초안이 있으면 그 초안을 쓰고, 여럿이면 합산 초안을 새로 만든다.
 * 합쳐진 자동 초안(상태 '작성')은 삭제함으로 숨긴다(되살릴 수 있다). 수주확정 뒤에는 막는다.
 */
export async function mergeCustomer(programId: string, key: string, who: MemberName): Promise<Result<{ number: string; created: boolean; orders: number }>> {
  try {
    const got = await freshCustomer(programId, key);
    if ("error" in got) return fail(got.error!);
    const { c, quotes } = got;
    const byNo = new Map(quotes.map((q) => [q.number, q]));
    const base = c.quote ? quoteBase(c.quote.number) : "";
    const added = c.orders.filter((o) => c.pendingIds.includes(o.id));
    const ownDrafts = (os: OrderInfo[], except = "") => [...new Set(os.map((o) => o.draft).filter(Boolean))]
      .map((n) => byNo.get(n)).filter((q): q is Quote => !!q && q.status === "작성" && !q.deleted && q.number !== except);

    if (c.quote) {
      const q = byNo.get(c.quote.number)!;
      if (isSale(q.status) || q.deducted) return fail(`견적 ${q.number}이 이미 ${q.status}입니다. 새 주문은 견적서 생성기에서 따로 처리해 주세요.`);
      const fix = clientFix(q, c);
      if (!added.length) {
        if (Object.keys(fix).length && q.status === "작성") await updateRecord<Row>(QUOTES, q.id, fix);
        return ok({ number: q.number, created: false, orders: c.orders.length });
      }
      const lines = mergeLines([q.lines, ...added.map((o) => o.lines)]);
      const detail = `주문 ${added.length}건(${added.map((o) => o.no).join(", ")}) 더함`;
      let number = q.number;
      if (q.status === "작성") {
        const m = moneyFields(q, lines);
        await updateRecord<Row>(QUOTES, q.id, { ...m.fields, ...fix, [Q.memo]: prependMemo(text(q.fields[Q.memo]), memoLine(new Date(), who, "합산추가", `${detail} · ERP 주문서`)) });
      } else {
        number = await createRevision(q, quotes, lines, who, "합산추가", detail, c);
      }
      await hideDrafts(ownDrafts(added, q.number), number, who);
      await updateRecords<Row>(REQUESTS, added.map((o) => ({ id: o.id, fields: { [R.draft]: base } })));
      return ok({ number, created: number !== q.number, orders: c.orders.length });
    }

    // 견적이 아직 없다
    const drafts = ownDrafts(c.orders);
    if (c.orders.length === 1 && drafts.length === 1) {
      const fix = clientFix(drafts[0], c);
      if (Object.keys(fix).length) await updateRecord<Row>(QUOTES, drafts[0].id, fix);
      return ok({ number: drafts[0].number, created: false, orders: 1 });
    }
    const lines = mergeLines(c.orders.map((o) => o.lines));
    if (!lines.length) return fail("주문 품목을 읽지 못했습니다.");
    const from = drafts.sort((a, b) => b.at.localeCompare(a.at))[0] ?? [...quotes].filter((q) => text(q.fields[Q.snap])).sort((a, b) => b.at.localeCompare(a.at))[0];
    let snap: Record<string, unknown> = {};
    try { snap = JSON.parse(text(from?.fields[Q.snap]) || "{}"); } catch { snap = {}; }
    const t = seoulParts(new Date());
    const number = nextQuoteNo(quotes.map((q) => q.number), t.compact);
    const taxType = snap.taxType === "과세" || c.orders.some((o) => /VAT\s*별도|부가세\s*별도/i.test(o.memo)) ? "과세" : "면세";
    const totals = quoteTotals(lines, taxType);
    const client = { ...((snap.client as Record<string, unknown>) ?? {}), company: c.company, name: c.person, phone: c.phone };
    const remarks = `주문 합산: ${c.orders.map((o) => o.no).join(", ")}`;
    await createRecord<Row>(QUOTES, {
      [Q.number]: number, [Q.issued]: t.ymd, [Q.at]: new Date().toISOString(), [Q.author]: who, [Q.revision]: 1,
      [Q.kind]: "식물 도매", [Q.count]: totals.count, [Q.qty]: totals.qty, [Q.supply]: totals.supply, [Q.vat]: totals.vat, [Q.total]: totals.total,
      [Q.status]: "작성", [Q.tax]: taxType, [Q.taxReason]: taxType === "과세" ? (text(snap.taxReason) || "주문에 VAT 별도 조건") : null,
      [Q.deal]: "일반", [Q.valid]: t.validUntil,
      [Q.snap]: JSON.stringify({ ...snap, kind: "plant", taxType, dealType: "일반", discountRate: 0, client, remarks, items: lines, totals, validDays: 14, validUntil: t.validUntil, quoteNo: number, issuedDate: t.ymd, issuedDateLabel: t.label, v: 1, issuedAt: t.issuedAt, author: who, revision: 1, sourceQuoteNo: "" }),
      [Q.items]: JSON.stringify({ kind: "plant", client, remarks, items: lines }), [Q.summary]: quoteSummary(lines), [Q.remarks]: remarks,
      [Q.company]: c.company, [Q.person]: c.person || null, [Q.phone]: c.phone || null,
      [Q.memo]: memoLine(new Date(), who, "합산견적", `주문 ${c.orders.length}건(${c.orders.map((o) => o.no).join(", ")}) 합침 · ERP 주문서`),
    });
    await hideDrafts(drafts, number, who);
    await updateRecords<Row>(REQUESTS, c.orders.map((o) => ({ id: o.id, fields: { [R.draft]: number } })));
    return ok({ number, created: true, orders: c.orders.length });
  } catch (e) {
    return fail(message(e, "견적을 합치지 못했다"));
  }
}

/**
 * 따라가지 않는 자동 초안(아직 '작성', 보낸 적 없음)을 삭제함으로 숨긴다 — 견적서 목록에 같은 주문이 두 장 보이지 않게.
 * 되살릴 수 있다(삭제함). 보낸 견적은 거래 기록이라 건드리지 않는다.
 */
export async function hideOtherDrafts(programId: string, key: string, who: MemberName): Promise<Result<{ hidden: number }>> {
  try {
    const got = await freshCustomer(programId, key);
    if ("error" in got) return fail(got.error!);
    const { c, quotes } = got;
    if (!c.quote) return fail("따라갈 견적이 없습니다.");
    const ids = new Set(c.others.filter((o) => o.auto).map((o) => o.id));
    const drafts = quotes.filter((q) => ids.has(q.id) && q.status === "작성" && !q.deleted);
    if (!drafts.length) return ok({ hidden: 0 });
    await updateRecords<Row>(QUOTES, drafts.map((q) => ({
      id: q.id,
      fields: {
        [Q.deleted]: true, [Q.deletedBy]: who, [Q.deletedAt]: new Date().toISOString(), [Q.deletedReason]: `최신 견적 ${c.quote!.number}을 따름(안 쓰는 자동 초안)`,
        [Q.memo]: prependMemo(text(q.fields[Q.memo]), memoLine(new Date(), who, "정리", `최신 견적 ${c.quote!.number}을 따름 · 삭제함`)),
      },
    })));
    return ok({ hidden: drafts.length });
  } catch (e) {
    return fail(message(e, "초안을 정리하지 못했다"));
  }
}

/**
 * 수주한 견적(최신 수정본)의 수량을 라인업 재고에서 뺀다. 견적의 `재고차감` 시각이 있으면 다시 빼지 않는다.
 * 라인업 레코드를 가리키지 않는 줄(손으로 만든 주문서)·재고 칸이 빈 품목은 건드리지 않고 알려 준다.
 */
export async function deductCustomer(programId: string, key: string, who: MemberName): Promise<Result<{ lines: number; unmatched: string[] }>> {
  try {
    const got = await freshCustomer(programId, key);
    if ("error" in got) return fail(got.error!);
    const { deal, c, quotes } = got;
    if (!c.quote) return fail("먼저 [견적서로 묶기]로 견적을 만드세요.");
    const q = quotes.find((x) => x.id === c.quote!.id)!;
    if (!isSale(q.status)) return fail(`견적 ${q.number}이 아직 판매 상태가 아닙니다(${q.status}). 견적서에서 수주확정한 뒤 빼세요.`);
    if (q.deducted) return fail(`이미 ${q.deducted.slice(0, 16).replace("T", " ")}에 뺐습니다.`);
    const { list, unmatched } = deductions(q.lines, deal.payload);
    const usable = list.filter((d) => d.group && d.rec);
    if (!usable.length) return fail("라인업 품목과 맞는 줄이 없습니다(손으로 만든 주문서는 라인업 재고가 없습니다).");
    const stock = await readStock(usable.map((d) => stockKey(d.group, d.rec)), true);
    const byGroup = new Map<OrderGroup, { id: string; fields: Row }[]>();
    const done: string[] = [];
    for (const d of usable) {
      const cur = stock.get(stockKey(d.group, d.rec));
      if (cur === undefined || cur === null) continue;
      byGroup.set(d.group, [...(byGroup.get(d.group) ?? []), { id: d.rec, fields: { [STOCK[d.group].field]: Math.max(0, cur - d.qty) } }]);
      done.push(`${d.name} ${d.spec} ${cur}→${Math.max(0, cur - d.qty)}`);
    }
    for (const [group, records] of byGroup) await updateRecords<Row>(STOCK[group].table, records);
    const skipped = [...unmatched.map((l) => `${l.name} ${l.spec}`.trim()), ...list.filter((d) => !d.group || !d.rec).map((d) => `${d.name} ${d.spec}`.trim())];
    await updateRecord<Row>(QUOTES, q.id, {
      [Q.deducted]: new Date().toISOString(),
      [Q.memo]: prependMemo(text(q.fields[Q.memo]), memoLine(new Date(), who, "재고차감", `${done.length}품목${skipped.length ? ` · 못 맞춘 줄 ${skipped.length}` : ""} · ERP 주문서`)),
    });
    return ok({ lines: done.length, unmatched: skipped });
  } catch (e) {
    return fail(message(e, "재고를 빼지 못했다"));
  }
}

