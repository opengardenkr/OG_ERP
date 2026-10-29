import "./document.css";

import {
  boldParts,
  formatWon,
  inkOn,
  type Card,
  type OrderRow,
  type Page,
  type Proposal,
} from "@/lib/genus-proposal";

/**
 * 속명 제안서 A4 문서. 서버 컴포넌트 — 상태가 없다.
 * 화면 미리보기와 인쇄용 화면이 같은 컴포넌트를 쓴다.
 */
export function ProposalDocument({ proposal, title, date }: { proposal: Proposal; title: string; date: string }) {
  const total = proposal.pages.length;
  const series = commonSeries(proposal.cards);
  return (
    <div className="gp-pages gp-root">
      {proposal.pages.map((page, i) => (
        <section className="gp-page" key={i}>
          <header className="gp-band">
            <div className="gp-mark">OPEN<br />GARDEN</div>
            <div className="gp-title">{title}</div>
            <div className="gp-date">{date}</div>
          </header>
          {i === 0 ? <Legend proposal={proposal} /> : null}
          <main className="gp-content">
            {page.kind === "cards" ? (
              <CardsPage page={page} proposal={proposal} series={series} first={i === 0} />
            ) : (
              <InfoPage page={page} proposal={proposal} />
            )}
          </main>
          <footer className="gp-fband">
            <span>Open Garden · 오픈가든 · open-garden.co.kr</span>
            <span className="gp-fc">{i + 1} / {total}</span>
            <span className="gp-pill">카카오톡 &quot;오픈가든&quot; 검색</span>
          </footer>
        </section>
      ))}
    </div>
  );
}

function commonSeries(cards: Card[]): string {
  const set = new Set(cards.map((c) => c.series));
  return set.size === 1 ? [...set][0] : "";
}

function Legend({ proposal }: { proposal: Proposal }) {
  const hasAward = proposal.cards.some((c) => c.award);
  return (
    <div className="gp-legend">
      {hasAward ? <><span className="gp-badge">수상</span> 품종 평가 수상 <span className="gp-lsep">|</span></> : null}
      {proposal.terms.legend.map((item, i) => (
        <span key={i}>{i > 0 ? <span className="gp-lsep">| </span> : null}{item}</span>
      ))}
      <span className="gp-lsep">|</span> <span className="gp-few">소량</span> {proposal.terms.few.toLocaleString("ko-KR")}주 미만
    </div>
  );
}

function Section({ name, sub }: { name: string; sub: string }) {
  return (
    <div className="gp-sec">
      <span className="gp-sname">{name}</span>
      <span className="gp-ssub">{sub}</span>
      <span className="gp-sline" />
    </div>
  );
}

function CardsPage({ page, proposal, series, first }: { page: Extract<Page, { kind: "cards" }>; proposal: Proposal; series: string; first: boolean }) {
  return (
    <>
      <Section
        name={series ? `${series} ${proposal.genus}` : proposal.genus}
        sub={first ? `${proposal.cards.length}품종 · ${proposal.rowCount}규격` : "계속"}
      />
      {page.rows.map((row, r) => (
        <div className="gp-row" key={r}>
          {row.map((slot, s) => (slot.kind === "chart" ? <Chart key={s} cards={proposal.cards} /> : <CardView key={s} card={slot.card} />))}
        </div>
      ))}
    </>
  );
}

