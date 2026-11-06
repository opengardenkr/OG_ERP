import { auth } from "@/lib/auth";
import { getProgramSelection, saveProgram } from "@/lib/airtable/order-programs";
import { readProgramInput } from "@/lib/order";

const NO_STORE = { "Cache-Control": "private, no-store" };

/** 주문 화면이 주문서를 다시 고칠 때 이름·조건·고른 수량을 받아 간다. */
export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user.member) return Response.json({ error: "로그인이 필요합니다." }, { status: 401 });
  const id = new URL(request.url).searchParams.get("id") ?? "";
  try {
    const program = await getProgramSelection(id);
    if (!program) return Response.json({ error: "주문서를 찾지 못했습니다." }, { status: 404 });
    return Response.json(program, { headers: NO_STORE });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "주문서를 불러오지 못했습니다." }, { status: 502 });
  }
}

/** 주문서 저장(새로 / 고치기). 고치면 묶인 링크의 품목도 함께 바뀐다. */
export async function POST(request: Request) {
  const session = await auth();
  const author = session?.user.member;
  if (!author) return Response.json({ error: "로그인이 필요합니다." }, { status: 401 });
  const input = readProgramInput(await request.json().catch(() => null));
  if (!input.ok) return Response.json({ error: input.message }, { status: 400 });
  try {
    return Response.json(await saveProgram(input.value, author), { headers: NO_STORE });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "주문서를 저장하지 못했습니다." }, { status: 502 });
  }
}
