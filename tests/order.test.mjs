import test from 'node:test';
import assert from 'node:assert/strict';
import { pickPrice, newLinkId, readLinkInput, readDirectInput, linkPayload, orderSummary, requestNo } from '../src/lib/order.ts';

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

test('link input is cleaned and rejects bad lines', () => {
  const ok = readLinkInput({ customer: ' 유니크가든 ', phone: '010-7405-2007', minOrder: 1000000, basisDate: '2026-10-30', lines: [line()] });
  assert.equal(ok.ok, true);
  assert.equal(ok.value.title, '오픈가든 주문서');
  assert.equal(ok.value.customer, '유니크가든');
  assert.equal(readLinkInput({ lines: [] }).ok, false);
  assert.equal(readLinkInput({ lines: [line({ id: '../x' })] }).ok, false);
  assert.equal(readLinkInput({ lines: [line({ price: 0 })] }).ok, false);
  assert.equal(readLinkInput({ phone: '12', lines: [line()] }).ok, false);
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
