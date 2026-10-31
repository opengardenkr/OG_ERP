"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  { href: "/", label: "대시보드" },
  { href: "/calendar", label: "일정" },
  { href: "/proposal", label: "제안서" },
  { href: "/proposal/genus", label: "속명 제안서" },
  { href: "/quote", label: "견적서" },
  { href: "/catalog", label: "주문" },
  { href: "/catalog/quick", label: "현장 빠른등록" },
  { href: "/catalog/manage", label: "품종 관리" },
  { href: "/sales-map", label: "영업 지도" },
  { href: "/updates", label: "업데이트" },
] as const;

export function Nav() {
  const pathname = usePathname();

  return (
    <nav className="flex flex-wrap gap-1 sm:flex-col">
      {ITEMS.map((item) => {
        // '오늘'은 정확히 일치할 때만. 나머지는 하위 경로도 선택으로 본다.
        const active =
          item.href === "/"
            ? pathname === "/"
            : pathname === item.href || (item.href !== "/catalog" && item.href !== "/proposal" && pathname.startsWith(`${item.href}/`));

        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={`rounded-[3px] border-l-[3px] px-3 py-[7px] text-sm transition-colors ${
              active
                ? "border-brand-600 bg-brand-50 font-semibold text-brand-600"
                : "border-transparent text-muted hover:bg-canvas hover:text-ink"
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
