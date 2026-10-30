import { auth } from "@/lib/auth";
import { createOrderLink } from "@/lib/airtable/order";
import { readLinkInput } from "@/lib/order";

/** 고객 주문 링크 만들기 → [영업] 주문 링크 한 줄 + https://open-garden.co.kr/o/<ID> */
export async function POST(request: Request) {
  const session = await auth();
  const author = session?.user.member;
  if (!author) return Response.json({ error: "로그인이 필요합니다." }, { status: 401 });
  const input = readLinkInput(await request.json().catch(() => null));
  if (!input.ok) return Response.json({ error: input.message }, { status: 400 });
  try {
    return Response.json(await createOrderLink(input.value, author), { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "링크를 만들지 못했습니다." }, { status: 502 });
  }
}
