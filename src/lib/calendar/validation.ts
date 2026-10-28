/** Server and fixture tests share strict Gregorian date/time validation. */
export function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
export function validTime(value: string): boolean { return /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value); }
export function validEventIdentity(id: string, etag: string): boolean {
  return /^[a-zA-Z0-9_@.-]{1,1024}$/.test(id) && /^"[^"\r\n]{1,256}"$/.test(etag);
}
