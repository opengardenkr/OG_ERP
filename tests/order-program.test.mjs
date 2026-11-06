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
