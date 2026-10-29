import { AppShell } from "@/components/app-shell";
import { EmptyState, ErrorState } from "@/components/data-state";
import { ProposalDocument } from "@/components/genus-proposal/document";
import { getGenera, getGenusProposal } from "@/lib/airtable/genus-proposal";
import { proposalTitle, readParams, todayLabel, toQuery } from "@/lib/genus-proposal-params";

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = readParams(await searchParams);
  const [genera, result] = await Promise.all([
    getGenera(),
    params.genus ? getGenusProposal(params.genus, params.q, !params.all) : Promise.resolve(null),
  ]);
  const ready = result?.ok && result.data.cards.length > 0;

  return (
    <AppShell
      title="속명 제안서"
      subtitle="속명을 고르면 재고 있는 품종으로 3×2 제안서를 만듭니다. 가격·재고는 호게나르드 DM, 사진·특징은 식물 등록 마스터에서 읽습니다."
      action={ready ? (
        <a className="btn-primary" href={`/proposal/genus/print?${toQuery(params)}`} target="_blank" rel="noopener">
          인쇄용 열기
        </a>
      ) : null}
    >
      {genera.ok ? (
        <form method="get" className="card flex flex-wrap items-end gap-3 p-3">
          <label className="flex flex-col gap-1 text-xs text-muted">
            속명
            <select name="genus" defaultValue={params.genus} className="field min-w-[160px]" required>
              <option value="" disabled>고르세요</option>
              {genera.data.map((g) => (
                <option key={g.genus} value={g.genus}>{g.genus} · 재고 {g.inStock}규격</option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted">
            이름 포함 (선택)
            <input name="q" defaultValue={params.q} placeholder="예: 리빙, Living" className="field w-[160px]" />
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted">
            제목 (선택)
            <input name="title" defaultValue={params.title} placeholder={proposalTitle({ ...params, title: "" }) } className="field w-[240px]" />
          </label>
          <label className="flex items-center gap-1.5 pb-2 text-sm text-muted">
            <input type="checkbox" name="all" value="1" defaultChecked={params.all} />
            재고 없는 규격도 넣기
          </label>
          <button type="submit" className="btn-primary">만들기</button>
        </form>
      ) : (
        <ErrorState message={genera.message} />
      )}

      {result === null ? (
        <div className="mt-4"><EmptyState message="속명을 고르고 [만들기]를 누르세요." /></div>
      ) : !result.ok ? (
        <div className="mt-4"><ErrorState message={result.message} /></div>
      ) : result.data.cards.length === 0 ? (
        <div className="mt-4"><EmptyState message="조건에 맞는 재고 품종이 없습니다. 이름 포함 조건을 비우거나 다른 속명을 고르세요." /></div>
      ) : (
        <>
          <div className="card mt-4 flex flex-col gap-1.5 p-3 text-sm">
            <p>
              <b>{result.data.cards.length}품종 · {result.data.rowCount}규격</b>
              {result.data.stockDate ? <span className="text-muted"> · 재고 기준일 {result.data.stockDate}</span> : null}
              {result.data.draft ? <span className="text-muted"> · AI 초안 정보 {result.data.draft}품종 (마스터에서 검토완료로 바꿔 주세요)</span> : null}
            </p>
            {result.data.missing.length ? (
              <p className="text-danger">
                품종 정보·사진이 없는 품종: {result.data.missing.join(", ")} — Claude에게 &quot;{params.genus} 품종 정보 채워줘&quot;라고 하면 식물 등록 마스터에 채웁니다.
              </p>
            ) : null}
            {result.data.needsCheck.length ? (
              <p className="text-danger">확인 필요: {result.data.needsCheck.join(", ")} (식물 등록 마스터의 검토 메모 참고)</p>
            ) : null}
          </div>
          <div className="mt-4 overflow-x-auto rounded-[3px] bg-[#e9ebe6] px-2">
            <ProposalDocument proposal={result.data} title={proposalTitle(params)} date={todayLabel()} />
          </div>
        </>
      )}
    </AppShell>
  );
}
