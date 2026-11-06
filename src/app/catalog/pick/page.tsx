import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { OrderTabs } from "@/components/order-tabs";
import { ToolFrame } from "@/components/tool-frame";
import { SUPPLIERS, SUPPLIER_INFO } from "@/lib/order";

export const metadata = { title: "주문서 작성 | 오픈가든", robots: { index: false, follow: false } };

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
  const editing = program && program !== "new";
  const subtitle = editing ? "저장한 주문서의 품목·가격을 고칩니다. 저장하면 배포한 링크도 같이 바뀝니다."
    : program === "new" ? "맨 위에서 업체(국내 · 호게나르드 · HBM)를 고르고 품목을 골라 [주문서로 저장]. 전화 주문은 [주문 접수]."
    : "카탈로그 전체에서 고릅니다. 주문서로 저장하려면 업체를 하나 고르세요.";
  return (
    <AppShell
      title="주문"
      subtitle={subtitle}
      action={editing ? <Link href={`/catalog/${program}`} className="btn text-sm">← 주문서로</Link> : undefined}
    >
      <OrderTabs active="주문서 작성" />
      {supplier && program === "new" ? <p className="-mt-2 mb-2 text-xs text-muted">{SUPPLIER_INFO[supplier].label} 주문서</p> : null}
      <ToolFrame title="주문서 작성" src={src} />
    </AppShell>
  );
}
