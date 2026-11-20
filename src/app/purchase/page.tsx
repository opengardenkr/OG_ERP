import Link from "next/link";
import { Suspense } from "react";

import { AppShell } from "@/components/app-shell";
import { EmptyState, ErrorState } from "@/components/data-state";
import { getPurchaseOrders } from "@/lib/airtable/purchase-orders";
import { formatAmount, type PoStatus } from "@/lib/purchase-order";

export const metadata = { title: "발주서 | 오픈가든", robots: { index: false, follow: false } };

const TONE: Record<PoStatus, string> = {
  작성: "bg-canvas text-muted",
  발주완료: "bg-[#e9f2ff] text-[#0055cc]",
  공급업체확인: "bg-brand-50 text-brand-600",
  부분입고: "bg-[#fff7d6] text-[#7f5f01]",
  입고완료: "bg-brand-50 text-brand-700",
  취소: "bg-[#ffe2dd] text-[#ae2e24]",
};

async function PurchaseList() {
  const result = await getPurchaseOrders();
  if (!result.ok) return <ErrorState message={result.message} />;
  if (result.data.length === 0) {
    return <EmptyState message="아직 발주서가 없다. [새 발주서]로 공급업체를 고르고 품목을 적으면 영문 A4 발주서가 나온다." />;
  }
  return (
    <ul className="flex flex-col gap-2">
      {result.data.map((po) => (
        <li key={po.id} className="card flex flex-wrap items-center gap-x-4 gap-y-2 p-3">
          <div className="min-w-0 flex-1 basis-[240px]">
            <div className="flex flex-wrap items-center gap-2">
              <Link href={`/purchase/${po.id}`} className="text-sm font-semibold text-ink hover:underline">{po.supplier || "(공급업체 없음)"}</Link>
              <span className={`chip ${TONE[po.status]}`}>{po.status}</span>
            </div>
            <p className="mt-0.5 text-xs text-muted">{po.number} · {po.date} · {po.count}품목 · {po.author}</p>
          </div>
          <p className="text-sm font-semibold tabular-nums">{po.total === null ? "—" : `${po.currency} ${formatAmount(po.total, po.currency)}`}</p>
          <div className="flex gap-2">
            <Link href={`/purchase/${po.id}`} className="btn">열기</Link>
            <Link href={`/purchase/${po.id}/print`} target="_blank" className="btn">인쇄 · PDF</Link>
          </div>
        </li>
      ))}
    </ul>
  );
}

export default function PurchasePage() {
  return (
    <AppShell
      title="발주서"
      subtitle="공급업체에 보내는 영문 발주서(Purchase Order). 통화를 골라 쓰고 A4로 인쇄하거나 PDF로 저장한다."
      action={<Link href="/purchase/new" className="btn-primary">새 발주서</Link>}
    >
      <Suspense fallback={<p role="status" className="card p-4 text-sm text-muted">발주서를 불러오는 중…</p>}>
        <PurchaseList />
      </Suspense>
    </AppShell>
  );
}
