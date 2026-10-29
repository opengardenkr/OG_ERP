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

const HISTORY = {
  number: 'fldarqONAT0cvnlBc', date: 'fldtUJengZES1OG7a', company: 'fldMruU9RhDA44EyD',
  kind: 'fldFtayOXs55xDwiq', total: 'fldskak7i2iuJOY8r', status: 'fldMMWnoJNwVCeKvp',
  summary: 'fld8BN5izEMtiJ6p6', author: 'fldqoY2KHfFtg6HDR', deleted: 'fldUDwBfzwcnftVsa',
  deletedReason: 'fldDzdTDIuDO4h9y3',
};
export type QuoteHistoryItem = {
  id: string; number: string; date: string; company: string; kind: string;
  total: number | null; status: string; summary: string; author: string;
  deleted: boolean; deletedReason: string;
};
export async function listQuoteHistory(query: string, includeDeleted: boolean, offset = '') {
  const token = process.env.AIRTABLE_TOKEN?.trim(), base = process.env.AIRTABLE_BASE_ID?.trim();
  if (!token || !base) throw new Error('견적 저장소 설정을 확인해주세요.');
  const params = new URLSearchParams({ pageSize: '50', returnFieldsByFieldId: 'true' });
  Object.values(HISTORY).forEach(field => params.append('fields[]', field));
  params.set('sort[0][field]', HISTORY.date); params.set('sort[0][direction]', 'desc');
  const filters = [];
  if (!includeDeleted) filters.push('NOT({삭제함})');
  if (query) {
    // Quote and slash escaping prevents user input from becoming a formula expression.
    const literal = JSON.stringify(query.toLowerCase());
    filters.push(`FIND(${literal},LOWER({견적번호}&" "&{거래처명}))>0`);
  }
  if (filters.length) params.set('filterByFormula', `AND(${filters.join(',')})`);
  if (offset) params.set('offset', offset);
  const response = await fetch(`https://api.airtable.com/v0/${base}/${TABLE}?${params}`, {
    headers: { Authorization: `Bearer ${token}` }, cache: 'no-store', signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error(response.status === 403 ? '견적 조회 권한이 없습니다. 관리자에게 문의해주세요.' : '견적 목록을 불러오지 못했습니다. 새로고침해 주세요.');
  const data = await response.json() as { records: {id: string; fields: Record<string, unknown>}[]; offset?: string };
  const items: QuoteHistoryItem[] = data.records.map(record => {
    const f = record.fields, text = (key: keyof typeof HISTORY) => typeof f[HISTORY[key]] === 'string' ? f[HISTORY[key]] as string : '';
    return { id: record.id, number: text('number'), date: text('date'), company: text('company'),
      kind: text('kind'), total: typeof f[HISTORY.total] === 'number' ? f[HISTORY.total] as number : null,
      status: text('status'), summary: text('summary'), author: text('author'),
      deleted: f[HISTORY.deleted] === true, deletedReason: text('deletedReason') };
  });
  return { items, nextOffset: data.offset || null };
}
