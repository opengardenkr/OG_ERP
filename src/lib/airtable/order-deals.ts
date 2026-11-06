import "server-only";

import type { MemberName } from "@/config/users";
import { createRecord, getRecord, getRecordFresh, updateRecord, updateRecords } from "@/lib/airtable/client";
import { getClients } from "@/lib/airtable/clients";
import {
  LINKS, LINK_FIELDS, P, PROGRAMS, Q, QUOTES, R, REQUESTS, STOCK, ids, message, num, quoteLines, readLinks, readOrders, readQuoteList,
  readStock, text, toLink, type LinkInfo, type OrderInfo, type QuoteLite, type Row,
} from "@/lib/airtable/order-tables";
import { selectRecordsFresh } from "@/lib/airtable/client";
import type { OrderGroup } from "@/lib/order";
import {
  changeSummary, customerKey, deductions, exclusiveFor, latestRevision, mergeLines, nextQuoteNo, nextRevisionNo, parsePayload,
  phoneKey, proposalIds, quoteBase, quoteSummary, quoteTotals, seoulParts, splitRequester, stockKey,
  type EditLine, type LinkPayload, type OrderedLine,
} from "@/lib/order-program";
import { fail, ok, type Result } from "@/lib/result";
import { isSale, memoLine, prependMemo, sameCompany } from "@/lib/sales";

/**
 * 주문서 하나로 들어온 주문을 **주문한 회사별로** 묶는다(2026-11-06 — 링크 하나를 여러 곳에 돌리면 주문이 섞였다).
 * - 주문의 출처: 이 주문서에 묶인 주문 링크(/o/) + 이 주문서 사진이 가리키는 주문형 제안서(/p/).
 * - 같은 회사 = 같은 전화번호(없으면 이름). 회사 이름은 거래처 표(전화번호) → 제안서 "○○ 전용" → '상호 / 성함'의 앞.
 * - 회사의 견적 = 그 회사 주문들이 가리키는 견적(견적요청 `견적서 초안`)의 최신 수정본. 견적은 회사마다 하나로 모은다.
 * 합산·주문 변경·재고 차감은 모두 (주문서, 회사) 단위다.
 */

type Quote = QuoteLite & { fields: Row };

export type CustomerQuote = {
  id: string; number: string; status: string; total: number; deducted: string;
  canDeduct: boolean; canEdit: boolean; lines: EditLine[]; changes: string[];
};
export type Customer = {
  key: string; company: string; person: string; phone: string; via: string[];
  orders: OrderInfo[]; amount: number;
  quote: CustomerQuote | null;
  /** 아직 견적에 안 들어간 주문 수(합치기·더하기 대상) */
  pending: number;
  /** 견적이 안 묶인 주문의 후보: 같은 번호·이름으로 주문 뒤에 만든 견적(손으로 만든 견적) */
  candidates: { number: string; status: string; total: number; issued: string }[];
  /** 배정 현황 계산용: 견적이 있으면 견적 줄, 없으면 주문 줄 합 */
  lines: OrderedLine[];
};
export type Deal = { programId: string; payload: LinkPayload; links: LinkInfo[]; customers: Customer[] };

const nonDeleted = (qs: Quote[]) => qs.filter((q) => !q.deleted);
const inChain = (no: string, base: string) => !!no && (no === base || no.startsWith(`${base}-R`));

function customerQuote(quotes: Quote[], base: string): CustomerQuote | null {
  const q = latestRevision(nonDeleted(quotes), base);
  if (!q) return null;
  return {
    id: q.id, number: q.number, status: q.status, total: q.total, deducted: q.deducted,
    canDeduct: isSale(q.status) && !q.deducted, canEdit: !isSale(q.status) && !q.deducted, lines: q.lines,
    changes: quotes.filter((x) => inChain(x.number, base)).flatMap((x) => x.memo.split("\n"))
      .filter((m) => m.includes(" · 주문변경 · ")).sort().reverse().slice(0, 5),
  };
}

