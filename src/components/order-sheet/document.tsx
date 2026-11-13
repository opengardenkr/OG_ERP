import "./sheet.css";

import { seoulDate } from "@/lib/date";
import { sheetPages, type OrderSheet } from "@/lib/sales";

const ROWS = 20;
const dot = (iso: string) => (/^\d{4}-\d{2}-\d{2}$/.test(iso) ? `${iso.slice(0, 4)}. ${+iso.slice(5, 7)}. ${+iso.slice(8, 10)}.` : iso);
const n = (x: number) => Math.round(x).toLocaleString("ko-KR");
const dash = (s: string) => s.trim() || "-";

/**
 * 주문서 A4 쪽들. 견적서 생성기 양식과 같은 머리(로고·제목·번호)와 품목 표, 가격 칸만 없다.
 * 받는 곳(상호·담당·연락처·배송지) / 보내는 곳(오픈가든 — 소재지 대신 홈페이지·카카오채널, 영업 문서에 지역을 쓰지 않는다).
 * 품목이 20줄을 넘으면 쪽을 나눈다. 비고·출고 확인 칸은 마지막 쪽에.
 */
export function OrderSheetDocument({ sheet }: { sheet: OrderSheet }) {
  const pages = sheetPages(sheet.lines, ROWS);
  const total = sheet.lines.reduce((a, l) => a + l.qty, 0);
  const issued = sheet.sheetAt ? dot(seoulDate(sheet.sheetAt)) : "";
  return (
    <>
      {pages.map((rows, p) => {
        const last = p === pages.length - 1;
        return (
          <article key={p} className="os-page">
            <header className="os-top">
              <div className="os-brand">
                {/* eslint-disable-next-line @next/next/no-img-element -- 인쇄용 고정 크기 로고 */}
                <img src="/brand/logo.png" alt="" />
                <div><b>OPEN GARDEN</b><span>오픈가든</span></div>
              </div>
              <div className="os-title">주 문 서</div>
              <table className="os-meta">
                <tbody>
                  <tr><th>주문번호</th><td>{sheet.base}</td></tr>
                  <tr><th>발행일</th><td>{issued}</td></tr>
                  <tr><th>견적번호</th><td>{sheet.number}</td></tr>
                </tbody>
              </table>
            </header>
            {p === 0 ? (
              <div className="os-parties">
                <section className="os-party">
                  <div className="os-party-title">받는 곳</div>
                  <div className="os-grid">
                    <span>상호</span><b>{dash(sheet.company)}</b>
                    <span>담당</span><b>{dash(sheet.person)}</b>
                    <span>연락처</span><b>{dash(sheet.phone)}</b>
                    <span className="last">배송지</span><b className="last">{dash(sheet.address)}</b>
                  </div>
                </section>
                <section className="os-party">
                  <div className="os-party-title">보내는 곳</div>
                  <div className="os-grid">
                    <span>상호</span><b>오픈가든</b>
                    <span>홈페이지</span><b>open-garden.co.kr</b>
                    <span>문의</span><b>카카오채널 @오픈가든</b>
                    <span className="last">출고</span><b className="last">현물 입고 즉시 발송</b>
                  </div>
                </section>
              </div>
            ) : <div style={{ height: "4mm" }} />}
            <div className="os-body">
              <table className="os-items">
                <thead>
                  <tr><th className="os-no">No</th><th>품명</th><th className="os-spec">규격</th><th className="os-qty">수량</th><th className="os-unit">단위</th><th className="os-check">확인</th></tr>
                </thead>
                <tbody>
                  {Array.from({ length: ROWS }, (_, i) => {
                    const l = rows[i];
                    return l ? (
                      <tr key={i}>
                        <td className="os-no">{p * ROWS + i + 1}</td><td>{l.name}</td><td className="os-spec">{l.spec}</td>
                        <td className="os-qty">{n(l.qty)}</td><td className="os-unit">{sheet.unit}</td><td className="os-check">☐</td>
                      </tr>
                    ) : <tr key={i}><td className="os-no" /><td /><td /><td /><td /><td /></tr>;
                  })}
                </tbody>
                {last ? (
                  <tfoot>
                    <tr><td colSpan={3} style={{ textAlign: "center" }}>총 {sheet.lines.length}품목</td><td className="os-qty">{n(total)}</td><td className="os-unit">{sheet.unit}</td><td /></tr>
                  </tfoot>
                ) : null}
              </table>
              {last ? (
                <>
                  <div className="os-remarks"><b>비고</b><span>{sheet.notes.join("\n") || " "}</span></div>
                  <div className="os-sign">
                    <div><b>출고일</b><span /></div>
                    <div><b>포장 확인</b><span /></div>
                    <div><b>인수 확인</b><span /></div>
                  </div>
                </>
              ) : null}
              <footer className="os-foot"><span>오픈가든 · open-garden.co.kr</span><span>{p + 1} / {pages.length}</span></footer>
            </div>
          </article>
        );
      })}
    </>
  );
}
