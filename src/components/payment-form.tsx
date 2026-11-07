"use client";

import { useActionState, useState } from "react";

import { cancelEntryAction, recordEntryAction, type SalesActionState } from "@/app/sales-actions";
import { PAY_METHODS, type PayKind, type Payment } from "@/lib/sales";

const won = (n: number) => `₩${Math.round(n).toLocaleString("ko-KR")}`;
const LABEL: Record<PayKind, string> = { 입금: "받은 돈", 환불: "돌려준 돈", 조정: "안 받기로 한 돈(끝전·에누리)" };

/**
 * 판매 1건의 장부에 한 줄 적기. 나눠 받으면 받을 때마다 [입금]을 한 번씩,
 * 차액을 돌려주면 [환불], 끝전을 깎아 주면 [조정]. 기본 금액은 남은 돈(환불은 돌려줄 돈).
 */
export function PaymentForm({ id, balance, overpaid, paid, today, label = "입금 기록", only }: {
  id: string; balance: number; overpaid: number; paid: number; today: string; label?: string; only?: PayKind;
}) {
  const start: PayKind = only ?? (overpaid > 0 ? "환불" : "입금");
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<PayKind>(start);
  const [state, action, pending] = useActionState<SalesActionState, FormData>(async (prev, form) => {
    const next = await recordEntryAction(prev, form);
    if (!next.error) setOpen(false);
    return next;
  }, { error: null });

  if (!open) {
    return (
      <span className="flex flex-col items-end gap-1">
        <button type="button" className="btn px-2.5 text-xs" onClick={() => { setKind(start); setOpen(true); }}>{label}</button>
        {state.done ? <span className="max-w-64 text-right text-[11px] text-brand-600">{state.done}</span> : null}
      </span>
    );
  }
  const kinds: PayKind[] = only ? [only] : ["입금", ...(paid > 0 ? ["환불" as const] : []), ...(balance > 0 ? ["조정" as const] : [])];
  const suggest = kind === "환불" ? overpaid : kind === "입금" ? balance : 0;
  return (
    <form action={action} data-og-saving={pending ? "true" : undefined} className="w-full basis-full space-y-1.5 rounded border border-line bg-canvas p-2">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="kind" value={kind} />
      {kinds.length > 1 ? (
        <div className="flex gap-1" role="group" aria-label="구분">
          {kinds.map((k) => (
            <button key={k} type="button" onClick={() => setKind(k)} className={`${k === kind ? "btn-primary" : "btn"} px-2 text-xs`}>{k}</button>
          ))}
        </div>
      ) : null}
      <div className="flex flex-wrap items-end gap-1.5">
        <label className="flex flex-col text-[11px] text-muted">{LABEL[kind]}
          <input key={kind} name="amount" inputMode="numeric" defaultValue={suggest ? String(suggest) : ""} className="field w-32 text-right" required autoFocus />
        </label>
        {kind !== "조정" ? (
          <>
            <label className="flex flex-col text-[11px] text-muted">날짜(모르면 비움)
              <input name="date" type="date" defaultValue={today} max={today} className="field" />
            </label>
            <label className="flex flex-col text-[11px] text-muted">방법
              <select name="method" defaultValue="계좌이체" className="field">{PAY_METHODS.map((m) => <option key={m}>{m}</option>)}</select>
            </label>
          </>
        ) : <input type="hidden" name="date" value={today} />}
        <label className="flex min-w-40 flex-1 flex-col text-[11px] text-muted">메모
          <input name="memo" maxLength={200} placeholder={kind === "환불" ? "예: 세일러맨 2크레이트 빠짐" : kind === "조정" ? "예: 끝전" : "예: 선금 50%"} className="field" />
        </label>
      </div>
      {kind !== "조정" ? (
        <label className="flex items-center gap-1.5 text-[11px] text-muted">
          <input type="checkbox" name="over" /> {kind === "입금" ? "남은 돈보다 더 받음(맞음)" : "돌려줄 돈보다 더 돌려줌(맞음)"}
        </label>
      ) : null}
      <div className="flex justify-end gap-1.5">
        <button type="button" className="btn px-2.5 text-xs" onClick={() => setOpen(false)}>닫기</button>
        <button type="submit" className="btn-primary px-2.5 text-xs" disabled={pending}>{pending ? "저장 중" : `${kind} 저장`}</button>
      </div>
      {state.error ? <p className="text-right text-xs text-danger" role="alert">{state.error}</p> : null}
    </form>
  );
}

/** 장부 줄 목록. 잘못 적은 줄은 [취소](지우지 않고 표시만, 합계에서 빠진다). */
export function Ledger({ entries }: { entries: Payment[] }) {
  if (!entries.length) return null;
  return (
    <ul className="mt-1 space-y-0.5 text-[11px]">
      {entries.map((e) => (
        <li key={e.id} className={`flex flex-wrap items-center gap-x-1.5 ${e.canceled ? "text-faint line-through" : "text-muted"}`}>
          <span>{e.date || "날짜 모름"}</span>
          <span className={e.kind === "환불" ? "text-danger" : e.kind === "입금" ? "text-brand-600" : ""}>{e.kind} {won(e.amount)}</span>
          {e.method ? <span>· {e.method}</span> : null}
          {e.memo ? <span className="truncate">· {e.memo.split("\n")[0]}</span> : null}
          <span>· {e.who}</span>
          {!e.canceled ? <CancelEntry id={e.id} label={`${e.kind} ${won(e.amount)}`} /> : null}
        </li>
      ))}
    </ul>
  );
}

function CancelEntry({ id, label }: { id: string; label: string }) {
  const [state, action, pending] = useActionState<SalesActionState, FormData>(cancelEntryAction, { error: null });
  return (
    <form action={action} onSubmit={(e) => { if (!window.confirm(`${label} 줄을 취소합니다(잘못 적은 경우). 기록은 남고 합계에서 빠집니다.`)) e.preventDefault(); }} className="inline">
      <input type="hidden" name="id" value={id} />
      <button type="submit" className="underline hover:text-ink" disabled={pending}>{pending ? "취소 중" : "취소"}</button>
      {state.error ? <span className="ml-1 text-danger">{state.error}</span> : null}
    </form>
  );
}
