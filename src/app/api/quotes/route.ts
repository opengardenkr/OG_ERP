import { auth } from '@/lib/auth';
import { listQuoteHistory } from '@/lib/airtable/quotes';

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user.member) return Response.json({ error: '로그인이 필요합니다.' }, { status: 401 });
  const params = new URL(request.url).searchParams;
  const query = (params.get('q') || '').trim(), offset = params.get('offset') || '';
  if (query.length > 100 || offset.length > 1000 || /[\x00-\x1f]/.test(query + offset)) {
    return Response.json({ error: '검색어는 100자 이내로 입력해 주세요.' }, { status: 400 });
  }
  try {
    return Response.json(await listQuoteHistory(query, params.get('deleted') === '1', offset), {
      headers: { 'Cache-Control': 'private, no-store' },
    });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : '견적 조회 실패' }, { status: 502 });
  }
}
