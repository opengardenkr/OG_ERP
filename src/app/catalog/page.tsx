import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell, Section } from "@/components/app-shell";
import { EmptyState, ErrorState } from "@/components/data-state";
import { adoptLinkAction } from "@/app/order-actions";
import { ActionButton, CopyLink } from "@/components/order-program-actions";
import { listPrograms } from "@/lib/airtable/order-programs";
import { won } from "@/lib/sales";

export const metadata = { title: "주문 | 오픈가든", robots: { index: false, follow: false } };

/** 주문: 주문서 폴더 목록. 웹 카탈로그에서 넘어온 선택(og_selection)은 품목 고르기로 바로 보낸다. */
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  if (typeof params.og_selection === "string") redirect(`/catalog/pick?og_selection=${encodeURIComponent(params.og_selection.slice(0, 7000))}`);
  const result = await listPrograms();

  return (
    <AppShell
      title="주문"
      subtitle="주문서를 폴더처럼 저장하고, 회사마다 링크를 배포합니다. 주문서를 고치면 배포한 링크도 같이 바뀝니다."
      action={
        <span className="flex flex-wrap gap-2">
          <Link href="/catalog/pick" className="btn text-sm">주문 바로 접수</Link>
          <Link href="/catalog/pick?program=new" className="btn-primary text-sm">새 주문서</Link>
        </span>
      }
    >
      {!result.ok ? <ErrorState message={result.message} /> : result.data.programs.length === 0 ? (
        <EmptyState message="아직 주문서가 없습니다. [새 주문서]에서 품목을 고르고 저장하세요." />
      ) : (
        <ul className="grid gap-2 lg:grid-cols-2">
          {result.data.programs.map((p) => (
            <li key={p.id}>
              <Link href={`/catalog/${p.id}`} className={`card block p-3 hover:border-brand-600 ${p.status === "보관" ? "opacity-60" : ""}`}>
                <span className="flex flex-wrap items-center gap-1.5">
                  <b className="text-sm">📁 {p.name}</b>
                  {p.status === "보관" ? <span className="chip">보관</span> : null}
                </span>
                <span className="mt-1 block text-xs text-muted">
                  품목 {p.items}종 · 배포 {p.links}곳 · 받은 주문 {p.orders}건{p.amount ? ` · ${won(p.amount)}` : ""}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {result.ok && result.data.loose.length ? (
        <Section title="주문서에 안 묶인 링크">
          <ul className="card divide-y divide-line text-sm">
            {result.data.loose.map((l) => (
              <li key={l.recId} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                <span>
                  <b>{l.title || "제목 없음"}</b>
                  <span className="ml-1.5 text-xs text-muted">{[l.customer, l.created, l.status, l.managed ? "" : "웹이 품목을 직접 읽음"].filter(Boolean).join(" · ")}</span>
                </span>
                <span className="flex flex-wrap items-start gap-1.5">
                  <a className="btn px-2.5 text-xs" href={l.url} target="_blank" rel="noopener noreferrer">열기</a>
                  <CopyLink url={l.url} />
                  <ActionButton action={adoptLinkAction} fields={{ link: l.recId }} label="주문서로 만들기" />
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-1.5 text-xs text-faint">[주문서로 만들기]는 링크의 품목을 글자 그대로 옮겨 폴더로 만듭니다(사진·크레이트 정보 유지). 그 뒤로 같은 품목을 다른 회사에도 배포할 수 있습니다.</p>
        </Section>
      ) : null}
    </AppShell>
  );
}
