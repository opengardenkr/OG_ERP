import Link from "next/link";
import { notFound } from "next/navigation";
import {
  deductStockAction, deleteProgramAction, hideDraftsAction, linkStatusAction, mergeOrdersAction, programStatusAction, refreshStockAction,
} from "@/app/order-actions";
import { AppShell, Section } from "@/components/app-shell";
import { EmptyState, ErrorState } from "@/components/data-state";
import { ActionButton, CopyLink, DeployForm } from "@/components/order-program-actions";
import { OrderTabs } from "@/components/order-tabs";
import { getClients } from "@/lib/airtable/clients";
import type { Customer } from "@/lib/airtable/order-deals";
import { getProgram, type Allocation, type LinkDetail } from "@/lib/airtable/order-programs";
import { GROUP_INFO, SUPPLIER_INFO } from "@/lib/order";
import { won } from "@/lib/sales";

export const metadata = { title: "주문서 | 오픈가든", robots: { index: false, follow: false } };

const fmt = (n: number) => n.toLocaleString("ko-KR");

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [result, clients] = await Promise.all([getProgram(id), getClients()]);
  if (result.ok && !result.data) notFound();
  if (!result.ok) return <AppShell title="주문서"><ErrorState message={result.message} /></AppShell>;
  const p = result.data!;
  const clientOptions = clients.ok ? clients.data.map((c) => ({ name: c.name, phone: c.phone })) : [];

  return (
    <AppShell
      title={`📁 ${p.name}`}
      subtitle={[p.supplier ? SUPPLIER_INFO[p.supplier].label : "업체 미정", p.source ? "품목 웹에서 읽음" : `품목 ${p.items.length}종`, p.min ? `최소 주문 ${won(p.min)}` : "", p.status === "보관" ? "보관함" : ""].filter(Boolean).join(" · ")}
      action={<Link href="/catalog" className="btn text-sm">← 주문프로그램</Link>}
    >
      <OrderTabs active="주문프로그램" />
      <div className="mb-3 flex flex-wrap items-start gap-2">
        {p.editable ? <Link href={`/catalog/pick?program=${p.id}`} className="btn-primary px-2.5 text-xs">품목·가격 고치기</Link> : null}
        {p.editable ? <ActionButton action={refreshStockAction} fields={{ program: p.id }} label="재고 반영" /> : null}
        <ActionButton action={programStatusAction} fields={{ program: p.id, status: p.status === "보관" ? "사용" : "보관" }} label={p.status === "보관" ? "다시 꺼내기" : "보관"} />
        {p.status === "보관" ? (
          <ActionButton
            action={deleteProgramAction} fields={{ program: p.id }} label="삭제"
            confirm={`'${p.name}' 주문서를 지웁니다. 되살릴 수 없습니다.\n배포한 링크 ${p.links.length}개는 닫힙니다(마감). 받은 주문·견적은 그대로 남습니다.\n지울까요?`}
          />
        ) : null}
      </div>
      {p.memo ? <p className="card mb-3 whitespace-pre-wrap p-3 text-xs text-muted">{p.memo.replace(/\*\*/g, "")}</p> : null}
      {p.source === "hg-pool" ? (
        <p className="mb-3 text-xs text-faint">공동수입 주문서 — 고객 화면의 품목은 웹사이트가 호게나르드 DM에서 <b>공동주문</b>에 체크한 줄을 바로 읽습니다. 품목은 DM에서 고르고, 여기서는 회사 배포·받은 주문·합산 견적을 봅니다.</p>
      ) : !p.editable ? (
        <p className="mb-3 text-xs text-faint">사진·크레이트·설명을 손으로 넣어 만든 주문서라 품목 고르기 화면에서는 고치지 않습니다(그 정보가 사라집니다). 재고도 적힌 대로 둡니다. 회사 배포·합산 견적·재고 차감은 됩니다.</p>
      ) : null}

      <Section title={`주문한 회사 ${p.customers.length}곳`}>
        {p.customers.length ? (
          <ul className="space-y-2">{p.customers.map((c) => <CustomerCard key={c.key} c={c} programId={p.id} />)}</ul>
        ) : <p className="text-sm text-muted">아직 받은 주문이 없습니다. 링크를 회사에 보내면 주문이 여기 회사별로 모입니다.</p>}
        {p.customers.length ? <p className="mt-1.5 text-xs text-faint">회사마다 <b>최신 견적</b>을 따라갑니다. 카톡·전화로 바뀐 내용은 <Link href="/quote?view=history" className="underline">견적서</Link>에서만 고칩니다(보낸 견적은 수정본). 여기서는 고치지 않습니다.</p> : null}
      </Section>

      {p.customers.length ? <AllocationTable a={p.allocation} /> : null}

      <Section title={`배포한 링크 ${p.links.length}개`}>
        <DeployForm programId={p.id} programName={p.name} clients={clientOptions} />
        {p.links.length ? <ul className="mt-2 space-y-2">{p.links.map((l) => <LinkCard key={l.recId} l={l} />)}</ul>
          : <p className="mt-2 text-sm text-muted">아직 배포한 링크가 없습니다. 위에서 회사 이름을 넣고 [링크 만들기]를 누르세요.</p>}
        <p className="mt-1.5 text-xs text-faint">링크 하나를 여러 곳에 돌려도 주문은 위 &lsquo;주문한 회사&rsquo;에 전화번호별로 따로 모입니다.</p>
      </Section>

      <Section title={`품목 ${p.items.length}종`}>
        {p.items.length ? (
          <div className="card overflow-x-auto">
            <table className="w-full min-w-[520px] text-xs">
              <thead className="text-left text-muted">
                <tr className="border-b border-line">
                  <th className="px-3 py-1.5 font-normal">품목</th><th className="py-1.5 pr-2 font-normal">규격</th>
                  <th className="py-1.5 pr-2 text-right font-normal">단가</th><th className="py-1.5 pr-2 text-right font-normal">크레이트</th><th className="py-1.5 pr-3 text-right font-normal">지금 재고</th>
                </tr>
              </thead>
              <tbody>
                {p.items.flatMap((it) => it.rows.map((r, i) => (
                  <tr key={`${it.k}-${r.size}`} className="border-b border-line last:border-0">
                    <td className="px-3 py-1.5">{i === 0 ? <><span className="text-muted">{it.group ? GROUP_INFO[it.group].label : "직접 입력"} · {it.grp}</span> {it.name}{it.latin ? <span className="block text-[11px] italic text-muted">{it.latin}</span> : null}</> : null}</td>
                    <td className="py-1.5 pr-2">{r.size}</td>
                    <td className="py-1.5 pr-2 text-right">₩{fmt(r.price)}<span className="text-muted">/{it.unit || "개"}</span></td>
                    <td className="py-1.5 pr-2 text-right">{r.pack ? <>{fmt(r.pack)}{it.unit} · ₩{fmt(r.price * r.pack)}</> : <span className="text-faint">낱개</span>}</td>
                    <td className="py-1.5 pr-3 text-right">{r.stock === null ? <span className="text-faint">표시 안 함</span> : `${typeof r.stock === "number" ? fmt(r.stock) : r.stock}${it.unit}`}</td>
                  </tr>
                )))}
              </tbody>
            </table>
          </div>
        ) : <EmptyState message={p.source ? "품목은 웹사이트가 직접 읽습니다(위 안내)." : "품목이 없습니다. [품목·가격 고치기]에서 고르세요."} />}
        <p className="mt-1.5 text-xs text-faint">
          {p.editable ? "재고는 라인업 표에서 지금 읽은 값입니다. 고객 링크는 [재고 반영]·품목 저장·재고 차감 때 이 값으로 바뀝니다." : "재고는 주문서에 적힌 값입니다."}
        </p>
      </Section>
    </AppShell>
  );
}

