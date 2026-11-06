"use client";

import { useActionState, useState } from "react";

import { deployLinkAction, editOrderAction, type OrderActionState } from "@/app/order-actions";
import type { EditLine } from "@/lib/order-program";

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

type Row = EditLine & { key: number };
const fmt = (n: number) => n.toLocaleString("ko-KR");

/**
 * 주문 뒤 카톡·전화로 바뀐 내용 고치기. 그 회사 견적의 품목·수량·단가를 고치고 무엇이 바뀌었는지 한 줄 남긴다.
 * 견적이 아직 '작성'이면 그대로 고치고, 이미 보냈으면 수정본(-R2…)이 생긴다 — 서버가 정한다.
 */
export function OrderEditor({ program, customer, lines, options, sent }: {
  program: string; customer: string; lines: EditLine[]; options: { name: string; spec: string; price: number }[]; sent: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<Row[]>(() => lines.map((l, i) => ({ ...l, key: i })));
  const [seq, setSeq] = useState(lines.length);
  const [state, run, pending] = useActionState<OrderActionState, FormData>(async (prev, form) => {
    const next = await editOrderAction(prev, form);
    if (!next.error) setOpen(false);
    return next;
  }, { error: null });

  if (!open) {
    return (
      <span className="inline-flex flex-col items-end gap-0.5">
        <button type="button" className="btn px-2.5 text-xs" onClick={() => { setRows(lines.map((l, i) => ({ ...l, key: i }))); setSeq(lines.length); setOpen(true); }}>
          주문 내용 고치기
        </button>
        {state.done ? <span className="max-w-64 text-right text-[11px] text-brand-600">{state.done}</span> : null}
      </span>
    );
  }
  const set = (key: number, patch: Partial<EditLine>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const add = (l: EditLine) => { setRows((rs) => [...rs, { ...l, key: seq }]); setSeq(seq + 1); };
  const total = rows.reduce((a, r) => a + (Number(r.qty) || 0) * (Number(r.price) || 0), 0);

  return (
    <form action={run} data-og-saving={pending ? "true" : undefined} className="mt-2 w-full space-y-2 rounded border border-line bg-canvas p-2">
      <input type="hidden" name="program" value={program} />
      <input type="hidden" name="customer" value={customer} />
      <input type="hidden" name="lines" value={JSON.stringify(rows.map(({ name, spec, qty, price }) => ({ name, spec, qty: Number(qty) || 0, price: Number(price) || 0 })))} />
      <p className="text-xs text-muted">{sent ? "이미 보낸 견적이라 저장하면 수정본(-R…)이 새로 생깁니다. 고객에게 다시 보내 주세요." : "아직 보내지 않은 견적이라 그대로 고칩니다."} 수량 0이면 그 줄을 뺍니다.</p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] text-xs">
          <thead className="text-left text-muted"><tr><th className="pb-1 font-normal">품목</th><th className="pb-1 font-normal">규격</th><th className="pb-1 text-right font-normal">수량</th><th className="pb-1 text-right font-normal">단가</th><th /></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key} className={Number(r.qty) ? "" : "opacity-50"}>
                <td className="py-0.5 pr-1"><input className="field w-full py-1 text-xs" value={r.name} aria-label="품목" onChange={(e) => set(r.key, { name: e.target.value })} /></td>
                <td className="py-0.5 pr-1"><input className="field w-20 py-1 text-xs" value={r.spec} aria-label="규격" onChange={(e) => set(r.key, { spec: e.target.value })} /></td>
                <td className="py-0.5 pr-1"><input className="field w-20 py-1 text-right text-xs" inputMode="numeric" value={String(r.qty)} aria-label="수량" onChange={(e) => set(r.key, { qty: Number(e.target.value.replace(/\D/g, "")) || 0 })} /></td>
                <td className="py-0.5 pr-1"><input className="field w-24 py-1 text-right text-xs" inputMode="numeric" value={String(r.price)} aria-label="단가" onChange={(e) => set(r.key, { price: Number(e.target.value.replace(/\D/g, "")) || 0 })} /></td>
                <td className="py-0.5"><button type="button" className="btn px-2 py-0.5 text-[11px]" onClick={() => set(r.key, { qty: 0 })}>빼기</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {options.length ? (
          <select className="field max-w-full text-xs" value="" aria-label="주문서 품목에서 추가" onChange={(e) => { const o = options[Number(e.target.value)]; if (o) add({ ...o, qty: 0 }); }}>
            <option value="">+ 주문서 품목에서 추가</option>
            {options.map((o, i) => <option key={`${o.name}|${o.spec}`} value={i}>{o.name} · {o.spec} · ₩{fmt(o.price)}</option>)}
          </select>
        ) : null}
        <button type="button" className="btn px-2.5 text-xs" onClick={() => add({ name: "", spec: "", qty: 0, price: 0 })}>+ 빈 줄</button>
        <span className="ml-auto text-xs">합계 <b>₩{fmt(total)}</b> <span className="text-muted">(VAT 전)</span></span>
      </div>
      <input name="reason" required maxLength={200} className="field w-full text-sm" placeholder="무엇이 바뀌었나 — 예: 11/6 카톡, 세일러맨 2크레이트 추가·배송지 변경" aria-label="바뀐 내용" />
      <div className="flex flex-wrap items-center justify-end gap-2">
        {state.error ? <span className="text-xs text-danger" role="alert">{state.error}</span> : null}
        <button type="button" className="btn px-2.5 text-xs" onClick={() => setOpen(false)}>취소</button>
        <button type="submit" className="btn-primary px-2.5 text-xs" disabled={pending}>{pending ? "저장 중…" : "저장"}</button>
      </div>
    </form>
  );
}
