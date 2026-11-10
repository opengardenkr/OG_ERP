"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";

import { uploadLibraryAction, type LibraryActionState } from "@/app/library-actions";

const CATEGORIES = ["영업", "수입", "시공", "자재", "내부"] as const;

/** 자료실 상단의 [자료 올리기]. 열면 제목·분류·파일 한 줄 폼. */
export function LibraryUpload() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const [state, setState] = useState<LibraryActionState>({ error: null });
  const [pending, start] = useTransition();

  const action = (formData: FormData) =>
    start(async () => {
      const result = await uploadLibraryAction({ error: null }, formData);
      setState(result);
      if (result.done) {
        formRef.current?.reset();
        setOpen(false);
        router.refresh();
      }
    });

  if (!open) {
    return (
      <button type="button" className="btn-primary" onClick={() => setOpen(true)}>
        자료 올리기
      </button>
    );
  }

  return (
    <form
      ref={formRef}
      action={action}
      data-og-saving={pending ? "true" : undefined}
      className="card w-full p-4 sm:w-[420px]"
    >
      <p className="section-title">새 자료</p>
      <div className="mt-2 flex flex-col gap-2">
        <input name="title" required placeholder="자료 제목" className="field" />
        <input name="description" placeholder="한 줄 설명 (선택)" className="field" />
        <select name="category" defaultValue="영업" className="field">
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
        <input
          name="file"
          type="file"
          required
          accept=".pdf,.png,.jpg,.jpeg,.xlsx,.docx,.pptx"
          className="field file:mr-2 file:rounded-[3px] file:border-0 file:bg-canvas file:px-2 file:py-1 file:text-xs"
        />
        <p className="text-xs text-muted">PDF 권장, 5MB까지. 첫 쪽이 미리보기로 쓰인다.</p>
      </div>
      <div className="mt-3 flex items-center justify-end gap-2">
        {state.error ? <span className="mr-auto text-xs text-danger" role="alert">{state.error}</span> : null}
        <button type="button" className="btn" onClick={() => setOpen(false)} disabled={pending}>취소</button>
        <button type="submit" className="btn-primary" disabled={pending}>{pending ? "올리는 중" : "올리기"}</button>
      </div>
    </form>
  );
}
