/**
 * 영문 문서(발주서 등)에 찍는 오픈가든 정보. 바꿀 일이 생기면 여기 한 곳만 고친다.
 * 주소는 HBM 인보이스(26021605)의 청구처와 같은 표기, 등록번호는 사업자등록증 값(2026-11-20 확인).
 * 영업 문서(견적·주문서)는 지역을 쓰지 않지만, 수입 발주서는 수입자(Consignee) 주소가 있어야 한다.
 */
export const OPEN_GARDEN_EN = {
  company: "Open Garden",
  contact: "Sihyeong (Ash) Lee",
  representative: "Sihyeong Lee",
  title: "Representative",
  regNo: "495-28-01860",
  /** 문서에 한 줄씩 찍힌다(좁은 칸에서 어색하게 꺾이지 않게 나눠 둔다). */
  address: [
    "64-6, Boseong-ri, Pungse-myeon",
    "Dongnam-gu, Cheonan-si",
    "Chungcheongnam-do 31216",
    "Republic of Korea",
  ],
  phone: "+82 10-9717-1251",
  email: "info@open-garden.co.kr",
  web: "www.open-garden.co.kr",
} as const;
