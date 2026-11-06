import test from 'node:test';
import assert from 'node:assert/strict';
import {
  deductions, isFromLink, latestRevision, mergeLines, nextQuoteNo, orderedLines, refreshStock, stripCrate,
} from '../src/lib/order-program.ts';
import { programPayloads, readProgramInput } from '../src/lib/order.ts';

const line = (over = {}) => ({ group: 'hoogenraad', id: 'rec01OSuUN7vaqWg2', kname: "매자나무 '로즈글로우'", sname: '', cat: '매자나무', photo: true, size: 'P9', price: 3900, stock: 1200, qty: 10, ...over });

test('주문서 저장값: 링크용 품목JSON과 다시 고칠 선택 상태를 함께 만든다', () => {
  const input = readProgramInput({ supplier: 'hoogenraad', name: '라이너', basis: 'pre', prefill: false, lines: [line(), line({ size: 'P12', price: 5200, qty: 0 })] }).value;
  const { items, selection } = programPayloads(input);
  assert.equal(items.items.length, 1);
  assert.deepEqual(items.items[0].rows, [['P9', 1200, 3900, 0], ['P12', 1200, 5200, 0]]);
  assert.deepEqual(selection, { v: 1, supplier: 'hoogenraad', basis: 'pre', prefill: false, qty: { 'hoogenraad:rec01OSuUN7vaqWg2|P9': 10, 'hoogenraad:rec01OSuUN7vaqWg2|P12': 1 }, pack: {} });
});

test('재고만 바꾸고 크레이트·가격 같은 다른 칸은 그대로', () => {
  const p = { v: 1, groups: [['구근', 'Bulbs']], items: [
    { k: 'i0', group: 'preorder', rec: 'recAAAAAAAAAAAAAA', grp: '튤립', name: '튤립 A', rows: [['12/+', 500, 400, 0, 250]], feat: ['x'] },
    { k: 'i1', group: 'preorder', rec: 'recBBBBBBBBBBBBBB', grp: '튤립', name: '튤립 B', rows: [['12/+', 9, 400, 0]] },
  ] };
  const out = refreshStock(p, new Map([['preorder:recAAAAAAAAAAAAAA', 120]]));
  assert.deepEqual(out.items[0].rows, [['12/+', 120, 400, 0, 250]]);
  assert.deepEqual(out.items[0].feat, ['x']);
  assert.deepEqual(out.items[1].rows, [['12/+', 9, 400, 0]]);
  assert.deepEqual(out.groups, [['구근', 'Bulbs']]);
});

test('링크 주문 읽기: @₩ 단가, 크레이트 표기는 떼고 수량은 낱개', () => {
  const raw = JSON.stringify([
    { sku: 'abc:i0|P9', kname: "매자나무 매자나무 '로즈글로우' @₩3,900 = ₩39,000", size: 'P9', qty: 10 },
    { sku: 'abc:i1|12/+', kname: '튤립 튤립 A 2크레이트×250구 @₩400 = ₩200,000', size: '12/+', qty: 500 },
    { sku: 'abc:i2|x', kname: '단가 없음', size: 'x', qty: 1 },
  ]);
  assert.deepEqual(orderedLines(raw), [
    { name: "매자나무 매자나무 '로즈글로우'", spec: 'P9', qty: 10, price: 3900 },
    { name: '튤립 튤립 A', spec: '12/+', qty: 500, price: 400 },
  ]);
  assert.equal(stripCrate('튤립 A 3크레이트×1,000구'), '튤립 A');
  assert.ok(isFromLink('[주문 링크 abc] 제목 (2026. 11. 6.)\n합계', 'abc'));
  assert.ok(!isFromLink('[주문 링크 abcd] 제목', 'abc'));
});

test('주문 합치기: 이름·규격·단가가 같으면 수량을 더한다', () => {
  const a = [{ name: 'A', spec: 'P9', qty: 10, price: 100 }, { name: 'B', spec: 'P9', qty: 5, price: 200 }];
  const b = [{ name: 'A', spec: 'P9', qty: 30, price: 100 }, { name: 'A', spec: 'P9', qty: 1, price: 90 }];
  assert.deepEqual(mergeLines([a, b]), [
    { name: 'A', spec: 'P9', qty: 40, price: 100 }, { name: 'B', spec: 'P9', qty: 5, price: 200 }, { name: 'A', spec: 'P9', qty: 1, price: 90 },
  ]);
});

