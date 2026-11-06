import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyPayment, balanceOf, costLines, costsPayload, groupReceivables, learnedCosts, marginOf, matchKey, memoLine,
  parseLines, prependMemo, sameCompany,
} from '../src/lib/sales.ts';

const sale = (over = {}) => ({
  id: 'recAAAAAAAAAAAAAA', number: 'OG-1', issued: '2026-10-01', ordered: '', company: 'A농원', status: '완료',
  dealType: '일반', total: 100000, supply: 100000, paid: 0, paidOn: '', payState: '', lines: [], costs: {}, ...over,
});

test('옛 완납 표시만 있는 건은 다 받은 것으로 본다', () => {
  assert.equal(balanceOf(sale({ payState: '완납' })), 0);
  assert.equal(balanceOf(sale({ payState: '선금' })), 100000);
  assert.equal(balanceOf(sale({ paid: 30000, payState: '선금' })), 70000);
});

test('입금: 일부면 선금, 다 받으면 완납, 잔액 초과는 거절', () => {
  assert.deepEqual(applyPayment(sale(), 40000), { ok: true, paid: 40000, payState: '선금' });
  assert.deepEqual(applyPayment(sale({ paid: 40000 }), 60000), { ok: true, paid: 100000, payState: '완납' });
  assert.equal(applyPayment(sale(), 1000000).ok, false);
  assert.equal(applyPayment(sale(), 0).ok, false);
  assert.equal(applyPayment(sale({ payState: '완납' }), 1).ok, false);
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
