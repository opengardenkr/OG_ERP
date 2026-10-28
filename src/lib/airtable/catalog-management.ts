import "server-only";
import { createHash } from "node:crypto";
import { validateCatalogInput, validatePhotoOrder, MAX_PHOTO_BYTES, MAX_PHOTOS } from "@/lib/catalog-input";
const TABLE = "tblDMLlaBwkW1NfhU";
const F = { name: "fldxfOsqC0b41oxmt", scientificName: "fld92Co6Q7JYeyAPe", sizes: "fldBy0z3isyaVqCmC", price: "fldCjIpc6W8GzdXjm", summary: "fldbfuW3P3N5QYxNE", photos: "fldwpaj4TS0bW9E0x", visibility: "flda4BMnsROcUcBVF" };
type Attachment = { id: string; url: string; filename?: string };
type RecordData = { id: string; fields: Record<string, unknown> };
function config() {
 const token = process.env.AIRTABLE_TOKEN?.trim(), base = process.env.AIRTABLE_BASE_ID?.trim();
 if (!token || !base) throw new Error("카탈로그 연결 설정이 필요합니다.");
 return { token, base };
}
async function request(path: string, method = "GET", body?: unknown, content = false) {
 const { token } = config();
 const response = await fetch(`https://${content ? "content" : "api"}.airtable.com/v0/${path}`, { method, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body), cache: "no-store", signal: AbortSignal.timeout(20000) });
 if (!response.ok) throw new Error(response.status === 403 ? "카탈로그 쓰기 권한이 없습니다. 관리자에게 문의해 주세요." : response.status === 429 ? "요청이 많습니다. 잠시 후 다시 시도해 주세요." : "카탈로그 저장소 요청에 실패했습니다. 내용을 유지한 채 다시 시도해 주세요.");
 return response.json();
}
function normalize(record: RecordData) {
 const f = record.fields;
 const photos = (Array.isArray(f[F.photos]) ? f[F.photos] : []) as Attachment[];
 return { id: record.id, name: String(f[F.name] || ""), scientificName: String(f[F.scientificName] || ""), sizes: (f[F.sizes] || []) as string[], price: typeof f[F.price] === "number" ? f[F.price] as number : null, summary: String(f[F.summary] || ""), visibility: String(f[F.visibility] || ""), photos: photos.map(p => ({ id:p.id, url:p.url, filename:p.filename || "식물 사진" })), version: createHash("sha256").update(JSON.stringify(Object.values(F).map(k => [k,f[k] ?? null]))).digest("hex") };
}
export async function listManagedCatalog() {
 const { base } = config(); let offset = ""; const result = [];
 do {
 const params = new URLSearchParams({ returnFieldsByFieldId: "true", pageSize: "100" });
 Object.values(F).forEach(id => params.append("fields[]",id)); if (offset) params.set("offset",offset);
 const data = await request(`${base}/${TABLE}?${params}`);
 result.push(...(data.records as RecordData[]).map(normalize)); offset = data.offset || "";
 } while (offset && result.length < 1000);
 return result;
}
async function read(id: string) {
 if (!/^rec[a-zA-Z0-9]{14}$/.test(id)) throw new Error("품종 식별자가 올바르지 않습니다.");
 const { base } = config(); return await request(`${base}/${TABLE}/${id}?returnFieldsByFieldId=true`) as RecordData;
}
export async function saveManagedCatalog(value: unknown, id?: string, version?: string) {
 const input = validateCatalogInput(value), { base } = config();
 if (id) { const current = normalize(await read(id)); if (!version || current.version !== version) throw new Error("다른 곳에서 수정된 품종입니다. 목록을 새로고침한 뒤 다시 수정해 주세요."); }
 const fields = { [F.name]:input.name || null, [F.scientificName]:input.scientificName || null, [F.sizes]:input.sizes, [F.price]:input.price, [F.summary]:input.summary || null, [F.visibility]:id ? input.visibility || null : "비공개" };
 const result = await request(`${base}/${TABLE}${id ? `/${id}` : ""}`, id ? "PATCH" : "POST", { fields, returnFieldsByFieldId:true });
 return normalize(result);
}
export async function orderManagedPhotos(id: string, ids: unknown, version: string) {
 const current = normalize(await read(id));
 if (current.version !== version) throw new Error("사진이 변경됐습니다. 새로고침 후 다시 시도해 주세요.");
 const order = validatePhotoOrder(ids, current.photos.map(p=>p.id)), { base } = config();
 return normalize(await request(`${base}/${TABLE}/${id}`, "PATCH", { fields: { [F.photos]: order.map(id=>({id})) }, returnFieldsByFieldId:true }));
}
export async function uploadManagedPhoto(id: string, file: File, version: string) {
 const current = normalize(await read(id));
 if (current.version !== version) throw new Error("품종이 변경됐습니다. 새로고침 후 다시 시도해 주세요.");
 if (current.photos.length >= MAX_PHOTOS) throw new Error("사진은 대표사진을 포함해 최대 5장입니다.");
 if (!file.size || file.size > MAX_PHOTO_BYTES || !["image/jpeg","image/png","image/webp"].includes(file.type)) throw new Error("사진은 2MB 이하 JPG, PNG, WebP만 가능합니다.");
 const bytes = Buffer.from(await file.arrayBuffer());
 const valid = file.type === "image/jpeg" ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255 : file.type === "image/png" ? bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])) : bytes.toString("ascii",0,4) === "RIFF" && bytes.toString("ascii",8,12) === "WEBP";
 if (!valid) throw new Error("사진 파일 형식을 확인해 주세요.");
 const { base } = config();
 await request(`${base}/${id}/${F.photos}/uploadAttachment`, "POST", { contentType:file.type, file:bytes.toString("base64"), filename:file.name.replace(/[^a-zA-Z0-9가-힣._-]/g,"_").slice(0,120) },true);
 return normalize(await read(id));
}
export type ManagedPlant = Awaited<ReturnType<typeof listManagedCatalog>>[number];
