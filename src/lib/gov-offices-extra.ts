import type { GovOffice } from "@/lib/gov-offices";

/**
 * 관공서 영업 지도(map.open-garden.co.kr)가 아직 다루지 않는 지방 기관.
 * 영업일지에 기록이 있는데 핀이 안 뜨던 곳만 넣었다(2026-11-06, 21곳).
 *
 * - 주소는 공식 청사 주소. 네이버 지도 주소 검색 결과에 같은 건물 이름(예: "진주시청")이
 *   붙어 나오는 것으로 확인했다. 좌표는 그때 받은 값이며, 주소 검색이 실패할 때만 쓴다.
 * - 관공서 지도에 같은 기관이 생기면(같은 매칭 이름) 그쪽이 이긴다 — 여기 것은 자동으로 빠진다.
 * - 새 기관은 여기 한 줄을 더하거나, 영업일지의 `지역관할`·`부서 및 위치`에 도로명 주소를 적으면 된다.
 * - 매칭 이름은 시·도를 붙인다("부산남구청"). "남구청"만 쓰면 부산·울산·대구가 겹친다.
 * - 매칭은 `normalize`를 거친다: "광역시"가 지워져 "울산광역시청"은 "울산청"이 된다. 그래서 두 이름을 다 둔다.
 */
export const EXTRA_GOV_OFFICES: GovOffice[] = [
  { id: "erp_jinju", name: "진주시청", sido: "경남", address: "경남 진주시 동진로 155", position: { lat: 35.18032, lng: 128.10765 }, match: ["진주시청"], departments: [] },
  { id: "erp_busan_nam", name: "부산 남구청", sido: "부산", address: "부산 남구 못골로 19", position: { lat: 35.13658, lng: 129.08416 }, match: ["부산남구청"], departments: [] },
  { id: "erp_busan_dong", name: "부산 동구청", sido: "부산", address: "부산 동구 구청로 1", position: { lat: 35.12927, lng: 129.04533 }, match: ["부산동구청"], departments: [] },
  { id: "erp_haeundae", name: "부산 해운대구청", sido: "부산", address: "부산 해운대구 중동2로 11", position: { lat: 35.16318, lng: 129.16363 }, match: ["해운대구청"], departments: [] },
  { id: "erp_ulsan_city", name: "울산광역시청", sido: "울산", address: "울산 남구 중앙로 201", position: { lat: 35.53948, lng: 129.3113 }, match: ["울산시청", "울산광역시청"], departments: [] },
  { id: "erp_ulsan_nam", name: "울산 남구청", sido: "울산", address: "울산 남구 돋질로 233", position: { lat: 35.5438, lng: 129.33011 }, match: ["울산남구청"], departments: [] },
  { id: "erp_yuseong", name: "대전 유성구청", sido: "대전", address: "대전 유성구 대학로 211", position: { lat: 36.36232, lng: 127.35627 }, match: ["유성구청"], departments: [] },
  { id: "erp_dj_dong", name: "대전 동구청", sido: "대전", address: "대전 동구 동구청로 147", position: { lat: 36.31204, lng: 127.45492 }, match: ["대전동구청"], departments: [] },
  {
    id: "erp_dj_jung", name: "대전 중구청", sido: "대전", address: "대전 중구 중앙로 100", position: { lat: 36.32566, lng: 127.42155 }, match: ["대전중구청"],
    // 공원녹지과는 본청이 아니라 선화별관(대유오피스빌딩). 영업일지에 "선화별관"이라고 적혀 있으면 이 주소로 간다.
    departments: [{ name: "선화별관", address: "대전 중구 선화서로 37" }],
  },
  { id: "erp_jeonju", name: "전주시청", sido: "전북", address: "전북특별자치도 전주시 완산구 노송광장로 10", position: { lat: 35.82417, lng: 127.14805 }, match: ["전주시청"], departments: [] },
  { id: "erp_deokjin", name: "전주 덕진구청", sido: "전북", address: "전북특별자치도 전주시 덕진구 벚꽃로 55", position: { lat: 35.8294, lng: 127.13436 }, match: ["덕진구청"], departments: [] },
  { id: "erp_wanju", name: "완주군청", sido: "전북", address: "전북특별자치도 완주군 용진읍 지암로 61", position: { lat: 35.90471, lng: 127.16202 }, match: ["완주군청"], departments: [] },
  { id: "erp_yesan", name: "예산군청", sido: "충남", address: "충남 예산군 예산읍 군청로 22", position: { lat: 36.6809, lng: 126.84474 }, match: ["예산군청"], departments: [] },
  { id: "erp_taean", name: "태안군청", sido: "충남", address: "충남 태안군 태안읍 군청로 1", position: { lat: 36.74561, lng: 126.29791 }, match: ["태안군청"], departments: [] },
  // 아산 문화공원 안 미래도시관리사업소 공원관리과. 주소는 관공서 지도 조사본(offices_later.json)과 같다.
  { id: "erp_asan_park", name: "아산 미래도시관리사업소 공원관리과", sido: "충남", address: "충남 아산시 권곡동 448-228", position: { lat: 36.79146, lng: 127.00612 }, match: ["아산문화공원", "미래도시관리사업소"], departments: [] },
  { id: "erp_ansan", name: "안산시청", sido: "경기", address: "경기 안산시 단원구 화랑로 387", position: { lat: 37.32187, lng: 126.83081 }, match: ["안산시청"], departments: [] },
  { id: "erp_danwon", name: "안산 단원구청", sido: "경기", address: "경기 안산시 단원구 화랑로 250", position: { lat: 37.32102, lng: 126.81526 }, match: ["단원구청"], departments: [] },
  // 농업기술센터: 주소는 고성군 신청사 이전 기사(경남일보 2014-10-24)·거제시농업기술센터 홈페이지 하단.
  { id: "erp_goseong_atc", name: "고성군농업기술센터", sido: "경남", address: "경남 고성군 고성읍 남해안대로 2829-60", position: { lat: 34.99599, lng: 128.32579 }, match: ["고성군농업기술센터"], departments: [] },
  { id: "erp_geoje_atc", name: "거제시농업기술센터", sido: "경남", address: "경남 거제시 거제면 거제남서로 3567", position: { lat: 34.8562, lng: 128.58167 }, match: ["거제농업기술센터", "거제시농업기술센터"], departments: [] },
  // 경기정원박람회 부스에 찾아온 경기도의회 건설교통위원회. 핀은 방문할 곳(경기도의회)에 찍는다. 주소는 경기도의회 홈페이지 하단.
  { id: "erp_ggc", name: "경기도의회", sido: "경기", address: "경기 수원시 영통구 도청로 32", position: { lat: 37.28887, lng: 127.0542 }, match: ["경기도의회"], departments: [] },
  // 영업일지에 "포천"으로만 적힌 기록용. 관공서 지도의 포천시청과 같은 건물이다.
  { id: "erp_pocheon", name: "포천시청", sido: "경기", address: "경기 포천시 중앙로 87", position: { lat: 37.89487, lng: 127.20024 }, match: ["포천"], departments: [] },
];
