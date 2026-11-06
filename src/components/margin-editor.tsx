"use client";

import { useActionState } from "react";

import { saveCostsAction, type SalesActionState } from "@/app/sales-actions";
import type { CostedLine } from "@/lib/sales";

const fmt = (n: number) => Math.round(n).toLocaleString("ko-KR");

/**
 * 판매 1건의 품목별 원가. 표에서 찾은 값은 흐리게 미리 채워 두고(placeholder),
 * 직접 적은 값만 저장한다 — 표의 원가가 바뀌면 직접 안 적은 줄은 따라 바뀐다.
 */
export function MarginEditor({ id, lines }: { id: string; lines: CostedLine[] }) {
  const [state, action, pending] = useActionState<SalesActionState, FormData>(saveCostsAction, { error: null });

  return (
    <form action={action} data-og-saving={pending ? "true" : undefined}>
      <input type="hidden" name="id" value={id} />
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] text-xs">
          <thead className="text-left text-muted">
            <tr className="border-b border-line">
              <th className="py-1.5 pr-2 font-normal">품목</th>
              <th className="py-1.5 pr-2 text-right font-normal">수량</th>
              <th className="py-1.5 pr-2 text-right font-normal">단가</th>
              <th className="py-1.5 pr-2 text-right font-normal">1개 원가</th>
              <th className="py-1.5 pr-2 font-normal">출처</th>
              <th className="py-1.5 text-right font-normal">줄 마진</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l) => {
              const own = l.source === "직접" && !(l.price === 0 && l.unitCost === 0);
              const lineMargin = l.unitCost === null ? null : l.revenue - l.unitCost * l.qty;
              return (
                <tr key={l.key} className="border-b border-line last:border-0">
                  <td className="py-1.5 pr-2">{l.name}{l.spec ? <span className="text-muted"> · {l.spec}</span> : null}</td>
                  <td className="py-1.5 pr-2 text-right">{fmt(l.qty)}</td>
                  <td className="py-1.5 pr-2 text-right">{fmt(l.price)}</td>
                  <td className="py-1.5 pr-2 text-right">
                    <input
                      name={`cost:${l.key}`} inputMode="decimal" aria-label={`${l.name} 원가`}
                      defaultValue={own && l.unitCost !== null ? String(l.unitCost) : ""}
                      placeholder={!own && l.unitCost !== null ? fmt(l.unitCost) : "입력"}
                      className="field w-24 py-1 text-right text-xs"
                    />
                  </td>
                  <td className="py-1.5 pr-2 text-muted">{l.source ?? <span className="text-danger">없음</span>}</td>
                  <td className={`py-1.5 text-right ${lineMargin !== null && lineMargin < 0 ? "text-danger" : ""}`}>
                    {lineMargin === null ? "—" : fmt(lineMargin)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-end gap-2">
        {state.error ? <span className="text-xs text-danger" role="alert">{state.error}</span> : null}
        {state.done ? <span className="text-xs text-brand-600">{state.done}</span> : null}
        <button type="submit" className="btn-primary px-3 text-xs" disabled={pending}>{pending ? "저장 중" : "원가 저장"}</button>
      </div>
    </form>
  );
}
