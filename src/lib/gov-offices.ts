/**
 * 관공서 영업 지도(map.open-garden.co.kr)의 기관 목록과 `지자체 영업일지` 기록을 잇는 규칙.
 * 매칭 규칙은 gov-map 저장소의 `js/visits-match.js`와 같다 — 두 지도가 같은 기록을
 * 같은 기관에 붙여야 한다. 규칙을 바꾸려면 저쪽과 함께 바꾼다.
 * 순수 함수. 서버·화면·테스트 어디서나 쓴다.
 */

export type Position = { lat: number; lng: number };

export type GovOffice = {
  id: string;
  name: string;
  sido: string;
  address: string;
  position: Position;
  match: string[];
  departments: { name: string; address: string }[];
};

export type GovRecordText = {
  region: string;
  jurisdiction: string;
  location: string;
};

export const normalize = (value: string) =>
  value.replace(/\s+/g, "").replace(/특별자치시|특별시|광역시/g, "");

const PROVINCES: Record<string, RegExp> = {
  // 대구: "해운대구"를 대구로 읽지 않는다(gov-map 원본 규칙에는 아직 없는 보정, 2026-11-06).
  서울: /서울/, 부산: /부산/, 대전: /대전/, 울산: /울산/, 대구: /(?<!해운)대구/, 인천: /인천/,
  광주: /광주광역/, 세종: /세종시|세종특별/, 경기: /경기/, 강원: /강원/,
  충북: /충북|충청북도/, 충남: /충남|충청남도/, 전북: /전북|전라북도/,
  전남: /전남|전라남도/, 경북: /경북|경상북도/, 경남: /경남|경상남도/, 제주: /제주/,
};

export function mentionedProvinces(record: GovRecordText): string[] {
  const text = `${record.region} ${record.jurisdiction}`;
  return Object.entries(PROVINCES).filter(([, pattern]) => pattern.test(text)).map(([name]) => name);
}

/** 가장 길게 맞는 기관 하나. 같은 길이로 둘 이상 맞으면 임의로 고르지 않는다. */
export function matchOffice(record: GovRecordText, offices: GovOffice[]): GovOffice | null {
  const text = normalize(record.jurisdiction || `${record.region} ${record.location}`);
  if (!text) return null;
  const mentioned = mentionedProvinces(record);
  const candidates = offices.flatMap(office => {
    if (mentioned.some(sido => sido !== office.sido)) return [];
    const lengths = office.match.map(normalize).filter(key => key && text.includes(key)).map(key => key.length);
    return lengths.length ? [{ office, length: Math.max(...lengths) }] : [];
  }).sort((a, b) => b.length - a.length);
  if (candidates.length > 1 && candidates[0].length === candidates[1].length) return null;
  return candidates[0]?.office ?? null;
}

/**
 * 영업일지 한 건의 기관. `지역관할`로 먼저 찾고, 못 찾으면 `부서 및 위치`로 한 번 더 찾는다.
 * 예: 지역관할 "양평"(만난 장소) + 부서 및 위치 "경기도의회 건설교통위원회"(상대 기관) → 경기도의회.
 * 두 번째 단계는 ERP에만 있다(관공서 지도 원본 규칙은 지역관할만 본다).
 */
export function matchRecord(record: GovRecordText, offices: GovOffice[]): GovOffice | null {
  return matchOffice(record, offices)
    ?? (record.location ? matchOffice({ region: record.region, jurisdiction: record.location, location: "" }, offices) : null);
}

/** "서울 강북구 도봉로 358 (코스타타워)" → "서울 강북구 도봉로 358". 괄호 안 건물명은 주소 검색을 방해한다. */
export const streetAddress = (address: string) => address.replace(/\s*\([^)]*\)/g, "").trim();

/**
 * 기록이 가리키는 부서가 본청이 아닌 건물에 있으면 그 부서 주소를, 아니면 기관 주소를 쓴다.
 * 기관 좌표는 대략값이라, 부서 건물이 다를 때는 대신 쓰지 않는다(엉뚱한 건물에 핀이 꽂힌다).
 */
export function officeLocation(office: GovOffice, location: string) {
  const text = normalize(location);
  const department = text
    ? office.departments.find(d => d.address && text.includes(normalize(d.name)))
    : undefined;
  if (department) {
    return { address: department.address, query: streetAddress(department.address), fallback: null };
  }
  return { address: office.address, query: streetAddress(office.address), fallback: office.position };
}

/**
 * 관공서 지도의 기관 목록 + ERP가 따로 아는 기관.
 * 관공서 지도에 같은 매칭 이름이 생기면 ERP 쪽 것을 뺀다 — 같은 길이로 둘이 맞으면 아무 데도 안 붙기 때문이다.
 */
export function mergeOffices(primary: GovOffice[], extra: GovOffice[]): GovOffice[] {
  const taken = new Set(primary.flatMap(o => o.match.map(normalize)));
  return [...primary, ...extra.filter(o => !o.match.some(key => taken.has(normalize(key))))];
}

const text = (value: unknown) => (typeof value === "string" ? value.trim() : "");

/** offices.json을 믿지 않고 필요한 칸만 꺼낸다. 모양이 틀린 기관은 버린다. */
export function parseOffices(json: unknown): GovOffice[] {
  const list = (json as { offices?: unknown } | null)?.offices;
  if (!Array.isArray(list)) return [];
  return list.flatMap((raw): GovOffice[] => {
    const o = raw as Record<string, unknown>;
    const lat = Number(o.lat), lng = Number(o.lng);
    const match = Array.isArray(o.match) ? o.match.map(text).filter(Boolean) : [];
    if (!text(o.id) || !text(o.address) || !Number.isFinite(lat) || !Number.isFinite(lng) || !match.length) return [];
    const departments = Array.isArray(o.departments)
      ? o.departments.map(d => ({ name: text((d as Record<string, unknown>).name), address: text((d as Record<string, unknown>).address) }))
          .filter(d => d.name)
      : [];
    return [{ id: text(o.id), name: text(o.name) || text(o.id), sido: text(o.sido), address: text(o.address), position: { lat, lng }, match, departments }];
  });
}
