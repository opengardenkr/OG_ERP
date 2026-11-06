import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { EmptyState, ErrorState } from "@/components/data-state";
import { MarginEditor } from "@/components/margin-editor";
import { SalesTabs } from "@/components/sales-tabs";
import { isAdmin } from "@/config/users";
import { getMarginData } from "@/lib/airtable/sales";
import { auth } from "@/lib/auth";
import { costLines, learnedCosts, marginOf, won } from "@/lib/sales";

export const metadata = { title: "마진 | 오픈가든", robots: { index: false, follow: false } };

const pct = (r: number | null) => (r === null ? "—" : `${(r * 100).toFixed(1)}%`);

export default async function Page({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const session = await auth();
  // 화면을 그리기 전에 서버에서 막는다. 메뉴에서 숨기는 것만으로는 주소를 직접 치면 열린다.
  if (!isAdmin(session?.user.member)) {
    return (
      <AppShell title="매출">
        <SalesTabs active="미수금" admin={false} />
        <EmptyState message="마진은 대표만 볼 수 있습니다." />
      </AppShell>
    );
  }
  const withQuotes = (await searchParams).q === "1";
  const result = await getMarginData(withQuotes);

  return (
    <AppShell title="매출" subtitle="판매건별 마진. 원가를 모르는 품목은 직접 적으면 다음 건부터 자동으로 채워집니다.">
      <SalesTabs active="마진" admin />
      <p className="mb-3 flex flex-wrap gap-2 text-xs">
        <Link href="/sales/margin" className={`chip ${withQuotes ? "" : "font-semibold"}`}>판매건만</Link>
        <Link href="/sales/margin?q=1" className={`chip ${withQuotes ? "font-semibold" : ""}`}>발송한 견적도</Link>
      </p>
      {!result.ok ? <ErrorState message={result.message} /> : result.data.sales.length === 0 ? (
        <EmptyState message="판매건이 없습니다." />
      ) : <Margins {...result.data} />}
    </AppShell>
  );
}

function Margins({ sales, catalog }: { sales: Parameters<typeof learnedCosts>[0]; catalog: Map<string, number> }) {
  const learned = learnedCosts(sales);
  const rows = sales.map((s) => {
    const lines = costLines(s, catalog, learned);
    return { s, lines, m: marginOf(s, lines) };
  });
  const done = rows.filter((r) => r.m.missing === 0);
  const sum = (k: "revenue" | "cost" | "margin") => done.reduce((a, r) => a + r.m[k], 0);
  const revenue = sum("revenue");

  return (
    <>
      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label={`매출 (원가 확인 ${done.length}건)`} value={won(revenue)} />
        <Stat label="원가" value={won(sum("cost"))} />
        <Stat label="마진" value={won(sum("margin"))} />
        <Stat label="마진율" value={pct(revenue > 0 ? sum("margin") / revenue : null)} />
      </div>
      <ul className="space-y-2">
        {rows.map(({ s, lines, m }) => (
          <li key={s.id}>
            <details className="card group">
              <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2.5 text-sm">
                <span className="min-w-0 flex-1">
                  <b>{s.company || "거래처 없음"}</b>
                  <span className="ml-1.5 font-mono text-xs text-muted">{s.number}</span>
                  <span className="chip ml-1.5">{s.status}</span>
                </span>
                <span className="text-xs text-muted">매출 {won(m.revenue)}</span>
                {m.missing ? (
                  <span className="chip text-danger">원가 미확인 {m.missing}품목</span>
                ) : (
                  <span className={m.margin < 0 ? "font-bold text-danger" : "font-bold"}>{won(m.margin)} · {pct(m.rate)}</span>
                )}
              </summary>
              <div className="border-t border-line px-3 py-3">
                <MarginEditor id={s.id} lines={lines} />
              </div>
            </details>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-xs text-faint">
        매출 = 공급가액(부가세 제외, 할인 반영). 원가 찾는 순서: 이 건에 직접 적은 값 → 호게나르드 DM 총원가(₩) → 다른 판매건에 적은 값.
        다른 라인업 표에는 아직 원가 칸이 비어 있습니다. 직접 적은 원가는 견적서의 원가JSON 칸에 저장됩니다.
        이 화면은 대표만 열리지만, Airtable 표는 두 사람 모두 열 수 있습니다.
      </p>
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="card px-3 py-2.5">
      <p className="text-[11px] text-muted">{label}</p>
      <p className="mt-0.5 text-sm font-bold sm:text-base">{value}</p>
    </div>
  );
}
