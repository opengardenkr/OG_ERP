import test from 'node:test';
import assert from 'node:assert/strict';
import { pickPrice, newLinkId, readDirectInput, linkPayload, orderSummary, requestNo, sections } from '../src/lib/order.ts';
import { readProgramInput } from '../src/lib/order.ts';

const line = (over = {}) => ({ group: 'preorder', id: 'recAAAAAAAAAAAAAA', kname: '퍼플 센세이션', sname: 'Allium', cat: '알리움', photo: true, size: '12/14', price: 500, stock: 2400, qty: 300, ...over });

test('price basis falls back to the base price', () => {
  assert.deepEqual(pickPrice({ base: 500, air: 800 }, 'air'), { price: 800, fallback: false });
  assert.deepEqual(pickPrice({ base: 500 }, 'gov'), { price: 500, fallback: true });
  assert.deepEqual(pickPrice({}, 'base'), { price: null, fallback: false });
});

test('link ids are 22 url-safe characters and do not repeat', () => {
  const ids = new Set(Array.from({ length: 200 }, newLinkId));
  assert.equal(ids.size, 200);
  for (const id of ids) assert.match(id, /^[A-Za-z0-9_-]{22}$/);
});

test('program input is cleaned and rejects bad lines', () => {
  const ok = readProgramInput({ supplier: 'hbm', name: ' 구근 가을 ', minOrder: 1000000, basis: 'air', lines: [line()] });
  assert.equal(ok.ok, true);
  assert.equal(ok.value.name, '구근 가을');
  assert.equal(ok.value.basis, 'air');
  assert.equal(ok.value.id, '');
  assert.equal(readProgramInput({ supplier: 'hbm', name: 'x', basis: 'nope', lines: [line()] }).value.basis, 'base');
  assert.equal(readProgramInput({ supplier: 'hbm', lines: [line()] }).ok, false);
  assert.equal(readProgramInput({ supplier: 'hbm', name: 'x', lines: [] }).ok, false);
  assert.equal(readProgramInput({ supplier: 'hbm', name: 'x', lines: [line({ id: '../x' })] }).ok, false);
  assert.equal(readProgramInput({ supplier: 'hbm', name: 'x', lines: [line({ price: 0 })] }).ok, false);
});

test('주문서는 업체 하나: 업체가 없거나 다른 업체 품목이 섞이면 거절', () => {
  assert.equal(readProgramInput({ name: 'x', lines: [line()] }).ok, false);
  const mixed = readProgramInput({ supplier: 'hbm', name: 'x', lines: [line(), line({ group: 'hoogenraad', id: 'recCCCCCCCCCCCCCC' })] });
  assert.equal(mixed.ok, false);
  assert.match(mixed.message, /다른 업체/);
  assert.equal(readProgramInput({ supplier: 'hbm', name: 'x', lines: [line({ group: 'preorder' }), line({ group: 'hbm', id: 'recBBBBBBBBBBBBBB' })] }).ok, true);
});

test('HBM은 크레이트 행(5번째 칸 = 크레이트당 구수), 미리 채울 수량은 크레이트로', () => {
  const r = readProgramInput({ supplier: 'hbm', name: 'x', prefill: true, lines: [line({ group: 'preorder', size: '12/14', price: 500, qty: 2000, pack: 500 }), line({ group: 'preorder', size: '14/+', price: 700, qty: 30 })] });
  assert.equal(r.ok, true);
  const p = linkPayload(r.value.lines, true);
  assert.deepEqual(p.items[0].rows, [['12/14', 2400, 500, 4, 500], ['14/+', 2400, 700, 30]]);
  // 국내·호게나르드 품목은 크레이트 칸을 받지 않는다
  const d = readProgramInput({ supplier: 'domestic', name: 'x', lines: [line({ group: 'immediate', pack: 500 })] });
  assert.equal(d.value.lines[0].pack, undefined);
});

test('웹 주문 페이지 묶음: 분류 + 학명 속명', () => {
  assert.deepEqual(sections([{ grp: '알리움', latin: "Allium 'Gladiator'" }, { grp: '알리움', latin: 'Allium x' }, { grp: '튤립', latin: "Tulipa 'Pink Sound'" }, { grp: '기타', latin: '' }]),
    [['알리움', 'Allium'], ['튤립', 'Tulipa']]);
});

test('direct order needs a customer and quantities', () => {
  assert.equal(readDirectInput({ lines: [line()] }).ok, false);
  assert.equal(readDirectInput({ customer: 'A', lines: [line({ qty: 0 })] }).ok, false);
  assert.equal(readDirectInput({ customer: 'A', lines: [line()] }).ok, true);
});

test('payload groups sizes into one card and only prefills on request', () => {
  const lines = [line(), line({ size: '14/16', price: 700, qty: 100 }), line({ group: 'hoogenraad', id: 'recBBBBBBBBBBBBBB', kname: '목수국', size: 'P9', price: 4500, stock: null, qty: 20 })];
  const p = linkPayload(lines, false);
  assert.equal(p.v, 1);
  assert.equal(p.items.length, 2);
  assert.deepEqual(p.items[0].rows, [['12/14', 2400, 500, 0], ['14/16', 2400, 700, 0]]);
  assert.equal(p.items[1].unit, '주');
  assert.equal(p.items[1].step, 10);
  assert.equal(linkPayload(lines, true).items[0].rows[0][3], 300);
  assert.match(orderSummary(lines), /^1\. 알리움 퍼플 센세이션 @₩500 = ₩150,000 · 12\/14 · 300구/);
});

test('request numbers use the Korean date', () => {
  assert.equal(requestNo(new Date('2026-10-29T16:00:00Z'), () => 0.5), 'Q-20261030-I00');
  assert.match(requestNo(new Date()), /^Q-\d{8}-[A-Z0-9]{3}$/);
});
