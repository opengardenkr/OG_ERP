import test from 'node:test';
import assert from 'node:assert/strict';
import {
  checkPoInput, formatAmount, formatDateEn, formatPrice, hangulFields, lineAmount, parsePoDoc, poLayout, poNumber, poPages, poTotals, taxLabel,
} from '../src/lib/purchase-order.ts';

const supplier = { company: 'Hoogenraad Handelskwekerijen B.V.', attn: 'Ruben Codee', address: 'Oudendijk 1-B, 6744 PT Ederveen, The Netherlands', phone: '', email: 'ruben@hoogenraadplant.nl', taxId: 'NL009040171B01' };
const input = (lines, extra = {}) => ({ date: '2026-11-20', supplierId: 'recvQmDVfXHvxhSPV', doc: { currency: 'EUR', supplier, lines, ...extra } });

test('줄 금액은 통화 소수 자리에서 반올림한다 (50 × 1.30 = 65.00, 부동소수 찌꺼기 없음)', () => {
  assert.equal(lineAmount({ qty: 50, price: 1.3 }, 'EUR'), 65);
  assert.equal(lineAmount({ qty: 3, price: 0.355 }, 'EUR'), 1.07);
  assert.equal(lineAmount({ qty: 3, price: 1234.5 }, 'KRW'), 3704);
  assert.equal(lineAmount({ qty: 3, price: null }, 'EUR'), null);
});

test('합계: 가격 문의 줄은 빠지고 줄 번호가 남는다 — 호게나르드 추가 발주 6줄 = €901.50', () => {
  const lines = [
    { qty: 50, price: 1.3, unit: 'pcs' }, { qty: 20, price: 1.35, unit: 'pcs' }, { qty: 133, price: 1.5, unit: 'pcs' },
    { qty: 400, price: null, unit: 'pcs' }, { qty: 200, price: 1.8, unit: 'pcs' }, { qty: 200, price: 1.25, unit: 'pcs' },
  ];
  const t = poTotals({ currency: 'EUR', lines });
  assert.equal(t.total, 901.5);
  assert.equal(t.qty, 1003);
  assert.deepEqual(t.onRequest, [4]);
  assert.deepEqual(t.units, ['pcs']);
});

test('숫자 표기: 영어권 천 단위 쉼표, 단가는 셋째 자리까지', () => {
  assert.equal(formatAmount(901.5, 'EUR'), '901.50');
  assert.equal(formatAmount(1234567, 'KRW'), '1,234,567');
  assert.equal(formatPrice(1.3, 'EUR'), '1.30');
  assert.equal(formatPrice(0.355, 'EUR'), '0.355');
  assert.equal(formatPrice(1700, 'KRW'), '1,700');
});

test('날짜는 20 Nov 2026처럼 — 월/일 순서 헷갈림이 없다', () => {
  assert.equal(formatDateEn('2026-11-20'), '20 Nov 2026');
  assert.equal(formatDateEn('2027-01-05'), '5 Jan 2027');
  assert.equal(formatDateEn('Week 10, 2027'), 'Week 10, 2027');
});

test('발주번호: 그날 가장 큰 번호 + 1, 다른 날은 무시', () => {
  assert.equal(poNumber('2026-11-20', []), 'PO-20261120-001');
  assert.equal(poNumber('2026-11-20', ['PO-20261120-001', 'PO-20261120-007', 'PO-20261119-020']), 'PO-20261120-008');
});

test('등록번호 칸 이름: 한국 사업자번호면 Business Reg. No., 아니면 VAT No.', () => {
  assert.equal(taxLabel('495-28-01860'), 'Business Reg. No.');
  assert.equal(taxLabel('NL009040171B01'), 'VAT No.');
});

test('쪽 나누기: 첫 쪽 14줄, 다음 쪽 24줄, 빈 목록도 한 쪽', () => {
  assert.equal(poPages([]).length, 1);
  assert.equal(poPages(Array(14).fill(0)).length, 1);
  const p = poPages(Array(40).fill(0));
  assert.deepEqual(p.map((x) => x.length), [14, 24, 2]);
});

test('합계·서명 칸이 마지막 쪽에 안 들어가면 빈 쪽을 하나 더 붙인다', () => {
  assert.deepEqual(poLayout(Array(6).fill(0)).map((x) => x.length), [6]);
  assert.deepEqual(poLayout(Array(12).fill(0)).map((x) => x.length), [12, 0]);
  assert.deepEqual(poLayout(Array(30).fill(0)).map((x) => x.length), [14, 16]);
  assert.deepEqual(poLayout(Array(34).fill(0)).map((x) => x.length), [14, 20, 0]);
});

test('입력 검사: 빈 줄은 버리고, 단가 빈칸 = 가격 문의(null), "1,003" 같은 쉼표 숫자는 읽는다', () => {
  const r = checkPoInput(input([
    { code: 'COSWGOLD', description: "Cornus sericea 'White Gold'", size: 'P9', qty: '50', unit: 'pcs', price: '1.30' },
    { code: '', description: '', size: '', qty: '', unit: 'pcs', price: '' },
    { code: '', description: "Cornus sanguinea 'Anny's Winter Orange'", size: 'P9', qty: '1,003', unit: 'pcs', price: '' },
  ]));
  assert.ok(!('error' in r));
  assert.equal(r.doc.lines.length, 2);
  assert.equal(r.doc.lines[0].price, 1.3);
  assert.equal(r.doc.lines[1].qty, 1003);
  assert.equal(r.doc.lines[1].price, null);
  assert.equal(r.supplierId, 'recvQmDVfXHvxhSPV');
});

test('입력 검사: 상호·품명·수량·통화가 없으면 거절', () => {
  assert.match(checkPoInput(input([])).error, /한 줄 이상/);
  assert.match(checkPoInput(input([{ description: 'X', qty: 0 }])).error, /수량/);
  assert.match(checkPoInput(input([{ code: 'A', qty: 3 }])).error, /품명/);
  assert.match(checkPoInput(input([{ description: 'X', qty: 1, price: '-1' }])).error, /단가/);
  assert.match(checkPoInput({ ...input([{ description: 'X', qty: 1 }]), date: '2026-13-40' }).error, /발주일/);
  assert.match(checkPoInput({ date: '2026-11-20', doc: { currency: 'XYZ', supplier, lines: [{ description: 'X', qty: 1 }] } }).error, /통화/);
  assert.match(checkPoInput({ date: '2026-11-20', doc: { currency: 'EUR', supplier: { company: ' ' }, lines: [{ description: 'X', qty: 1 }] } }).error, /상호/);
});

test('저장한 JSON을 다시 읽는다 — 깨진 JSON은 null', () => {
  const r = checkPoInput(input([{ description: 'X', qty: 2, price: 1 }], { remarks: 'Hold stock' }));
  const back = parsePoDoc(JSON.stringify(r.doc));
  assert.deepEqual(back, r.doc);
  assert.equal(parsePoDoc('{oops'), null);
  assert.equal(parsePoDoc(JSON.stringify({ v: 2 })), null);
});

test('한글이 든 칸을 알려준다(영문 문서 경고)', () => {
  const r = checkPoInput(input([{ description: '흰말채 White Gold', qty: 2 }, { description: 'Syringa', qty: 1 }], { remarks: '재고 확보 부탁' }));
  assert.deepEqual(hangulFields(r.doc), ['Remarks', '1번째 줄']);
});
