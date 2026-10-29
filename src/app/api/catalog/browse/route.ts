import { auth } from "@/lib/auth";
export async function GET() {
 const session = await auth(); if (!session?.user.member) return Response.json({error:"로그인이 필요합니다."},{status:401});
 try {
 const lists = await Promise.all(["immediate","preorder","hoogenraad","hbm"].map(async group=>{
 const response = await fetch(`https://open-garden.co.kr/api/catalog?group=${group}`,{next:{revalidate:60},signal:AbortSignal.timeout(15000)});
 if (!response.ok) throw Error("catalog"); const data=await response.json();
 return (data.items || []).map((p: { id:string; kname:string; sname:string; size:string|string[]; image:string|null; thumb?:string|null; sku?:string;source?:string })=>({ id:p.id,kname:p.kname,sname:p.sname,size:p.size,image:p.image ? `https://open-garden.co.kr/api/plant-image?group=${group}&id=${encodeURIComponent(p.id)}&index=0&w=520` : "",sku:p.sku||"",source:p.source||"",group }));
 }));
 return Response.json({items:lists.flat()},{headers:{"Cache-Control":"private, no-store"}});
 } catch {return Response.json({error:"카탈로그를 불러오지 못했습니다. 잠시 뒤 다시 시도해 주세요."},{status:502});}
}
