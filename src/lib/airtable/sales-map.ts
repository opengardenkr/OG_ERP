import "server-only";
import { extractAddress } from "@/lib/sales-map-address";
import { matchOffice, officeLocation, streetAddress, type Position } from "@/lib/gov-offices";
import { getGovOffices } from "@/lib/gov-map/offices";

import { selectRecords } from "@/lib/airtable/client";

/**
 * CRM / 관공서 영업지도는 사내 포털 로그인 뒤에서만 읽는다.
 * 주소를 지도에서 찾는 것과 실제 현장 방문을 구분해야 한다.
 */
export type SalesMapItem = {
  id: string;
  kind: "partner" | "government";
  name: string;
  address: string;
  geocodeQuery: string;
  /** 주소 검색이 실패했을 때 쓸 좌표(관공서 지도의 기관 좌표). 없으면 핀을 찍지 않는다. */
  fallback: Position | null;
  /** 관공서 영업 지도에서 맞춘 기관 이름. 못 맞췄으면 빈 문자열. */
  office: string;
  approximate: boolean;
  detail: string;
  category: string;
  lastVisit: string;
  contact: string;
  notes: string;
  activityCount: number;
};

const BASE = "appzLstFHtHcQlWSu";
const PARTNERS = "tblTGohUQYwkdLjpV";
const GOVERNMENT = "tblIkbVaxbApkV0oe";

type PartnerRow = {
  거래처명: string;
  주소: string;
  거래처_구분: string;
  대표자명: string;
  연락처: string;
  "영업 일지": string[];
  "제안 이력": string[];
  비고: string;
};

type GovernmentRow = {
  지역: string;
  지역관할: string;
  "부서 및 위치": string;
  날짜: string;
  담당자: string;
  반응: string;
  리뷰: string;
  비고: string;
};

function cleaned(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (typeof value === "object" && value !== null && "name" in value) {
    return String((value as { name: unknown }).name ?? "").trim();
  }
  return "";
}

// 주소가 아닌 '조경과 2층' 같은 기록에 핀을 임의로 찍지 않는다.

export async function getSalesMapItems(): Promise<SalesMapItem[]> {
  const [partners, governments, offices] = await Promise.all([
    selectRecords<PartnerRow>(PARTNERS, {
      fields: ["거래처명", "주소", "거래처_구분", "대표자명", "연락처", "영업 일지", "제안 이력", "비고"],
      revalidate: 300,
    }),
    selectRecords<GovernmentRow>(GOVERNMENT, {
      fields: ["지역", "지역관할", "부서 및 위치", "날짜", "담당자", "반응", "리뷰", "비고"],
      revalidate: 300,
    }),
    getGovOffices(),
  ]);

  const businessItems = partners.map(({ id, fields: f }) => {
    const address = cleaned(f.주소);
    return {
      id,
      kind: "partner" as const,
      name: cleaned(f.거래처명) || "이름 미등록 거래처",
      address,
      geocodeQuery: extractAddress(address) || streetAddress(address),
      fallback: null,
      office: "",
      approximate: false,
      detail: cleaned(f.대표자명),
      category: cleaned(f.거래처_구분) || "미분류",
      lastVisit: "", // 상담 날짜는 영업일지의 별도 조회가 필요; 임의로 생성하지 않는다.
      contact: cleaned(f.연락처),
      notes: cleaned(f.비고).slice(0, 300),
      activityCount: Array.isArray(f["영업 일지"]) ? f["영업 일지"].length : 0,
    };
  });

  const govItems = governments.map(({ id, fields: f }) => {
    const location = cleaned(f["부서 및 위치"]);
    const jurisdiction = cleaned(f.지역관할);
    const region = [cleaned(f.지역), jurisdiction].filter(Boolean).join(" ");
    // 1) 기록에 적힌 도로명·지번 주소 2) 관공서 지도의 같은 기관 주소.
    // 둘 다 없으면 대략위치로 두고 핀을 찍지 않는다 — 관할 이름만으로 아무 데나 찍지 않는다.
    const written = extractAddress(location) || extractAddress(jurisdiction);
    const office = written ? null : matchOffice({ region: cleaned(f.지역), jurisdiction, location }, offices);
    const place = office ? officeLocation(office, location) : null;
    return {
      id,
      kind: "government" as const,
      name: jurisdiction || cleaned(f.지역) || "지역 미등록",
      address: written || place?.address || region,
      geocodeQuery: written || place?.query || "",
      fallback: place?.fallback ?? null,
      office: office?.name ?? "",
      approximate: !written && !place,
      detail: location,
      category: cleaned(f.반응) || "미분류",
      lastVisit: cleaned(f.날짜),
      contact: cleaned(f.담당자),
      notes: cleaned(f.리뷰).slice(0, 300),
      activityCount: 0,
    };
  });

  return [...businessItems, ...govItems];
}

export const salesMapAirtableLink = (record: SalesMapItem) =>
  `https://airtable.com/${BASE}/${record.kind === "partner" ? PARTNERS : GOVERNMENT}/${record.id}`;
