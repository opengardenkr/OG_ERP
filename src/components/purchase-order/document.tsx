import "./po.css";

import { OPEN_GARDEN_EN as OG } from "@/config/company";
import { formatDateEn, formatPrice, formatQty, poLayout, PO_TITLE, type PoDoc, type PoLine } from "@/lib/purchase-order";

type Props = { number: string; date: string; doc: PoDoc };

/**
 * 영문 발주서 A4. 품목 · 규격 · 수량 · 단가만 싣는다(2026-11-20 사용자: "쓸데없는 글씨 너무 많아").
 * 머리띠(로고 · 제목 · 번호 · 날짜) → To 한 줄 → 품목 표 → Note(적었을 때만).
 */
export function PurchaseOrderDocument({ number, date, doc }: Props) {
  const pages = poLayout<PoLine>(doc.lines, Boolean(doc.remarks));
  const starts = pages.map((_, p) => pages.slice(0, p).reduce((n, rows) => n + rows.length, 0));
  const s = doc.supplier;

  return (
    <>
      {pages.map((rows, p) => {
        const first = p === 0;
        const last = p === pages.length - 1;
        return (
          <article key={p} className="po-page">
            <header className="po-top">
              <div className="po-brand">
                {/* eslint-disable-next-line @next/next/no-img-element -- 인쇄용 고정 크기 로고 */}
                <img src="/brand/logo.png" alt="" />
                <div><b>OPEN GARDEN</b><span>{OG.web}</span></div>
              </div>
              <div className="po-title">{PO_TITLE[doc.kind]}</div>
              <dl className="po-meta">
                <dt>No.</dt><dd>{number}</dd>
                <dt>Date</dt><dd>{formatDateEn(date)}</dd>
                {pages.length > 1 ? (<><dt>Page</dt><dd>{p + 1} / {pages.length}</dd></>) : null}
              </dl>
            </header>

            {first ? (
              <p className="po-to">
                <span>To</span>
                <b>{s.company}</b>
                {s.attn ? <em>Attn. {s.attn}</em> : null}
              </p>
            ) : null}

            {rows.length ? (
              <table className="po-items">
                <thead>
                  <tr>
                    <th className="po-no">No.</th>
                    <th>Item</th>
                    <th className="po-size">Size</th>
                    <th className="po-num">Qty</th>
                    <th className="po-num po-price">Unit price ({doc.currency})</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((l, i) => (
                    <tr key={i}>
                      <td className="po-no">{starts[p] + i + 1}</td>
                      <td className="po-desc">{l.description}</td>
                      <td className="po-size">{l.size}</td>
                      <td className="po-num">{formatQty(l.qty)}{l.unit ? <small> {l.unit}</small> : null}</td>
                      <td className="po-num po-price">{l.price === null ? <i>On request</i> : formatPrice(l.price, doc.currency)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : null}

            {last && doc.remarks ? (
              <section className="po-note">
                <h3>Note</h3>
                <p>{doc.remarks}</p>
              </section>
            ) : null}
          </article>
        );
      })}
    </>
  );
}
