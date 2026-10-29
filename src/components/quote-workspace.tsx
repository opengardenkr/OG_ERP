'use client';
import { useState } from 'react';
import { ToolFrame } from '@/components/tool-frame';
import { QuoteHistory } from '@/components/quote-history';
export function QuoteWorkspace({ src, initialHistory = false }: { src: string; initialHistory?: boolean }) {
  const [history, setHistory] = useState(initialHistory);
  const [editorOpened, setEditorOpened] = useState(!initialHistory);
  return <>
    <div className="mb-4 flex gap-2" role="group" aria-label="견적서 화면">
      <button className={'btn ' + (!history ? 'btn-primary' : '')} aria-pressed={!history} onClick={() => { setHistory(false); setEditorOpened(true); }}>견적 작성</button>
      <button className={'btn ' + (history ? 'btn-primary' : '')} aria-pressed={history} onClick={() => setHistory(true)}>기존 견적 · 삭제/복원</button>
    </div>
    {editorOpened && <div hidden={history}><ToolFrame title="견적서" src={src} /></div>}
    {history && <QuoteHistory />}
  </>;
}
