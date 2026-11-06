import "server-only";

import { getRecordFresh, selectRecords, updateRecord } from "@/lib/airtable/client";
import { fail, ok, type Result } from "@/lib/result";
import {
  applyPayment, costsPayload, isSale, matchKey, memoLine, oneSalePerChain, openQuotes, parseCosts, parseLines, prependMemo, won,
  type Sale,
} from "@/lib/sales";

/**
 * 매출 화면(미수금·마진)의 Airtable 경계. 원천은 `견적서 발송 내역` 하나.
 * 쓰는 칸은 셋뿐: 입금액·입금일·입금상태(+작업메모 한 줄), 그리고 원가JSON(마진).
 * 금액·품목·상태는 건드리지 않는다 — 그건 견적서 도구의 몫이다.
 */
const QUOTES = "tblj74vsSha7drqmj";
const Q = {
  number: "fldarqONAT0cvnlBc", issued: "fldtUJengZES1OG7a", company: "fldMruU9RhDA44EyD", status: "fldMMWnoJNwVCeKvp",
  deal: "fldN2wuhNA6pXh3as", total: "fldskak7i2iuJOY8r", supply: "fld70Zouk4tTQiew5", paid: "fldVz195iBuWBQV82",
  paidOn: "fldGu7Pha6kQK21jG", payState: "fldIDIwHJQ0gtfLeo", ordered: "fld9M5fVtuyx4wv2i", items: "fld11Vy38j2SZgqIf",
  costs: "fldgc4piij1y2mFXV", deleted: "fldUDwBfzwcnftVsa", memo: "fldLHric3VonWTZNI",
} as const;

/** 호게나르드 DM: 국명·규격·총원가(₩). 원가가 표에 있는 유일한 라인업이다(2026-11-06 기준). */
const DM = "tblVVRTKfyViCI1aW";
const D = { name: "fld3XAFUiRqL9I5xM", spec: "fldqwhjXWl1NWgrwV", cost: "fldh2LU8RdOMgPh8E" } as const;

type Row = Record<string, unknown>;
const text = (v: unknown) => (typeof v === "string" ? v.trim() : v && typeof v === "object" && "name" in v ? String((v as { name: unknown }).name).trim() : "");
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);

function toSale(id: string, f: Row): Sale {
  return {
    id, number: text(f[Q.number]), issued: text(f[Q.issued]), ordered: text(f[Q.ordered]), company: text(f[Q.company]),
    status: text(f[Q.status]), dealType: text(f[Q.deal]), total: num(f[Q.total]), supply: num(f[Q.supply]),
    paid: num(f[Q.paid]), paidOn: text(f[Q.paidOn]), payState: text(f[Q.payState]),
    lines: parseLines(f[Q.items]), costs: parseCosts(f[Q.costs]),
  };
}

/** 지우지 않은 견적 전부(최근 발행 순). 테스트 거래는 뺀다. 성공만 60초 캐시. */
async function readQuotes(): Promise<Sale[]> {
  const rows = await selectRecords<Row>(QUOTES, {
    fields: Object.values(Q).filter((f) => f !== Q.memo), filterByFormula: "NOT({삭제함})",
    sort: [{ field: Q.issued, direction: "desc" }], revalidate: 60, byId: true,
  });
  return rows.map((r) => toSale(r.id, r.fields)).filter((s) => s.dealType !== "테스트");
}

const message = (e: unknown, fallback: string) => (e instanceof Error ? e.message : fallback);

export async function getSales(): Promise<Result<Sale[]>> {
  try {
    return ok(oneSalePerChain(await readQuotes()));
  } catch (e) {
    return fail(message(e, "판매 기록을 불러오지 못했다"));
  }
}

/** 매출 화면: 판매 + 보냈는데 판매로 안 바뀐 견적(상태를 안 바꾼 판매 찾기용) */
export async function getSalesOverview(): Promise<Result<{ sales: Sale[]; open: Sale[] }>> {
  try {
    const all = await readQuotes();
    return ok({ sales: oneSalePerChain(all), open: openQuotes(all) });
  } catch (e) {
    return fail(message(e, "판매 기록을 불러오지 못했다"));
  }
}

