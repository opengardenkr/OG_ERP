import { auth } from '@/lib/auth';
import { setQuoteDeleted } from '@/lib/airtable/quotes';

export async function PATCH(request: Request, context: {params: Promise<{id:string}>}) {
  const session = await auth();
  if (!session?.user.member) return Response.json({error:'로그인이 필요합니다.'},{status:401});
  if (request.headers.get('origin') !== new URL(request.url).origin) return Response.json({error:'허용되지 않은 요청입니다.'},{status:403});
  const {id} = await context.params;
  if (!/^rec[A-Za-z0-9]{14}$/.test(id)) return Response.json({error:'잘못된 견적 번호입니다.'},{status:400});
  let body;
  try { body = await request.json(); } catch {return Response.json({error:'잘못된 요청입니다.'},{status:400});}
  if (!body || typeof body.deleted !== 'boolean' || (body.deleted && (typeof body.reason !== 'string' || !body.reason.trim() || body.reason.length > 500))) return Response.json({error:'삭제 사유를 500자 이내로 입력해주세요.'},{status:400});
  try {
    await setQuoteDeleted(id,body.deleted,body.deleted ? body.reason.trim() : '',session.user.member);
    return Response.json({ok:true});
  } catch(error) { return Response.json({error:error instanceof Error ? error.message : '저장 실패'},{status:502}); }
}