function LinkCard({ l }: { l: LinkDetail }) {
  const closed = l.status === "마감";
  return (
    <li className={`card flex flex-wrap items-start justify-between gap-2 p-3 text-sm ${closed ? "opacity-60" : ""}`}>
      <div className="min-w-0">
        <p className="flex flex-wrap items-center gap-1.5">
          <b>{l.customer || l.title}</b>
          {closed ? <span className="chip">마감</span> : null}
          <span className="text-xs text-muted">{l.created}</span>
        </p>
        <p className="text-xs text-muted">{l.customer && l.title ? `${l.title} · ` : ""}받은 주문 {l.orders}건{l.amount ? ` · ${won(l.amount)}` : ""}</p>
      </div>
      <div className="flex flex-wrap items-start gap-1.5">
        <a className="btn px-2.5 text-xs" href={l.url} target="_blank" rel="noopener noreferrer">열기</a>
        <CopyLink url={l.url} />
        <ActionButton action={linkStatusAction} fields={{ link: l.recId, status: closed ? "사용" : "마감" }} label={closed ? "다시 열기" : "닫기"} />
      </div>
    </li>
  );
}

function CustomerCard({ c, programId }: { c: Customer; programId: string }) {
  const f = { program: programId, customer: c.key };
  const pending = c.orders.filter((o) => c.pendingIds.includes(o.id));
  const autoDrafts = c.others.filter((o) => o.auto);
  return (
    <li className="card p-3 text-sm">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="flex flex-wrap items-center gap-1.5">
          <b>{c.company}</b>
          {c.person ? <span className="text-xs text-muted">{c.person}</span> : null}
          {c.phone ? <a href={`tel:${c.phone.replace(/[^\d+]/g, "")}`} className="text-xs text-muted underline">{c.phone}</a> : null}
        </p>
        <span className="text-xs text-muted">{c.via.join(" · ")}</span>
      </div>

      {c.quote ? (
        <div className="mt-1.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p>
              <span className="font-mono text-xs">{c.quote.number}</span> <span className="chip">{c.quote.status}</span> <b>{won(c.quote.total)}</b>
              {c.quote.deducted ? <span className="ml-1.5 text-xs text-brand-600">재고 차감함 {c.quote.deducted.slice(0, 10)}</span> : null}
            </p>
            <div className="flex flex-wrap items-start gap-1.5">
              <Link href="/quote?view=history" className="btn px-2.5 text-xs">견적서에서 고치기 →</Link>
              {c.quote.canDeduct ? (
                <ActionButton action={deductStockAction} fields={f} label="재고 차감" primary confirm={`${c.quote.number}의 수량을 라인업 재고에서 뺍니다. 한 번만 할 수 있습니다. 진행할까요?`} />
              ) : null}
            </div>
          </div>
          <p className="mt-0.5 text-xs text-muted">{c.quote.lines.map((l) => `${l.name} ${l.spec} ${fmt(l.qty)}`.replace(/\s+/g, " ")).join(" · ")}</p>
        </div>
      ) : (
        <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs text-danger">아직 견적이 없습니다.</span>
          <ActionButton action={mergeOrdersAction} fields={f} label={c.orders.length > 1 ? `주문 ${c.orders.length}건 견적 하나로 모으기` : "견적서로 묶기"} primary />
        </div>
      )}

      {c.quote && pending.length ? (
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded border border-line bg-canvas p-2 text-xs">
          <span className="text-danger">견적 뒤에 들어온 주문 {pending.length}건: {pending.map((o) => `${o.no} ${won(o.total)}`).join(", ")}</span>
          {c.quote.canAdd
            ? <ActionButton action={mergeOrdersAction} fields={f} label="이 주문을 견적에 더하기" primary confirm={`${pending.map((o) => o.no).join(", ")}의 품목을 ${c.quote.number}에 더합니다.${c.quote.status === "작성" ? "" : " 이미 보낸 견적이라 수정본이 생깁니다."}\n견적서에서 이미 넣었다면 누르지 마세요(두 번 들어갑니다).`} />
            : <span className="text-muted">견적이 {c.quote.status}라 견적서에서 반영합니다.</span>}
        </div>
      ) : null}

      <ul className="mt-2 space-y-0.5 border-t border-line pt-1.5 text-[11px] text-muted">
        {c.orders.map((o) => <li key={o.id}>받은 주문 {o.at.slice(0, 10)} · {o.no} · {won(o.total)}{c.quote && o.total !== c.quote.total ? " (처음 받은 그대로)" : ""}</li>)}
        {c.others.map((o) => <li key={o.id}>안 쓰는 견적 {o.number} · {o.status} · {won(o.total)}{o.auto ? " · 자동 초안" : ""}</li>)}
      </ul>
      {c.quote && autoDrafts.length ? (
        <div className="mt-1 flex justify-end">
          <ActionButton action={hideDraftsAction} fields={f} label={`안 쓰는 자동 초안 ${autoDrafts.length}장 숨기기`} confirm={`${autoDrafts.map((o) => o.number).join(", ")}을 견적서 목록에서 숨깁니다(삭제함, 되살릴 수 있음). 이 회사는 ${c.quote.number}을 따릅니다.`} />
        </div>
      ) : null}
    </li>
  );
}

