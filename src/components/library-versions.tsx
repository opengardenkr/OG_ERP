"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

export type LibraryVersionLink = { id: string; date: string; fileName: string; fileUrl: string };

/**
 * 자료실 카드의 누르는 영역. 버전이 하나면 바로 연다.
 * 둘 이상이면 날짜 목록을 띄워 고르게 한다 — 카드는 하나, 갱신 과정은 여기서 본다.
 */
export function LibraryVersions({
  versions,
  latestUrl,
  label,
  className,
  children,
}: {
  versions: LibraryVersionLink[];
  latestUrl: string;
  label: string;
  className: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  if (versions.length <= 1) {
    return (
      <a href={latestUrl} target="_blank" rel="noreferrer" className={className} aria-label={`${label} 열기`}>
        {children}
      </a>
    );
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        className={`${className} w-full text-left`}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`${label} 버전 고르기`}
      >
        {children}
      </button>
      {open ? (
        <ul role="menu" className="card absolute left-2 right-2 top-2 z-10 p-1 shadow-md">
          <li className="px-2 py-1 text-[11px] text-faint">버전 {versions.length}개 · 날짜를 고르면 열린다</li>
          {versions.map((v, i) => (
            <li key={v.id} role="none">
              <a
                role="menuitem"
                href={v.fileUrl}
                target="_blank"
                rel="noreferrer"
                className="flex items-center justify-between gap-2 rounded-[3px] px-2 py-1.5 text-sm hover:bg-canvas"
                onClick={() => setOpen(false)}
              >
                <span>{v.date}</span>
                <span className="text-[11px] text-faint">{i === 0 ? "최신" : ""}</span>
              </a>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
