import "@/components/purchase-order/po.css";

import type { Metadata } from "next";
import Link from "next/link";
import { cache } from "react";

import { EmptyState, ErrorState } from "@/components/data-state";
import { PrintButton } from "@/components/genus-proposal/print-button";
import { PurchaseOrderDocument } from "@/components/purchase-order/document";
import { FitWidth } from "@/components/purchase-order/fit-width";
import { getPurchaseOrder } from "@/lib/airtable/purchase-orders";

const RECORD_ID = /^rec[A-Za-z0-9]{14}$/;

/** 제목과 본문이 같은 읽기를 나눠 쓴다(Airtable 한 번). */
const load = cache((id: string) => getPurchaseOrder(id));

/** PDF로 저장할 때 파일 이름이 문서 제목을 따른다: "PO-20261120-001 Hoogenraad Handelskwekerijen B.V." */
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const result = RECORD_ID.test(id) ? await load(id) : null;
  const po = result?.ok ? result.data : null;
  return { title: po ? `${po.number} ${po.supplier}` : "Purchase Order", robots: { index: false, follow: false } };
}

/** 인쇄용 영문 발주서. 사이드바 없이 A4 쪽만 그린다. [PDF로 저장] → 브라우저 인쇄 창. */
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const result = RECORD_ID.test(id) ? await load(id) : null;
  const po = result?.ok ? result.data : null;

  return (
    <div className="po-root">
      <div className="po-toolbar">
        <span>
          <b>{po ? po.number : "발주서"}</b>{po ? ` · ${po.supplier}` : ""}{" "}
          <Link href={po ? `/purchase/${id}` : "/purchase"}>← 고치기</Link>
        </span>
        {po?.doc ? <PrintButton /> : null}
      </div>
      {result === null ? (
        <div className="p-6"><EmptyState message="발주서 주소가 올바르지 않다." /></div>
      ) : !result.ok ? (
        <div className="p-6"><ErrorState message={result.message} /></div>
      ) : !po ? (
        <div className="p-6"><EmptyState message="이 발주서를 찾지 못했다(삭제함으로 옮겼을 수 있다)." /></div>
      ) : !po.doc ? (
        <div className="p-6"><ErrorState message="발주내용JSON을 읽지 못했다." /></div>
      ) : (
        <FitWidth><PurchaseOrderDocument number={po.number} date={po.date} doc={po.doc} /></FitWidth>
      )}
    </div>
  );
}
