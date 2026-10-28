import { AppShell } from "@/components/app-shell";
import { ToolFrame } from "@/components/tool-frame";
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
 const params = await searchParams;
 const selection = typeof params.og_selection === "string" && params.og_selection.length <= 7000 ? params.og_selection : "";
 return <AppShell title="카탈로그 선택"><ToolFrame title="카탈로그 선택" src={"/tools/catalog-bridge.html" + (selection ? "?og_selection=" + encodeURIComponent(selection) : "")} /></AppShell>;
}
