"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { savePurchaseOrderAction } from "@/app/purchase-actions";
import {
  CURRENCIES,
  CURRENCY_LABEL,
  PO_KINDS,
  PO_KIND_LABEL,
  checkPoInput,
  emptyParty,
  formatAmount,
  formatQty,
  hangulFields,
  lineAmount,
  poTotals,
  taxLabel,
  type Currency,
  type PoDoc,
  type PoKind,
  type PoLine,
  type PoParty,
  type PoSupplier,
} from "@/lib/purchase-order";

type LineDraft = { key: number; description: string; size: string; qty: string; unit: string; price: string };

export type PoFormInitial = { id: string | null; date: string; supplierId: string | null; doc: PoDoc | null };

let nextKey = 1;
const blank = (unit = "pcs"): LineDraft => ({ key: nextKey++, description: "", size: "", qty: "", unit, price: "" });
const draftOf = (l: PoLine): LineDraft => ({
  key: nextKey++, description: l.description, size: l.size, qty: String(l.qty), unit: l.unit, price: l.price === null ? "" : String(l.price),
});
const toNumber = (s: string) => {
  const t = s.replaceAll(",", "").trim();
  return t === "" ? Number.NaN : Number(t);
};

/** 한국 업체(한글 상호·주소, 사업자번호)면 원화, 아니면 유로. 새 발주서에서 공급업체를 고를 때만 쓴다. */
const guessCurrency = (s: PoParty): Currency =>
  /[가-힣]/.test(s.company + s.address) || taxLabel(s.taxId) === "Business Reg. No." ? "KRW" : "EUR";

function Field({ label, children, wide }: { label: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <label className={`flex flex-col gap-1 text-xs text-muted ${wide ? "sm:col-span-2" : ""}`}>
      {label}
      {children}
    </label>
  );
}

/**
 * 영문 발주서 쓰기·고치기. 화면 글은 한국어, 칸에 적는 내용은 문서에 그대로 영어로 찍힌다.
 * 문서에는 To(상호·담당자)와 품목·규격·수량·단가만 나온다 — 화면도 그 칸만 받는다.
 * 공급업체를 고르면 거래처의 영문 정보가 채워진다(주소·전화 등은 Airtable 사본으로만 남는다).
 */
