import test from 'node:test';
import assert from 'node:assert/strict';
import {
  balanceOf, checkEntry, costLines, costsPayload, groupReceivables, learnedCosts, marginOf, matchKey, memoLine,
  parseLines, prependMemo, sameCompany,
} from '../src/lib/sales.ts';

const sale = (over = {}) => ({
  id: 'recAAAAAAAAAAAAAA', number: 'OG-1', issued: '2026-10-01', ordered: '', company: 'A농원', status: '완료',
  dealType: '일반', total: 100000, supply: 100000, paid: 0, paidOn: '', payState: '', lines: [], costs: {},
  adjusted: 0, ledger: false, entries: [], ...over,
});

test('옛 완납 표시만 있는 건은 다 받은 것으로 본다', () => {
  assert.equal(balanceOf(sale({ payState: '완납' })), 0);
  assert.equal(balanceOf(sale({ payState: '선금' })), 100000);
  assert.equal(balanceOf(sale({ paid: 30000, payState: '선금' })), 70000);
});

test('장부 한 줄: 넘치는 금액은 거절, 실제로 더 받았으면 체크로 통과', () => {
  assert.deepEqual(checkEntry(sale(), '입금', 40000), { ok: true, paid: 40000, adjusted: 0, balance: 60000, overpaid: 0 });
  assert.equal(checkEntry(sale(), '입금', 1000000).ok, false);
  assert.equal(checkEntry(sale(), '입금', 110000, true).overpaid, 10000);
  assert.equal(checkEntry(sale(), '입금', 0).ok, false);
  assert.equal(checkEntry(sale({ payState: '완납' }), '입금', 1).ok, false);
  assert.equal(checkEntry(sale(), '환불', 1).ok, false); // 받은 돈이 없다
  assert.equal(checkEntry(sale({ ledger: true, paid: 90000 }), '조정', 10001).ok, false);
  assert.deepEqual(checkEntry(sale({ ledger: true, paid: 99000 }), '조정', 1000), { ok: true, paid: 99000, adjusted: 1000, balance: 0, overpaid: 0 });
});

test('나눠 받고, 수정본으로 금액이 줄면 돌려줄 돈, 환불하면 0 (장부는 묶음을 따라간다)', async () => {
  const { withLedger, ledgerSum, overpaidOf, payStateOf, chainTarget } = await import('../src/lib/sales.ts');
  const pay = (over) => ({ id: 'p', base: 'OG-1-001', kind: '입금', amount: 0, date: '', method: '', company: '', memo: '', who: '이시형', at: '', canceled: false, ...over });
  const book = [
    pay({ id: 'a', amount: 3000000, date: '2026-11-01' }),
    pay({ id: 'b', amount: 272500, date: '2026-11-07' }),
    pay({ id: 'c', amount: 999999, date: '2026-11-07', canceled: true }), // 잘못 적어 취소한 줄
    pay({ id: 'd', base: 'OG-2-001', amount: 50 }),
  ];
  assert.deepEqual(ledgerSum(book.filter((p) => p.base === 'OG-1-001')), { received: 3272500, refunded: 0, adjusted: 0, net: 3272500, lastDate: '2026-11-07' });
  // 수정본 R3로 합계가 3,272,500 → 3,000,000으로 줄었다
  const r3 = withLedger(sale({ number: 'OG-1-001-R3', total: 3000000 }), book);
  assert.equal(r3.entries.length, 3);
  assert.equal(balanceOf(r3), 0);
  assert.equal(overpaidOf(r3), 272500);
  assert.equal(payStateOf(r3), '완납');
  assert.equal(checkEntry(r3, '환불', 300000).ok, false); // 돌려줄 돈보다 큼
  const back = withLedger(r3, [...book, pay({ id: 'e', kind: '환불', amount: 272500, date: '2026-11-08' })]);
  assert.equal(overpaidOf(back), 0);
  assert.equal(back.paid, 3000000);
  // 장부가 있으면 옛 '완납' 칸은 보지 않는다
  assert.equal(balanceOf(withLedger(sale({ number: 'OG-2-001', payState: '완납' }), book)), 100000 - 50);
  assert.equal(payStateOf(sale()), '미입금');
  // 돈을 붙일 견적: 판매인 최신 수정본, 없으면 최신
  const qs = [{ number: 'OG-1-001', status: '수주확정' }, { number: 'OG-1-001-R2', status: '발송' }, { number: 'OG-3-001', status: '발송' }, { number: 'OG-3-001-R2', status: '수락' }];
  assert.equal(chainTarget(qs, 'OG-1-001').number, 'OG-1-001');
  assert.equal(chainTarget(qs, 'OG-3-001').number, 'OG-3-001-R2');
  assert.equal(chainTarget(qs, 'OG-9-001'), null);
});

