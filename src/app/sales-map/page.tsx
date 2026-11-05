import { AppShell } from "@/components/app-shell";
import { SalesMapClient } from "@/components/sales-map-client";
import { getSalesMapItems } from "@/lib/airtable/sales-map";

export const metadata = {
  title: "영업 지도 | 오픈가든",
  robots: { index: false, follow: false },
};

export default async function SalesMapPage() {
  let entries: Awaited<ReturnType<typeof getSalesMapItems>> = [];
  let warning = "";
  try {
    entries = await getSalesMapItems();
  } catch {
    warning = "Airtable 데이터를 읽지 못했습니다. 서버의 Airtable 연결 설정을 확인해 주세요.";
  }

  return (
    <AppShell title="영업 지도" subtitle="관공서·업체를 지도에서 검색하고 기존 기록을 확인합니다">
      <SalesMapClient
        entries={entries}
        // 관공서 지도(gov-map)와 같은 이름(NAVER_MAP_KEY_ID)도 받는다.
        // Client ID는 브라우저에 드러나는 값이고, 네이버 콘솔의 Web 서비스 URL이 지킨다.
        naverMapClientId={(process.env.NAVER_MAPS_CLIENT_ID || process.env.NAVER_MAP_KEY_ID || "").trim()}
        warning={warning}
      />
    </AppShell>
  );
}
