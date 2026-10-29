import "server-only";
import { uploadManagedPhoto } from "@/lib/airtable/catalog-management";

const API = "https://commons.wikimedia.org/w/api.php";
const AGENT = "OpenGardenBotanicalCatalog/1.0 (info@open-garden.co.kr)";
type ImageMeta = { url?:string; thumburl?:string; width?:number; height?:number;
  descriptionurl?:string; mime?:string; extmetadata?:Record<string,{value?:string}> };
type ImagePage = { pageid:number; title:string; imageinfo?:ImageMeta[] };
type CommonsData = {query?:{pages?:Record<string,ImagePage>}};
const licenseOf=(meta:ImageMeta)=>String(meta.extmetadata?.LicenseShortName?.value||"").replace(/<[^>]+>/g,"").trim();
const isCC0=(license:string)=>/^CC0(?:\s|$)/i.test(license);
async function commons(parameters:Record<string,string>):Promise<ImagePage[]> {
  const url=new URL(API);
  Object.entries({action:"query",format:"json",formatversion:"2",prop:"imageinfo",iiprop:"url|size|mime|extmetadata",iiurlwidth:"1200",iiextmetadatafilter:"LicenseShortName|LicenseUrl|Artist",...parameters}).forEach(([k,v])=>url.searchParams.set(k,v));
  const res=await fetch(url,{headers:{"User-Agent":AGENT},cache:"no-store",signal:AbortSignal.timeout(12000)});
  if(!res.ok)throw new Error("사진 검색 서비스에 연결하지 못했습니다.");
  const data=await res.json() as CommonsData;
  return Object.values(data.query?.pages||{});
}
export type CommonsCandidate={pageId:number;title:string;preview:string;source:string;license:string;canImport:boolean};
export async function findCommonsPhotos(query:string):Promise<CommonsCandidate[]> {
  const term=query.trim().replace(/[<>\r\n]/g," ").slice(0,100);
  if(term.length<2)return [];
  const pages=await commons({generator:"search",gsrsearch:term,gsrnamespace:"6",gsrlimit:"12"});
  return pages.map(p=>{
    const m=p.imageinfo?.[0],license=m?licenseOf(m):"";
    return {pageId:p.pageid,title:p.title.replace(/^File:/,""),preview:m?.thumburl||"",source:m?.descriptionurl||"",license:license||"권리 확인 필요",canImport:!!m?.thumburl && isCC0(license) && (m?.width||0)>=700 && /^image\/(jpeg|png|webp)$/.test(m?.mime||"")};
  }).filter(p=>p.preview.startsWith("https://upload.wikimedia.org/") && p.source.startsWith("https://commons.wikimedia.org/")).slice(0,10);
}
export async function importCommonsPhoto(id:string,version:string,pageId:number) {
  if(!Number.isSafeInteger(pageId)||pageId<1)throw new Error("잘못된 사진 번호입니다.");
  // Search results can change: re-fetch source/license and use server-verified URL only.
  const pages=await commons({pageids:String(pageId)});
  const m=pages.find(p=>p.pageid===pageId)?.imageinfo?.[0], license=m&&licenseOf(m);
  if(!m?.thumburl || !license || !isCC0(license) || (m.width||0)<700 || !/^image\/(jpeg|png|webp)$/.test(m.mime||"")) throw new Error("CC0 조건 또는 화질을 확인할 수 없는 사진입니다.");
  const url=new URL(m.thumburl);
  if(url.protocol!=="https:"||url.hostname!=="upload.wikimedia.org"||url.port||url.username||url.password)throw new Error("허용되지 않은 사진 출처입니다.");
  const res=await fetch(url,{redirect:"error",cache:"no-store",signal:AbortSignal.timeout(12000)});
  const type=(res.headers.get("content-type")||"").split(";")[0].trim();
  if(!res.ok||!["image/jpeg","image/png","image/webp"].includes(type)||Number(res.headers.get("content-length")||0)>2*1024*1024)throw new Error("사진을 안전하게 가져오지 못했습니다.");
  const buffer=Buffer.from(await res.arrayBuffer());
  if(buffer.length>2*1024*1024)throw new Error("사진 크기가 2MB를 넘습니다. 자체 사진 업로드를 이용해 주세요.");
  const ext=type==="image/png"?"png":type==="image/webp"?"webp":"jpg";
  const file=new File([new Uint8Array(buffer)],`commons_cc0_${pageId}.${ext}`,{type});
  return uploadManagedPhoto(id,file,version);
}
