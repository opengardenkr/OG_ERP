/** A department/floor label is not a geocodable street address. */
export function looksLikeAddress(value: string): boolean {
  return /(?:[가-힣0-9·]+(?:대로|로|길)\s*\d+|[가-힣]+(?:동|리)\s+\d+(?:-\d+)?)/.test(value);
}
