import test from 'node:test';
import assert from 'node:assert/strict';
import { bizNoValid, formatBizNo, hometaxRows, missingRequired } from '../src/lib/client-types.ts';

test('사업자등록번호 검증 규칙', () => {
  assert.equal(bizNoValid('124-81-00998'), true); // 공개된 대기업 번호로 규칙 확인
  assert.equal(bizNoValid('1248100998'), true);
  assert.equal(bizNoValid('124-81-00997'), false); // 끝자리 오타
  assert.equal(bizNoValid('124-81-0099'), false); // 9자리
  assert.equal(bizNoValid(''), false);
});

test('등록번호 모양 맞추기', () => {
  assert.equal(formatBizNo('1248100998'), '124-81-00998');
  assert.equal(formatBizNo(' 124 81 00998 '), '124-81-00998');
  assert.equal(formatBizNo('12-34'), '12-34');
});

const base = { name: '금성농원', bizNo: '', bizName: '', ceo: '', address: '', bizType: '', bizItem: '', invoiceEmail: '', email: '' };

test('홈택스 공급받는자 칸: 순서·대체값', () => {
  const rows = hometaxRows({ ...base, bizNo: '1248100998', ceo: '김희준', email: 'a@b.kr', address: '충남 천안시 1' });
  assert.deepEqual(rows.map((r) => r.label), ['등록번호', '상호', '성명(대표자)', '사업장 주소', '업태', '종목', '이메일']);
  assert.equal(rows[0].value, '124-81-00998');
  assert.equal(rows[1].value, '금성농원'); // 상호 비우면 거래처 이름
  assert.equal(rows[6].value, 'a@b.kr'); // 계산서 이메일 비우면 거래처 이메일
  const own = hometaxRows({ ...base, bizName: '농업회사법인 금성(주)', invoiceEmail: 'tax@b.kr', email: 'a@b.kr' });
  assert.equal(own[1].value, '농업회사법인 금성(주)');
  assert.equal(own[6].value, 'tax@b.kr');
});

test('주소 칸에 지도 링크가 있으면 비운다', () => {
  assert.equal(hometaxRows({ ...base, address: 'https://naver.me/x' })[3].value, '');
});

test('먼저 채울 칸', () => {
  assert.deepEqual(missingRequired(hometaxRows(base)), ['등록번호', '성명(대표자)']);
  assert.deepEqual(missingRequired(hometaxRows({ ...base, bizNo: '1248100998', ceo: '김' })), []);
});
