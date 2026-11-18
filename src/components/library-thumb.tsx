"use client";

/* eslint-disable @next/next/no-img-element -- 서버 리디렉션(/library/<id>/thumb)을 거치는 외부 이미지 */
import { useState } from "react";

/** 세로가 가로의 1.6배를 넘으면(배너 등) 상자를 꽉 채우고 위쪽만 보인다. A4·A1(1.41배)은 통째로 보인다. */
const TALL_RATIO = 1.6;

/**
 * 자료실 카드의 1쪽 미리보기. 주소가 아직 404면(올린 직후 Airtable이 썸네일을 만드는 중)
 * 깨진 그림 대신 파일명을 보인다. 상자 크기는 카드마다 같다(3:4) — 긴 그림은 위에서부터 잘린다.
 */
export function LibraryThumb({ src, fileName }: { src: string | null; fileName: string }) {
  const [failed, setFailed] = useState(false);
  const [tall, setTall] = useState(false);
  if (!src || failed) return <span className="text-xs text-muted">{fileName}</span>;
  return (
    <img
      src={src}
      alt=""
      loading="lazy"
      onLoad={(e) => {
        const { naturalWidth: w, naturalHeight: h } = e.currentTarget;
        setTall(w > 0 && h / w > TALL_RATIO);
      }}
      onError={() => setFailed(true)}
      className={`border border-line bg-white shadow-sm ${tall ? "h-full w-full object-cover object-top" : "max-h-full max-w-full object-contain"}`}
    />
  );
}