export function PurchaseOrderForm({ suppliers, initial }: { suppliers: PoSupplier[]; initial: PoFormInitial }) {
  const router = useRouter();
  const doc = initial.doc;
  const [supplierId, setSupplierId] = useState(initial.supplierId ?? "");
  const [party, setParty] = useState<PoParty>(doc?.supplier ?? emptyParty());
  const [date, setDate] = useState(initial.date);
  const [currency, setCurrency] = useState<Currency>(doc?.currency ?? "EUR");
  const [kind, setKind] = useState<PoKind>(doc?.kind ?? "inquiry");
  const [remarks, setRemarks] = useState(doc?.remarks ?? "");
  const [lines, setLines] = useState<LineDraft[]>(() => (doc?.lines.length ? doc.lines.map(draftOf) : [blank(), blank(), blank()]));
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, start] = useTransition();

  const touch = () => setSaved(false);
  const setP = (k: keyof PoParty, v: string) => (touch(), setParty((p) => ({ ...p, [k]: v })));
  const setLine = (key: number, k: keyof Omit<LineDraft, "key">, v: string) =>
    (touch(), setLines((ls) => ls.map((l) => (l.key === key ? { ...l, [k]: v } : l))));

  const pickSupplier = (id: string) => {
    touch();
    setSupplierId(id);
    const s = suppliers.find((x) => x.id === id);
    if (!s) return;
    const next = { company: s.company, attn: s.attn, address: s.address, phone: s.phone, email: s.email, taxId: s.taxId };
    setParty(next);
    if (!initial.id) setCurrency(guessCurrency(next));
  };

  const payload = () => ({
    date,
    supplierId: supplierId || null,
    doc: {
      kind,
      currency,
      supplier: party,
      remarks,
      lines: lines.map((l) => ({ description: l.description, size: l.size, qty: l.qty, unit: l.unit, price: l.price })),
    },
  });

  // 미리 검사한 문서(합계·한글 경고용). 저장할 때 서버가 같은 규칙으로 다시 검사한다.
  const checked = checkPoInput(payload());
  const totals = "error" in checked ? null : poTotals(checked.doc);
  const hangul = "error" in checked ? [] : hangulFields(checked.doc);

  const save = () =>
    start(async () => {
      setError(null);
      const result = await savePurchaseOrderAction(initial.id, JSON.stringify(payload()));
      if (result.error) return setError(result.error);
      if (!initial.id && result.id) router.push(`/purchase/${result.id}`);
      else {
        setSaved(true);
        router.refresh();
      }
    });

  return (
    <form
      action={save}
      data-og-saving={pending ? "true" : undefined}
      className="flex flex-col gap-4"
    >
      <section className="card p-4">
        <div className="grid gap-2 sm:grid-cols-2">
          <Field label="문서 제목">
            <select value={kind} onChange={(e) => (touch(), setKind(e.target.value as PoKind))} className="field">
              {PO_KINDS.map((k) => (
                <option key={k} value={k}>{PO_KIND_LABEL[k]}</option>
              ))}
            </select>
          </Field>
          <Field label="공급업체 (거래처 구분 '공급업체')">
            <select value={supplierId} onChange={(e) => pickSupplier(e.target.value)} className="field">
              <option value="">— 고르기 —</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </Field>
          <Field label="To (상호)"><input value={party.company} onChange={(e) => setP("company", e.target.value)} required className="field" /></Field>
          <Field label="Attn. (담당자)"><input value={party.attn} onChange={(e) => setP("attn", e.target.value)} className="field" /></Field>
          <Field label="날짜 (Date)"><input type="date" value={date} onChange={(e) => (touch(), setDate(e.target.value))} required className="field" /></Field>
          <Field label="통화 (Currency)">
            <select value={currency} onChange={(e) => (touch(), setCurrency(e.target.value as Currency))} className="field">
              {CURRENCIES.map((c) => (
                <option key={c} value={c}>{CURRENCY_LABEL[c]}</option>
              ))}
            </select>
          </Field>
        </div>
      </section>

      <section className="card p-4">
        <div className="flex items-center justify-between gap-2">
          <p className="section-title">품목 · ITEMS</p>
          <span className="text-[11px] text-faint">단가를 비우면 문서에 &ldquo;On request&rdquo;. 금액·합계는 이 화면에만 보인다</span>
        </div>
        <div className="mt-2 hidden grid-cols-[28px_1fr_72px_72px_56px_88px_88px_28px] gap-1.5 px-0.5 text-[11px] text-faint sm:grid">
          <span>No</span><span>품목 (영문)</span><span>규격</span><span>수량</span><span>단위</span><span>단가 ({currency})</span><span className="text-right">금액</span><span />
        </div>
        <ul className="mt-1 flex flex-col gap-2 sm:gap-1">
          {lines.map((l, i) => {
            const qty = toNumber(l.qty);
            const price = l.price.trim() === "" ? null : toNumber(l.price);
            const amount = Number.isFinite(qty) && (price === null || Number.isFinite(price)) ? lineAmount({ qty, price }, currency) : null;
            return (
              <li key={l.key} className="grid grid-cols-[28px_minmax(0,1fr)_minmax(0,1fr)] gap-1.5 rounded-[3px] border border-line p-2 sm:grid-cols-[28px_minmax(0,1fr)_72px_72px_56px_88px_88px_28px] sm:items-center sm:border-0 sm:p-0.5">
                <span className="row-span-4 pt-2 text-xs text-faint sm:row-span-1 sm:pt-0">{i + 1}</span>
                <input aria-label="품명" value={l.description} onChange={(e) => setLine(l.key, "description", e.target.value)} placeholder="Item (English)" className="field min-w-0 col-span-2 sm:col-span-1" />
                <input aria-label="규격" value={l.size} onChange={(e) => setLine(l.key, "size", e.target.value)} placeholder="Size" className="field min-w-0" />
                <input aria-label="수량" value={l.qty} onChange={(e) => setLine(l.key, "qty", e.target.value)} inputMode="decimal" placeholder="Qty" className="field min-w-0 text-right" />
                <input aria-label="단위" value={l.unit} onChange={(e) => setLine(l.key, "unit", e.target.value)} placeholder="Unit" className="field min-w-0" />
                <input aria-label="단가" value={l.price} onChange={(e) => setLine(l.key, "price", e.target.value)} inputMode="decimal" placeholder="Price" className="field min-w-0 text-right" />
                <span className="self-center text-right text-sm tabular-nums">
                  {amount === null ? (price === null && l.description ? <span className="text-xs text-faint">On request</span> : "") : formatAmount(amount, currency)}
                </span>
                <button
                  type="button"
                  aria-label={`${i + 1}번째 줄 지우기`}
                  onClick={() => (touch(), setLines((ls) => (ls.length > 1 ? ls.filter((x) => x.key !== l.key) : [blank()])))}
                  className="self-center text-faint hover:text-danger"
                >
                  ×
                </button>
              </li>
            );
          })}
        </ul>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
          <button type="button" className="btn" onClick={() => (touch(), setLines((ls) => [...ls, blank(ls.at(-1)?.unit || "pcs")]))}>줄 추가</button>
          {totals ? (
            <p className="text-sm">
              <span className="text-muted">
                {totals.lines}품목 · {formatQty(totals.qty)}{totals.units.length === 1 ? ` ${totals.units[0]}` : ""}
                {totals.onRequest.length ? ` · 가격 문의 ${totals.onRequest.join(", ")}번 제외` : ""}
              </span>
              <b className="ml-3 tabular-nums">{currency} {formatAmount(totals.total, currency)}</b>
            </p>
          ) : null}
        </div>
      </section>

      <section className="card p-4">
        <p className="section-title">Note (선택 — 적으면 표 아래 한 칸으로 나온다)</p>
        <textarea value={remarks} onChange={(e) => (touch(), setRemarks(e.target.value))} rows={2} className="field mt-2 w-full" />
      </section>

      {hangul.length ? (
        <p className="rounded-[3px] border border-[#f5cd47] bg-[#fff7d6] px-3 py-2 text-xs text-[#7f5f01]">
          영문 문서인데 한글이 들어간 칸이 있다: {hangul.join(", ")}. 외국 공급업체는 읽지 못한다.
        </p>
      ) : null}

      <div className="flex flex-wrap items-center justify-end gap-2">
        {error ? <span className="mr-auto text-sm text-danger" role="alert">{error}</span> : null}
        {saved && !error ? <span className="mr-auto text-sm text-brand-600" role="status">저장했다.</span> : null}
        <button type="submit" className="btn-primary" disabled={pending}>
          {pending ? "저장 중" : initial.id ? "저장" : "발주서 만들기"}
        </button>
      </div>
    </form>
  );
}
