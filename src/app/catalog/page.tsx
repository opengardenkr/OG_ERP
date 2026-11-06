import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell, Section } from "@/components/app-shell";
import { EmptyState, ErrorState } from "@/components/data-state";
import { adoptLinkAction } from "@/app/order-actions";
import { ActionButton, CopyLink } from "@/components/order-program-actions";
import { OrderTabs } from "@/components/order-tabs";
import { listPrograms, type ProgramSummary } from "@/lib/airtable/order-programs";
import { SUPPLIERS, SUPPLIER_INFO } from "@/lib/order";
import { won } from "@/lib/sales";

export const metadata = { title: "주문 | 오픈가든", robots: { index: false, follow: false } };

/**
 * 주문 › 주문프로그램: 저장한 주문서 폴더를 업체별로 묶어 보인다.
 * 새로 만드는 일은 옆 칸 '주문서 작성'이 한다(업체 고르기 → 품목 고르기 → 저장).
 * 웹 카탈로그에서 넘어온 선택(og_selection)은 품목 고르기로 바로 보낸다.
 */
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  if (typeof params.og_selection === "string") redirect(`/catalog/pick?og_selection=${encodeURIComponent(params.og_selection.slice(0, 7000))}`);
  const result = await listPrograms();
  const programs = result.ok ? result.data.programs : [];
  const groups = [
    ...SUPPLIERS.map((s) => ({ key: s as string, title: SUPPLIER_INFO[s].label, list: programs.filter((p) => p.supplier === s) })),
    { key: "none", title: "업체 미정", list: programs.filter((p) => !p.supplier) },
  ].filter((g) => g.list.length);

  return (
    <AppShell title="주문" subtitle="주문서를 폴더처럼 저장하고 회사마다 링크를 배포합니다. 주문서를 고치면 배포한 링크도 같이 바뀝니다.">
      <OrderTabs active="주문프로그램" />

      {!result.ok ? <ErrorState message={result.message} /> : groups.length === 0 ? (
        <EmptyState message="아직 주문서가 없습니다. 위 [주문서 작성]에서 업체를 고르고 품목을 골라 저장하세요." />
      ) : (
        <div className="space-y-4">
          {groups.map((g) => (
            <section key={g.key}>
              <h2 className="section-title mb-2">{g.title} <span className="text-xs font-normal text-faint">{g.list.length}</span></h2>
              <ProgramList programs={g.list} />
            </section>
          ))}
        </div>
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
                  <ActionButton action={adoptLinkAction} fields={{ link: l.recId }} label="주문프로그램으로 옮기기" />
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-1.5 text-xs text-faint">옮기면 링크의 품목을 글자 그대로 담은 주문서가 생깁니다(사진·크레이트 정보 유지). 업체는 품목을 보고 정합니다.</p>
        </Section>
      ) : null}
    </AppShell>
  );
}

function ProgramList({ programs }: { programs: ProgramSummary[] }) {
  return (
    <ul className="grid gap-2 lg:grid-cols-2">
      {programs.map((p) => (
        <li key={p.id}>
          <Link href={`/catalog/${p.id}`} className={`card block p-3 hover:border-brand-600 ${p.status === "보관" ? "opacity-60" : ""}`}>
            <span className="flex flex-wrap items-center gap-1.5">
              <b className="text-sm">📁 {p.name}</b>
              {p.status === "보관" ? <span className="chip">보관</span> : null}
            </span>
            <span className="mt-1 block text-xs text-muted">
              {p.items ? `품목 ${p.items}종` : "품목 웹에서 읽음"} · 배포 {p.links}곳 · 주문 {p.customers}곳{p.amount ? ` · ${won(p.amount)}` : ""}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
