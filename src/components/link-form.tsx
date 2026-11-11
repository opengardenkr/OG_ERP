"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { createLinkAction, updateLinkAction, type LinkActionState } from "@/app/link-actions";
import { LINK_CATEGORIES } from "@/lib/link-stats";

type Editing = { id: string; name: string; target: string; category: string; memo: string };

/**
 * [링크 만들기] / [고치기]. 열면 한 열 폼.
 * 고칠 때 짧은 주소(코드)는 못 바꾼다 — 인쇄한 QR이 깨진다. 넘길 주소는 언제든 바꿀 수 있다.
 */
export function LinkForm({ editing }: { editing?: Editing }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<LinkActionState>({ error: null });
  const [pending, start] = useTransition();

  const action = (formData: FormData) =>
    start(async () => {
      const result = editing ? await updateLinkAction(editing.id, formData) : await createLinkAction(formData);
      setState(result);
      if (result.done) {
        setOpen(false);
        if (!editing && result.id) router.push(`/links/${result.id}`);
        else router.refresh();
      }
    });

  if (!open) {
    return (
      <button type="button" className={editing ? "btn" : "btn-primary"} onClick={() => setOpen(true)}>
        {editing ? "고치기" : "링크 만들기"}
      </button>
    );
  }

  return (
    <form action={action} data-og-saving={pending ? "true" : undefined} className="card w-full p-4 sm:w-[440px]">
      <p className="section-title">{editing ? "링크 고치기" : "새 추적 링크"}</p>
      <div className="mt-2 flex flex-col gap-2">
        <label className="flex flex-col gap-1 text-xs text-muted">
          이름
          <input name="name" required defaultValue={editing?.name} placeholder="예: 국정박 아이파크 도슨트" className="field" />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted">
          넘길 주소
          <input name="target" type="url" required defaultValue={editing?.target} placeholder="https://open-garden.co.kr/…" className="field" />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted">
          분류
          <select name="category" defaultValue={editing?.category ?? "기타"} className="field">
            {LINK_CATEGORIES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </label>
        {editing ? null : (
          <label className="flex flex-col gap-1 text-xs text-muted">
            짧은 주소 (선택) — 비우면 6자로 자동
            <input name="code" placeholder="예: ipark" pattern="[A-Za-z0-9][A-Za-z0-9\-]{1,30}[A-Za-z0-9]" className="field" />
          </label>
        )}
        <label className="flex flex-col gap-1 text-xs text-muted">
          메모 (선택)
          <input name="memo" defaultValue={editing?.memo} placeholder="어디에 붙였는지, 누구에게 보냈는지" className="field" />
        </label>
      </div>
      <div className="mt-3 flex items-center justify-end gap-2">
        {state.error ? <span className="mr-auto text-xs text-danger" role="alert">{state.error}</span> : null}
        <button type="button" className="btn" onClick={() => setOpen(false)} disabled={pending}>취소</button>
        <button type="submit" className="btn-primary" disabled={pending}>
          {pending ? "저장 중" : editing ? "저장" : "만들기"}
        </button>
      </div>
    </form>
  );
}
