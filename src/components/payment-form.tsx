"use client";

import { useActionState, useState } from "react";

import { recordPaymentAction, type SalesActionState } from "@/app/sales-actions";

/** 판매 1건의 [입금 기록]. 누르면 금액(기본 = 잔액)·날짜 칸이 열린다. */
export function PaymentForm({ id, balance, today }: { id: string; balance: number; today: string }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<SalesActionState, FormData>(async (prev, form) => {
    const next = await recordPaymentAction(prev, form);
    if (!next.error) setOpen(false);
    return next;
  }, { error: null });

  if (!open) {
    return (
      <span className="flex flex-col items-end gap-1">
        <button type="button" className="btn px-2.5 text-xs" onClick={() => setOpen(true)}>입금 기록</button>
        {state.done ? <span className="text-[11px] text-brand-600">{state.done}</span> : null}
      </span>
    );
  }
  return (
    <form action={action} data-og-saving={pending ? "true" : undefined} className="flex flex-wrap items-end justify-end gap-1.5">
      <input type="hidden" name="id" value={id} />
      <label className="flex flex-col text-[11px] text-muted">입금액
        <input name="amount" inputMode="numeric" defaultValue={String(balance)} className="field w-32 text-right" required autoFocus />
      </label>
      <label className="flex flex-col text-[11px] text-muted">입금일
        <input name="date" type="date" defaultValue={today} max={today} className="field" required />
      </label>
      <button type="submit" className="btn-primary px-2.5 text-xs" disabled={pending}>{pending ? "저장 중" : "저장"}</button>
      <button type="button" className="btn px-2.5 text-xs" onClick={() => setOpen(false)}>취소</button>
      {state.error ? <p className="w-full text-right text-xs text-danger" role="alert">{state.error}</p> : null}
    </form>
  );
}
