import { Tabs } from "@/components/tabs";

/** 매출 화면 탭. 마진은 대표만 보인다(src/config/users.ts ADMIN_MEMBERS). */
export function SalesTabs({ active, admin }: { active: "미수금" | "마진"; admin: boolean }) {
  const items = [{ href: "/sales", label: "미수금" }];
  if (admin) items.push({ href: "/sales/margin", label: "마진" });
  return <Tabs items={items} active={active} />;
}
