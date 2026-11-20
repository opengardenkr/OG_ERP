import Link from "next/link";
import { notFound } from "next/navigation";

import { AppShell } from "@/components/app-shell";
import { ErrorState } from "@/components/data-state";
import { PurchaseOrderForm } from "@/components/purchase-order/form";
import { PurchaseStatus } from "@/components/purchase-order/status";
import { getPurchaseOrder, getSuppliers, purchaseAirtableUrl } from "@/lib/airtable/purchase-orders";

export const metadata = { title: "발주서 | 오픈가든", robots: { index: false, follow: false } };

const RECORD_ID = /^rec[A-Za-z0-9]{14}$/;

/** 발주서 하나: 상태 + 고치기. 인쇄는 새 탭(사이드바 없는 A4 화면). */
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!RECORD_ID.test(id)) notFound();
  const [po, suppliers] = await Promise.all([getPurchaseOrder(id), getSuppliers()]);
  if (po.ok && !po.data) notFound();

  const title = po.ok && po.data ? `${po.data.number} · ${po.data.supplier}` : "발주서";
  return (
    <AppShell
      title={title}
      subtitle="고치고 [저장]하면 인쇄 화면에 바로 반영된다. 보낸 뒤에는 상태를 '발주완료'로 바꿔 둔다."
      action={
        <div className="flex gap-2">
          <Link href="/purchase" className="btn">← 목록</Link>
          {po.ok ? <Link href={`/purchase/${id}/print`} target="_blank" className="btn-primary">인쇄 · PDF</Link> : null}
        </div>
      }
    >
      {!po.ok ? (
        <ErrorState message={po.message} />
      ) : !suppliers.ok ? (
        <ErrorState message={suppliers.message} />
      ) : po.data ? (
        <div className="flex flex-col gap-4">
          <PurchaseStatus id={id} status={po.data.status} />
          {po.data.doc ? (
            <PurchaseOrderForm
              suppliers={suppliers.data}
              initial={{ id, date: po.data.date, supplierId: po.data.supplierId, doc: po.data.doc }}
            />
          ) : (
            <ErrorState message="발주내용JSON을 읽지 못했다. Airtable에서 이 줄을 확인해라." />
          )}
          <p className="text-[11px] text-faint">
            작성 {po.data.author} · <a href={purchaseAirtableUrl(id)} target="_blank" rel="noreferrer" className="hover:underline">Airtable에서 보기</a>
          </p>
          {po.data.memo ? <pre className="card overflow-x-auto p-3 text-[11px] whitespace-pre-wrap text-muted">{po.data.memo}</pre> : null}
        </div>
      ) : null}
    </AppShell>
  );
}