test('재고 차감 대상: 견적 품목명(분류 이름) → 라인업 레코드, 같은 레코드는 합친다', () => {
  const p = { v: 1, items: [
    { k: 'i0', group: 'hoogenraad', rec: 'recAAAAAAAAAAAAAA', grp: '매자나무', name: "매자나무 '로즈글로우'", rows: [['P9', 100, 3900, 0]] },
    { k: 'i1', group: 'immediate', rec: 'recBBBBBBBBBBBBBB', grp: '목수국', name: "목수국 '라임라이트'", rows: [['9치', 50, 15000, 0], ['7치', 50, 9000, 0]] },
  ] };
  const { list, unmatched } = deductions([
    { name: "매자나무 매자나무 '로즈글로우'", spec: 'P9', qty: 10, price: 3900 },
    { name: "목수국 '라임라이트'", spec: '9치', qty: 3, price: 15000 },
    { name: "목수국 '라임라이트'", spec: '7치', qty: 2, price: 9000 },
    { name: '모르는 품목', spec: 'P9', qty: 1, price: 1 },
  ], p);
  assert.deepEqual(list.map((d) => [d.group, d.rec, d.qty]), [['hoogenraad', 'recAAAAAAAAAAAAAA', 10], ['immediate', 'recBBBBBBBBBBBBBB', 5]]);
  assert.deepEqual(unmatched.map((l) => l.name), ['모르는 품목']);
});

test('견적번호: 오늘 가장 큰 번호 + 1, 수정본은 최신 번호를 따라간다', () => {
  assert.equal(nextQuoteNo(['OG-20261106-001', 'OG-20261106-004-R2', 'OG-20261105-009', 'OG-20260903-5716'], '20261106'), 'OG-20261106-005');
  assert.equal(nextQuoteNo([], '20261106'), 'OG-20261106-001');
  const rows = [{ number: 'OG-1-001' }, { number: 'OG-1-001-R3' }, { number: 'OG-1-001-R2' }, { number: 'OG-1-0011' }];
  assert.equal(latestRevision(rows, 'OG-1-001').number, 'OG-1-001-R3');
  assert.equal(latestRevision(rows, 'OG-9'), null);
});

test('공동수입 링크(src)는 items 없이도 읽고, ERP가 품목을 쓰지 않는다', async () => {
  const { parsePayload, isManagedPayload, isPickerPayload, refreshStock } = await import('../src/lib/order-program.ts');
  const p = parsePayload(JSON.stringify({ v: 1, src: 'hg-pool', minEach: 200 }));
  assert.deepEqual(p.items, []);
  assert.equal(p.minEach, 200);
  assert.equal(isManagedPayload(p), false);
  assert.equal(isPickerPayload(p), false);
  assert.equal(refreshStock(p, new Map()).src, 'hg-pool');
  assert.equal(parsePayload(JSON.stringify({ v: 1 })), null);
});

test('수정본 번호와 합계', async () => {
  const { nextRevisionNo, quoteTotals } = await import('../src/lib/order-program.ts');
  assert.deepEqual(nextRevisionNo(['OG-1-001', 'OG-1-001-R2', 'OG-1-001-R5', 'OG-1-0011-R9'], 'OG-1-001'), { number: 'OG-1-001-R6', revision: 6 });
  assert.deepEqual(nextRevisionNo(['OG-1-001'], 'OG-1-001'), { number: 'OG-1-001-R2', revision: 2 });
  assert.deepEqual(quoteTotals([{ name: 'a', spec: '', qty: 10, price: 1000 }], '과세'), { count: 1, qty: 10, supply: 10000, vat: 1000, total: 11000 });
  assert.equal(quoteTotals([{ name: 'a', spec: '', qty: 10, price: 1000 }], '면세').vat, 0);
});

test('주문한 곳 찾기: 링크·제안서 출처, 상호/성함, 같은 회사 = 같은 번호', async () => {
  const m = await import('../src/lib/order-program.ts');
  assert.deepEqual(m.orderSource('[주문 링크 5Sy9Fi1DhdMwpNbh7MGQ3Q] 항공 (2026. 11. 2)\n합계'), { kind: 'link', id: '5Sy9Fi1DhdMwpNbh7MGQ3Q' });
  assert.deepEqual(m.orderSource('[제안서 air-20261028-aff57e25] 항공 · 유니크가든 전용'), { kind: 'proposal', id: 'air-20261028-aff57e25' });
  assert.equal(m.orderSource('[ERP 직접 접수 · 이시형]'), null);
  assert.deepEqual(m.splitRequester('금성농원/김희준'), { company: '금성농원', person: '김희준' });
  assert.deepEqual(m.splitRequester('유니크가든'), { company: '유니크가든', person: '' });
  assert.equal(m.customerKey('010-7405-2007', 'a'), m.customerKey('+82 10 7405 2007', 'b'));
  assert.equal(m.exclusiveFor('[제안서 x] 항공 (2026. 10. 28) · 유니크가든 전용\n합계'), '유니크가든');
  assert.equal(m.quoteBase('OG-20261029-001-R5'), 'OG-20261029-001');
  const p = { v: 1, items: [{ k: 'st', grp: '알리움', name: '스티피타툼', img: '/p/air-20261028-aff57e25/img/st.jpg', rows: [['14/+', 400, 400, 0]] }, { k: 'x', grp: 'a', name: 'b', rows: [] }] };
  assert.deepEqual(m.proposalIds(p), ['air-20261028-aff57e25']);
});

