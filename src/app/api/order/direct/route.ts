import { auth } from "@/lib/auth";
import { createDirectOrder } from "@/lib/airtable/order";
import { readDirectInput } from "@/lib/order";

/** 직원이 받은 주문을 바로 접수 → 견적요청 표(웹 접수와 같은 곳, 같은 카톡 알림) */
export async function POST(request: Request) {
  const session = await auth();
  const author = session?.user.member;
  if (!author) return Response.json({ error: "로그인이 필요합니다." }, { status: 401 });
  const input = readDirectInput(await request.json().catch(() => null));
  if (!input.ok) return Response.json({ error: input.message }, { status: 400 });
  try {
    return Response.json(await createDirectOrder(input.value, author), { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "주문을 접수하지 못했습니다." }, { status: 502 });
  }
}
