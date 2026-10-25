"use client";

import { useActionState, useRef } from "react";

import { saveTodoAction, type ActionState } from "@/app/todo-actions";
import { TodoStatusSelect } from "@/components/todo-status";
import { TODO_CATEGORIES } from "@/lib/todo-types";
import type { Todo } from "@/lib/todo-types";

const FIELD = "field w-full";

export function TodoDetailForm({
  todo,
  members,
}: {
  todo: Todo;
  members: string[];
}) {
  const form = useRef<HTMLFormElement>(null);
  const [state, action, pending] = useActionState<ActionState, FormData>(
    async (prev, formData) => {
      const next = await saveTodoAction(todo.id, prev, formData);
      if (!next.error && form.current) delete form.current.dataset.ogDirty;
      return next;
    },
    { error: null },
  );

  return (
    <form ref={form} data-og-saving={pending ? "true" : undefined} action={action} className="grid gap-6 md:grid-cols-[1fr_260px]">
      {/* 왼쪽: 내용 */}
      <div className="space-y-4">
        <div>
          <Label>제목</Label>
          <input name="title" defaultValue={todo.title} className={FIELD} required />
        </div>

        <div>
          <Label>설명</Label>
          <textarea
            name="memo"
            defaultValue={todo.memo}
            rows={10}
            placeholder="진행 상황, 참고 링크 등"
            className={`${FIELD} resize-y`}
          />
        </div>

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={pending}
            className="btn-primary"
          >
            {pending ? "저장 중" : "저장"}
          </button>
          {state.error ? (
            <span className="text-sm text-red-700">{state.error}</span>
          ) : null}
        </div>
      </div>

      {/* 오른쪽: 속성 */}
      <aside className="card space-y-4 p-4">
        <div>
          <Label>상태</Label>
          {/* 상태만 즉시 저장된다 — 완료일시를 같이 찍어야 하기 때문이다 */}
          <TodoStatusSelect id={todo.id} status={todo.status} />
        </div>

        <div>
          <Label>담당자</Label>
          <select name="owner" defaultValue={todo.owner} className={FIELD}>
            {members.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <Label>시작일</Label>
          <input
            name="start"
            type="date"
            defaultValue={todo.start ?? ""}
            className={FIELD}
          />
        </div>

        <div>
          <Label>마감일</Label>
          <input
            name="due"
            type="date"
            defaultValue={todo.due ?? ""}
            className={FIELD}
          />
        </div>

        <div>
          <Label>분류</Label>
          <select name="category" defaultValue={todo.category} className={FIELD}>
            <option value="">분류 없음</option>
            {TODO_CATEGORIES.map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </select>
        </div>

        <dl className="border-t border-line pt-4 text-xs text-muted">
          <Meta label="만든 사람" value={todo.author || "-"} />
          <Meta
            label="완료"
            value={todo.completedAt ? formatSeoul(todo.completedAt) : "-"}
          />
        </dl>
      </aside>
    </form>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <span className="mb-1 block text-xs font-medium text-muted">
      {children}
    </span>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-2 py-0.5">
      <dt>{label}</dt>
      <dd className="text-ink">{value}</dd>
    </div>
  );
}

function formatSeoul(iso: string): string {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(iso));
}
