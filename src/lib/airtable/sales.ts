import "server-only";

import { createRecord, getRecordFresh, selectRecords, selectRecordsFresh, updateRecord } from "@/lib/airtable/client";
import { fail, ok, type Result } from "@/lib/result";
import { todayInSeoul } from "@/lib/date";
import {
  canTakePayment, chainOf, chainTarget, checkEntry, confirmedStatus, costsPayload, isSale, isSheetWaiting, matchKey, memoLine,
  oneSalePerChain, openQuotes, parseCosts, parseLines, payStateOf, prependMemo, sheetChains, shouldIssueSheet, toOrderSheet, withLedger,
  won, PAY_KINDS, type OrderSheet, type PayKind, type Payment, type Sale, type SheetDetail,
} from "@/lib/sales";

/**
 * 매출 화면(미수금·마진)의 Airtable 경계. 판매 = `견적서 발송 내역`, 돈 = `[영업] 입금` 장부.
 * 견적에 쓰는 칸: 입금액·입금일·입금상태(장부의 거울, +작업메모 한 줄), 원가JSON(마진), 주문서발행일시·출고일시(물류 주문서).
 * 금액·품목은 건드리지 않는다 — 그건 견적서 도구의 몫이다. 상태는 둘만 바꾼다(2026-11-13 사용자 요청):
 * 완납되면 보낸 견적 → 수주확정(+주문서 발행), [출고 완료] → 출하완료.
 */
const QUOTES = "tblj74vsSha7drqmj";
const Q = {
  number: "fldarqONAT0cvnlBc", issued: "fldtUJengZES1OG7a", company: "fldMruU9RhDA44EyD", status: "fldMMWnoJNwVCeKvp",
  deal: "fldN2wuhNA6pXh3as", total: "fldskak7i2iuJOY8r", supply: "fld70Zouk4tTQiew5", paid: "fldVz195iBuWBQV82",
  paidOn: "fldGu7Pha6kQK21jG", payState: "fldIDIwHJQ0gtfLeo", ordered: "fld9M5fVtuyx4wv2i", items: "fld11Vy38j2SZgqIf",
  costs: "fldgc4piij1y2mFXV", deleted: "fldUDwBfzwcnftVsa", memo: "fldLHric3VonWTZNI",
  sheetAt: "fld2b3Yqyug9ZUUBl", shippedAt: "fld91diIPM0SmcrzG",
} as const;
/** 주문서에만 쓰는 칸(스냅샷은 커서 목록 읽기에서는 뺀다). */
const QD = { snap: "fldqTH5ObhUM1Hbei", person: "fldtinVuZGVJRmSPB", phone: "fld1Wn6pq9yiqEvFy" } as const;

/** 호게나르드 DM: 국명·규격·총원가(₩). 원가가 표에 있는 유일한 라인업이다(2026-11-06 기준). */
const DM = "tblVVRTKfyViCI1aW";
const D = { name: "fld3XAFUiRqL9I5xM", spec: "fldqwhjXWl1NWgrwV", cost: "fldh2LU8RdOMgPh8E" } as const;

/** `[영업] 입금` — 판매 한 건(견적 묶음)에 오간 돈. 한 줄 = 입금·환불·조정 한 번. */
const PAYMENTS = "tblrJcYBUlxlUbnvI";
const PM = {
  title: "fldNI8e2qYgNxGn78", base: "fldUDHsgHD4ojnAbn", kind: "fldLUZCS4LP7OddOF", amount: "fld7h6rIhDT5avUe5", date: "fldN7UMLwtnky01fY",
  method: "fldg357S3brfECPBk", company: "fldOpb7Nb49NGesO0", memo: "fldeDyj5XVfFea4fw", who: "fldR0wcFj7hRSKwo8", at: "fldpizIQmbgCxWeEq",
  canceled: "fld6bZccxVyYoCEUo",
} as const;

type Row = Record<string, unknown>;
const text = (v: unknown) => (typeof v === "string" ? v.trim() : v && typeof v === "object" && "name" in v ? String((v as { name: unknown }).name).trim() : "");
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);

function toSale(id: string, f: Row): Sale {
  return {
    id, number: text(f[Q.number]), issued: text(f[Q.issued]), ordered: text(f[Q.ordered]), company: text(f[Q.company]),
    status: text(f[Q.status]), dealType: text(f[Q.deal]), total: num(f[Q.total]), supply: num(f[Q.supply]),
    paid: num(f[Q.paid]), paidOn: text(f[Q.paidOn]), payState: text(f[Q.payState]),
    lines: parseLines(f[Q.items]), costs: parseCosts(f[Q.costs]), adjusted: 0, ledger: false, entries: [],
    sheetAt: text(f[Q.sheetAt]), shippedAt: text(f[Q.shippedAt]),
  };
}