/** 거래처 화면용: 이름이 같은 견적 전부(판매 아닌 것 포함). */
export async function getQuotesFor(match: (company: string) => boolean): Promise<Result<Sale[]>> {
  try {
    return ok((await readQuotes()).filter((s) => match(s.company)));
  } catch (e) {
    return fail(message(e, "견적을 불러오지 못했다"));
  }
}

/** 마진 화면용: 판매(또는 발송 견적 포함) + 라인업 원가표. 원가표는 5분 캐시. */
export async function getMarginData(includeQuotes: boolean): Promise<Result<{ sales: Sale[]; catalog: Map<string, number> }>> {
  try {
    const [quotes, dm] = await Promise.all([
      readQuotes(),
      selectRecords<Row>(DM, { fields: Object.values(D), filterByFormula: `{총원가(₩)}>0`, revalidate: 300, byId: true }),
    ]);
    const catalog = new Map<string, number>();
    for (const r of dm) {
      const cost = num(r.fields[D.cost]);
      if (cost > 0) catalog.set(matchKey(text(r.fields[D.name]), text(r.fields[D.spec])), cost);
    }
    const sales = quotes.filter((s) => isSale(s.status) || (includeQuotes && s.status === "발송"));
    return ok({ sales, catalog });
  } catch (e) {
    return fail(message(e, "마진 자료를 불러오지 못했다"));
  }
}

/**
 * 입금 기록. 캐시 없이 다시 읽고(읽고-고쳐-쓰기) 누계에 더한다.
 * 다 받으면 입금상태 '완납', 일부면 '선금'. 작업메모 맨 위에 한 줄.
 */
export async function recordPayment(id: string, amount: number, date: string, who: string): Promise<Result<{ paid: number; payState: string }>> {
  try {
    const rec = await getRecordFresh<Row>(QUOTES, id, true);
    if (!rec) return fail("견적을 찾지 못했습니다. 새로고침해 주세요.");
    const f = rec.fields as Row;
    if (f[Q.deleted] === true) return fail("삭제한 견적입니다.");
    const sale = toSale(id, f);
    if (!isSale(sale.status)) return fail(`판매 상태가 아닙니다(${sale.status || "상태 없음"}). 견적서에서 수주확정부터 해 주세요.`);
    const next = applyPayment(sale, amount);
    if (!next.ok) return fail(next.error);
    const line = memoLine(new Date(), who, "입금", `${won(amount)} (${date}) · 누계 ${won(next.paid)} / ${won(sale.total)}`);
    await updateRecord<Row>(QUOTES, id, {
      [Q.paid]: next.paid, [Q.paidOn]: date, [Q.payState]: next.payState, [Q.memo]: prependMemo(text(f[Q.memo]), line),
    });
    return ok({ paid: next.paid, payState: next.payState });
  } catch (e) {
    return fail(message(e, "입금을 저장하지 못했다"));
  }
}

/** 판매건의 품목별 원가 저장. 이 건의 품목이 아닌 키는 버린다. */
export async function saveCosts(id: string, input: Record<string, string>): Promise<Result<null>> {
  try {
    const rec = await getRecordFresh<Row>(QUOTES, id, true);
    if (!rec) return fail("견적을 찾지 못했습니다.");
    const payload = costsPayload(parseLines((rec.fields as Row)[Q.items]), input);
    if ("error" in payload) return fail(payload.error);
    await updateRecord<Row>(QUOTES, id, { [Q.costs]: Object.keys(payload.lines).length ? JSON.stringify(payload) : null });
    return ok(null);
  } catch (e) {
    return fail(message(e, "원가를 저장하지 못했다"));
  }
}

export const quoteAirtableUrl = (id: string) => `https://airtable.com/appzLstFHtHcQlWSu/${QUOTES}/${id}`;
