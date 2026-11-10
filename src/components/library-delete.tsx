"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { deleteLibraryAction } from "@/app/library-actions";

export function LibraryDelete({ id, title }: { id: string; title: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      className="text-[11px] text-muted hover:text-danger disabled:opacity-50"
      onClick={() => {
        if (!window.confirm(`'${title}' 자료를 지울까? 되살릴 수 없다.`)) return;
        start(async () => {
          const r = await deleteLibraryAction(id);
          if (r.error) window.alert(r.error);
          else router.refresh();
        });
      }}
    >
      {pending ? "지우는 중" : "삭제"}
    </button>
  );
}
