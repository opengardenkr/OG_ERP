const STREET = /(?:[가-힣0-9·]+(?:대로|로|길)\s*\d+(?:-\d+)?|[가-힣]+(?:동|리)\s+\d+(?:-\d+)?)/;

/** A department/floor label is not a geocodable street address. */
export function looksLikeAddress(value: string): boolean {
  return STREET.test(value);
}

/**
 * "공주시 수원지공원길 131-21 금학생태공원쪽" → "공주시 수원지공원길 131-21".
 * 번지 뒤에 붙은 설명은 주소 검색을 실패하게 만든다. 주소가 없으면 빈 문자열.
 */
export function extractAddress(value: string): string {
  const found = STREET.exec(value);
  if (!found) return "";
  return value.slice(0, found.index + found[0].length).replace(/\s*\([^)]*\)/g, "").trim();
}
