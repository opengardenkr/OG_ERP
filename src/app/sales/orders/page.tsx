import Link from "next/link";

import { AppShell, Section } from "@/components/app-shell";
import { EmptyState, ErrorState } from "@/components/data-state";
import { SheetAction } from "@/components/order-sheet-actions";
import { SalesTabs } from "@/components/sales-tabs";
import { isAdmin } from "@/config/users";
import { getOrderSheets, quoteAirtableUrl } from "@/lib/airtable/sales";
import { auth } from "@/lib/auth";
import { seoulDate } from "@/lib/date";
import { balanceOf, pickList, sinceOf, won, type OrderSheet, type Sale } from "@/lib/sales";

export const metadata = { title: "주문서 | 오픈가든", robots: { index: false, follow: false } };

const n = (x: number) => Math.round(x).toLocaleString("ko-KR");

/**
 * 매출 › 주문서: 가격 없는 물류용 주문서. 다 받으면(완납) 입금을 적는 순간 저절로 발행되고,
 * 후불 판매는 [주문서 발행]으로 낸다. 현물이 오면 품목별 합계로 나누고, 주문서를 인쇄해 싸서 보낸 뒤 [출고 완료].
 */
export default async function Page() {
  const [session, result] = await Promise.all([auth(), getOrderSheets()]);
  return (
    <AppShell title="매출" subtitle="가격 없는 주문서(물류용). 다 받으면 저절로 발행되고, 현물이 들어오면 이걸로 나누고 싸서 보냅니다.">
      <SalesTabs active="주문서" admin={isAdmin(session?.user.member)} />
      {!result.ok ? <ErrorState message={result.message} /> : <Sheets {...result.data} />}
    </AppShell>
  );
}

