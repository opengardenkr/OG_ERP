import Link from "next/link";
import { AppShell, Section } from "@/components/app-shell";
import { EmptyState, ErrorState } from "@/components/data-state";
import { SalesTabs } from "@/components/sales-tabs";
import { isAdmin } from "@/config/users";
import { getSalesOverview, quoteAirtableUrl } from "@/lib/airtable/sales";
import { auth } from "@/lib/auth";
import { todayInSeoul } from "@/lib/date";
import { balanceOf, monthOf, monthlySummary, paidOf, sinceOf, won, type Sale } from "@/lib/sales";

export const metadata = { title: "매출 | 오픈가든", robots: { index: false, follow: false } };

/**
 * 매출 › 매출: 지금까지의 판매 전체와 월별 합계. 판매 = 수주확정 이후 상태의 견적(미수금과 같은 원천).
 * 달은 수주일(없으면 발행일) 기준. ?m=YYYY-MM 이면 그 달 판매만 아래 목록에.
 */
export default async function Page({ searchParams }: { searchParams: Promise<{ m?: string }> }) {
  const [session, result, params] = await Promise.all([auth(), getSalesOverview(), searchParams]);
  const month = /^\d{4}-\d{2}$/.test(params.m ?? "") ? params.m! : "";

  return (
    <AppShell title="매출" subtitle="지금까지의 판매와 월별 합계. 판매 = 견적서에서 수주확정 이후로 바뀐 건입니다.">
      <SalesTabs active="매출" admin={isAdmin(session?.user.member)} />
      {!result.ok ? <ErrorState message={result.message} /> : (
        <>
          {result.data.sales.length === 0 ? <EmptyState message="아직 판매가 없습니다. 견적서에서 수주확정하면 여기에 쌓입니다." /> : <Overview sales={result.data.sales} month={month} />}
          <OpenQuotes open={result.data.open} sales={result.data.sales} />
        </>
      )}
    </AppShell>
  );
}

