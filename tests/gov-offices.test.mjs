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
