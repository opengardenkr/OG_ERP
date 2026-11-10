import { Suspense } from "react";
import { AppShell } from "@/components/app-shell";
import { EmptyState } from "@/components/data-state";
import { ProgramCards } from "@/components/program-cards";
import { getPrograms } from "@/lib/airtable/programs";

export const metadata = {
  title: "외부 사이트 | 오픈가든",
  robots: { index: false, follow: false },
};

async function ExternalSites() {
  const result = await getPrograms();
  if (!result.ok) return <ProgramCards result={result} />;

  // Reuse the program registry; internal ERP tools remain in their own menus.
  const sites = result.data.filter((program) => {
    try {
      const url = new URL(program.href);
      return url.protocol === "https:" || url.protocol === "http:";
    } catch {
      return false;
    }
  });

  if (sites.length === 0) {
    return <EmptyState message="등록된 외부 사이트가 없습니다." />;
  }
  return <ProgramCards result={{ ok: true, data: sites }} />;
}

export default function ExternalSitesPage() {
  return (
    <AppShell title="외부 사이트" subtitle="도슨트와 외부 업무 사이트를 한곳에서 엽니다.">
      <Suspense fallback={<p role="status" className="card p-4 text-sm text-muted">외부 사이트를 불러오는 중…</p>}>
        <ExternalSites />
      </Suspense>
    </AppShell>
  );
}