/** 회사의 견적 기준 번호: 주문들이 가리키는 견적 중 지워지지 않은 것(가장 최근) */
function baseOf(orders: OrderInfo[], quotes: Quote[]): string {
  const live = new Set(nonDeleted(quotes).map((q) => q.number));
  const bases = orders.map((o) => quoteBase(o.draft)).filter((b) => b && live.has(b));
  return bases.sort().reverse()[0] ?? "";
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
  const linkIds = new Set(links.map((l) => l.linkId));
  const props = new Set(proposalIds(payload));
  const mine = orders.filter((o) => (o.source.kind === "link" ? linkIds.has(o.source.id) : props.has(o.source.id)));
  const byPhone = new Map((clients.ok ? clients.data : []).map((c) => [phoneKey(c.phone), c] as const));

  const groups = new Map<string, OrderInfo[]>();
  for (const o of mine.sort((a, b) => a.at.localeCompare(b.at))) {
    const key = customerKey(o.phone, o.who);
    groups.set(key, [...(groups.get(key) ?? []), o]);
  }
  const customers = [...groups].map(([key, list]): Customer => {
    const last = list[list.length - 1];
    const client = byPhone.get(phoneKey(last.phone));
    const req = splitRequester(last.who);
    const company = client?.name || exclusiveFor(last.memo) || req.company || "이름 없는 주문";
    const person = req.person || (req.company !== company ? req.company : "") || client?.ceo || "";
    const base = baseOf(list, quotes);
    const quote = base ? customerQuote(quotes, base) : null;
    const pending = list.filter((o) => !inChain(o.draft, base)).length;
    const first = list[0].at.slice(0, 10);
    const candidates = base ? [] : [...new Map(nonDeleted(quotes)
      .filter((q) => (phoneKey(text(q.fields[Q.phone])) && phoneKey(text(q.fields[Q.phone])) === phoneKey(last.phone)) || sameCompany(text(q.fields[Q.company]), company))
      .filter((q) => text(q.fields[Q.issued]) >= first)
      .map((q) => [quoteBase(q.number), q] as const)).keys()]
      .map((b) => latestRevision(nonDeleted(quotes), b)!).filter(Boolean)
      .map((q) => ({ number: q.number, status: q.status, total: q.total, issued: text(q.fields[Q.issued]) }));
    return {
      key, company, person, phone: last.phone,
      via: [...new Set(list.map((o) => (o.source.kind === "link" ? links.find((l) => l.linkId === o.source.id)?.title || "주문 링크" : "카톡 제안서")))],
      orders: list, amount: list.reduce((a, o) => a + o.total, 0), quote, pending, candidates,
      lines: quote ? quote.lines : mergeLines(list.map((o) => o.lines)),
    };
  });
  customers.sort((a, b) => b.orders[b.orders.length - 1].at.localeCompare(a.orders[a.orders.length - 1].at));
  return { programId, payload, links, customers };
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
    const added = c.orders.filter((o) => !inChain(o.draft, base));
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

/** 견적 없이 들어온 주문을 이미 있는 견적(손으로 만든 견적)에 묶는다. 후보로 보인 견적만 받는다. */
export async function attachQuote(programId: string, key: string, number: string): Promise<Result<{ number: string }>> {
  try {
    const got = await freshCustomer(programId, key);
    if ("error" in got) return fail(got.error!);
    const hit = got.c.candidates.find((q) => q.number === number);
    if (!hit) return fail("이 회사의 견적 후보가 아닙니다. 새로고침해 주세요.");
    const base = quoteBase(number);
    await updateRecords<Row>(REQUESTS, got.c.orders.map((o) => ({ id: o.id, fields: { [R.draft]: base } })));
    return ok({ number: hit.number });
  } catch (e) {
    return fail(message(e, "견적에 묶지 못했다"));
  }
}

/**
 * 주문 뒤 카톡·전화로 바뀐 내용 → 그 회사 견적. '작성'이면 그대로 고치고, 보냈으면 수정본(-R…)을 만든다.
 * 판매 상태(수주확정 이후)·재고 차감 뒤에는 막는다. 바꾼 이유는 작업메모에 '주문변경'으로 남는다.
 */
export async function editCustomerQuote(programId: string, key: string, lines: EditLine[], reason: string, who: MemberName): Promise<Result<{ number: string; created: boolean }>> {
  try {
    const got = await freshCustomer(programId, key);
    if ("error" in got) return fail(got.error!);
    const { c, quotes } = got;
    if (!c.quote) return fail("먼저 [견적서로 묶기]로 견적을 만드세요.");
    const q = quotes.find((x) => x.number === c.quote!.number)!;
    if (isSale(q.status) || q.deducted) return fail(`견적 ${q.number}은 이미 ${q.status}입니다. 수주확정 뒤 변경은 견적서 생성기에서 수정본으로 고쳐 주세요.`);
    const totals = quoteTotals(lines, text(q.fields[Q.tax]) === "과세" ? "과세" : "면세");
    const detail = `${reason} · ${changeSummary(quoteLines(q.fields), lines)} · 합계 ₩${num(q.fields[Q.total]).toLocaleString("en-US")}→₩${totals.total.toLocaleString("en-US")}`;
    if (q.status === "작성") {
      const m = moneyFields(q, lines);
      await updateRecord<Row>(QUOTES, q.id, { ...m.fields, ...clientFix(q, c), [Q.memo]: prependMemo(text(q.fields[Q.memo]), memoLine(new Date(), who, "주문변경", detail)) });
      return ok({ number: q.number, created: false });
    }
    return ok({ number: await createRevision(q, quotes, lines, who, "주문변경", detail, c), created: true });
  } catch (e) {
    return fail(message(e, "주문 변경을 저장하지 못했다"));
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
    const q = quotes.find((x) => x.number === c.quote!.number)!;
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

