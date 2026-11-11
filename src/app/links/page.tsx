import Link from "next/link";
import { Suspense } from "react";

import { AppShell } from "@/components/app-shell";
import { EmptyState, ErrorState } from "@/components/data-state";
import { CopyButton } from "@/components/link-buttons";
import { LinkForm } from "@/components/link-form";
import { shortUrl } from "@/config/site";
import { getLinks, getScans, SCAN_READ_LIMIT } from "@/lib/airtable/links";
import { todayInSeoul } from "@/lib/date";
import { summarize, type Bucket } from "@/lib/link-stats";

export const metadata = {
  title: "링크 · QR | 오픈가든",
  robots: { index: false, follow: false },
};

/** 30일 흐름을 한 줄로. 숫자는 옆 칸이 말하므로 축·눈금 없이 모양만 보인다. */
function Spark({ buckets }: { buckets: Bucket[] }) {
  const peak = Math.max(1, ...buckets.map((b) => b.total));
  const slot = 120 / buckets.length;
  return (
    <svg viewBox="0 0 120 28" className="h-7 w-[120px]" role="img" aria-label="최근 30일 스캔 흐름">
      <line x1="0" x2="120" y1="27.5" y2="27.5" stroke="#dfe1e6" strokeWidth="1" />
      {buckets.map((b, i) =>
        b.total ? (
          <rect key={b.key} x={i * slot + 0.5} y={27 - (b.total / peak) * 25} width={Math.max(1, slot - 1)} height={(b.total / peak) * 25} rx="0.75" fill="#0b6b3a" />
        ) : null,
      )}
    </svg>
  );
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="card p-3">
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-1 text-base font-semibold tabular-nums">{value}</p>
    </div>
  );
}

async function LinkList() {
  const [links, scans] = await Promise.all([getLinks(), getScans(30)]);
  if (!links.ok) return <ErrorState message={links.message} />;
  if (!scans.ok) return <ErrorState message={scans.message} />;
  if (links.data.length === 0) {
    return <EmptyState message="아직 추적 링크가 없다. [링크 만들기]로 주문 링크·도슨트·외부 사이트 주소를 넣으면 짧은 주소와 QR이 나온다." />;
  }

  const today = todayInSeoul();
  const all = summarize(scans.data, 30, today);
  const rows = links.data
    .map((link) => ({ link, stats: summarize(scans.data.filter((s) => s.code === link.code), 30, today) }))
    .sort((a, b) => b.stats.total - a.stats.total || b.link.created.localeCompare(a.link.created));

  return (
    <>
      <div className="grid grid-cols-3 gap-3">
        <Tile label="링크" value={`${links.data.length}개`} />
        <Tile label="30일 스캔" value={`${all.total}회`} />
        <Tile label="30일 순 방문자" value={`${all.unique}명`} />
      </div>
      {scans.data.length >= SCAN_READ_LIMIT ? (
        <p className="mt-2 text-xs text-danger">30일 스캔이 {SCAN_READ_LIMIT}줄을 넘어 일부만 셌다. 알려 주면 집계 방식을 바꾼다.</p>
      ) : null}

      <ul className="mt-4 flex flex-col gap-2">
        {rows.map(({ link, stats }) => (
          <li key={link.id} className="card flex flex-wrap items-center gap-x-4 gap-y-2 p-3">
            <div className="min-w-0 flex-1 basis-[240px]">
              <div className="flex items-center gap-2">
                <Link href={`/links/${link.id}`} className="truncate text-sm font-semibold text-ink hover:underline">{link.name}</Link>
                <span className="chip bg-canvas text-muted">{link.category}</span>
                {link.active ? null : <span className="chip bg-[#ffe2dd] text-[#ae2e24]">일시정지</span>}
              </div>
              <div className="mt-1 flex items-center gap-2 text-xs text-muted">
                <span className="truncate">{shortUrl(link.code).replace("https://", "")}</span>
                <CopyButton text={shortUrl(link.code)} />
              </div>
              <p className="mt-0.5 truncate text-[11px] text-faint">→ {link.target}</p>
            </div>
            <Spark buckets={stats.buckets} />
            <dl className="flex gap-4 text-right">
              <div><dt className="text-[11px] text-faint">30일 스캔</dt><dd className="text-sm font-semibold tabular-nums">{stats.total}</dd></div>
              <div><dt className="text-[11px] text-faint">순 방문자</dt><dd className="text-sm font-semibold tabular-nums">{stats.unique}</dd></div>
              <div><dt className="text-[11px] text-faint">최근</dt><dd className="text-sm tabular-nums text-muted">{stats.last ? stats.last.slice(5).replace("-", "/") : "—"}</dd></div>
            </dl>
            <Link href={`/links/${link.id}`} className="btn">자세히</Link>
          </li>
        ))}
      </ul>
    </>
  );
}

export default function LinksPage() {
  return (
    <AppShell
      title="링크 · QR"
      subtitle="우리가 만든 링크·QR이 얼마나 열렸는지 한 화면에서 본다. 짧은 주소로 들어온 것만 센다."
      action={<LinkForm />}
    >
      <Suspense fallback={<p role="status" className="card p-4 text-sm text-muted">링크를 불러오는 중…</p>}>
        <LinkList />
      </Suspense>
    </AppShell>
  );
}
