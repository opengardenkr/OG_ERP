import { Tabs } from "@/components/tabs";

/**
 * 주문 화면 맨 위 두 칸(2026-11-06 사용자 요청).
 * 주문프로그램 = 저장한 주문서 폴더(회사 배포·받은 주문·합산 견적·재고) / 주문서 작성 = 업체 고르고 품목 골라 새로 만들기.
 */
export function OrderTabs({ active }: { active: "주문프로그램" | "주문서 작성" }) {
  return (
    <Tabs
      items={[
        { href: "/catalog", label: "주문프로그램" },
        { href: "/catalog/pick?program=new", label: "주문서 작성" },
      ]}
      active={active}
    />
  );
}
