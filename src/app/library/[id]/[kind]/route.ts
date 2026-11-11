import { auth } from "@/lib/auth";
import { resolveLibraryUrl } from "@/lib/airtable/library";

/**
 * 자료실 파일의 고정 주소. `/library/<레코드ID>/file` · `/library/<레코드ID>/thumb`.
 * Airtable 첨부 URL은 몇 시간 뒤 만료되므로 카드·공유 링크는 이 주소를 쓰고,
 * 열 때마다 서버가 Airtable에서 새 URL을 받아 넘긴다(302). 파일은 여전히 Airtable이 든다(원칙 2·3).
 */
export async function GET(_request: Request, context: { params: Promise<{ id: string; kind: string }> }) {
  const session = await auth();
  if (!session?.user.member) return new Response("로그인이 필요하다", { status: 401 });

  const { id, kind } = await context.params;
  if (!/^rec[A-Za-z0-9]{14}$/.test(id) || (kind !== "file" && kind !== "thumb")) {
    return new Response("잘못된 주소", { status: 400 });
  }

  const url = await resolveLibraryUrl(id, kind);
  if (!url) return new Response("자료가 없다", { status: 404 });

  // 짧게만 캐시한다 — 리디렉션 대상이 만료되기 훨씬 전에 다시 받는다.
  return Response.redirect(url, 302);
}
