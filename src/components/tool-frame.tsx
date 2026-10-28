"use client";
import { useState } from "react";
export function ToolFrame({ title, src }: { title: string; src: string }) {
  const [loaded, setLoaded] = useState(false);
  return <section className="relative">
    {!loaded && <p role="status" className="p-4 text-sm text-muted">{title} 불러오는 중…</p>}
    <iframe title={title} src={`${src}${src.includes("?") ? "&" : "?"}embedded=1`} onLoad={() => setLoaded(true)} className="w-full min-h-[calc(100dvh-140px)] border-0 bg-white" />
  </section>;
}
