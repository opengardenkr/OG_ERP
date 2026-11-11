"use client";

/* eslint-disable @next/next/no-img-element -- 서버 리디렉션(/library/<id>/thumb)을 거치는 외부 이미지 */
import { useState } from "react";

/**
 * 자료실 카드의 1쪽 미리보기. 주소가 아직 404면(올린 직후 Airtable이 썸네일을 만드는 중)
 * 깨진 그림 대신 파일명을 보인다.
 */
export function LibraryThumb({ src, fileName }: { src: string | null; fileName: string }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) return <span className="text-xs text-muted">{fileName}</span>;
  return (
    <img
      src={src}
      alt=""
      loading="lazy"
      onError={() => setFailed(true)}
      className="max-h-full max-w-full border border-line bg-white object-contain shadow-sm"
    />
  );
}
