"use client";

import Link from "next/link";

import { useEventEditor } from "@/components/event-composer";
import type { PortalEvent } from "@/lib/calendar/types";

/**
 * 달력 위 일정 하나. 누르면 포털 안에서 열린다.
 * - 구글 일정: 일정 창(고칠 수 있으면 고치기, 아니면 보기)
 * - 할 일: 할 일 상세 창(같은 탭)
 * 창을 띄울 수 없는 곳에서만 원본으로 간다.
 */
export function EventLink({
  event,
  className = "",
  time,
}: {
  event: PortalEvent;
  className?: string;
  /** 제목 앞에 붙는 시각. 누르는 영역에 함께 들어간다 */
  time?: string;
}) {
  const editor = useEventEditor();
  const label = (
    <>
      {time ? <span className="opacity-70">{time} </span> : null}
      {event.title}
    </>
  );

  if (event.google && editor) {
    return (
      <button
        type="button"
        onClick={() => editor.open(event)}
        title={event.title}
        className={`cursor-pointer text-left ${className}`}
      >
        {label}
      </button>
    );
  }

  if (!event.href) return <span className={className}>{label}</span>;

  if (event.href.startsWith("/")) {
    return (
      <Link href={event.href} title={event.title} className={className}>
        {label}
      </Link>
    );
  }

  return (
    <a
      href={event.href}
      target="_blank"
      rel="noreferrer"
      title={event.title}
      className={className}
    >
      {label}
    </a>
  );
}
