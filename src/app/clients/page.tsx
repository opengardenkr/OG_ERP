import { AppShell } from "@/components/app-shell";
import { ClientList } from "@/components/client-list";
import { EmptyState, ErrorState } from "@/components/data-state";
import { getClients } from "@/lib/airtable/clients";

export const metadata = { title: "거래처 | 오픈가든", robots: { index: false, follow: false } };

export default async function Page() {
  const result = await getClients();
  return (
    <AppShell title="거래처" subtitle="연락처·명함·영업일지를 한곳에서. 이름을 누르면 상세가 열립니다.">
      {!result.ok ? <ErrorState message={result.message} />
        : result.data.length === 0 ? <EmptyState message="등록된 거래처가 없습니다." />
        : <ClientList clients={result.data} />}
    </AppShell>
  );
}
