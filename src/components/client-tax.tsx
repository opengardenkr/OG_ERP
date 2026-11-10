"use client";
/* eslint-disable @next/next/no-img-element */

import { useActionState, useState } from "react";

import { removeBizCertAction, saveTaxInfoAction, uploadBizCertAction, type ClientActionState } from "@/app/client-actions";
import { missingRequired, type FileRef, type TaxRow } from "@/lib/client-types";

type Values = { bizNo: string; bizName: string; ceo: string; address: string; bizType: string; bizItem: string; invoiceEmail: string };

const FIELDS: { key: keyof Values; label: string; placeholder?: (p: { name: string; email: string }) => string; mode?: "numeric" | "email" }[] = [
  { key: "bizNo", label: "사업자등록번호", placeholder: () => "000-00-00000", mode: "numeric" },
  { key: "bizName", label: "상호(등록증대로)", placeholder: (p) => `비우면 '${p.name}'` },
  { key: "ceo", label: "대표자" },
  { key: "address", label: "사업장 주소" },
  { key: "bizType", label: "업태", placeholder: () => "예: 농업, 도소매" },
  { key: "bizItem", label: "종목", placeholder: () => "예: 화훼, 조경수" },
  { key: "invoiceEmail", label: "계산서 받을 이메일", placeholder: (p) => (p.email ? `비우면 ${p.email}` : "예: tax@example.com"), mode: "email" },
];

async function copy(text: string, done: () => void) {
  try {
    await navigator.clipboard.writeText(text);
    done();
  } catch {
    window.prompt("아래 내용을 복사하세요", text);
  }
}

/**
 * 거래처 상세의 '사업자 정보' 카드. 세금계산서를 낼 때 홈택스 '공급받는자' 칸에 그대로 붙여넣도록
 * 홈택스 순서대로 보이고 칸마다 [복사]가 있다. 사업자등록증(사진·PDF)도 여기서 올린다.
 */
export function ClientTaxCard({ id, name, email, values, rows, bizNoOk, certs }: {
  id: string; name: string; email: string; values: Values; rows: TaxRow[]; bizNoOk: boolean; certs: FileRef[];
}) {
  const [editing, setEditing] = useState(false);
  const [copied, setCopied] = useState("");
  const flash = (key: string) => { setCopied(key); setTimeout(() => setCopied(""), 1500); };
  const [saved, save, saving] = useActionState<ClientActionState, FormData>(async (prev, form) => {
    const next = await saveTaxInfoAction(prev, form);
    if (!next.error) setEditing(false);
    return next;
  }, { error: null });
  const missing = missingRequired(rows);
  const all = rows.filter((r) => r.value).map((r) => `${r.label}\t${r.value}`).join("\n");

  return (
    <div className="card p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h2 className="section-title">사업자 정보 <span className="font-normal text-muted">· 세금계산서용</span></h2>
        <span className="flex gap-1.5">
          {!editing && all ? (
            <button type="button" className="btn px-2.5 text-xs" onClick={() => copy(all, () => flash("all"))}>{copied === "all" ? "복사됨" : "전체 복사"}</button>
          ) : null}
          <button type="button" className="btn px-2.5 text-xs" onClick={() => setEditing((v) => !v)}>{editing ? "닫기" : "고치기"}</button>
        </span>
      </div>

      {editing ? (
        <form action={save} data-og-saving={saving ? "true" : undefined} className="grid gap-2 sm:grid-cols-2">
          <input type="hidden" name="id" value={id} />
          {FIELDS.map((f) => (
            <label key={f.key} className={`flex flex-col text-[11px] text-muted ${f.key === "address" ? "sm:col-span-2" : ""}`}>
              {f.label}
              <input
                name={f.key} defaultValue={values[f.key]} placeholder={f.placeholder?.({ name, email })}
                inputMode={f.mode === "numeric" ? "numeric" : undefined} type={f.mode === "email" ? "email" : "text"}
                className="field text-sm text-ink"
              />
            </label>
          ))}
          <div className="flex items-center justify-end gap-1.5 sm:col-span-2">
            <span className="mr-auto text-[11px] text-muted">사업자등록증을 보며 그대로 적으세요. 대표자·주소는 거래처 기본 정보도 같이 바뀝니다.</span>
            <button type="submit" className="btn-primary px-3 text-xs" disabled={saving}>{saving ? "저장 중" : "저장"}</button>
          </div>
        </form>
      ) : (
        <dl className="divide-y divide-line text-sm">
          {rows.map((r) => (
            <div key={r.key} className="grid grid-cols-[96px_minmax(0,1fr)_auto] items-center gap-2 py-1.5">
              <dt className="text-xs text-muted">{r.label}</dt>
              <dd className={`break-all ${r.value ? "" : "text-muted"}`}>
                {r.value || "비어 있음"}
                {r.key === "bizNo" && r.value && !bizNoOk ? <span className="ml-1.5 text-[11px] text-danger">번호 확인 필요</span> : null}
              </dd>
              {r.value ? (
                <button type="button" className="btn px-2 text-[11px]" onClick={() => copy(r.value, () => flash(r.key))}>{copied === r.key ? "복사됨" : "복사"}</button>
              ) : <span />}
            </div>
          ))}
        </dl>
      )}
      {saved.error ? <p className="mt-1 text-xs text-danger" role="alert">{saved.error}</p> : saved.done ? <p className="mt-1 text-xs text-brand-600">{saved.done}</p> : null}
      {!editing && missing.length ? <p className="mt-1.5 text-xs text-danger">세금계산서 전에 채울 칸: {missing.join(" · ")}</p> : null}

      <div className="mt-3 border-t border-line pt-3">
        <h3 className="mb-2 text-xs font-semibold text-muted">사업자등록증</h3>
        {certs.length ? (
          <ul className="mb-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
            {certs.map((f) => <CertTile key={f.id} clientId={id} file={f} />)}
          </ul>
        ) : <p className="mb-2 text-sm text-muted">아직 없습니다. 사진을 찍거나 PDF를 올리세요.</p>}
        <CertUpload id={id} />
      </div>
    </div>
  );
}

