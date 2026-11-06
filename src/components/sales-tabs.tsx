import { Tabs } from "@/components/tabs";

/** 매출 화면 탭: 매출(전체·월별) / 미수금 / 마진(대표만, src/config/users.ts ADMIN_MEMBERS). */
export function SalesTabs({ active, admin }: { active: "매출" | "미수금" | "마진"; admin: boolean }) {
  const items = [{ href: "/sales", label: "매출" }, { href: "/sales/receivables", label: "미수금" }];
  if (admin) items.push({ href: "/sales/margin", label: "마진" });
  return <Tabs items={items} active={active} />;
}