test('배정 현황: 견적 줄을 주문서 줄에 맞추고 "9,360+"는 이상으로', async () => {
  const m = await import('../src/lib/order-program.ts');
  const p = { v: 1, items: [
    { k: 'dm', grp: '수선화', name: '더치마스터', rows: [['16/18', '9,360+', 1000, 0, 160]] },
    { k: 'bb', grp: '무스카리', name: '베이비 브레스', rows: [['7/8 잔량', 500, 200, 0, 500]] },
    { k: 'rm', grp: '알리움', name: '레드 모히칸', rows: [['10/12', 700, 1900, 0, 700], ['10/12 잔량', 300, 1900, 0, 300]] },
  ] };
  const rows = m.allocRows(p);
  assert.deepEqual(rows[0], { key: 'dm|16/18', label: '수선화 더치마스터', size: '16/18', stock: 9360, approx: true });
  const r = m.allocate(p, [
    { name: '수선화 더치마스터', spec: '16/18', qty: 500, price: 1000 },
    { name: '무스카리 베이비 브레스', spec: '7/8', qty: 2500, price: 200 },
    { name: '알리움 레드 모히칸 1크레이트×700구', spec: '10/12', qty: 700, price: 1900 },
    { name: '튤립 없음', spec: '1', qty: 5, price: 1 },
  ]);
  assert.deepEqual([...r.qty], [['dm|16/18', 500], ['bb|7/8 잔량', 2500], ['rm|10/12', 700]]);
  assert.deepEqual(r.unmatched.map((l) => l.name), ['튤립 없음']);
});

test('수정본 따라가기는 앞부분이 같은 번호만 (길이만 같은 다른 견적은 아님)', async () => {
  const { latestRevision } = await import('../src/lib/order-program.ts');
  const rows = [{ number: 'OG-20261102-001' }, { number: 'OG-20261029-001-R6' }, { number: 'OG-20261102-001-R2' }];
  assert.equal(latestRevision(rows, 'OG-20261102-001').number, 'OG-20261102-001-R2');
  assert.equal(latestRevision([{ number: 'OG-20261029-001-R6' }], 'OG-20261102-001'), null);
});

test('회사는 최신 견적을 따라간다: 손으로 만든 견적이 자동 초안을 이긴다 (금성농원 항공 건)', async () => {
  const { followQuote, pendingOrders } = await import('../src/lib/order-program.ts');
  const p = { v: 1, items: [
    { k: 'a', grp: '수선화', name: '세일러맨', rows: [['12/14', '2,800+', 500, 0]] },
    { k: 'b', grp: '수선화', name: '더치마스터', rows: [['16/18', '9,360+', 1000, 0]] },
  ] };
  const q = (over) => ({ status: '발송', at: '', issued: '', phone: '010-5755-6653', company: '금성농원', deal: '일반', deleted: false, lines: [{ name: '수선화 세일러맨', spec: '12/14', qty: 5100, price: 500 }], ...over });
  const quotes = [
    q({ number: 'OG-20261102-001', status: '작성', company: '김희준', at: '2026-11-02T08:04:47Z', issued: '2026-11-02' }), // 자동 초안(상호·성함 뒤바뀜)
    q({ number: 'OG-20261103-001', at: '2026-11-03T08:22:25Z', issued: '2026-11-03' }),
    q({ number: 'OG-20261103-001-R3', at: '2026-11-06T06:10:37Z', issued: '2026-11-06' }),
    q({ number: 'OG-20261029-001-R6', phone: '010-7405-2007', company: '유니크가든', at: '2026-11-06T06:09:59Z', issued: '2026-11-06' }), // 남의 견적
    q({ number: 'OG-20261104-001', at: '2026-11-04T01:00:00Z', issued: '2026-11-04', lines: [{ name: '라벤더', spec: 'P9', qty: 10, price: 1 }] }), // 다른 품목
    q({ number: 'OG-20261105-001', at: '2026-11-05T01:00:00Z', issued: '2026-11-05', deal: '테스트' }),
  ];
  const r = followQuote(quotes, { phone: '01057556653', company: '금성농원', drafts: ['OG-20261102-001'], since: '2026-11-02' }, p);
  assert.equal(r.current.number, 'OG-20261103-001-R3');
  assert.deepEqual(r.others.map((x) => x.number), ['OG-20261102-001']);
  assert.equal(r.auto, false);
  const orders = [{ at: '2026-11-02T08:00:00Z', draft: 'OG-20261102-001' }, { at: '2026-11-07T01:00:00Z', draft: 'OG-20261107-001' }];
  assert.deepEqual(pendingOrders(orders, r.current, r.auto).map((o) => o.draft), ['OG-20261107-001']); // 견적 뒤에 들어온 주문만

  // 자동 초안만 있으면 그걸 따르고, 다른 주문은 아직 안 들어간 것
  const only = followQuote(quotes.slice(0, 1), { phone: '01057556653', company: '금성농원', drafts: ['OG-20261102-001'], since: '2026-11-02' }, p);
  assert.equal(only.current.number, 'OG-20261102-001');
  assert.equal(only.auto, true);
  assert.equal(pendingOrders([{ at: '2026-11-01T00:00:00Z', draft: '' }, orders[0]], only.current, only.auto).length, 1);
  assert.equal(followQuote([], { phone: '', company: 'x', drafts: [], since: '' }, p).current, null);
});
