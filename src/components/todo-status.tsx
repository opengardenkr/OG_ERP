"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { setStatusAction } from "@/app/todo-actions";
import { statusChip } from "@/lib/labels";
import { TODO_STATUSES, type TodoStatus } from "@/lib/todo-types";

export function TodoStatusSelect({
  id,
  status,
}: {
  id: string;
  status: TodoStatus;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  // 서버 응답을 기다리지 않고 먼저 바꿔 보여준다. 실패하면 되돌린다.
  const [shown, setShown] = useState<TodoStatus>(status);
  const [error, setError] = useState<string | null>(null);

  function change(next: TodoStatus) {
    const previous = shown;
    setShown(next);
    setError(null);

    startTransition(async () => {
      const result = await setStatusAction(id, next);
      if (result.error) {
        setShown(previous);
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <span data-og-ignore-draft data-og-saving={pending ? "true" : undefined} className="inline-flex items-center gap-1">
      <select
        value={shown}
        disabled={pending}
        onChange={(event) => change(event.target.value as TodoStatus)}
        aria-label="상태"
        className={`chip ${statusChip(shown)} cursor-pointer border-0 disabled:opacity-60`}
      >
        {TODO_STATUSES.map((value) => (
          <option key={value} value={value}>
            {value}
          </option>
        ))}
      </select>
      {error ? <span title={error} className="text-xs text-red-700">!</span> : null}
    </span>
  );
}
