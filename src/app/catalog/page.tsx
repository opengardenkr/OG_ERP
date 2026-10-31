import { AppShell } from "@/components/app-shell";
import { ToolFrame } from "@/components/tool-frame";

/** 주문: 카탈로그에서 품목·수량을 골라 고객 링크를 만들거나 바로 접수한다 (public/tools/order.html) */
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const selection = typeof params.og_selection === "string" && params.og_selection.length <= 7000 ? params.og_selection : "";
  return <AppShell title="주문"><ToolFrame title="주문" src={"/tools/order.html" + (selection ? "?og_selection=" + encodeURIComponent(selection) : "")} /></AppShell>;
}
