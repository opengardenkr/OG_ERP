import { auth } from "@/lib/auth";
import { findCommonsPhotos, importCommonsPhoto } from "@/lib/catalog-commons";

export async function GET(request:Request) {
  const session=await auth();
  if(!session?.user.member)return Response.json({error:"로그인이 필요합니다."},{status:401});
  const q=new URL(request.url).searchParams.get("q")||"";
  if(q.length>100)return Response.json({error:"검색어는 100자 이내로 입력해 주세요."},{status:400});
  try {
    const candidates=await findCommonsPhotos(q);
    return Response.json({candidates},{headers:{"Cache-Control":"private, no-store"}});
  } catch {return Response.json({error:"외부 사진 검색이 일시적으로 불가능합니다. 직접 사진을 등록할 수 있습니다."},{status:502});}
}
export async function POST(request:Request) {
  const session=await auth();
  if(!session?.user.member)return Response.json({error:"로그인이 필요합니다."},{status:401});
  if(request.headers.get("origin")!==new URL(request.url).origin)return Response.json({error:"허용되지 않은 요청입니다."},{status:403});
  try {
    const data=await request.json() as {id?:unknown;version?:unknown;pageId?:unknown};
    if(typeof data.id!=="string" || typeof data.version!=="string" || typeof data.pageId!=="number")return Response.json({error:"사진 정보를 확인해 주세요."},{status:400});
    const item=await importCommonsPhoto(data.id,data.version,data.pageId);
    return Response.json({item});
  }catch(e){return Response.json({error:e instanceof Error?e.message:"사진을 등록하지 못했습니다."},{status:400});}
}