test('미수금은 거래처별로 묶고 잔액 큰 곳이 위', () => {
  const groups = groupReceivables([
    sale({ id: 'r1', company: 'A농원', total: 50000, ordered: '2026-10-01' }),
    sale({ id: 'r2', company: 'B가든', total: 200000, issued: '2026-10-20' }),
    sale({ id: 'r3', company: 'A농원', total: 70000, paid: 70000 }),
  ], '2026-11-06');
  assert.deepEqual(groups.map((g) => [g.company, g.balance]), [['B가든', 200000], ['A농원', 50000]]);
  assert.equal(groups[1].oldest, 36);
});

test('작업메모 줄은 견적서 도구와 같은 모양으로 맨 위에', () => {
  const line = memoLine(new Date('2026-11-06T03:05:00Z'), '이시형', '입금', '₩10,000');
  assert.equal(line, '2026-11-06 12:05 · 이시형 · 입금 · ₩10,000');
  assert.equal(prependMemo('옛 줄', line), `${line}\n옛 줄`);
  assert.equal(prependMemo('', line), line);
});

test('품목JSON 줄 읽기: 깨진 줄은 버린다', () => {
  const raw = JSON.stringify({ items: [{ name: "호스타'와이드 브림'", spec: '128구', qty: 10, price: 900 }, { name: '', qty: 1, price: 1 }, { name: 'x', qty: 'a', price: 1 }] });
  assert.deepEqual(parseLines(raw), [{ name: "호스타'와이드 브림'", spec: '128구', qty: 10, price: 900 }]);
  assert.deepEqual(parseLines('not json'), []);
});

test('원가: 직접 → 총원가 → 다른 건 순서, 모르면 null', () => {
  const lines = [
    { name: "은청가문비 'Oldenburg'", spec: 'P14 H (접목묘)', qty: 2, price: 16900 },
    { name: '무늬쥐똥나무', spec: '5치', qty: 10, price: 3000 },
    { name: '모르는 품목', spec: '', qty: 1, price: 5000 },
    { name: 'CC 트롤리 (대여)', spec: '', qty: 20, price: 0 },
  ];
  const catalog = new Map([[matchKey('은청가문비 Oldenburg', 'P14 H (접목묘)'), 11241]]);
  const learned = learnedCosts([sale({ costs: { '무늬쥐똥나무|5치': 1500 } })]);
  const costed = costLines({ lines, costs: {} }, catalog, learned);
  assert.deepEqual(costed.map((l) => [l.unitCost, l.source]), [[11241, '총원가'], [1500, '다른 건'], [null, null], [0, '직접']]);
  const m = marginOf({ supply: 0 }, costed);
  assert.equal(m.missing, 1);
  assert.equal(m.rate, null);
  const own = costLines({ lines, costs: { '모르는 품목|': 2000, "은청가문비 'Oldenburg'|P14 H (접목묘)": 10000 } }, catalog, learned);
  const m2 = marginOf({ supply: 68800 }, own);
  assert.equal(m2.cost, 20000 + 15000 + 2000);
  assert.equal(m2.margin, 68800 - 37000);
});

