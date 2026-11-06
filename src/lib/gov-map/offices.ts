import "server-only";

import { unstable_cache } from "next/cache";
import { parseOffices, type GovOffice } from "@/lib/gov-offices";

/**
 * 관공서 기관 목록의 원천은 관공서 영업 지도(별도 저장소·별도 배포)다.
 * 같은 자료를 ERP에 복사해 두면 저쪽에서 조사·보정한 내용과 어긋나므로, 공개 주소에서 읽는다.
 * 키가 필요 없는 정적 파일이다.
 */
const OFFICES_URL = "https://map.open-garden.co.kr/data/offices.json";

async function fetchOffices(): Promise<GovOffice[]> {
  const response = await fetch(OFFICES_URL, { cache: "no-store", signal: AbortSignal.timeout(5000) });
  if (!response.ok) throw new Error(`offices.json ${response.status}`);
  const offices = parseOffices(await response.json());
  if (!offices.length) throw new Error("offices.json에 기관이 없다");
  return offices;
}

/**
 * 실패하면 빈 목록 — 지도는 그대로 뜨고 관공서 핀만 줄어든다.
 * 예외는 캐시되지 않으므로 성공한 결과만 6시간 남는다.
 */
export async function getGovOffices(): Promise<GovOffice[]> {
  try {
    return await unstable_cache(fetchOffices, ["gov-map", "offices"], { revalidate: 21600 })();
  } catch {
    return [];
  }
}