function toPayment(id: string, f: Row): Payment | null {
  const kind = text(f[PM.kind]) as PayKind;
  if (!(PAY_KINDS as readonly string[]).includes(kind)) return null;
  return {
    id, base: text(f[PM.base]), kind, amount: num(f[PM.amount]), date: text(f[PM.date]), method: text(f[PM.method]),
    company: text(f[PM.company]), memo: text(f[PM.memo]), who: text(f[PM.who]), at: text(f[PM.at]), canceled: f[PM.canceled] === true,
  };
}

async function readPayments(fresh = false): Promise<Payment[]> {
  const q = { fields: Object.values(PM), byId: true };
  const rows = fresh ? await selectRecordsFresh<Row>(PAYMENTS, q) : await selectRecords<Row>(PAYMENTS, { ...q, revalidate: 60 });
  return rows.flatMap((r) => toPayment(r.id, r.fields) ?? []);
}

/** 지우지 않은 견적 전부(최근 발행 순) + 장부. 테스트 거래는 뺀다. 성공만 60초 캐시. */
async function readQuotes(fresh = false): Promise<Sale[]> {
  const q = { fields: Object.values(Q).filter((f) => f !== Q.memo), filterByFormula: "NOT({삭제함})", sort: [{ field: Q.issued, direction: "desc" as const }], byId: true };
  const [rows, payments] = await Promise.all([
    fresh ? selectRecordsFresh<Row>(QUOTES, q) : selectRecords<Row>(QUOTES, { ...q, revalidate: 60 }),
    readPayments(fresh),
  ]);
  return rows.map((r) => withLedger(toSale(r.id, r.fields), payments)).filter((s) => s.dealType !== "테스트");
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
export async function getSalesOverview(): Promise<Result<{ sales: Sale[]; open: Sale[] }>> { // 미수금 화면도 쓴다(선금)
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

export type EntryInput = { kind: PayKind; amount: number; date: string; method: string; memo: string; over: boolean };

/** 묶음의 거울 칸(입금액·입금일·입금상태)을 장부에 맞춘다. 작업메모 맨 위에 한 줄(여럿이면 위에서부터). */
async function mirror(target: Sale, after: Sale, lines: string[], extra: Row = {}) {
  const rec = await getRecordFresh<Row>(QUOTES, target.id, true);
  const memo = [...lines].reverse().reduce((m, l) => prependMemo(m, l), text((rec?.fields as Row | undefined)?.[Q.memo]));
  await updateRecord<Row>(QUOTES, target.id, {
    [Q.paid]: after.paid, [Q.paidOn]: after.paidOn || null, [Q.payState]: payStateOf(after), [Q.memo]: memo, ...extra,
  });
}

/** 주문서 발행 칸: 발행 시각 + (보낸 견적이면) 수주확정·수주일. */
function sheetFields(target: Sale, now: Date): Row {
  const status = confirmedStatus(target.status);
  return {
    [Q.sheetAt]: now.toISOString(),
    ...(status ? { [Q.status]: status } : {}),
    ...(status && !target.ordered ? { [Q.ordered]: todayInSeoul(now) } : {}),
  };
}
const chainHasSheet = (quotes: Sale[], base: string) => quotes.some((q) => chainOf(q.number) === base && q.sheetAt);

const entryLine = (kind: PayKind, amount: number, date: string, method: string, memo: string) =>
  `${kind} ${won(amount)}${date ? ` (${date})` : ""}${method ? ` · ${method}` : ""}${memo ? ` · ${memo}` : ""}`;

/**
 * 장부 한 줄 기록: 입금(나눠 받기도 한 번에 한 줄) · 환불(차액 돌려주기) · 조정(끝전·에누리).
 * 캐시 없이 다시 읽어 묶음의 대상 견적(판매인 최신 수정본, 없으면 최신)을 찾고, 넘치는 금액은 거절한다(오타 방지).
 */
export async function recordEntry(id: string, input: EntryInput, who: string): Promise<Result<{ balance: number; overpaid: number; sheet: boolean }>> {
  try {
    const quotes = await readQuotes(true);
    const picked = quotes.find((x) => x.id === id);
    if (!picked) return fail("견적을 찾지 못했습니다(삭제했거나 테스트 거래). 새로고침해 주세요.");
    const base = chainOf(picked.number);
    const target = chainTarget(quotes, base)!;
    if (!canTakePayment(target.status)) return fail(`견적 ${target.number}이 ${target.status || "상태 없음"}입니다. 보낸 견적이나 판매 건에만 적습니다.`);
    const check = checkEntry(target, input.kind, input.amount, input.over);
    if (!check.ok) return fail(check.error);
    const now = new Date();
    await createRecord<Row>(PAYMENTS, {
      [PM.title]: `${base} · ${input.kind} · ${won(input.amount)}`, [PM.base]: base, [PM.kind]: input.kind, [PM.amount]: input.amount,
      [PM.date]: input.date || null, [PM.method]: input.method || null, [PM.company]: target.company || null, [PM.memo]: input.memo || null,
      [PM.who]: who, [PM.at]: now.toISOString(),
    });
    const after = withLedger(target, await readPayments(true));
    const lines = [memoLine(now, who, input.kind, `${entryLine(input.kind, input.amount, input.date, input.method, input.memo)} · 받은 돈 ${won(after.paid)} / ${won(after.total)}`)];
    // 다 받았으면 확정: 보낸 견적은 수주확정으로, 가격 없는 주문서(물류용)를 발행한다(묶음에 한 번).
    const issue = shouldIssueSheet(after, chainHasSheet(quotes, base));
    const extra = issue ? sheetFields(target, now) : {};
    if (issue) lines.push(memoLine(now, who, "주문서 발행", `완납${extra[Q.status] ? ` → ${target.status} → 수주확정` : ""} · 매출 > 주문서`));
    await mirror(target, after, lines, extra);
    return ok({ balance: check.balance, overpaid: check.overpaid, sheet: issue });
  } catch (e) {
    return fail(message(e, "장부에 적지 못했다"));
  }
}

/** 잘못 적은 줄 되돌리기: 지우지 않고 '취소'에 체크한다(기록은 남는다). 거울 칸도 다시 맞춘다. */
export async function cancelEntry(paymentId: string, who: string): Promise<Result<null>> {
  try {
    const rec = await getRecordFresh<Row>(PAYMENTS, paymentId, true);
    const p = rec ? toPayment(rec.id, rec.fields as Row) : null;
    if (!p) return fail("장부 줄을 찾지 못했습니다. 새로고침해 주세요.");
    if (p.canceled) return fail("이미 취소한 줄입니다.");
    const now = new Date();
    await updateRecord<Row>(PAYMENTS, paymentId, {
      [PM.canceled]: true, [PM.memo]: [p.memo, `취소 ${memoLine(now, who, "취소", "잘못 적은 줄")}`].filter(Boolean).join("\n"),
    });
    const quotes = await readQuotes(true);
    const target = chainTarget(quotes, p.base);
    if (target) await mirror(target, target, [memoLine(now, who, "장부 취소", `${entryLine(p.kind, p.amount, p.date, p.method, "")} 취소 · 받은 돈 ${won(target.paid)} / ${won(target.total)}`)]);
    return ok(null);
  } catch (e) {
    return fail(message(e, "취소하지 못했다"));
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

// ── 주문서(가격 없음, 물류용) ─────────────────────────────

/** 주문서에 실을 견적 칸(스냅샷·담당자·연락처). 40장씩 나눠 읽는다(주소 길이). 성공만 60초 캐시. */
async function readDetails(ids: string[]): Promise<Map<string, SheetDetail>> {
  const out = new Map<string, SheetDetail>();
  for (let i = 0; i < ids.length; i += 40) {
    const chunk = ids.slice(i, i + 40);
    const rows = await selectRecords<Row>(QUOTES, {
      fields: Object.values(QD), filterByFormula: `OR(${chunk.map((id) => `RECORD_ID()='${id}'`).join(",")})`, revalidate: 60, byId: true,
    });
    for (const r of rows) out.set(r.id, { snap: r.fields[QD.snap], person: text(r.fields[QD.person]), phone: text(r.fields[QD.phone]) });
  }
  return out;
}

const NO_DETAIL: SheetDetail = { snap: "", person: "", phone: "" };
const SHIPPED_SHOWN = 30;

/** 주문서 화면: 출고 전 주문서 전부 + 최근 출고 30장 + 주문서를 기다리는 판매. */
export async function getOrderSheets(): Promise<Result<{ sheets: OrderSheet[]; waiting: Sale[]; shippedMore: number }>> {
  try {
    const { issued, waiting } = sheetChains(await readQuotes());
    const open = issued.filter((c) => !c.shippedAt);
    const shipped = issued.filter((c) => c.shippedAt).sort((a, b) => b.shippedAt.localeCompare(a.shippedAt));
    const shown = [...open, ...shipped.slice(0, SHIPPED_SHOWN)];
    const details = await readDetails(shown.map((c) => c.target.id));
    const sheets = shown.map((c) => toOrderSheet(c.target, c.sheetAt, c.shippedAt, details.get(c.target.id) ?? NO_DETAIL));
    return ok({ sheets, waiting, shippedMore: Math.max(0, shipped.length - SHIPPED_SHOWN) });
  } catch (e) {
    return fail(message(e, "주문서를 불러오지 못했다"));
  }
}

/** 주문서 한 장(인쇄). base = 견적 묶음 번호. 없으면 null. */
export async function getOrderSheet(base: string): Promise<Result<OrderSheet | null>> {
  try {
    const chain = sheetChains((await readQuotes()).filter((q) => chainOf(q.number) === base)).issued[0];
    if (!chain) return ok(null);
    const d = (await readDetails([chain.target.id])).get(chain.target.id) ?? NO_DETAIL;
    return ok(toOrderSheet(chain.target, chain.sheetAt, chain.shippedAt, d));
  } catch (e) {
    return fail(message(e, "주문서를 불러오지 못했다"));
  }
}

/** 손으로 발행: 후불(관급 등)처럼 다 받기 전에 물건을 보내야 하는 판매. 판매 상태(수주확정·입고대기·출고대기)만. */
export async function issueSheet(id: string, who: string): Promise<Result<{ base: string }>> {
  try {
    const quotes = await readQuotes(true);
    const picked = quotes.find((q) => q.id === id);
    if (!picked) return fail("견적을 찾지 못했습니다. 새로고침해 주세요.");
    const base = chainOf(picked.number);
    const target = chainTarget(quotes, base)!;
    if (chainHasSheet(quotes, base)) return fail("이미 주문서를 발행한 판매입니다.");
    if (!isSheetWaiting(target.status)) return fail(`견적 ${target.number}이 ${target.status || "상태 없음"}입니다. 수주확정·입고대기·출고대기에서만 발행합니다.`);
    const now = new Date();
    const rec = await getRecordFresh<Row>(QUOTES, target.id, true);
    await updateRecord<Row>(QUOTES, target.id, {
      ...sheetFields(target, now),
      [Q.memo]: prependMemo(text((rec?.fields as Row | undefined)?.[Q.memo]), memoLine(now, who, "주문서 발행", `손으로 발행 · 받은 돈 ${won(target.paid)} / ${won(target.total)}`)),
    });
    return ok({ base });
  } catch (e) {
    return fail(message(e, "주문서를 발행하지 못했다"));
  }
}

/** 출고 완료: 묶음의 따라가는 견적에 출고일시 + 상태 출하완료(판매 상태였으면). 되돌리기는 [출고 취소]. */
export async function shipSheet(id: string, who: string, undo = false): Promise<Result<null>> {
  try {
    const quotes = await readQuotes(true);
    const picked = quotes.find((q) => q.id === id);
    if (!picked) return fail("견적을 찾지 못했습니다. 새로고침해 주세요.");
    const base = chainOf(picked.number);
    const chain = sheetChains(quotes.filter((q) => chainOf(q.number) === base)).issued[0];
    if (!chain) return fail("주문서를 발행하지 않은 판매입니다.");
    if (!undo && chain.shippedAt) return fail("이미 출고한 주문서입니다.");
    if (undo && !chain.shippedAt) return fail("출고 기록이 없습니다.");
    const now = new Date();
    const target = chain.target;
    const rec = await getRecordFresh<Row>(QUOTES, target.id, true);
    const memo = text((rec?.fields as Row | undefined)?.[Q.memo]);
    const status: Row = undo
      ? (target.status === "출하완료" ? { [Q.status]: "출고대기" } : {})
      : (isSheetWaiting(target.status) ? { [Q.status]: "출하완료" } : {});
    // 출고 시각은 묶음 안 어느 수정본에 있어도 묶음 것으로 보므로, 취소할 때는 묶음 전체에서 지운다.
    const holders = undo ? quotes.filter((q) => chainOf(q.number) === base && q.shippedAt && q.id !== target.id) : [];
    for (const q of holders) await updateRecord<Row>(QUOTES, q.id, { [Q.shippedAt]: null });
    await updateRecord<Row>(QUOTES, target.id, {
      [Q.shippedAt]: undo ? null : now.toISOString(), ...status,
      [Q.memo]: prependMemo(memo, memoLine(now, who, undo ? "출고 취소" : "출고 완료", `주문서 ${base}${status[Q.status] ? ` · 상태 ${target.status} → ${status[Q.status]}` : ""}`)),
    });
    return ok(null);
  } catch (e) {
    return fail(message(e, "출고를 적지 못했다"));
  }
}

export const quoteAirtableUrl = (id: string) => `https://airtable.com/appzLstFHtHcQlWSu/${QUOTES}/${id}`;
