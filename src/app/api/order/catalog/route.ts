import { auth } from "@/lib/auth";
import { getOrderCatalog } from "@/lib/airtable/order";

/** 주문 화면용 카탈로그(가격·재고 포함). 로그인한 직원에게만. */
export async function GET() {
  const session = await auth();
  if (!session?.user.member) return Response.json({ error: "로그인이 필요합니다." }, { status: 401 });
  try {
    return Response.json({ items: await getOrderCatalog() }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "카탈로그를 불러오지 못했습니다." }, { status: 502 });
  }
}
