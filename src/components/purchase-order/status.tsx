"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { setPurchaseStatusAction, trashPurchaseOrderAction } from "@/app/purchase-actions";
import { PO_STATUSES, type PoStatus } from "@/lib/purchase-order";

/** 상태 칩 줄 + [삭제함으로]. 누르면 바로 저장한다(작업메모에 한 줄). */
export function PurchaseStatus({ id, status }: { id: string; status: PoStatus }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const pick = (next: PoStatus) =>
    start(async () => {
      setError(null);
      const result = await setPurchaseStatusAction(id, next);
      if (result.error) setError(result.error);
      else router.refresh();
    });

  const trash = () => {
    if (!window.confirm("이 발주서를 삭제함으로 옮길까? 목록에서 사라진다(Airtable에서 되살릴 수 있다).")) return;
    start(async () => {
      const result = await trashPurchaseOrderAction(id);
      if (result.error) setError(result.error);
      else router.push("/purchase");
    });
  };

  return (
    <div className="card flex flex-wrap items-center gap-2 p-3" data-og-saving={pending ? "true" : undefined}>
      <span className="text-xs text-muted">상태</span>
      {PO_STATUSES.map((s) => (
        <button
          key={s}
          type="button"
          disabled={pending || s === status}
          onClick={() => pick(s)}
          aria-pressed={s === status}
          className={`chip border ${s === status ? "border-brand-600 bg-brand-50 text-brand-600" : "border-line bg-surface text-muted hover:text-ink"}`}
        >
          {s}
        </button>
      ))}
      <button type="button" onClick={trash} disabled={pending} className="ml-auto text-xs text-faint hover:text-danger">
        삭제함으로
      </button>
      {error ? <p className="w-full text-xs text-danger" role="alert">{error}</p> : null}
    </div>
  );
}