test('원가 저장값: 이 건의 품목만, 빈 칸은 빼고, 숫자가 아니면 거절', () => {
  const lines = [{ name: 'a', spec: '1', qty: 1, price: 1 }];
  assert.deepEqual(costsPayload(lines, { 'a|1': '1,200', 'zz|9': '5' }), { v: 1, lines: { 'a|1': 1200 } });
  assert.deepEqual(costsPayload(lines, { 'a|1': '' }), { v: 1, lines: {} });
  assert.ok('error' in costsPayload(lines, { 'a|1': 'abc' }));
});

test('거래처 이름 비교는 (주)·띄어쓰기를 무시한다', () => {
  assert.ok(sameCompany('한연종합개발(주)', '한연종합개발'));
  assert.ok(sameCompany('유니크 가든', '유니크가든'));
  assert.ok(!sameCompany('', ''));
});

test('월별 매출: 수주일(없으면 발행일) 기준, 관계사·미수 따로', async () => {
  const { monthlySummary } = await import('../src/lib/sales.ts');
  const rows = monthlySummary([
    sale({ id: 'a', issued: '2026-09-03', total: 7200000, supply: 7200000 }),
    sale({ id: 'b', issued: '2026-08-28', ordered: '2026-09-02', total: 4500000, supply: 4500000, dealType: '관계사', paid: 4500000 }),
    sale({ id: 'c', issued: '2026-07-24', total: 74000, supply: 74000, payState: '완납' }),
    sale({ id: 'd', issued: '2026-10-01', total: 1100000, supply: 1000000 }),
  ]);
  assert.deepEqual(rows.map((r) => r.month), ['2026-10', '2026-09', '2026-07']);
  assert.deepEqual(rows[1], { month: '2026-09', count: 2, supply: 11700000, vat: 0, total: 11700000, related: 4500000, paid: 4500000, due: 7200000 });
  assert.equal(rows[0].vat, 100000);
  assert.equal(rows[2].due, 0);
});

test('판매는 묶음당 한 건, 판매로 안 잡힌 견적은 최신 수정본만', async () => {
  const { oneSalePerChain, openQuotes } = await import('../src/lib/sales.ts');
  const q = (number, status, issued = '2026-10-01') => sale({ id: number, number, status, issued });
  const all = [
    q('OG-1-001', '수주확정'), q('OG-1-001-R2', '출하완료'),          // 수정본마다 판매 → 한 건(R2)
    q('OG-2-001', '발송'), q('OG-2-001-R4', '발송', '2026-10-09'),     // 안 바뀐 판매 후보 → R4
    q('OG-3-001', '발송'), q('OG-3-001-R2', '출하완료'),              // 묶음에 판매가 있으면 빠짐
    q('OG-4-001', '작성'), q('OG-5-001', '거절'), q('OG-6-001', '수락', '2026-10-20'),
  ];
  assert.deepEqual(oneSalePerChain(all).map((s) => s.number).sort(), ['OG-1-001-R2', 'OG-3-001-R2']);
  assert.deepEqual(openQuotes(all).map((s) => s.number), ['OG-6-001', 'OG-2-001-R4']);
});

// ── 주문서(가격 없음, 물류용) ──
import {
  confirmedStatus, deliveryOf, parseSnap, pickList, sheetChains, sheetNotes, sheetPages, shouldIssueSheet, toOrderSheet,
} from '../src/lib/sales.ts';

test('주문서는 다 받았을 때 묶음에 한 번만 낸다', () => {
  assert.equal(shouldIssueSheet(sale({ ledger: true, paid: 100000 }), false), true);
  assert.equal(shouldIssueSheet(sale({ ledger: true, paid: 100000 }), true), false); // 이미 냄
  assert.equal(shouldIssueSheet(sale({ ledger: true, paid: 60000 }), false), false); // 덜 받음
  assert.equal(shouldIssueSheet(sale({ ledger: true, paid: 99000, adjusted: 1000 }), false), true); // 끝전 조정
  assert.equal(shouldIssueSheet(sale({ ledger: true, paid: 0, total: 0 }), false), false);
  assert.equal(confirmedStatus('수락'), '수주확정');
  assert.equal(confirmedStatus('발송'), '수주확정');
  assert.equal(confirmedStatus('입고대기'), null);
});

