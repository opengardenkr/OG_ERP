"use client";

import Image from "next/image";
import { useState } from "react";
import { ProgramIcon } from "@/components/program-icon";

function imageUrl(value?: string) {
  if (!value) return null;
  if (value.startsWith("/") && !value.startsWith("//")) return value;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password ? value : null;
  } catch {
    return null;
  }
}

export function ProgramPreview({
  src,
  name,
  icon,
}: {
  src?: string;
  name: string;
  icon: string;
}) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const url = imageUrl(src);

  return (
    <div className="relative aspect-[16/9] overflow-hidden border-b border-line bg-canvas">
      <div aria-hidden="true" className="absolute inset-0 flex flex-col items-center justify-center gap-3">
        <ProgramIcon name={icon} size={40} />
        <span className="text-sm font-medium text-muted">{name}</span>
      </div>
      {url && failedSrc !== url ? (
        <Image
          src={url}
          alt={`${name} 대표 이미지`}
          fill
          // Assets are already compressed; direct loading preserves ERP login cookies.
          unoptimized
          loading="lazy"
          className="object-cover"
          onError={() => setFailedSrc(url)}
        />
      ) : null}
    </div>
  );
}
