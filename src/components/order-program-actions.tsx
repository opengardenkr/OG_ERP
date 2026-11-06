"use client";

import { useActionState, useState } from "react";

import { deployLinkAction, type OrderActionState } from "@/app/order-actions";

type Action = (prev: OrderActionState, form: FormData) => Promise<OrderActionState>;

/** 버튼 하나짜리 서버 액션. confirm이 있으면 한 번 더 묻는다(재고 차감처럼 되돌리기 번거로운 일). */
export function ActionButton({ action, fields, label, confirm, primary = false }: {
  action: Action; fields: Record<string, string>; label: string; confirm?: string; primary?: boolean;
}) {
  const [state, run, pending] = useActionState<OrderActionState, FormData>(action, { error: null });
  return (
    <form
      action={run}
      data-og-saving={pending ? "true" : undefined}
      onSubmit={(e) => { if (confirm && !window.confirm(confirm)) e.preventDefault(); }}
      className="inline-flex flex-col items-end gap-0.5"
    >
      {Object.entries(fields).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      <button type="submit" className={`${primary ? "btn-primary" : "btn"} px-2.5 text-xs`} disabled={pending}>
        {pending ? "처리 중…" : label}
      </button>
      {state.error ? <span className="max-w-64 text-right text-[11px] text-danger" role="alert">{state.error}</span> : null}
      {state.done ? <span className="max-w-64 text-right text-[11px] text-brand-600">{state.done}</span> : null}
    </form>
  );
}

export function CopyLink({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button" className="btn px-2.5 text-xs"
      onClick={() => {
        navigator.clipboard?.writeText(url).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }, () => window.prompt("아래 주소를 복사하세요", url));
      }}
    >
      {copied ? "복사함" : "링크 복사"}
    </button>
  );
}

/** 회사 하나에 링크 배포. 거래처 표의 이름·전화번호를 고를 수 있다(직접 적어도 된다). */
export function DeployForm({ programId, programName, clients }: { programId: string; programName: string; clients: { name: string; phone: string }[] }) {
  const [state, run, pending] = useActionState<OrderActionState, FormData>(deployLinkAction, { error: null });
  const [phone, setPhone] = useState("");
  return (
    <form action={run} data-og-saving={pending ? "true" : undefined} className="card space-y-2 p-3">
      <input type="hidden" name="program" value={programId} />
      <p className="text-sm font-semibold">회사에 배포</p>
      <div className="grid gap-2 sm:grid-cols-[1fr_160px_1fr_auto]">
        <input
          name="customer" list="og-clients" required maxLength={60} placeholder="회사 이름" aria-label="회사 이름" className="field"
          onChange={(e) => { const hit = clients.find((c) => c.name === e.target.value); if (hit?.phone) setPhone(hit.phone); }}
        />
        <input name="phone" value={phone} onChange={(e) => setPhone(e.target.value)} type="tel" maxLength={30} placeholder="연락처(자동 입력용)" aria-label="연락처" className="field" />
        <input name="title" maxLength={60} placeholder={`제목 (기본: 회사 이름 ${programName})`} aria-label="제목" className="field" />
        <button type="submit" className="btn-primary text-sm" disabled={pending}>{pending ? "만드는 중…" : "링크 만들기"}</button>
      </div>
      <datalist id="og-clients">{clients.map((c) => <option key={c.name} value={c.name} />)}</datalist>
      {state.error ? <p className="text-xs text-danger" role="alert">{state.error}</p> : null}
      {state.url ? (
        <p className="flex flex-wrap items-center gap-2 text-xs text-brand-600">
          {state.done} <a href={state.url} target="_blank" rel="noopener noreferrer" className="underline">{state.url}</a> <CopyLink url={state.url} />
        </p>
      ) : null}
    </form>
  );
}
