import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell, Section } from "@/components/app-shell";
import { EmptyState, ErrorState } from "@/components/data-state";
import { adoptLinkAction } from "@/app/order-actions";
import { ActionButton, CopyLink } from "@/components/order-program-actions";
import { Tabs } from "@/components/tabs";
import { listPrograms, type ProgramSummary } from "@/lib/airtable/order-programs";
import { SUPPLIERS, SUPPLIER_INFO, type Supplier } from "@/lib/order";
import { won } from "@/lib/sales";

export const metadata = { title: "주문 | 오픈가든", robots: { index: false, follow: false } };

const NOTE: Record<Supplier, string> = {
  domestic: "국내 라인업 품목 · 주 단위",
  hoogenraad: "호게나르드 라이너(P9) · 주 단위 — 주문확인서와 같은 단위",
  hbm: "구근 라인업·HBM · 크레이트 단위(크레이트당 구수 × 크레이트) — 인보이스와 같은 단위",
};

/**
 * 주문: 주문서 폴더 목록. 위에서 업체(국내 · 호게나르드 · HBM)를 고른다 — 주문서 하나 = 업체 하나.
 * 웹 카탈로그에서 넘어온 선택(og_selection)은 품목 고르기로 바로 보낸다.
 */
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  if (typeof params.og_selection === "string") redirect(`/catalog/pick?og_selection=${encodeURIComponent(params.og_selection.slice(0, 7000))}`);
  const result = await listPrograms();
  const programs = result.ok ? result.data.programs : [];
  const asked = SUPPLIERS.find((s) => s === params.s);
  // 고르지 않았으면 주문서가 있는 첫 업체
  const supplier: Supplier = asked ?? SUPPLIERS.find((s) => programs.some((p) => p.supplier === s)) ?? "domestic";
  const shown = programs.filter((p) => p.supplier === supplier);
  const unset = programs.filter((p) => !p.supplier);

  return (
    <AppShell
      title="주문"
      subtitle="업체별로 주문서를 폴더처럼 저장하고, 회사마다 링크를 배포합니다. 주문서를 고치면 배포한 링크도 같이 바뀝니다."
      action={
        <span className="flex flex-wrap gap-2">
          <Link href="/catalog/pick" className="btn text-sm">주문 바로 접수</Link>
          <Link href={`/catalog/pick?program=new&supplier=${supplier}`} className="btn-primary text-sm">새 {SUPPLIER_INFO[supplier].label} 주문서</Link>
        </span>
      }
    >
      <Tabs
        items={SUPPLIERS.map((s) => ({ href: `/catalog?s=${s}`, label: SUPPLIER_INFO[s].label, count: programs.filter((p) => p.supplier === s).length }))}
        active={SUPPLIER_INFO[supplier].label}
      />
      <p className="-mt-2 mb-3 text-xs text-muted">{NOTE[supplier]}</p>

      {!result.ok ? <ErrorState message={result.message} /> : shown.length === 0 ? (
        <EmptyState message={`${SUPPLIER_INFO[supplier].label} 주문서가 없습니다. [새 ${SUPPLIER_INFO[supplier].label} 주문서]에서 품목을 고르고 저장하세요.`} />
      ) : (
        <ProgramList programs={shown} />
      )}

      {unset.length ? (
        <Section title="업체를 정하지 않은 주문서">
          <ProgramList programs={unset} />
          <p className="mt-1.5 text-xs text-faint">Airtable [영업] 주문서의 `업체` 칸을 채우면 해당 탭으로 옮겨집니다.</p>
        </Section>
      ) : null}

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
          <p className="mt-1.5 text-xs text-faint">[주문서로 만들기]는 링크의 품목을 글자 그대로 옮겨 폴더로 만듭니다(사진·크레이트 정보 유지). 업체는 품목을 보고 정합니다.</p>
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
              품목 {p.items}종 · 배포 {p.links}곳 · 받은 주문 {p.orders}건{p.amount ? ` · ${won(p.amount)}` : ""}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
