import test from 'node:test';
import assert from 'node:assert/strict';
import { matchOffice, officeLocation, parseOffices } from '../src/lib/gov-offices.ts';
import { extractAddress, looksLikeAddress } from '../src/lib/sales-map-address.ts';

// 관공서 지도 offices.json과 같은 모양. 실제 담당자·리뷰는 넣지 않는다.
const offices = parseOffices({ offices: [
  { id: 'yongsan', name: '용산구청', sido: '서울', address: '서울 용산구 녹사평대로 150', lat: 37.53, lng: 126.99, match: ['용산구청'], departments: [{ name: '공원녹지과' }] },
  { id: 'junggu', name: '중구청', sido: '서울', address: '서울 중구 창경궁로 17', lat: 37.56, lng: 126.99, match: ['중구청'], departments: [] },
  { id: 'seocho', name: '서초구청', sido: '서울', address: '서울 서초구 남부순환로 2584', lat: 37.48, lng: 127.03, match: ['서초구청'],
    departments: [{ name: '정원여가과', address: '서울 서초구 강남대로 221 (양재주차빌딩)' }] },
  { id: 'broken', name: '좌표 없음', sido: '서울', address: '서울', match: ['좌표없음'] },
] });
const record = (jurisdiction, location = '', region = '') => ({ region, jurisdiction, location });

test('offices.json entries without coordinates are dropped', () => {
  assert.deepEqual(offices.map(o => o.id), ['yongsan', 'junggu', 'seocho']);
});

test('records match the same office as the government map', () => {
  assert.equal(matchOffice(record('서울 용산구청 ', '본관 7층 공원녹지과 조경팀'), offices)?.id, 'yongsan');
  assert.equal(matchOffice(record('서울 중구청'), offices)?.id, 'junggu');
  // 다른 시·도 이름이 적혀 있으면 서울 기관에 붙이지 않는다.
  assert.equal(matchOffice(record('부산광역시 중구청'), offices), null);
  assert.equal(matchOffice(record('진주시청'), offices), null);
  assert.equal(matchOffice(record(''), offices), null);
});

test('a department in another building uses its own address, not the city hall coordinates', () => {
  const seocho = offices.find(o => o.id === 'seocho');
  assert.deepEqual(officeLocation(seocho, '4층 정원여가과 조경팀'),
    { address: '서울 서초구 강남대로 221 (양재주차빌딩)', query: '서울 서초구 강남대로 221', fallback: null });
  const yongsan = offices.find(o => o.id === 'yongsan');
  assert.deepEqual(officeLocation(yongsan, '공원녹지과'),
    { address: '서울 용산구 녹사평대로 150', query: '서울 용산구 녹사평대로 150', fallback: { lat: 37.53, lng: 126.99 } });
});

test('addresses written in a record are trimmed to what the geocoder understands', () => {
  assert.equal(extractAddress('공주시 수원지공원길 131-21 금학생태공원쪽'), '공주시 수원지공원길 131-21');
  assert.equal(extractAddress('전라남도 순천시 성서면 출산2길 18 (우: 57909)'), '전라남도 순천시 성서면 출산2길 18');
  assert.equal(extractAddress('본관 9층 공원녹지과'), '');
  assert.equal(looksLikeAddress('서울 용산구청'), false);
});

test('provincial offices outside the government map get pinned, without crossing provinces', async () => {
  const { EXTRA_GOV_OFFICES } = await import('../src/lib/gov-offices-extra.ts');
  const { mergeOffices } = await import('../src/lib/gov-offices.ts');
  const all = mergeOffices(offices, EXTRA_GOV_OFFICES);
  const id = (jurisdiction, location = '', region = '') => matchOffice(record(jurisdiction, location, region), all)?.id ?? null;
  assert.equal(id('진주시청', '본관 9층 공원녹지과'), 'erp_jinju');
  assert.equal(id('부산 남구청'), 'erp_busan_nam');
  assert.equal(id('울산 남구청', '5층 정원녹지과'), 'erp_ulsan_nam');
  assert.equal(id('울산광역시청'), 'erp_ulsan_city');
  assert.equal(id('부산광역시 동구청'), 'erp_busan_dong');
  assert.equal(id('대전광역시 동구청'), 'erp_dj_dong');
  assert.equal(id('대전광역시 중구청', '선화별관 6층 공원녹지과'), 'erp_dj_jung');
  assert.equal(id('예산군청', '', '충청남도'), 'erp_yesan');
  assert.equal(id('안산 시청'), 'erp_ansan');
  assert.equal(id('안산 단원구청'), 'erp_danwon');
  assert.equal(id('포천', '본관 3층 정원도시과', '경기'), 'erp_pocheon');
  // 서울 중구청은 그대로 서울로, '남구청'만 적힌 기록은 어느 쪽인지 몰라 붙이지 않는다.
  assert.equal(id('서울 중구청'), 'junggu');
  assert.equal(id('남구청'), null);
  // 같은 기관이 관공서 지도에 생기면 ERP 쪽 것은 빠진다.
  assert.equal(mergeOffices([...offices, { ...offices[0], id: 'jinju', match: ['진주시청'] }], EXTRA_GOV_OFFICES).filter(o => o.match.includes('진주시청')).length, 1);
  const jung = all.find(o => o.id === 'erp_dj_jung');
  assert.equal(officeLocation(jung, '선화별관 6층 공원녹지과').query, '대전 중구 선화서로 37');
});

test('"해운대구" is Busan, not Daegu; "광역시청" still matches its city hall', async () => {
  const { EXTRA_GOV_OFFICES } = await import('../src/lib/gov-offices-extra.ts');
  const { mergeOffices, mentionedProvinces } = await import('../src/lib/gov-offices.ts');
  assert.deepEqual(mentionedProvinces(record('부산 해운대구청')), ['부산']);
  const all = mergeOffices(offices, EXTRA_GOV_OFFICES);
  assert.equal(matchOffice(record('부산 해운대구청', '6층'), all)?.id, 'erp_haeundae');
  assert.equal(matchOffice(record('울산광역시청', '1층 태화강국가정원과'), all)?.id, 'erp_ulsan_city');
});
