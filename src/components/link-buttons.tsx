"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { setLinkActiveAction } from "@/app/link-actions";

/** 짧은 주소 복사. 누르면 잠깐 '복사됨'. */
export function CopyButton({ text, label = "복사" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="rounded-[3px] border border-line px-1.5 py-0.5 text-[11px] text-muted hover:bg-canvas hover:text-ink"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          window.prompt("복사해서 쓰세요", text);
        }
      }}
    >
      {copied ? "복사됨" : label}
    </button>
  );
}

/** 일시정지 / 다시 켜기. 정지하면 짧은 주소가 안내 화면만 보인다. */
export function LinkToggle({ id, active }: { id: string; active: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      className="btn"
      disabled={pending}
      onClick={() => {
        if (active && !window.confirm("일시정지하면 이 QR·링크로 들어온 사람은 안내 화면만 본다. 정지할까?")) return;
        start(async () => {
          const result = await setLinkActiveAction(id, !active);
          if (result.error) window.alert(result.error);
          else router.refresh();
        });
      }}
    >
      {pending ? "바꾸는 중" : active ? "일시정지" : "다시 켜기"}
    </button>
  );
}
