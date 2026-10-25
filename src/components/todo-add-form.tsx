"use client";

import { useActionState, useRef } from "react";

import { addTodoAction, type ActionState } from "@/app/todo-actions";
import { TODO_CATEGORIES } from "@/lib/todo-types";

function Field({
  label,
  required = false,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-semibold text-muted">
        {label}
        {required ? <span className="ml-0.5 text-danger">*</span> : null}
      </span>
      {children}
    </label>
  );
}

export function TodoAddForm({
  members,
  defaultOwner,
  /** 창 안에서는 세로로 쌓는다. 한 줄에 밀어 넣으면 칸이 좁아 못 읽는다. */
  stacked = false,
  onDone,
}: {
  members: string[];
  defaultOwner: string;
  stacked?: boolean;
  onDone?: () => void;
}) {
  const form = useRef<HTMLFormElement>(null);
  const [state, action, pending] = useActionState<ActionState, FormData>(
    async (prev, formData) => {
      const next = await addTodoAction(prev, formData);
      if (!next.error) {
        form.current?.reset();
        onDone?.();
      }
      return next;
    },
    { error: null },
  );

  if (stacked) {
    return (
      <form data-og-saving={pending ? "true" : undefined} ref={form} action={action}>
        {/* 본문 — 한 열로 쌓는다. 칸마다 제목이 왼쪽 위에 붙는다. */}
        <div className="flex flex-col gap-4 px-5 py-5">
          <Field label="내용" required>
            <input
              name="title"
              placeholder="할 일을 한 줄로"
              className="field w-full"
              required
              autoFocus
            />
          </Field>

          <Field label="설명">
            <textarea
              name="memo"
              rows={4}
              placeholder="진행 상황, 참고 링크 등"
              className="field w-full resize-y"
            />
          </Field>

          <Field label="담당자">
            <select name="owner" defaultValue={defaultOwner} className="field w-full">
              {members.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </Field>

          <Field label="분류">
            <select name="category" defaultValue="" className="field w-full">
              <option value="">분류 없음</option>
              {TODO_CATEGORIES.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field label="시작일">
              <input name="start" type="date" className="field w-full" />
            </Field>
            <Field label="마감일">
              <input name="due" type="date" className="field w-full" />
            </Field>
          </div>
        </div>

        {/* 바닥 — 버튼은 오른쪽 아래 */}
        <div className="flex items-center justify-end gap-2 border-t border-line px-5 py-3">
          {state.error ? (
            <span className="mr-auto text-sm text-danger">{state.error}</span>
          ) : null}
          <button type="button" onClick={onDone} className="btn">
            취소
          </button>
          <button type="submit" disabled={pending} className="btn-primary">
            {pending ? "만드는 중" : "만들기"}
          </button>
        </div>
      </form>
    );
  }

  return (
    <form data-og-saving={pending ? "true" : undefined} ref={form} action={action} className="card p-3">
      <div className="flex flex-wrap gap-2">
        <input
          name="title"
          placeholder="할 일을 적어라"
          className="field min-w-0 flex-1"
          required
        />
        <select name="owner" defaultValue={defaultOwner} className="field">
          {members.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
        <input name="due" type="date" className="field" />
        <select name="category" defaultValue="" className="field">
          <option value="">분류 없음</option>
          {TODO_CATEGORIES.map((category) => (
            <option key={category} value={category}>
              {category}
            </option>
          ))}
        </select>
        <button type="submit" disabled={pending} className="btn-primary">
          {pending ? "추가 중" : "추가"}
        </button>
      </div>

      {state.error ? (
        <p className="mt-2 text-sm text-danger">{state.error}</p>
      ) : null}
    </form>
  );
}
