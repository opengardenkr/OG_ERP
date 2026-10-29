'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Modal } from '@/components/modal';
import type { QuoteHistoryItem } from '@/lib/airtable/quotes';

export function QuoteHistory() {
  const [items, setItems] = useState<QuoteHistoryItem[]>([]);
  const [query, setQuery] = useState(''), [includeDeleted, setIncludeDeleted] = useState(false);
  const [filter, setFilter] = useState({ query: '', includeDeleted: false });
  const [offset, setOffset] = useState<string | null>(null);
  const [loading, setLoading] = useState(true), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const [selected, setSelected] = useState<QuoteHistoryItem | null>(null), [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false), [saveError, setSaveError] = useState('');
  const request = useRef<AbortController | null>(null);
  const load = useCallback(async (next?: string) => {
    request.current?.abort(); const controller = new AbortController(); request.current = controller;
    try {
      const params = new URLSearchParams({ q: filter.query, deleted: filter.includeDeleted ? '1' : '0' });
      if (next) params.set('offset', next);
      const response = await fetch('/api/quotes?' + params, { signal: controller.signal, cache: 'no-store' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || '견적 조회 실패');
      if (controller.signal.aborted) return;
      setItems(previous => next ? [...previous, ...data.items.filter((item: QuoteHistoryItem) => !previous.some(p => p.id === item.id))] : data.items);
      setOffset(data.nextOffset);
    } catch (e) { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : '견적 조회 실패'); }
    finally { if (!controller.signal.aborted) setLoading(false); }
  }, [filter]);
  useEffect(() => {
    let active = true;
    void Promise.resolve().then(() => { if (active) return load(); });
    return () => { active = false; request.current?.abort(); };
  }, [load]);
  function startLoad(next?: string) {
    setLoading(true); setError('');
    if (!next) { setItems([]); setOffset(null); }
    void load(next);
  }
  async function save() {
    if (!selected || saving) return;
    setSaving(true); setSaveError('');
    try {
      const deleted = !selected.deleted;
      const response = await fetch('/api/quotes/' + selected.id, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ deleted, reason }) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error || '저장 실패');
      setItems(previous => previous.flatMap(item => item.id !== selected.id ? [item] : deleted && !filter.includeDeleted ? [] : [{ ...item, deleted, deletedReason: deleted ? reason.trim() : '' }]));
      setNotice(deleted ? '삭제했습니다. 삭제 포함으로 검색하면 복원할 수 있습니다.' : '견적서를 복원했습니다.');
      setSelected(null); setReason('');
    } catch (e) { setSaveError(e instanceof Error ? e.message : '저장하지 못했습니다.'); }
    finally { setSaving(false); }
  }
  return <section aria-label="기존 견적 목록" className="space-y-4">
    <p className="text-sm text-muted">기존 견적을 조회하고 삭제·복원합니다. 삭제해도 견적 원본과 금액은 보존됩니다.</p>
    <form className="flex flex-wrap items-end gap-3" onSubmit={e => { e.preventDefault(); setNotice(''); setLoading(true); setError(''); setItems([]); setOffset(null); setFilter({ query: query.trim(), includeDeleted }); }}>
      <label className="flex min-w-0 flex-1 flex-col gap-1 text-xs">견적번호·거래처 검색<input className="field" value={query} maxLength={100} onChange={e => setQuery(e.target.value)} placeholder="견적번호 또는 거래처명" /></label>
      <label className="flex items-center gap-2 py-2 text-sm"><input type="checkbox" checked={includeDeleted} onChange={e => setIncludeDeleted(e.target.checked)} />삭제 포함</label>
      <button className="btn btn-primary" disabled={loading || saving}>검색</button>
      <button type="button" className="btn" disabled={loading || saving} onClick={() => { setNotice(''); startLoad(); }}>새로고침</button>
    </form>
    {notice && <p role="status" className="text-sm text-brand">{notice}</p>}
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    {!loading && !error && items.length === 0 && <p className="card p-4 text-sm text-muted">조건에 맞는 견적이 없습니다.</p>}
    <ul className="space-y-3">{items.map(item => <li key={item.id} className="card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1"><h2 className="break-words text-sm font-semibold">{item.company || '거래처 미입력'}</h2><p className="break-all text-xs text-muted">{item.number || '견적번호 미입력'} · {item.date || '발행일 미입력'}</p></div>
        <button type="button" className="btn shrink-0" disabled={saving || loading} aria-label={`${item.number || item.company || '견적서'} ${item.deleted ? '복원' : '삭제'}`} onClick={() => { setSelected(item); setReason(''); setSaveError(''); }}>{item.deleted ? '복원' : '삭제'}</button>
      </div>
      <p className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-sm"><span>{item.total === null ? '금액 미입력' : item.total.toLocaleString('ko-KR') + '원'}</span><span className="text-muted">{[item.kind, item.status, item.author].filter(Boolean).join(' · ')}</span>{item.deleted && <span className="text-red-700">삭제됨</span>}</p>
      {item.summary && <details className="mt-3 text-sm"><summary className="cursor-pointer text-muted">품목 요약</summary><p className="mt-2 whitespace-pre-wrap break-words">{item.summary}</p></details>}
      {item.deletedReason && <p className="mt-2 whitespace-pre-wrap break-words text-xs text-muted">삭제 사유: {item.deletedReason}</p>}
    </li>)}</ul>
    {loading && <p role="status" className="text-sm text-muted">견적을 불러오는 중…</p>}
    {offset && <button type="button" className="btn" disabled={loading || saving} onClick={() => startLoad(offset)}>더 보기</button>}
    <Modal open={!!selected} title={selected?.deleted ? '견적서 복원' : '견적서 삭제'} onClose={() => { if (!saving) setSelected(null); }} width="max-w-lg">
      <form onSubmit={e => { e.preventDefault(); void save(); }}>
        <div className="space-y-4 p-5"><p className="break-words text-sm">{selected?.company || '거래처 미입력'} · {selected?.number || '견적번호 미입력'}</p>
          <p className="text-sm text-muted">{selected?.deleted ? '이 견적서를 목록에 다시 표시합니다.' : '목록에서 숨깁니다. 원본은 보존되며 언제든 복원할 수 있습니다.'}</p>
          {!selected?.deleted && <label className="block text-xs">삭제 사유<textarea autoFocus required maxLength={500} value={reason} onChange={e => setReason(e.target.value)} disabled={saving} className="field mt-1 min-h-24 w-full" /></label>}
          {saveError && <p role="alert" className="text-sm text-red-700">{saveError}</p>}
        </div>
        <div className="flex justify-end gap-2 border-t border-line p-4"><button type="button" className="btn" disabled={saving} onClick={() => setSelected(null)}>취소</button><button className="btn btn-primary" disabled={saving || (!selected?.deleted && !reason.trim())}>{saving ? '저장 중…' : selected?.deleted ? '복원' : '삭제'}</button></div>
      </form>
    </Modal>
  </section>;
}