/** 확보 수량을 누가 얼마나 가져가나. 견적이 있으면 견적(최신 수정본), 없으면 주문 기준. */
function AllocationTable({ a }: { a: Allocation }) {
  const rows = a.rows.filter((r) => r.total > 0 || r.stock !== null);
  return (
    <Section title="배정 현황">
      <div className="card overflow-x-auto">
        <table className="w-full min-w-[480px] text-xs">
          <thead className="text-left text-muted">
            <tr className="border-b border-line">
              <th className="px-3 py-1.5 font-normal">품목 · 규격</th>
              <th className="py-1.5 pr-2 text-right font-normal">확보</th>
              {a.customers.map((c) => <th key={c.key} className="py-1.5 pr-2 text-right font-normal">{c.name}</th>)}
              <th className="py-1.5 pr-3 text-right font-normal">남음</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const left = r.stock === null ? null : r.stock - r.total;
              return (
                <tr key={r.key} className="border-b border-line last:border-0">
                  <td className="px-3 py-1.5">{r.label} <span className="text-muted">{r.size}</span></td>
                  <td className="py-1.5 pr-2 text-right">{r.stock === null ? "—" : `${fmt(r.stock)}${r.approx ? "+" : ""}`}</td>
                  {r.byCustomer.map((q, i) => <td key={a.customers[i].key} className="py-1.5 pr-2 text-right">{q ? fmt(q) : ""}</td>)}
                  <td className={`py-1.5 pr-3 text-right font-semibold ${left !== null && left < 0 ? "text-danger" : ""}`}>{left === null ? "" : left < 0 ? `${fmt(-left)} 초과` : fmt(left)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {a.unmatched.length ? (
        <p className="mt-1.5 text-xs text-danger">주문서에 없는 줄: {a.unmatched.map((u) => `${u.customer} — ${u.line.name} ${u.line.spec} ${fmt(u.line.qty)}`).join(" · ")}</p>
      ) : null}
      <p className="mt-1 text-xs text-faint">확보 = 주문서에 적힌 재고. 회사별 수량은 그 회사의 최신 견적(없으면 받은 주문) 기준.</p>
    </Section>
  );
}