function Overview({ sales, month }: { sales: Sale[]; month: string }) {
  const rows = monthlySummary(sales);
  const year = todayInSeoul().slice(0, 4);
  const thisMonth = todayInSeoul().slice(0, 7);
  const sum = (list: Sale[]) => list.reduce((a, s) => a + s.total, 0);
  const max = Math.max(1, ...rows.map((r) => r.total));
  const list = (month ? sales.filter((s) => monthOf(s) === month) : sales).slice().sort((a, b) => sinceOf(b).localeCompare(sinceOf(a)));

  return (
    <>
      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label={`${year}년 매출`} value={won(sum(sales.filter((s) => sinceOf(s).startsWith(year))))} />
        <Stat label="이번 달" value={won(sum(sales.filter((s) => monthOf(s) === thisMonth)))} />
        <Stat label="전체 판매" value={`${sales.length}건 · ${won(sum(sales))}`} />
        <Stat label="받을 돈" value={won(sales.reduce((a, s) => a + balanceOf(s), 0))} warn />
      </div>

      <Section title="월별">
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[560px] text-xs">
            <thead className="text-left text-muted">
              <tr className="border-b border-line">
                <th className="px-3 py-1.5 font-normal">월</th>
                <th className="py-1.5 pr-2 text-right font-normal">건수</th>
                <th className="py-1.5 pr-2 text-right font-normal">공급가액</th>
                <th className="py-1.5 pr-2 text-right font-normal">부가세</th>
                <th className="py-1.5 pr-2 text-right font-normal">합계</th>
                <th className="py-1.5 pr-2 text-right font-normal">관계사</th>
                <th className="py-1.5 pr-2 text-right font-normal">받은 돈</th>
                <th className="py-1.5 pr-3 text-right font-normal">미수</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.month} className={`border-b border-line last:border-0 ${r.month === month ? "bg-brand-50" : ""}`}>
                  <td className="px-3 py-1.5">
                    <Link href={r.month === month ? "/sales" : `/sales?m=${r.month}`} className="font-semibold underline-offset-2 hover:underline">{r.month.replace("-", ". ")}.</Link>
                    <span className="mt-0.5 block h-1 rounded bg-brand-600" style={{ width: `${Math.max(4, (r.total / max) * 100)}%` }} aria-hidden />
                  </td>
                  <td className="py-1.5 pr-2 text-right">{r.count}</td>
                  <td className="py-1.5 pr-2 text-right">{won(r.supply)}</td>
                  <td className="py-1.5 pr-2 text-right">{won(r.vat)}</td>
                  <td className="py-1.5 pr-2 text-right font-semibold">{won(r.total)}</td>
                  <td className="py-1.5 pr-2 text-right text-muted">{r.related ? won(r.related) : ""}</td>
                  <td className="py-1.5 pr-2 text-right">{won(r.paid)}</td>
                  <td className={`py-1.5 pr-3 text-right ${r.due ? "text-danger" : ""}`}>{r.due ? won(r.due) : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-1 text-xs text-faint">달을 누르면 그 달 판매만 아래에 보입니다. 관계사 = 견적의 거래구분이 &lsquo;관계사&rsquo;인 건(합계에 들어 있음). 수정본(-R2…)은 묶음당 한 건만 셉니다. 테스트 거래는 빠집니다.</p>
      </Section>

      <Section
        title={month ? `${month.replace("-", ". ")}. 판매 ${list.length}건` : `전체 판매 ${list.length}건`}
        action={month ? <Link href="/sales" className="text-xs text-muted hover:text-ink">전체 보기</Link> : undefined}
      >
        <ul className="card divide-y divide-line text-sm">
          {list.map((s) => {
            const due = balanceOf(s);
            return (
              <li key={s.id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-3 py-2">
                <span className="min-w-0">
                  <span className="text-xs text-muted">{sinceOf(s)}</span>{" "}
                  <b>{s.company || "거래처 없음"}</b>{" "}
                  <a href={quoteAirtableUrl(s.id)} target="_blank" rel="noopener noreferrer" className="font-mono text-xs text-muted hover:underline">{s.number}</a>{" "}
                  <span className="chip">{s.status}</span>
                  {s.dealType && s.dealType !== "일반" ? <span className="chip ml-1">{s.dealType}</span> : null}
                </span>
                <span className="text-right">
                  <b>{won(s.total)}</b>
                  <span className={`ml-2 text-xs ${due ? "text-danger" : "text-muted"}`}>{due ? `미수 ${won(due)}` : paidOf(s) ? "완납" : ""}</span>
                </span>
              </li>
            );
          })}
        </ul>
      </Section>
    </>
  );
}

/** 보냈는데 판매로 안 바뀐 견적. 실제로 판 건이면 견적서에서 상태만 바꾸면 매출로 들어온다. */
function OpenQuotes({ open, sales }: { open: Sale[]; sales: Sale[] }) {
  if (!open.length) return null;
  const total = open.reduce((a, q) => a + q.total, 0);
  const hint = (q: Sale) => {
    const sold = sales.find((s) => s.company === q.company && s.total === q.total);
    if (sold) return `판매 ${sold.number}와 같은 금액`;
    const same = open.filter((x) => x.company === q.company && x.total === q.total).length;
    return same > 1 ? `같은 금액 ${same}장` : "";
  };
  return (
    <Section title={`판매로 안 잡힌 견적 ${open.length}건 · ${won(total)}`}>
      <p className="mb-1.5 text-xs text-muted">
        보냈는데 상태가 아직 발송·수락 등인 견적입니다(수정본은 최신 것만). 실제로 판 건이면 <Link href="/quote?view=history" className="underline">견적서</Link>에서
        상태를 <b>수주확정</b>(납품까지 끝났으면 출하완료·완료)으로 바꾸면 위 매출·미수금에 들어옵니다. 안 된 거래는 거절·취소로 바꾸면 여기서 빠집니다.
      </p>
      <ul className="card divide-y divide-line text-sm">
        {open.map((q) => {
          const h = hint(q);
          return (
            <li key={q.id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-3 py-2">
              <span className="min-w-0">
                <span className="text-xs text-muted">{q.issued}</span>{" "}
                <b>{q.company || "거래처 없음"}</b>{" "}
                <a href={quoteAirtableUrl(q.id)} target="_blank" rel="noopener noreferrer" className="font-mono text-xs text-muted hover:underline">{q.number}</a>{" "}
                <span className="chip">{q.status}</span>
                {h ? <span className="ml-1 text-[11px] text-danger">{h}</span> : null}
              </span>
              <b>{won(q.total)}</b>
            </li>
          );
        })}
      </ul>
    </Section>
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