function Sheets({ sheets, waiting, shippedMore }: { sheets: OrderSheet[]; waiting: Sale[]; shippedMore: number }) {
  const open = sheets.filter((s) => !s.shippedAt);
  const shipped = sheets.filter((s) => s.shippedAt);
  const picks = pickList(open);
  return (
    <>
      <div className="mb-4 grid grid-cols-3 gap-2">
        <Stat label="출고 전 주문서" value={`${open.length}건`} />
        <Stat label="출고 전 품목" value={`${picks.length}종 · ${n(picks.reduce((a, r) => a + r.qty, 0))}`} />
        <Stat label="발행 전 판매" value={`${waiting.length}건`} warn={waiting.length > 0} />
      </div>

      <Section title={`출고 전 주문서 ${open.length}건`}>
        {open.length === 0 ? <EmptyState message="출고 전 주문서가 없습니다. 판매 건의 입금을 다 적으면 여기에 쌓입니다." /> : (
          <div className="space-y-3">{open.map((s) => <SheetCard key={s.id} s={s} />)}</div>
        )}
      </Section>

      {picks.length ? (
        <Section title="품목별 합계(출고 전)">
          <div className="card overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-canvas text-left text-xs text-muted">
                <tr><th className="px-3 py-2 font-medium">품명</th><th className="px-2 py-2 font-medium">규격</th><th className="px-2 py-2 text-right font-medium">수량</th><th className="px-3 py-2 font-medium">나눌 곳</th></tr>
              </thead>
              <tbody className="divide-y divide-line">
                {picks.map((r) => (
                  <tr key={`${r.name}|${r.spec}`}>
                    <td className="px-3 py-2">{r.name}</td>
                    <td className="px-2 py-2 text-muted">{r.spec}</td>
                    <td className="whitespace-nowrap px-2 py-2 text-right font-semibold">{n(r.qty)} {r.unit}</td>
                    <td className="px-3 py-2 text-xs text-muted">{r.orders.map((o) => `${o.company || o.base} ${n(o.qty)}`).join(" · ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-1 text-xs text-faint">현물이 들어오면 이 표로 입고 수량을 맞춰 보고 주문서마다 나눕니다. 이름·규격이 같은 줄을 더했습니다.</p>
        </Section>
      ) : null}

      {waiting.length ? (
        <Section title={`주문서 발행 전 판매 ${waiting.length}건`}>
          <ul className="card divide-y divide-line">
            {waiting.map((w) => (
              <li key={w.id} className="flex flex-wrap items-start gap-x-3 gap-y-1.5 px-3 py-2.5 text-sm">
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-1.5">
                    <b>{w.company || "거래처 없음"}</b>
                    <a href={quoteAirtableUrl(w.id)} target="_blank" rel="noopener noreferrer" className="font-mono text-xs hover:underline">{w.number}</a>
                    <span className="chip">{w.status}</span>
                  </p>
                  <p className="mt-0.5 text-xs text-muted">
                    {sinceOf(w) || "날짜 없음"} · {w.lines.length}품목 · 합계 {won(w.total)}{balanceOf(w) > 0 ? <span className="text-danger"> · 받을 돈 {won(balanceOf(w))}</span> : " · 다 받음"}
                  </p>
                </div>
                <SheetAction id={w.id} kind="issue" label={`${w.company} ${w.number}`} />
              </li>
            ))}
          </ul>
          <p className="mt-1 text-xs text-faint">입금이 끝나면 저절로 발행됩니다. 후불(관급 등)처럼 먼저 보내야 하는 건만 여기서 발행하세요.</p>
        </Section>
      ) : null}

      <Section title="출고한 주문서">
        {shipped.length === 0 ? <EmptyState message="아직 출고한 주문서가 없습니다." /> : (
          <details className="card">
            <summary className="cursor-pointer px-3 py-2 text-sm">최근 {shipped.length}건{shippedMore ? ` (더 오래된 ${shippedMore}건은 Airtable 출고일시)` : ""}</summary>
            <ul className="divide-y divide-line border-t border-line">
              {shipped.map((s) => (
                <li key={s.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-sm">
                  <span className="min-w-0 flex-1"><b>{s.company}</b> <span className="font-mono text-xs text-muted">{s.base}</span> <span className="text-xs text-muted">· 출고 {seoulDate(s.shippedAt)} · {s.lines.length}품목</span></span>
                  <Link href={`/sales/orders/${encodeURIComponent(s.base)}/print`} className="btn px-2.5 text-xs">주문서</Link>
                  <SheetAction id={s.id} kind="unship" label={`${s.company} ${s.base}`} />
                </li>
              ))}
            </ul>
          </details>
        )}
      </Section>
    </>
  );
}

function SheetCard({ s }: { s: OrderSheet }) {
  const total = s.lines.reduce((a, l) => a + l.qty, 0);
  return (
    <section className="card overflow-hidden">
      <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line bg-canvas px-3 py-2">
        <span className="flex flex-wrap items-baseline gap-1.5">
          <b className="text-sm">{s.company || "거래처 없음"}</b>
          <span className="font-mono text-xs text-muted">{s.base}</span>
          {s.number !== s.base ? <span className="text-xs text-muted">(견적 {s.number})</span> : null}
        </span>
        <span className="text-xs text-muted">발행 {seoulDate(s.sheetAt)} · <span className="chip">{s.status}</span></span>
      </header>
      <div className="space-y-2 px-3 py-2.5 text-sm">
        <p className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted">
          <span>담당 {s.person || "-"}</span>
          {s.phone ? <a href={`tel:${s.phone.replace(/[^\d+]/g, "")}`} className="text-brand-600 underline">{s.phone}</a> : <span>연락처 없음</span>}
          <span>배송지 {s.address || "미확인"}</span>
        </p>
        {s.balance > 0 ? <p className="text-xs text-danger">받을 돈 {won(s.balance)}이 남아 있습니다(후불이거나 입금 취소).</p> : null}
        <ul className="divide-y divide-line rounded border border-line">
          {s.lines.map((l, i) => (
            <li key={i} className="flex items-baseline justify-between gap-2 px-2.5 py-1.5">
              <span className="min-w-0">{l.name} <span className="text-xs text-muted">{l.spec}</span></span>
              <b className="whitespace-nowrap">{n(l.qty)} {s.unit}</b>
            </li>
          ))}
          <li className="flex justify-between bg-canvas px-2.5 py-1.5 text-xs text-muted"><span>총 {s.lines.length}품목</span><span>{n(total)} {s.unit}</span></li>
        </ul>
        {s.notes.length ? <p className="whitespace-pre-line text-xs text-muted">{s.notes.join("\n")}</p> : null}
        <div className="flex flex-wrap items-start justify-end gap-2">
          <Link href={`/sales/orders/${encodeURIComponent(s.base)}/print`} className="btn px-2.5 text-xs">인쇄 · PDF</Link>
          <SheetAction id={s.id} kind="ship" label={`${s.company} ${s.base}`} />
        </div>
      </div>
    </section>
  );
}

function Stat({ label, value, warn = false }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className="card px-3 py-2.5">
      <p className="text-[11px] text-muted">{label}</p>
      <p className={`mt-0.5 text-sm font-bold sm:text-base ${warn ? "text-danger" : ""}`}>{value}</p>
    </div>
  );
}
