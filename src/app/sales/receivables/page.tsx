import Link from "next/link";
import { AppShell, Section } from "@/components/app-shell";
import { EmptyState, ErrorState } from "@/components/data-state";
import { PaymentForm } from "@/components/payment-form";
import { SalesTabs } from "@/components/sales-tabs";
import { getSales, quoteAirtableUrl } from "@/lib/airtable/sales";
import { auth } from "@/lib/auth";
import { isAdmin } from "@/config/users";
import { todayInSeoul } from "@/lib/date";
import { balanceOf, groupReceivables, paidOf, sinceOf, won, type Sale } from "@/lib/sales";

export const metadata = { title: "미수금 | 오픈가든", robots: { index: false, follow: false } };

export default async function Page() {
  const [session, result] = await Promise.all([auth(), getSales()]);
  const today = todayInSeoul();
  const admin = isAdmin(session?.user.member);

  return (
    <AppShell title="매출" subtitle="판매(수주확정 이후) 건의 받을 돈. 입금이 들어오면 [입금 기록]을 누릅니다.">
      <SalesTabs active="미수금" admin={admin} />
      {!result.ok ? <ErrorState message={result.message} /> : <Receivables sales={result.data} today={today} />}
    </AppShell>
  );
}

function Receivables({ sales, today }: { sales: Sale[]; today: string }) {
  const groups = groupReceivables(sales, today);
  const total = groups.reduce((a, g) => a + g.balance, 0);
  const late = groups.flatMap((g) => g.sales).filter((s) => s.age > 30).reduce((a, s) => a + s.balance, 0);
  const paid = sales.filter((s) => balanceOf(s) === 0 && s.total > 0).slice(0, 10);

  return (
    <>
      <div className="mb-4 grid grid-cols-3 gap-2">
        <Stat label="받을 돈" value={won(total)} />
        <Stat label="건수" value={`${groups.reduce((a, g) => a + g.sales.length, 0)}건 · ${groups.length}곳`} />
        <Stat label="30일 넘음" value={won(late)} warn={late > 0} />
      </div>

      {groups.length === 0 ? <EmptyState message="받을 돈이 남은 판매가 없습니다." /> : (
        <div className="space-y-3">
          {groups.map((g) => (
            <section key={g.company} className="card overflow-hidden">
              <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line bg-canvas px-3 py-2">
                <b className="text-sm">{g.company}</b>
                <span className="text-sm"><b>{won(g.balance)}</b><span className="ml-2 text-xs text-muted">가장 오래된 건 {g.oldest}일</span></span>
              </header>
              <ul className="divide-y divide-line">
                {g.sales.map((s) => (
                  <li key={s.id} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-3 py-2.5 text-sm">
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-center gap-1.5">
                        <a href={quoteAirtableUrl(s.id)} target="_blank" rel="noopener noreferrer" className="font-mono text-xs hover:underline">{s.number}</a>
                        <span className="chip">{s.status}</span>
                        {s.age > 30 ? <span className="chip text-danger">{s.age}일</span> : <span className="text-xs text-muted">{s.age}일</span>}
                      </p>
                      <p className="mt-0.5 text-xs text-muted">
                        {sinceOf(s) === s.ordered && s.ordered ? `수주 ${s.ordered}` : `발행 ${s.issued}`} · 합계 {won(s.total)}
                        {paidOf(s) > 0 ? ` · 받음 ${won(paidOf(s))}${s.paidOn ? ` (${s.paidOn})` : ""}` : ""}
                      </p>
                    </div>
                    <b className="text-right">{won(s.balance)}</b>
                    <PaymentForm id={s.id} balance={s.balance} today={today} />
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

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
          입금을 잘못 적었으면 견적번호를 눌러 Airtable에서 <b>입금액</b>을 고칩니다.
          {" "}<Link href="/quote" className="underline">견적서</Link>에서 상태를 바꾸면 여기에 나타납니다.
        </p>
      </Section>
    </>
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
