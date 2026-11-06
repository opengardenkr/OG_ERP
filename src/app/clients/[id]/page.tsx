/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell, Section } from "@/components/app-shell";
import { EmptyState, ErrorState } from "@/components/data-state";
import { clientAirtableUrl, getClient } from "@/lib/airtable/clients";
import { getQuotesFor, quoteAirtableUrl } from "@/lib/airtable/sales";
import { phoneDigits, type SalesLog } from "@/lib/client-types";
import { balanceOf, isSale, sameCompany, won } from "@/lib/sales";

export const metadata = { title: "거래처 | 오픈가든", robots: { index: false, follow: false } };

const LOG_FIELDS: [keyof SalesLog, string][] = [
  ["purpose", "방문 목적"], ["request", "고객 요청"], ["interest", "관심·요청 품목"],
  ["pain", "불편 사항"], ["next", "다음 플랜"], ["misc", "기타 메모"],
];

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const result = await getClient(id);
  if (result.ok && !result.data) notFound();
  if (!result.ok) return <AppShell title="거래처"><ErrorState message={result.message} /></AppShell>;
  const c = result.data!;
  const quotes = await getQuotesFor((company) => sameCompany(company, c.name));
  const tel = phoneDigits(c.phone);
  const isUrl = /^https?:\/\//i.test(c.address);

  return (
    <AppShell
      title={c.name}
      subtitle={[c.kind, c.ceo && `대표 ${c.ceo}`, c.manager && `담당 ${c.manager}`].filter(Boolean).join(" · ") || undefined}
      action={<Link href="/clients" className="btn text-sm">← 목록</Link>}
    >
      <div className="card flex flex-wrap gap-2 p-3">
        {tel ? <a className="btn-primary" href={`tel:${tel}`}>전화 {c.phone}</a> : <span className="text-sm text-muted">연락처 없음</span>}
        {tel ? <a className="btn" href={`sms:${tel}`}>문자</a> : null}
        {c.email ? <a className="btn" href={`mailto:${c.email}`}>메일</a> : null}
        {c.address && !isUrl ? <a className="btn" href={`https://map.naver.com/p/search/${encodeURIComponent(c.address)}`} target="_blank" rel="noopener noreferrer">네이버 지도 ↗</a> : null}
        <a className="btn ml-auto text-xs" href={clientAirtableUrl(c.id)} target="_blank" rel="noopener noreferrer">Airtable에서 고치기 ↗</a>
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,1fr)_280px]">
        <div className="card space-y-1.5 p-3 text-sm">
          {c.address ? <p><span className="text-muted">주소 </span>{c.address}</p> : null}
          {c.bizNo ? <p><span className="text-muted">사업자번호 </span>{c.bizNo}</p> : null}
          {c.email ? <p><span className="text-muted">이메일 </span>{c.email}</p> : null}
          {c.online ? <p className="text-muted">온라인 판매 중</p> : null}
          {c.notes ? <p className="whitespace-pre-wrap border-t border-line pt-2">{c.notes}</p> : null}
          {!c.address && !c.bizNo && !c.email && !c.notes ? <p className="text-muted">등록된 정보가 없습니다.</p> : null}
        </div>
        <div className="card p-3">
          <h2 className="section-title mb-2">명함</h2>
          {c.cards.length ? (
            <div className="grid grid-cols-2 gap-2">
              {c.cards.map((p) => (
                <a key={p.url} href={p.url} target="_blank" rel="noopener noreferrer" className="block overflow-hidden rounded border border-line">
                  <img src={p.thumb} alt={`${c.name} ${p.filename}`} className="aspect-[4/3] w-full bg-canvas object-contain" />
                </a>
              ))}
            </div>
          ) : <p className="text-sm text-muted">명함 사진이 없습니다.</p>}
        </div>
      </div>

      <Section title="견적·판매" action={<Link href="/sales/receivables" className="text-xs text-muted hover:text-ink">미수금 전체 →</Link>}>
        {!quotes.ok ? <ErrorState message={quotes.message} /> : quotes.data.length === 0 ? (
          <p className="text-sm text-muted">이 이름으로 낸 견적이 없습니다. (견적서의 거래처명이 거래처 이름과 같아야 묶입니다)</p>
        ) : (
          <ul className="card divide-y divide-line text-sm">
            {quotes.data.slice(0, 12).map((q) => {
              const due = isSale(q.status) ? balanceOf(q) : 0;
              return (
                <li key={q.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                  <span className="flex flex-wrap items-center gap-1.5">
                    <a href={quoteAirtableUrl(q.id)} target="_blank" rel="noopener noreferrer" className="font-mono text-xs hover:underline">{q.number}</a>
                    <span className="chip">{q.status || "상태 없음"}</span>
                    <span className="text-xs text-muted">{q.issued}</span>
                  </span>
                  <span className="text-right">
                    {won(q.total)}
                    {due > 0 ? <span className="ml-2 text-xs font-semibold text-danger">미수 {won(due)}</span> : null}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </Section>

      <Section title={`영업일지 ${c.logs.length}건`}>
        {c.logs.length ? (
          <ol className="space-y-2">
            {c.logs.map((log) => (
              <li key={log.id} className="card p-3 text-sm">
                <p className="flex flex-wrap items-center gap-1.5">
                  <b>{log.date || "날짜 없음"}</b>
                  {log.author ? <span className="chip">{log.author}</span> : null}
                  {log.visit ? <span className="chip">{log.visit}</span> : null}
                  {log.proposalSent ? <span className="chip">제안서 발송</span> : null}
                </p>
                <dl className="mt-1.5 space-y-1">
                  {LOG_FIELDS.filter(([k]) => log[k]).map(([k, label]) => (
                    <div key={k} className="grid gap-x-3 sm:grid-cols-[100px_minmax(0,1fr)]">
                      <dt className="text-xs text-muted">{label}</dt>
                      <dd className="whitespace-pre-wrap">{String(log[k])}</dd>
                    </div>
                  ))}
                </dl>
              </li>
            ))}
          </ol>
        ) : <EmptyState message="이 거래처에 연결된 영업일지가 없습니다." />}
      </Section>
    </AppShell>
  );
}
