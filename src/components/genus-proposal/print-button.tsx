"use client";

export function PrintButton() {
  return (
    <button type="button" onClick={() => window.print()}>
      PDF로 저장
    </button>
  );
}
