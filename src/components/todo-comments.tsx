"use client";

import { useActionState, useRef } from "react";

import { addCommentAction, type ActionState } from "@/app/todo-actions";
import { parseComments } from "@/lib/comments";

export function TodoComments({ id, raw }: { id: string; raw: string }) {
  const form = useRef<HTMLFormElement>(null);
  const [state, action, pending] = useActionState<ActionState, FormData>(
    async (prev, formData) => {
      const next = await addCommentAction(id, prev, formData);
      if (!next.error) form.current?.reset();
      return next;
    },
    { error: null },
  );

  const comments = parseComments(raw);

  return (
    <section className="mt-10">
      <h2 className="section-title mb-3">댓글</h2>

      <form data-og-saving={pending ? "true" : undefined} ref={form} action={action} className="mb-4">
        <textarea
          name="body"
          rows={3}
          placeholder="이 할 일에 대해 남길 말"
          className="field w-full resize-y"
          required
        />
        <div className="mt-2 flex items-center gap-3">
          <button
            type="submit"
            disabled={pending}
            className="btn-primary"
          >
            {pending ? "남기는 중" : "댓글 남기기"}
          </button>
          {state.error ? (
            <span className="text-sm text-red-700">{state.error}</span>
          ) : null}
        </div>
      </form>

      {comments.length === 0 ? (
        <p className="rounded-lg border border-dashed border-line p-6 text-center text-sm text-muted">
          아직 댓글이 없다.
        </p>
      ) : (
        <ul className="space-y-3">
          {comments.map((comment, index) => (
            <li
              key={`${comment.at}-${index}`}
              className="card p-3"
            >
              <div className="mb-1 flex gap-2 text-xs text-muted">
                <span className="font-medium text-ink">
                  {comment.author || "(작성자 없음)"}
                </span>
                <span>{comment.at}</span>
              </div>
              <p className="text-sm whitespace-pre-wrap">{comment.body}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
