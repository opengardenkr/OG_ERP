import 'server-only';

const TABLE = 'tblj74vsSha7drqmj';
/** Existing quote soft-delete fields; never delete a record or change its financial data. */
export async function setQuoteDeleted(id: string, deleted: boolean, reason: string, author: string) {
  const token = process.env.AIRTABLE_TOKEN?.trim();
  const base = process.env.AIRTABLE_BASE_ID?.trim();
  if (!token || !base) throw new Error('견적 저장소 설정을 확인해주세요.');
  const response = await fetch(`https://api.airtable.com/v0/${base}/${TABLE}/${id}`, {
    method: 'PATCH', cache: 'no-store',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({fields: {
      fldUDwBfzwcnftVsa: deleted,
      fldea1Ig4sqNSdtw1: deleted ? author : null,
      fldHrVPSYs8vWlCpV: deleted ? new Date().toISOString() : null,
      fldDzdTDIuDO4h9y3: deleted ? reason : null,
    }}),
  });
  if (!response.ok) throw new Error(response.status === 403 ? '견적 수정 권한이 없습니다. 관리자에게 문의해주세요.' : '견적을 저장하지 못했습니다. 잠시 후 다시 시도해주세요.');
}
