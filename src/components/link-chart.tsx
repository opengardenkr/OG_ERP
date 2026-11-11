"use client";

import { useState } from "react";

import type { Bucket } from "@/lib/link-stats";

/** 스캔 = 브랜드 초록, 순 방문자 = 파랑. 색만으로 구분하지 않게 범례·툴팁·표를 같이 둔다. */
const TOTAL = "#0b6b3a";
const UNIQUE = "#2f7fd6";

const W = 720;
const H = 240;
const PAD = { top: 12, right: 8, bottom: 26, left: 30 };

/** 기간별 스캔 막대. 막대 묶음에 올리면 그 날의 숫자가 뜬다. */
export function LinkChart({ buckets }: { buckets: Bucket[] }) {
  const [hover, setHover] = useState<number | null>(null);

  const peak = Math.max(1, ...buckets.map((b) => b.total));
  const step = Math.max(1, Math.ceil(peak / 4));
  const top = step * Math.ceil(peak / step);
  const ticks = Array.from({ length: top / step + 1 }, (_, i) => i * step);

  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;
  const slot = plotW / buckets.length;
  const bar = Math.max(1.5, Math.min(14, slot * 0.36));
  const y = (value: number) => PAD.top + plotH - (value / top) * plotH;
  const labelEvery = Math.ceil(buckets.length / 8);
  const active = hover === null ? null : buckets[hover];

  return (
    <div>
      <div className="mb-1 flex items-center gap-4 text-xs text-muted">
        <span className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-[2px]" style={{ background: TOTAL }} />스캔</span>
        <span className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-[2px]" style={{ background: UNIQUE }} />순 방문자</span>
        <span className="ml-auto min-h-4 text-ink" aria-live="polite">
          {active ? `${active.key} · 스캔 ${active.total} · 순 방문자 ${active.unique}` : ""}
        </span>
      </div>
      {/* 좁은 화면에서는 글자가 뭉개지지 않게 폭을 지키고 옆으로 민다 */}
      <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full min-w-[520px]" role="img" aria-label="기간별 스캔 수와 순 방문자 수 막대 그래프" onMouseLeave={() => setHover(null)}>
        {ticks.map((tick) => (
          <g key={tick}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(tick)} y2={y(tick)} stroke="#dfe1e6" strokeWidth={tick === 0 ? 1.2 : 0.6} />
            <text x={PAD.left - 6} y={y(tick) + 3.5} textAnchor="end" fontSize="10" fill="#8993a4">{tick}</text>
          </g>
        ))}
        {buckets.map((bucket, i) => {
          const center = PAD.left + slot * i + slot / 2;
          return (
            <g key={bucket.key} onMouseEnter={() => setHover(i)} onFocus={() => setHover(i)} onBlur={() => setHover(null)} tabIndex={bucket.total ? 0 : -1} aria-label={`${bucket.key} 스캔 ${bucket.total}, 순 방문자 ${bucket.unique}`}>
              {hover === i ? <rect x={PAD.left + slot * i} y={PAD.top} width={slot} height={plotH} fill="#f1f2f4" /> : null}
              {bucket.total ? <rect x={center - bar - 0.75} y={y(bucket.total)} width={bar} height={y(0) - y(bucket.total)} rx={1.5} fill={TOTAL} /> : null}
              {bucket.unique ? <rect x={center + 0.75} y={y(bucket.unique)} width={bar} height={y(0) - y(bucket.unique)} rx={1.5} fill={UNIQUE} /> : null}
              {/* 손가락·마우스가 닿는 면은 막대보다 넓게 */}
              <rect x={PAD.left + slot * i} y={PAD.top} width={slot} height={plotH + PAD.bottom} fill="transparent" onClick={() => setHover(i)} />
              {i % labelEvery === 0 ? (
                <text x={center} y={H - 8} textAnchor="middle" fontSize="10" fill="#626f86">{bucket.label}</text>
              ) : null}
            </g>
          );
        })}
      </svg>
      </div>
      <details className="mt-1 text-xs text-muted">
        <summary className="cursor-pointer select-none hover:text-ink">표로 보기</summary>
        <table className="mt-2 w-full max-w-[360px] text-left">
          <thead><tr className="border-b border-line"><th className="py-1 font-semibold">날짜</th><th className="py-1 text-right font-semibold">스캔</th><th className="py-1 text-right font-semibold">순 방문자</th></tr></thead>
          <tbody>
            {buckets.filter((b) => b.total).reverse().map((b) => (
              <tr key={b.key} className="border-b border-line/60"><td className="py-1">{b.key}</td><td className="py-1 text-right tabular-nums">{b.total}</td><td className="py-1 text-right tabular-nums">{b.unique}</td></tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}
