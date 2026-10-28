import { auth } from "@/lib/auth";
import { listManagedCatalog, saveManagedCatalog, orderManagedPhotos, uploadManagedPhoto } from "@/lib/airtable/catalog-management";
export async function GET() {
 const session = await auth(); if (!session?.user.member) return Response.json({error:"로그인이 필요합니다."},{status:401});
 try { return Response.json({items:await listManagedCatalog()},{headers:{"Cache-Control":"private, no-store"}}); }
 catch { return Response.json({error:"카탈로그를 불러오지 못했습니다. 연결 설정을 확인해 주세요."},{status:502}); }
}
export async function POST(req: Request) {
 const session = await auth(); if (!session?.user.member) return Response.json({error:"로그인이 필요합니다."},{status:401});
 if (req.headers.get("origin") !== new URL(req.url).origin) return Response.json({error:"허용되지 않은 요청입니다."},{status:403});
 if (Number(req.headers.get("content-length") || 0) > 3 * 1024 * 1024) return Response.json({error:"파일이 너무 큽니다."},{status:413});
 try {
 let item;
 if (req.headers.get("content-type")?.startsWith("multipart/form-data")) {
  const form = await req.formData(), file = form.get("file");
  if (!(file instanceof File)) throw new Error("사진 파일이 필요합니다.");
  item = await uploadManagedPhoto(String(form.get("id") || ""),file,String(form.get("version") || ""));
 } else {
  const body = await req.json();
  if (body.action === "photos") item = await orderManagedPhotos(body.id,body.ids,body.version);
  else if (body.action === "save") item = await saveManagedCatalog(body.input,body.id,body.version);
  else throw new Error("지원하지 않는 요청입니다.");
 }
 return Response.json({item});
 } catch (e) { return Response.json({error:e instanceof Error ? e.message : "저장에 실패했습니다."},{status:400}); }
}
