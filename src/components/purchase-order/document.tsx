import "./po.css";

import { OPEN_GARDEN_EN as OG } from "@/config/company";
import {
  formatAmount,
  formatDateEn,
  formatPrice,
  formatQty,
  lineAmount,
  poLayout,
  poTotals,
  taxLabel,
  type PoDoc,
  type PoLine,
} from "@/lib/purchase-order";

type Props = { number: string; date: string; doc: PoDoc };

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </>
  );
}

/**
 * 영문 발주서 A4. 외국 공급업체가 한눈에 읽게: 큰 제목, BUYER / SUPPLIER 나란히,
 * 조건 네 칸, 통화를 머리에 적은 품목 표, 합계는 통화 코드와 함께 굵게. 날짜는 20 Nov 2026(일·월 혼동 없음).
 * 단가 미정 줄은 On request로 적고 합계에서 뺀다는 문장을 붙인다.
 */
export function PurchaseOrderDocument({ number, date, doc }: Props) {
  const pages = poLayout<PoLine>(doc.lines);
  const totals = poTotals(doc);
  const unit = totals.units.length === 1 ? ` ${totals.units[0]}` : "";
  const s = doc.supplier;
  // 각 쪽의 첫 줄 번호(0부터)
  const starts = pages.map((_, p) => pages.slice(0, p).reduce((n, rows) => n + rows.length, 0));

  return (
    <>
      {pages.map((rows, p) => {
        const first = p === 0;
        const last = p === pages.length - 1;
        const start = starts[p];
        return (
          <article key={p} className="po-page">
            <header className="po-top">
              <div className="po-brand">
                {/* eslint-disable-next-line @next/next/no-img-element -- 인쇄용 고정 크기 로고 */}
                <img src="/brand/logo.png" alt="" />
                <div><b>OPEN GARDEN</b><span>{OG.web}</span></div>
              </div>
              <div className="po-title">PURCHASE ORDER{first ? null : <small>continued</small>}</div>
              <dl className="po-meta">
                <Row label="PO No." value={number} />
                <Row label="Date" value={formatDateEn(date)} />
                <Row label="Currency" value={doc.currency} />
                <Row label="Page" value={`${p + 1} of ${pages.length}`} />
              </dl>
            </header>

            {first ? (
              <>
                <div className="po-parties">
                  <section className="po-party">
                    <h2>BUYER</h2>
                    <dl>
                      <Row label="Company" value={<b>{OG.company}</b>} />
                      <Row label="Contact" value={`${OG.contact} — ${OG.title}`} />
                      <Row label="Address" value={OG.address.map((l) => <span key={l}>{l}</span>)} />
                      <Row label="Tel" value={OG.phone} />
                      <Row label="E-mail" value={OG.email} />
                      <Row label="Business Reg. No." value={OG.regNo} />
                    </dl>
                  </section>
                  <section className="po-party">
                    <h2>SUPPLIER</h2>
                    <dl>
                      <Row label="Company" value={<b>{s.company}</b>} />
                      {s.attn ? <Row label="Attn." value={s.attn} /> : null}
                      {s.address ? <Row label="Address" value={s.address} /> : null}
                      {s.phone ? <Row label="Tel" value={s.phone} /> : null}
                      {s.email ? <Row label="E-mail" value={s.email} /> : null}
                      {s.taxId ? <Row label={taxLabel(s.taxId)} value={s.taxId} /> : null}
                    </dl>
                  </section>
                </div>

                <dl className="po-terms">
                  <div><dt>Your reference</dt><dd>{doc.reference || "—"}</dd></div>
                  <div><dt>Requested delivery</dt><dd>{doc.requestedDelivery ? formatDateEn(doc.requestedDelivery) : "To be confirmed"}</dd></div>
                  <div><dt>Delivery terms</dt><dd>{doc.deliveryTerms || "To be confirmed"}</dd></div>
                  <div><dt>Payment terms</dt><dd>{doc.paymentTerms || "As agreed"}</dd></div>
                  <div className="po-shipto"><dt>Ship to</dt><dd>{doc.shipTo || `Same as Buyer — ${OG.company}, ${OG.address.join(", ")}`}</dd></div>
                </dl>
              </>
            ) : null}

            <div className="po-body">
              {rows.length ? (
                <table className="po-items">
                  <thead>
                    <tr>
                      <th className="po-no">No.</th>
                      <th className="po-code">Item code</th>
                      <th className="po-desc">Description</th>
                      <th className="po-size">Size</th>
                      <th className="po-num">Qty</th>
                      <th className="po-unit">Unit</th>
                      <th className="po-num">Unit price<br />({doc.currency})</th>
                      <th className="po-num po-amount">Amount<br />({doc.currency})</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((l, i) => {
                      const amount = lineAmount(l, doc.currency);
                      return (
                        <tr key={i}>
                          <td className="po-no">{start + i + 1}</td>
                          <td className="po-code">{l.code}</td>
                          <td className="po-desc">{l.description}</td>
                          <td className="po-size">{l.size}</td>
                          <td className="po-num">{formatQty(l.qty)}</td>
                          <td className="po-unit">{l.unit}</td>
                          <td className="po-num">{l.price === null ? <i>On request</i> : formatPrice(l.price, doc.currency)}</td>
                          <td className="po-num po-amount">{amount === null ? <i>—</i> : formatAmount(amount, doc.currency)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              ) : null}

              {last ? (
                <>
                  <div className="po-total">
                    <div className="po-total-count">
                      {totals.lines} item{totals.lines === 1 ? "" : "s"} · Total quantity {formatQty(totals.qty)}{unit}
                    </div>
                    <div className="po-total-sum">
                      <span>TOTAL AMOUNT</span>
                      <b>{doc.currency} {formatAmount(totals.total, doc.currency)}</b>
                    </div>
                  </div>
                  {totals.onRequest.length ? (
                    <p className="po-note-line">
                      * Item{totals.onRequest.length > 1 ? "s" : ""} {totals.onRequest.join(", ")}: price on request — not included in the total.
                      Please quote your price when confirming.
                    </p>
                  ) : null}

                  {doc.remarks ? (
                    <section className="po-box">
                      <h3>Remarks</h3>
                      <p>{doc.remarks}</p>
                    </section>
                  ) : null}

                  <section className="po-box po-instructions">
                    <h3>Instructions to supplier</h3>
                    <ol>
                      <li>Please confirm this order by e-mail to {OG.email} with availability, prices and expected dispatch date.</li>
                      <li>Please quote PO No. {number} on your order confirmation, invoice, packing list and all correspondence.</li>
                      <li>Prices are in {doc.currency}, excluding VAT, unless stated otherwise.</li>
                    </ol>
                  </section>

                  <div className="po-sign">
                    <div>
                      <span className="po-sign-label">Issued by</span>
                      <span className="po-sign-line" />
                      <b>{OG.representative}, {OG.title}</b>
                      <span>{OG.company}</span>
                    </div>
                    <div>
                      <span className="po-sign-label">Accepted by supplier</span>
                      <span className="po-sign-line" />
                      <b>Name / Date</b>
                      <span>{s.company}</span>
                    </div>
                  </div>
                </>
              ) : null}

              <footer className="po-foot">
                <span>{OG.company} · Business Reg. No. {OG.regNo} · {OG.web} · {OG.email}</span>
                <span>{number} · Page {p + 1} of {pages.length}</span>
              </footer>
            </div>
          </article>
        );
      })}
    </>
  );
}