function CertTile({ clientId, file }: { clientId: string; file: FileRef }) {
  const [state, action, pending] = useActionState<ClientActionState, FormData>(removeBizCertAction, { error: null });
  return (
    <li className="space-y-1">
      <a href={file.url} target="_blank" rel="noopener noreferrer" className="block overflow-hidden rounded border border-line bg-canvas" title={file.filename}>
        {file.thumb ? (
          <img src={file.thumb} alt={`사업자등록증 ${file.filename}`} className="aspect-[3/4] w-full object-contain" />
        ) : (
          <span className="flex aspect-[3/4] w-full items-center justify-center text-sm font-semibold text-muted">{file.isPdf ? "PDF" : "파일"}</span>
        )}
      </a>
      <form
        action={action}
        onSubmit={(e) => { if (!window.confirm("이 사업자등록증 파일을 뺄까요? 되살릴 수 없습니다.")) e.preventDefault(); }}
        className="flex items-center justify-between gap-1"
      >
        <input type="hidden" name="id" value={clientId} />
        <input type="hidden" name="att" value={file.id} />
        <span className="truncate text-[11px] text-muted">{file.filename}</span>
        <button type="submit" className="btn shrink-0 px-1.5 text-[11px]" disabled={pending}>{pending ? "…" : "빼기"}</button>
      </form>
      {state.error ? <p className="text-[11px] text-danger" role="alert">{state.error}</p> : null}
    </li>
  );
}

function CertUpload({ id }: { id: string }) {
  const [state, action, pending] = useActionState<ClientActionState, FormData>(uploadBizCertAction, { error: null });
  return (
    <form action={action} data-og-saving={pending ? "true" : undefined} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="id" value={id} />
      <input name="file" type="file" accept="image/*,application/pdf" required className="min-w-0 flex-1 text-xs" />
      <button type="submit" className="btn-primary px-3 text-xs" disabled={pending}>{pending ? "올리는 중" : "올리기"}</button>
      {state.error ? <p className="basis-full text-xs text-danger" role="alert">{state.error}</p> : state.done ? <p className="basis-full text-xs text-brand-600">{state.done}</p> : null}
    </form>
  );
}