function CardView({ card }: { card: Card }) {
  const height = card.heightMin !== null && card.heightMax !== null
    ? card.heightMin === card.heightMax ? `약 ${card.heightMin}cm` : `${card.heightMin}~${card.heightMax}cm`
    : "";
  return (
    <article className="gp-card" data-key={card.key}>
      <div className="gp-ctop">
        <span className="gp-grp">{card.genusLabel}</span>
        {card.award ? <span className="gp-badge">{card.award}</span> : null}
      </div>
      <div className="gp-vname">{card.name}</div>
      <div className="gp-latin">{card.latin}</div>
      <div className="gp-photo">
        {card.photo ? (
          <>
            {/* 서명된 Airtable 주소라 next/image 최적화를 거치지 않는다 */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={card.photo} alt={card.name} referrerPolicy="no-referrer" />
            {card.photoCredit ? <span className="gp-cr">© {card.photoCredit}</span> : null}
          </>
        ) : (
          <div className="gp-photo-empty">사진 준비 중</div>
        )}
      </div>
      {card.hues.length ? (
        <div className="gp-hstrip">
          <span className="gp-hlab">꽃색 변화</span>
          <div className="gp-hsegs">
            {card.hues.map((h, i) => (
              <span key={i} style={{ background: h.color, color: inkOn(h.color) }}>
                <b>{h.month}</b><i>{h.name}</i>
              </span>
            ))}
          </div>
        </div>
      ) : null}
      <div className="gp-chips">
        {card.sizeClass ? <span className="gp-chip gp-size">{card.sizeClass}</span> : null}
        {height ? <span className="gp-chip">키 {height}</span> : null}
        {card.width !== null ? <span className="gp-chip">폭 {card.width}cm</span> : null}
      </div>
      <ul className="gp-feat">
        {card.features.length
          ? card.features.slice(0, 3).map((f, i) => <li key={i}>{f}</li>)
          : <li className="gp-noinfo">품종 특징은 별도로 안내드립니다</li>}
      </ul>
      <div className="gp-meta">
        <div className="gp-mhead"><span className="gp-c1">규 격</span><span className="gp-c2">현지 재고</span><span className="gp-c3">판매가 / 주</span></div>
        {card.rows.map((row) => (
          <div className="gp-mrow" key={row.sku}>
            <span className="gp-c1">{row.spec}{row.specNote ? <small>{row.specNote}</small> : null}</span>
            <span className="gp-c2">{row.stock.toLocaleString("ko-KR")}주{row.few ? <span className="gp-few">소량</span> : null}</span>
            <span className="gp-c3">{formatWon(row.price)}</span>
          </div>
        ))}
      </div>
    </article>
  );
}

function Chart({ cards }: { cards: Card[] }) {
  const items = cards
    .filter((c) => c.heightMax !== null)
    .sort((a, b) => (b.heightMax ?? 0) - (a.heightMax ?? 0) || (b.heightMin ?? 0) - (a.heightMin ?? 0));
  const top = Math.max(...items.map((c) => c.heightMax ?? 0));
  const step = top > 200 ? 100 : 50;
  const max = Math.max(step * 3, Math.ceil(top / step) * step);
  const ticks: number[] = [];
  for (let t = 0; t <= max; t += step) ticks.push(t);
  const classes = [...new Set(items.map((c) => c.sizeClass).filter(Boolean))];
  return (
    <section className="gp-chart">
      <div className="gp-chead">
        <span className="gp-ctitle">품종별 키 비교</span>
        <span className="gp-csub">성목 높이 · cm · 화단 앞→뒤 배치 참고</span>
        {classes.length ? (
          <span className="gp-ckey">{classes.map((c) => <span key={c}><i className={`gp-s-${c}`} />{c}</span>)}</span>
        ) : null}
      </div>
      <div className="gp-cbody">
        {items.map((c) => {
          const lo = c.heightMin ?? c.heightMax ?? 0, hi = c.heightMax ?? lo;
          const left = (lo / max) * 100, width = Math.max(((hi - lo) / max) * 100, 1.4);
          return (
            <div className="gp-crow" key={c.key}>
              <span className="gp-cname">{c.name.replace(/^리빙\s+/, "")}</span>
              <span className="gp-ctrack">
                <span className={`gp-cbar gp-s-${c.sizeClass}`} style={{ left: `${left}%`, width: `${width}%` }} />
                <span className="gp-cval" style={{ left: `calc(${left + width}% + 1.2mm)` }}>{lo === hi ? lo : `${lo}~${hi}`}</span>
              </span>
            </div>
          );
        })}
        <div className="gp-crow gp-axis">
          <span className="gp-cname" />
          <span className="gp-ctrack">
            {ticks.map((t) => <span className="gp-tick" key={t} style={{ left: `${(t / max) * 100}%` }}><i /><b>{t}</b></span>)}
          </span>
        </div>
      </div>
    </section>
  );
}

function OrderTables({ rows }: { rows: OrderRow[] }) {
  const half = Math.ceil(rows.length / 2);
  const table = (list: OrderRow[]) => (
    <table>
      <thead><tr><th>품종</th><th>규격</th><th className="gp-num">현지 재고</th><th className="gp-num">판매가/주</th><th>주문 박스</th></tr></thead>
      <tbody>
        {list.map((r) => (
          <tr key={r.sku}>
            <td className="gp-on">{r.name.replace(/^리빙\s+/, "")}</td>
            <td>{r.spec}</td>
            <td className="gp-num">{r.stock.toLocaleString("ko-KR")}{r.few ? <span className="gp-few">소량</span> : null}</td>
            <td className="gp-num gp-b">{formatWon(r.price)}</td>
            <td className="gp-blank" />
          </tr>
        ))}
      </tbody>
    </table>
  );
  return <div className="gp-otbls">{table(rows.slice(0, half))}{rows.length > half ? table(rows.slice(half)) : <div />}</div>;
}

function InfoPage({ page, proposal }: { page: Extract<Page, { kind: "info" }>; proposal: Proposal }) {
  const { terms } = proposal;
  const credits = [...new Set(proposal.cards.map((c) => c.photoCredit).filter(Boolean))];
  const hasHues = proposal.cards.some((c) => c.hues.length);
  return (
    <>
      <Section name={terms.seriesTiles.length ? "시리즈 특성 · 주문 안내" : "주문 안내"} sub={page.first ? "" : "주문표 계속"} />
      {page.first && terms.seriesTiles.length ? (
        <section className="gp-series">
          <div className="gp-stitle">{terms.seriesTitle}</div>
          <div className="gp-tiles">
            {terms.seriesTiles.map((t, i) => <div className="gp-tile" key={i}><b>{t.value}</b><span>{t.label}</span><i>{t.note}</i></div>)}
          </div>
        </section>
      ) : null}
      <section className="gp-box">
        <div className="gp-bhead">
          <span className="gp-btitle">한눈에 보기 · 주문표</span>
          <span className="gp-bsub">주문 박스 칸에 적어 사진으로 보내주시면 견적서로 회신드립니다</span>
        </div>
        <OrderTables rows={page.orderRows} />
      </section>
      {page.first && terms.lines.length ? (
        <section className="gp-box gp-terms">
          <div className="gp-bhead"><span className="gp-btitle">거래 조건 및 안내</span></div>
          <ul>
            {terms.lines.map((line, i) => (
              <li key={i}>{boldParts(line).map((p, j) => (p.bold ? <b key={j}>{p.text}</b> : <span key={j}>{p.text}</span>))}</li>
            ))}
          </ul>
        </section>
      ) : null}
      {page.first ? (
        <section className="gp-credits">
          <div className="gp-crh">품종 정보 및 사진 출처</div>
          <p>
            품종 특징·키·폭은 육종사와 공급사가 공개한 자료를 기준으로 정리했으며, 재배 환경과 전정에 따라 달라질 수 있습니다.
            {hasHues ? " 꽃색 변화 막대는 육종사가 공개한 월별 꽃색이며, 실제 꽃색은 일조·토양·기온에 따라 달라집니다." : ""}
            {credits.length ? ` 사진: ${credits.join(", ")}.` : ""}
          </p>
        </section>
      ) : null}
    </>
  );
}
