import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { ToolFrame } from "@/components/tool-frame";
import { SUPPLIERS, SUPPLIER_INFO } from "@/lib/order";

export const metadata = { title: "품목 고르기 | 오픈가든", robots: { index: false, follow: false } };

/**
 * 카탈로그에서 품목·수량을 고른다 (public/tools/order.html).
 * 위에서 업체(국내·호게나르드·HBM)를 고른다(?supplier=). 고른 뒤: 주문서로 저장(?program=<id>면 그 주문서를 고친다) / 주문 접수 / 견적서로.
 */
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const selection = typeof params.og_selection === "string" && params.og_selection.length <= 7000 ? params.og_selection : "";
  const program = typeof params.program === "string" && /^(new|rec[A-Za-z0-9]{14})$/.test(params.program) ? params.program : "";
  const supplier = SUPPLIERS.find((s) => s === params.supplier);
  const query = new URLSearchParams();
  if (selection) query.set("og_selection", selection);
  if (program) query.set("program", program);
  if (supplier) query.set("supplier", supplier);
  const src = "/tools/order.html" + (query.size ? `?${query}` : "");
  return (
    <AppShell
      title={program === "new" ? `새 ${supplier ? SUPPLIER_INFO[supplier].label + " " : ""}주문서` : program ? "주문서 품목 고치기" : "품목 고르기"}
      action={<Link href={program && program !== "new" ? `/catalog/${program}` : `/catalog${supplier ? `?s=${supplier}` : ""}`} className="btn text-sm">← 주문서</Link>}
    >
      <ToolFrame title="주문" src={src} />
    </AppShell>
  );
}
