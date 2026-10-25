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
    <AppShell title="영업 지도" subtitle="거래처와 지자체 방문 기록을 한곳에서 확인합니다">
      <SalesMapClient
        entries={entries}
        naverMapClientId={process.env.NAVER_MAPS_CLIENT_ID?.trim() ?? ""}
        warning={warning}
      />
    </AppShell>
  );
}
