import Link from "next/link";
import { AppShell, Section } from "@/components/app-shell";
import { EmptyState, ErrorState } from "@/components/data-state";
import { Ledger, PaymentForm } from "@/components/payment-form";
import { SalesTabs } from "@/components/sales-tabs";
import { getSalesOverview, quoteAirtableUrl } from "@/lib/airtable/sales";
import { auth } from "@/lib/auth";
import { isAdmin } from "@/config/users";
import { todayInSeoul } from "@/lib/date";
import { balanceOf, groupReceivables, overpaidOf, paidOf, sinceOf, won, type Sale } from "@/lib/sales";

export const metadata = { title: "미수금 | 오픈가든", robots: { index: false, follow: false } };

export default async function Page() {
  const [session, result] = await Promise.all([auth(), getSalesOverview()]);
  const today = todayInSeoul();
  const admin = isAdmin(session?.user.member);

  return (
    <AppShell title="매출" subtitle="판매 건의 받을 돈과 돌려줄 돈. 돈이 오갈 때마다 한 줄씩 적습니다 — 나눠 받으면 받을 때마다, 차액을 돌려주면 환불로.">
      <SalesTabs active="미수금" admin={admin} />
      {!result.ok ? <ErrorState message={result.message} /> : <Receivables sales={result.data.sales} open={result.data.open} today={today} />}
    </AppShell>
  );
}

function Receivables({ sales, open, today }: { sales: Sale[]; open: Sale[]; today: string }) {
  const groups = groupReceivables(sales, today);
  const total = groups.reduce((a, g) => a + g.balance, 0);
  const late = groups.flatMap((g) => g.sales).filter((s) => s.age > 30).reduce((a, s) => a + s.balance, 0);
  const refunds = sales.filter((s) => overpaidOf(s) > 0);
  const paid = sales.filter((s) => balanceOf(s) === 0 && overpaidOf(s) === 0 && paidOf(s) > 0).slice(0, 10);

  return (
    <>
      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="받을 돈" value={won(total)} />
        <Stat label="건수" value={`${groups.reduce((a, g) => a + g.sales.length, 0)}건 · ${groups.length}곳`} />
        <Stat label="30일 넘음" value={won(late)} warn={late > 0} />
        <Stat label="돌려줄 돈" value={won(refunds.reduce((a, s) => a + overpaidOf(s), 0))} warn={refunds.length > 0} />
      </div>

      {refunds.length ? (
        <Section title={`돌려줄 돈 ${refunds.length}건`}>
          <ul className="card divide-y divide-line">{refunds.map((s) => <Row key={s.id} s={s} today={today} amount={overpaidOf(s)} danger />)}</ul>
          <p className="mt-1 text-xs text-faint">받은 돈이 합계보다 많습니다(수정본으로 수량·금액이 줄었거나 더 받음). 돌려주면 [환불]로 적습니다.</p>
        </Section>
      ) : null}

      {groups.length === 0 ? <EmptyState message="받을 돈이 남은 판매가 없습니다." /> : (
        <div className="space-y-3">
          {groups.map((g) => (
            <section key={g.company} className="card overflow-hidden">
              <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line bg-canvas px-3 py-2">
                <b className="text-sm">{g.company}</b>
                <span className="text-sm"><b>{won(g.balance)}</b><span className="ml-2 text-xs text-muted">가장 오래된 건 {g.oldest}일</span></span>
              </header>
              <ul className="divide-y divide-line">{g.sales.map((s) => <Row key={s.id} s={s} today={today} amount={s.balance} age={s.age} />)}</ul>
            </section>
          ))}
        </div>
      )}

      {open.length ? (
        <Section title="판매 전에 받은 돈(선금)">
          <details className="card">
            <summary className="cursor-pointer px-3 py-2 text-sm">보낸 견적 {open.length}건 — 선금을 받았으면 여기서 적습니다{open.some((q) => q.ledger) ? ` · 받은 기록 ${open.filter((q) => paidOf(q) > 0).length}건` : ""}</summary>
            <ul className="divide-y divide-line border-t border-line">{open.map((s) => <Row key={s.id} s={s} today={today} amount={balanceOf(s)} only="입금" />)}</ul>
          </details>
          <p className="mt-1 text-xs text-faint">받은 돈은 견적 묶음(수정본 포함)을 따라가서, 수주확정하면 그대로 미수금에 반영됩니다.</p>
        </Section>
      ) : null}

      <Section title="최근 완납">
        {paid.length ? (
          <ul className="card divide-y divide-line text-sm">
            {paid.map((s) => (
              <li key={s.id} className="flex flex-wrap justify-between gap-2 px-3 py-2">
                <span>{s.company} <span className="font-mono text-xs text-muted">{s.number}</span></span>
                <span className="text-muted">{won(s.total)}{s.paidOn ? ` · ${s.paidOn}` : ""}</span>
              </li>
            ))}
          </ul>
        ) : <p className="text-sm text-muted">아직 완납 기록이 없습니다.</p>}
        <p className="mt-2 text-xs text-faint">
          판매로 보는 상태: 수주확정·입고대기·출고대기·출하완료·완료. 테스트 거래와 삭제한 견적은 빠집니다.
          받을 돈 = 합계 − (입금 − 환불) − 조정. 잘못 적은 줄은 줄 옆 [취소] — 지우지 않고 합계에서만 뺍니다.
          {" "}<Link href="/quote?view=history" className="underline">견적서</Link>에서 상태를 바꾸면 여기에 나타납니다.
        </p>
      </Section>
    </>
  );
}

function Row({ s, today, amount, age, danger = false, only }: { s: Sale; today: string; amount: number; age?: number; danger?: boolean; only?: "입금" }) {
  return (
    <li className="flex flex-wrap items-start gap-x-3 gap-y-1.5 px-3 py-2.5 text-sm">
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-1.5">
          {only ? <b>{s.company || "거래처 없음"}</b> : null}
          <a href={quoteAirtableUrl(s.id)} target="_blank" rel="noopener noreferrer" className="font-mono text-xs hover:underline">{s.number}</a>
          <span className="chip">{s.status}</span>
          {age === undefined ? null : age > 30 ? <span className="chip text-danger">{age}일</span> : <span className="text-xs text-muted">{age}일</span>}
        </p>
        <p className="mt-0.5 text-xs text-muted">
          {sinceOf(s) === s.ordered && s.ordered ? `수주 ${s.ordered}` : `발행 ${s.issued}`} · 합계 {won(s.total)}
          {paidOf(s) > 0 ? ` · 받은 돈 ${won(paidOf(s))}` : ""}{s.adjusted ? ` · 조정 ${won(s.adjusted)}` : ""}
        </p>
        <Ledger entries={s.entries} />
      </div>
      <b className={`text-right ${danger ? "text-danger" : ""}`}>{won(amount)}</b>
      <PaymentForm id={s.id} balance={balanceOf(s)} overpaid={overpaidOf(s)} paid={paidOf(s)} today={today} label={danger ? "환불 기록" : only ? "선금 기록" : "입금 기록"} only={only} />
    </li>
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
