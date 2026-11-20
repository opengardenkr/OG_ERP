"use client";

import { useLayoutEffect, useRef } from "react";

/** A4 쪽 너비(198mm)를 화면 픽셀로. 96dpi 기준. */
const PAGE_PX = (198 / 25.4) * 96;

/**
 * 폰에서 A4 쪽을 화면 너비에 맞춰 통째로 줄인다 — 가로 스크롤 없이 한 화면에 들어와 그대로 캡처할 수 있다.
 * 비율·줄바꿈은 A4 그대로(`zoom`이라 글자 위치가 인쇄본과 같다). 인쇄·PDF는 원래 크기(po.css의 print 규칙).
 */
export function FitWidth({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const fit = () => {
      const style = getComputedStyle(el);
      const room = el.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
      el.style.setProperty("--po-zoom", String(Math.min(1, room / PAGE_PX)));
    };
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, []);

  return (
    <div ref={ref} className="po-holder">
      {children}
    </div>
  );
}
