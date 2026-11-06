"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { matchesClient, phoneDigits, type ClientSummary } from "@/lib/client-types";

/** 거래처 목록. 검색은 화면에서 거른다(거래처 수가 적다). 폰에서는 한 줄씩, 넓은 화면에서는 두 칸. */
export function ClientList({ clients }: { clients: ClientSummary[] }) {
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState("");
  const kinds = useMemo(() => [...new Set(clients.map((c) => c.kind).filter(Boolean))].sort((a, b) => a.localeCompare(b, "ko")), [clients]);
  const shown = clients.filter((c) => (!kind || c.kind === kind) && matchesClient(c, query));

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <input
          type="search" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="거래처 검색"
          placeholder="이름·대표자·지역·전화번호" className="field min-w-0 flex-1"
        />
        <select value={kind} onChange={(e) => setKind(e.target.value)} aria-label="거래처 구분" className="field">
          <option value="">전체 구분</option>
          {kinds.map((k) => <option key={k}>{k}</option>)}
        </select>
      </div>
      <p className="text-xs text-muted">{shown.length}곳 · 최근 영업일지 순</p>
      {shown.length ? (
        <ul className="grid gap-2 lg:grid-cols-2">
          {shown.map((c) => (
            <li key={c.id} className="card flex items-center gap-3 p-3">
              <Link href={`/clients/${c.id}`} className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-1.5">
                  <b className="text-sm">{c.name}</b>
                  {c.kind ? <span className="chip">{c.kind}</span> : null}
                  {c.hasCard ? <span className="chip">명함</span> : null}
                </span>
                <span className="mt-0.5 block truncate text-xs text-muted">
                  {[c.ceo, c.address].filter(Boolean).join(" · ") || "정보 없음"}
                </span>
                <span className="mt-0.5 block text-xs text-muted">
                  {c.logCount ? `영업일지 ${c.logCount}건 · 최근 ${c.lastLog || "날짜 없음"}` : "영업일지 없음"}
                </span>
              </Link>
              {c.phone ? (
                <a href={`tel:${phoneDigits(c.phone)}`} className="btn shrink-0 px-2.5 text-xs" aria-label={`${c.name} 전화`}>
                  전화
                </a>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-lg border border-dashed border-line p-6 text-center text-sm text-muted">찾는 거래처가 없습니다.</p>
      )}
    </div>
  );
}
