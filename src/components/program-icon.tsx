"use client";

import { DynamicIcon, iconNames, type IconName } from "lucide-react/dynamic";

const FALLBACK: IconName = "app-window";

/**
 * Airtable `아이콘` 필드는 자유 텍스트라 오타가 들어올 수 있다.
 * 없는 이름이면 기본 아이콘으로 대체한다. 화면이 깨지지 않게.
 */
export function ProgramIcon({ name, size = 20 }: { name: string; size?: number }) {
  const icon = (iconNames as readonly string[]).includes(name)
    ? (name as IconName)
    : FALLBACK;

  return <DynamicIcon name={icon} size={size} className="text-brand-700" />;
}
