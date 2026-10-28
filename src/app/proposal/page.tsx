import { AppShell } from "@/components/app-shell";
import { ToolFrame } from "@/components/tool-frame";
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
 const params = await searchParams;
 const selection = typeof params.og_selection === "string" && params.og_selection.length <= 7000 ? params.og_selection : "";
 return <AppShell title="제안서"><ToolFrame title="제안서" src={"/tools/proposal.html" + (selection ? "?og_selection=" + encodeURIComponent(selection) : "")} /></AppShell>;
}
