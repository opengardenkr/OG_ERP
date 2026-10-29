import Link from "next/link";
import { EmptyState, ErrorState } from "@/components/data-state";
import { ProposalDocument } from "@/components/genus-proposal/document";
import { PrintButton } from "@/components/genus-proposal/print-button";
import { getGenusProposal } from "@/lib/airtable/genus-proposal";
import { proposalTitle, readParams, todayLabel, toQuery } from "@/lib/genus-proposal-params";

/** 인쇄용. 사이드바 없이 A4 쪽만 그린다. [PDF로 저장] → 브라우저 인쇄 창에서 PDF로 저장. */
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = readParams(await searchParams);
  const result = params.genus ? await getGenusProposal(params.genus, params.q, !params.all) : null;
  const title = proposalTitle(params);

  return (
    <div className="gp-print-root gp-root">
      <div className="gp-toolbar">
        <span><b>{title}</b> <Link href={`/proposal/genus?${toQuery(params)}`}>← 조건 바꾸기</Link></span>
        {result?.ok && result.data.cards.length ? <PrintButton /> : null}
      </div>
      {result === null ? (
        <div className="p-6"><EmptyState message="속명이 없습니다. 속명 제안서 화면에서 다시 여세요." /></div>
      ) : !result.ok ? (
        <div className="p-6"><ErrorState message={result.message} /></div>
      ) : result.data.cards.length === 0 ? (
        <div className="p-6"><EmptyState message="조건에 맞는 재고 품종이 없습니다." /></div>
      ) : (
        <ProposalDocument proposal={result.data} title={title} date={todayLabel()} />
      )}
    </div>
  );
}