test('주문서에는 돈 얘기를 싣지 않고 배송지는 따로 뽑는다', () => {
  const snap = parseSnap(JSON.stringify({
    client: { company: '금성농원', name: '김희준', phone: '010-0000-0000', address: '본사 주소' },
    remarks: '[주문요청 Q-20261102-U13] 항공 즉시수배 구근\n요청하신 규격은 상위 규격으로 공급하며, 추가 비용은 없습니다.\n운임: 착불 (수령 시 운송업체에 직접 정산)\n배송지: 전남 나주시 어딘가 1\n단가 1,000원 기준',
    unit: '구',
  }));
  assert.equal(deliveryOf(snap), '전남 나주시 어딘가 1');
  assert.deepEqual(sheetNotes(snap), ['[주문요청 Q-20261102-U13] 항공 즉시수배 구근', '운임: 착불 (수령 시 운송업체에 직접 정산)']);
  assert.equal(deliveryOf(parseSnap(JSON.stringify({ orderDeliveryPlace: '현장', remarks: '배송지: 다른 곳' }))), '현장');
  assert.equal(deliveryOf(parseSnap(JSON.stringify({ client: { address: '주소만' } }))), '주소만');
  assert.deepEqual(parseSnap('{깨짐'), {});

  const s = toOrderSheet(sale({ number: 'OG-20261103-001-R3', lines: [{ name: '수선화', spec: '16/18', qty: 250, price: 1000 }] }), '2026-11-13T05:00:00.000Z', '', { snap: JSON.stringify(snap), person: '', phone: '' });
  assert.equal(s.base, 'OG-20261103-001');
  assert.equal(s.person, '김희준');
  assert.equal(s.unit, '구');
  assert.deepEqual(s.lines, [{ name: '수선화', spec: '16/18', qty: 250 }]);
  assert.equal(JSON.stringify(s.lines).includes('price'), false);
});

test('주문서 현황: 발행 시각은 묶음 것, 품목은 최신 판매 수정본을 따른다', () => {
  const quotes = [
    sale({ id: 'recA', number: 'OG-1', status: '수정됨', sheetAt: '2026-11-10T00:00:00Z' }),
    sale({ id: 'recB', number: 'OG-1-R2', status: '수주확정' }),
    sale({ id: 'recC', number: 'OG-2', status: '수주확정' }),
    sale({ id: 'recD', number: 'OG-3', status: '완료' }),
    sale({ id: 'recE', number: 'OG-4', status: '발송' }),
  ];
  const { issued, waiting } = sheetChains(quotes);
  assert.deepEqual(issued.map((c) => [c.base, c.target.id, c.sheetAt]), [['OG-1', 'recB', '2026-11-10T00:00:00Z']]);
  assert.deepEqual(waiting.map((w) => w.id), ['recC']); // 완료·발송은 기다리지 않는다
});

test('품목별 합계는 출고 전 주문서만, 이름·규격이 같으면 더한다', () => {
  const sh = (base, company, lines, shippedAt = '') => ({ id: base, base, number: base, company, person: '', phone: '', address: '', unit: '주', lines, notes: [], sheetAt: 'x', shippedAt, status: '수주확정', balance: 0 });
  const rows = pickList([
    sh('OG-1', 'A', [{ name: '목수국 라임라이트', spec: 'P9', qty: 100 }]),
    sh('OG-2', 'B', [{ name: '목수국  라임라이트', spec: 'P9', qty: 50 }, { name: '병꽃나무', spec: 'P9', qty: 10 }]),
    sh('OG-3', 'C', [{ name: '병꽃나무', spec: 'P9', qty: 999 }], '2026-11-12T00:00:00Z'),
  ]);
  assert.deepEqual(rows.map((r) => [r.name, r.qty, r.orders.length]), [['목수국 라임라이트', 150, 2], ['병꽃나무', 10, 1]]);
  assert.equal(sheetPages([], 20).length, 1);
  assert.deepEqual(sheetPages([1, 2, 3, 4, 5], 2).map((p) => p.length), [2, 2, 1]);
});
