export const MAX_PHOTOS = 5;
export const MAX_PHOTO_BYTES = 2 * 1024 * 1024;
export const SIZES = ["7치", "9치", "5치", "??", "4치", "6치", "비닐포트", "확인필요"];
export type CatalogInput = { name: string; scientificName: string; sizes: string[]; price: number | null; summary: string; visibility: string };
export function validateCatalogInput(value: unknown): CatalogInput {
  if (!value || typeof value !== "object") throw new Error("입력값을 확인해 주세요.");
  const v = value as Record<string, unknown>;
  for (const key of ["name", "scientificName", "summary", "visibility"]) if (typeof v[key] !== "string") throw new Error("문자 입력값을 확인해 주세요.");
  const name = (v.name as string).trim(), scientificName = (v.scientificName as string).trim(), summary = (v.summary as string).trim();
  if (name.length > 200 || scientificName.length > 200 || Array.from(summary).length > 600) throw new Error("이름은 200자, 요약은 600자 이내로 입력해 주세요.");
  if (!Array.isArray(v.sizes) || v.sizes.some(x => typeof x !== "string" || !SIZES.includes(x))) throw new Error("등록된 규격을 선택해 주세요.");
  if (v.price !== null && (typeof v.price !== "number" || !Number.isFinite(v.price) || v.price < 0 || v.price > 1e12)) throw new Error("가격은 빈칸 또는 0 이상의 숫자여야 합니다.");
  if (!["", "비공개", "공개", "미검토"].includes(v.visibility as string)) throw new Error("공개 상태를 확인해 주세요.");
  if (v.visibility === "공개" && !name && !scientificName) throw new Error("공개하려면 이름 또는 학명을 입력해 주세요.");
  return { name, scientificName, sizes: [...new Set(v.sizes)] as string[], price: v.price as number | null, summary, visibility: v.visibility as string };
}
export function validatePhotoOrder(ids: unknown, existing: string[]): string[] {
  if (!Array.isArray(ids) || ids.length > MAX_PHOTOS || ids.some(id => typeof id !== "string" || !existing.includes(id)) || new Set(ids).size !== ids.length) throw new Error("사진은 기존 사진 중 최대 5장만 선택할 수 있습니다.");
  return ids;
}
