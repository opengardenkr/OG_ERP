import Link from "next/link";
import { notFound } from "next/navigation";
import {
  deductStockAction, linkStatusAction, mergeOrdersAction, programStatusAction, refreshStockAction,
} from "@/app/order-actions";
import { AppShell, Section } from "@/components/app-shell";
import { EmptyState, ErrorState } from "@/components/data-state";
import { ActionButton, CopyLink, DeployForm } from "@/components/order-program-actions";
import { getClients } from "@/lib/airtable/clients";
import { getProgram, type LinkDetail } from "@/lib/airtable/order-programs";
import { quoteAirtableUrl } from "@/lib/airtable/sales";
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
      subtitle={[p.supplier ? SUPPLIER_INFO[p.supplier].label : "업체 미정", `품목 ${p.items.length}종`, p.min ? `최소 주문 ${won(p.min)}` : "", p.status === "보관" ? "보관함" : ""].filter(Boolean).join(" · ")}
      action={<Link href={`/catalog${p.supplier ? `?s=${p.supplier}` : ""}`} className="btn text-sm">← 주문서</Link>}
    >
      <div className="mb-3 flex flex-wrap items-start gap-2">
        {p.editable ? <Link href={`/catalog/pick?program=${p.id}`} className="btn-primary px-2.5 text-xs">품목·가격 고치기</Link> : null}
        <ActionButton action={refreshStockAction} fields={{ program: p.id }} label="재고 반영" />
        <ActionButton action={programStatusAction} fields={{ program: p.id, status: p.status === "보관" ? "사용" : "보관" }} label={p.status === "보관" ? "다시 꺼내기" : "보관"} />
      </div>
      {p.memo ? <p className="card mb-3 whitespace-pre-wrap p-3 text-xs text-muted">{p.memo.replace(/\*\*/g, "")}</p> : null}
      {!p.editable ? (
        <p className="mb-3 text-xs text-faint">사진·크레이트·설명을 손으로 넣어 만든 주문서라 품목 고르기 화면에서는 고치지 않습니다(그 정보가 사라집니다). 재고 반영·회사 배포·합산 견적·재고 차감은 됩니다.</p>
      ) : null}

      <Section title={`배포한 회사 ${p.links.length}곳`}>
        <DeployForm programId={p.id} programName={p.name} clients={clientOptions} />
        {p.links.length ? <ul className="mt-2 space-y-2">{p.links.map((l) => <LinkCard key={l.recId} l={l} />)}</ul>
          : <p className="mt-2 text-sm text-muted">아직 배포한 회사가 없습니다. 위에서 회사 이름을 넣고 [링크 만들기]를 누르세요.</p>}
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
        ) : <EmptyState message="품목이 없습니다. [품목·가격 고치기]에서 고르세요." />}
        <p className="mt-1.5 text-xs text-faint">
          재고는 라인업 표에서 지금 읽은 값입니다. 고객 링크는 [재고 반영]·품목 저장·재고 차감 때 이 값으로 바뀝니다.
        </p>
      </Section>
    </AppShell>
  );
}

function LinkCard({ l }: { l: LinkDetail }) {
  const closed = l.status === "마감";
  return (
    <li className={`card p-3 text-sm ${closed ? "opacity-60" : ""}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-1.5">
            <b>{l.customer || l.title}</b>
            {closed ? <span className="chip">마감</span> : null}
            <span className="text-xs text-muted">{l.created}</span>
          </p>
          {l.customer && l.title ? <p className="text-xs text-muted">{l.title}</p> : null}
        </div>
        <div className="flex flex-wrap items-start gap-1.5">
          <a className="btn px-2.5 text-xs" href={l.url} target="_blank" rel="noopener noreferrer">열기</a>
          <CopyLink url={l.url} />
          <ActionButton action={linkStatusAction} fields={{ link: l.recId, status: closed ? "사용" : "마감" }} label={closed ? "다시 열기" : "닫기"} />
        </div>
      </div>

      <div className="mt-2 border-t border-line pt-2">
        {l.orders.length ? (
          <>
            <p className="text-xs"><b>받은 주문 {l.orders.length}건 · {won(l.amount)}</b> <span className="text-muted">(VAT 별도)</span></p>
            <ul className="mt-1 space-y-0.5 text-xs text-muted">
              {l.orders.map((o) => (
                <li key={o.id}>{o.at.slice(0, 10)} · {o.no} · {o.who} · {won(o.total)}{o.draft ? ` → ${o.draft}` : ""}</li>
              ))}
            </ul>
          </>
        ) : <p className="text-xs text-muted">아직 받은 주문이 없습니다.</p>}

        <div className="mt-2 flex flex-wrap items-start justify-between gap-2">
          {l.quote ? (
            <p className="text-xs">
              견적 <a href={quoteAirtableUrl(l.quote.id)} target="_blank" rel="noopener noreferrer" className="font-mono underline">{l.quote.number}</a>
              {" "}<span className="chip">{l.quote.status}</span> {won(l.quote.total)}
              {l.quote.deducted ? <span className="ml-1.5 text-brand-600">재고 차감함 {l.quote.deducted.slice(0, 10)}</span> : null}
            </p>
          ) : <span />}
          <div className="flex flex-wrap items-start gap-1.5">
            {l.orders.length ? (
              <ActionButton action={mergeOrdersAction} fields={{ link: l.recId }} label={l.quote ? "새 주문까지 다시 합치기" : "합산 견적서 만들기"} primary={!l.quote} />
            ) : null}
            {l.quote?.canDeduct ? (
              <ActionButton
                action={deductStockAction} fields={{ link: l.recId }} label="재고 차감" primary
                confirm={`${l.quote.number}의 수량을 라인업 재고에서 뺍니다. 한 번만 할 수 있습니다. 진행할까요?`}
              />
            ) : null}
          </div>
        </div>
        {l.quote && !l.quote.canDeduct && !l.quote.deducted ? (
          <p className="mt-1 text-[11px] text-faint">견적서에서 수주확정하면 [재고 차감]이 나타납니다.</p>
        ) : null}
      </div>
    </li>
  );
}
