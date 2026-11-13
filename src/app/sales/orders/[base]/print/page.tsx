import "@/components/order-sheet/sheet.css";

import Link from "next/link";

import { EmptyState, ErrorState } from "@/components/data-state";
import { PrintButton } from "@/components/genus-proposal/print-button";
import { OrderSheetDocument } from "@/components/order-sheet/document";
import { getOrderSheet } from "@/lib/airtable/sales";

export const metadata = { title: "주문서 | 오픈가든", robots: { index: false, follow: false } };

/** 견적 묶음 번호(OG-20261103-001, 옛 형식 OG-2026318-8705) */
const BASE = /^[A-Z]{2}-\d{6,8}-[0-9A-Z]{1,6}$/;

/** 인쇄용 주문서(가격 없음). 사이드바 없이 A4 쪽만 그린다. [PDF로 저장] → 브라우저 인쇄 창. */
export default async function Page({ params }: { params: Promise<{ base: string }> }) {
  const base = decodeURIComponent((await params).base);
  const result = BASE.test(base) ? await getOrderSheet(base) : null;
  const sheet = result?.ok ? result.data : null;

  return (
    <div className="os-root">
      <div className="os-toolbar">
        <span><b>주문서 {base}</b>{sheet ? ` · ${sheet.company}` : ""} <Link href="/sales/orders">← 주문서 목록</Link></span>
        {sheet ? <PrintButton /> : null}
      </div>
      {result === null ? (
        <div className="p-6"><EmptyState message="주문번호가 올바르지 않습니다." /></div>
      ) : !result.ok ? (
        <div className="p-6"><ErrorState message={result.message} /></div>
      ) : !sheet ? (
        <div className="p-6"><EmptyState message="이 번호로 발행한 주문서가 없습니다. 주문서 목록에서 [주문서 발행]을 먼저 누르세요." /></div>
      ) : (
        <div className="os-holder"><OrderSheetDocument sheet={sheet} /></div>
      )}
    </div>
  );
}
