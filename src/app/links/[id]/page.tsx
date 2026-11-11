import Link from "next/link";
import { Suspense } from "react";

import { AppShell, Section } from "@/components/app-shell";
import { EmptyState, ErrorState } from "@/components/data-state";
import { CopyButton, LinkToggle } from "@/components/link-buttons";
import { LinkChart } from "@/components/link-chart";
import { LinkForm } from "@/components/link-form";
import { shortUrl } from "@/config/site";
import { getLink, getScans, SCAN_READ_LIMIT } from "@/lib/airtable/links";
import { todayInSeoul } from "@/lib/date";
import { countryName, rangeOf, RANGES, summarize, type Share } from "@/lib/link-stats";

export const metadata = {
  title: "링크 통계 | 오픈가든",
  robots: { index: false, follow: false },
};

const RANGE_LABEL: Record<number, string> = { 7: "7일", 30: "30일", 90: "90일", 365: "1년" };

function Tile({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="card p-3">
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-1 text-base font-semibold tabular-nums">{value}</p>
      {note ? <p className="mt-0.5 text-[11px] text-faint">{note}</p> : null}
    </div>
  );
}

/** 기기·국가·도시·유입 표. 비율은 옅은 막대로 같이 보인다(한 색 — 크기만 뜻한다). */
function ShareTable({ title, head, rows }: { title: string; head: string; rows: Share[] }) {
  return (
    <div className="card p-3">
      <p className="section-title">{title}</p>
      {rows.length === 0 ? (
        <p className="mt-3 text-xs text-faint">아직 기록이 없다.</p>
      ) : (
        <table className="mt-2 w-full text-left text-sm">
          <thead>
            <tr className="border-b border-line text-xs text-muted">
              <th className="py-1.5 font-semibold">{head}</th>
              <th className="py-1.5 text-right font-semibold">스캔</th>
              <th className="w-[84px] py-1.5 text-right font-semibold">비율</th>
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, 8).map((row) => (
              <tr key={row.name} className="border-b border-line/60 last:border-0">
                <td className="py-1.5">{row.name}</td>
                <td className="py-1.5 text-right tabular-nums">{row.count}</td>
                <td className="py-1.5">
                  <span className="flex items-center justify-end gap-1.5">
                    <span className="h-1.5 w-10 overflow-hidden rounded-[2px] bg-canvas">
                      <span className="block h-full rounded-[2px] bg-brand-600" style={{ width: `${row.percent}%` }} />
                    </span>
                    <span className="w-8 text-right text-xs tabular-nums text-muted">{row.percent}%</span>
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {rows.length > 8 ? <p className="mt-1 text-[11px] text-faint">그 밖 {rows.length - 8}곳</p> : null}
    </div>
  );
}

async function LinkDashboard({ id, range }: { id: string; range: string | undefined }) {
  if (!/^rec[A-Za-z0-9]{14}$/.test(id)) return <EmptyState message="없는 링크다." />;
  const found = await getLink(id);
  if (!found.ok) return <ErrorState message={found.message} />;
  const link = found.data;
  if (!link) return <EmptyState message="없는 링크다. 목록에서 다시 골라라." />;

  const days = rangeOf(range);
  const scans = await getScans(days, link.code);
  if (!scans.ok) return <ErrorState message={scans.message} />;
  const stats = summarize(scans.data, days, todayInSeoul());
  const short = shortUrl(link.code);

  return (
    <>
      <div className="card flex flex-wrap items-start gap-4 p-4">
        <div className="min-w-0 flex-1 basis-[280px]">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base font-semibold">{link.name}</h2>
            <span className="chip bg-canvas text-muted">{link.category}</span>
            {link.active ? <span className="chip bg-[#dcf2e5] text-[#0b6b3a]">사용 중</span> : <span className="chip bg-[#ffe2dd] text-[#ae2e24]">일시정지</span>}
          </div>
          <dl className="mt-3 flex flex-col gap-2 text-sm">
            <div>
              <dt className="text-xs text-muted">짧은 주소 (QR에 담긴 주소)</dt>
              <dd className="mt-0.5 flex flex-wrap items-center gap-2"><span className="break-all font-semibold">{short}</span><CopyButton text={short} /></dd>
            </div>
            <div>
              <dt className="text-xs text-muted">넘어가는 곳</dt>
              <dd className="mt-0.5"><a href={link.target} target="_blank" rel="noreferrer" className="break-all text-brand-600 hover:underline">{link.target}</a></dd>
            </div>
            {link.memo ? <div><dt className="text-xs text-muted">메모</dt><dd className="mt-0.5">{link.memo}</dd></div> : null}
          </dl>
          <div className="mt-4 flex flex-wrap items-start gap-2">
            <LinkForm editing={{ id: link.id, name: link.name, target: link.target, category: link.category, memo: link.memo }} />
            <LinkToggle id={link.id} active={link.active} />
          </div>
        </div>
        <div className="flex flex-col items-center gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element -- 로그인한 사람만 받는 내부 SVG라 next/image를 거치지 않는다 */}
          <img src={`/links/${link.id}/qr`} alt={`${link.name} QR 코드`} width={148} height={148} className="rounded-[3px] border border-line bg-white" />
          <div className="flex gap-2 text-xs">
            <a href={`/links/${link.id}/qr?format=png&download=1`} className="btn !px-2 !py-1 !text-xs">PNG 받기</a>
            <a href={`/links/${link.id}/qr?format=svg&download=1`} className="btn !px-2 !py-1 !text-xs">SVG 받기</a>
          </div>
        </div>
      </div>

      <Section
        title={`최근 ${RANGE_LABEL[days]}`}
        action={
          <nav className="flex gap-1" aria-label="기간">
            {RANGES.map((r) => (
              <Link
                key={r}
                href={`/links/${link.id}?range=${r}`}
                aria-current={r === days ? "page" : undefined}
                className={`rounded-[3px] border px-2 py-1 text-xs ${r === days ? "border-brand-600 bg-brand-50 font-semibold text-brand-600" : "border-line text-muted hover:bg-canvas"}`}
              >
                {RANGE_LABEL[r]}
              </Link>
            ))}
          </nav>
        }
      >
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Tile label="스캔" value={`${stats.total}회`} />
          <Tile label="순 방문자" value={`${stats.unique}명`} note="같은 기기는 한 명으로" />
          <Tile label="마지막 스캔" value={stats.last ?? "—"} />
          <Tile label="시작일" value={link.created || "—"} note={link.author ? `${link.author} 만듦` : undefined} />
        </div>
        {scans.data.length >= SCAN_READ_LIMIT ? (
          <p className="mt-2 text-xs text-danger">이 기간 스캔이 {SCAN_READ_LIMIT}줄을 넘어 최근 것만 셌다. 기간을 줄여서 봐라.</p>
        ) : null}
        <div className="card mt-3 p-3">
          {stats.total === 0 ? (
            <p className="py-10 text-center text-sm text-muted">이 기간에는 스캔이 없다. 짧은 주소나 QR로 들어와야 기록된다.</p>
          ) : (
            <LinkChart buckets={stats.buckets} />
          )}
        </div>
      </Section>

      <Section title="누가 · 어디서">
        <div className="grid gap-3 sm:grid-cols-2">
          <ShareTable title="기기" head="기기" rows={stats.devices} />
          <ShareTable title="국가" head="국가" rows={stats.countries.map((r) => ({ ...r, name: countryName(r.name) }))} />
          <ShareTable title="도시" head="도시" rows={stats.cities} />
          <ShareTable title="들어온 곳" head="앞 페이지" rows={stats.referrers} />
        </div>
        <p className="mt-2 text-[11px] text-faint">국가·도시는 접속 IP로 추정한 값이다(통신사·VPN에 따라 다르게 나올 수 있다). IP 자체는 저장하지 않는다. 카톡 미리보기 같은 로봇은 세지 않는다.</p>
      </Section>
    </>
  );
}

export default async function LinkDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ range?: string }>;
}) {
  const [{ id }, { range }] = await Promise.all([params, searchParams]);
  return (
    <AppShell title="링크 통계" subtitle="이 링크·QR이 언제, 어떤 기기로, 어디서 열렸는지." action={<Link href="/links" className="btn">← 링크 목록</Link>}>
      <Suspense fallback={<p role="status" className="card p-4 text-sm text-muted">통계를 불러오는 중…</p>}>
        <LinkDashboard id={id} range={range} />
      </Suspense>
    </AppShell>
  );
}
