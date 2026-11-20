import Link from "next/link";
import { Suspense } from "react";

import { AppShell } from "@/components/app-shell";
import { ErrorState } from "@/components/data-state";
import { PurchaseOrderForm } from "@/components/purchase-order/form";
import { getSuppliers } from "@/lib/airtable/purchase-orders";
import { todayInSeoul } from "@/lib/date";

export const metadata = { title: "새 발주서 | 오픈가든", robots: { index: false, follow: false } };

async function NewForm() {
  const suppliers = await getSuppliers();
  if (!suppliers.ok) return <ErrorState message={suppliers.message} />;
  return <PurchaseOrderForm suppliers={suppliers.data} initial={{ id: null, date: todayInSeoul(), supplierId: null, doc: null }} />;
}

export default function NewPurchasePage() {
  return (
    <AppShell
      title="새 발주서"
      subtitle="문서는 영어로 찍힌다 — 품명·조건·비고를 영어로 적는다. 만들면 번호가 붙고 인쇄 화면이 열린다."
      action={<Link href="/purchase" className="btn">← 목록</Link>}
    >
      <Suspense fallback={<p role="status" className="card p-4 text-sm text-muted">공급업체를 불러오는 중…</p>}>
        <NewForm />
      </Suspense>
    </AppShell>
  );
}
