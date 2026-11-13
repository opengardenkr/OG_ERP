"use client";

import { useActionState } from "react";

import { issueSheetAction, shipSheetAction, type SalesActionState } from "@/app/sales-actions";

/** 주문서 [발행](후불 판매 등, 손으로) · [출고 완료] · [출고 취소]. 누르기 전에 한 번 묻는다. */
export function SheetAction({ id, kind, label }: { id: string; kind: "issue" | "ship" | "unship"; label: string }) {
  const [state, action, pending] = useActionState<SalesActionState, FormData>(kind === "issue" ? issueSheetAction : shipSheetAction, { error: null });
  const ask = kind === "issue"
    ? `${label} 주문서를 발행합니다. 아직 다 받지 않은 판매(후불 등)도 발행됩니다.`
    : kind === "ship" ? `${label} 주문서를 출고 완료로 적습니다(상태 출하완료).` : `${label} 주문서의 출고 기록을 지웁니다.`;
  return (
    <form action={action} onSubmit={(e) => { if (!window.confirm(ask)) e.preventDefault(); }} className="flex flex-col items-end gap-1">
      <input type="hidden" name="id" value={id} />
      {kind === "unship" ? <input type="hidden" name="undo" value="1" /> : null}
      <button type="submit" disabled={pending} className={`${kind === "ship" ? "btn-primary" : "btn"} px-2.5 text-xs`}>
        {pending ? "저장 중" : kind === "issue" ? "주문서 발행" : kind === "ship" ? "출고 완료" : "출고 취소"}
      </button>
      {state.error ? <span className="max-w-64 text-right text-[11px] text-danger" role="alert">{state.error}</span> : null}
      {state.done ? <span className="max-w-64 text-right text-[11px] text-brand-600">{state.done}</span> : null}
    </form>
  );
}
