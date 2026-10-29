import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildProposal, parseHues, nameOfColor, splitName, splitSpec, cleanLatin, boldParts, parseTiles, mergeTerms, genusFormula, inkOn,
} from '../src/lib/genus-proposal.ts';
import { readParams, toQuery, proposalTitle, todayLabel } from '../src/lib/genus-proposal-params.ts';

const row = (id, master, name, size, stock, price, sku = id) => ({
  id, sku, name, latin: "Hydrangea pan. Living 'X'® NEW", size, price, stock, stockDate: '2026-10-05', masterId: master,
});
const master = (id, name, sizeClass, heightMin, heightMax, extra = {}) => ({
  id, name, latin: `Hydrangea paniculata ${id}`, features: ['특징 하나', '특징 둘'], sizeClass, heightMin, heightMax, width: 80,
  hues: parseHues('7월 #f7f1de, 8월 #edc0cc, 9월 #be0053'), award: '', series: 'Living Creations', photo: `https://x/${id}.jpg`,
  photoCredit: 'Living Creations®', review: 'AI 초안', ...extra,
});
const termRows = [
  { series: '', lines: '**품종당 5박스부터** 주문\n재고는 10월 기준', legend: '판매가: 원/주 | 규격: P9', few: 300, seriesTitle: '', seriesTiles: '' },
  { series: 'Living Creations', lines: 'PBR 품종입니다', legend: '', few: null, seriesTitle: '시리즈 특성', seriesTiles: '-30℃ | 내한성 | 월동\n100일 | 개화 | 7~9월' },
];

test('parsers turn Airtable text into display values', () => {
  assert.deepEqual(parseHues('7월 #EDC0CC, 8월 #d56886 로즈, 잘못된 칸'), [
    { month: '7월', color: '#edc0cc', name: '연분홍' }, { month: '8월', color: '#d56886', name: '로즈' },
  ]);
  assert.equal(nameOfColor('#9cbf21'), '연두');
  assert.equal(nameOfColor('#123456').length > 0, true);
  assert.deepEqual(splitName("목수국 '리빙 핑크 앤 로즈'"), { genusLabel: '목수국', cultivar: '리빙 핑크 앤 로즈' });
  assert.deepEqual(splitName('무늬 은사철'), { genusLabel: '', cultivar: '무늬 은사철' });
  assert.deepEqual(splitSpec('P12 (컬러팟)'), { spec: 'P12', specNote: '컬러팟' });
  assert.equal(cleanLatin("Hydrangea pan. Living 'Pink & Rose'® NEW24"), "Hydrangea pan. Living 'Pink & Rose'®");
  assert.deepEqual(boldParts('가 **나** 다'), [{ text: '가 ', bold: false }, { text: '나', bold: true }, { text: ' 다', bold: false }]);
  assert.deepEqual(parseTiles('a | b | c\n\nx | y'), [{ value: 'a', label: 'b', note: 'c' }, { value: 'x', label: 'y', note: '' }]);
  assert.equal(inkOn('#be0053'), '#ffffff');
  assert.equal(inkOn('#f7f1de'), '#2e3a28');
});

test('genus formula escapes quotes so input cannot become a formula', () => {
  assert.equal(genusFormula('목수국'), 'AND({세부분류}="목수국",NOT({노출제외}))');
  assert.equal(genusFormula('a"),TRUE()'), 'AND({세부분류}="a\\"),TRUE()",NOT({노출제외}))');
});

test('rows group by master, out-of-stock rows drop, cards sort large to small', () => {
  const masters = [master('mA', "목수국 '리빙 A'", '소형', 60, 70), master('mB', "목수국 '리빙 B'", '대형', 120, 140, { award: 'KVBC 금상' })];
  const rows = [
    row('r1', 'mA', "목수국 '리빙 A'", 'P9', 1000, 6500),
    row('r2', 'mA', "목수국 '리빙 A'", 'P12 (컬러팟)', 72, 7500),
    row('r3', 'mB', "목수국 '리빙 B'", 'P9', 0, 6500),
    row('r4', 'mB', "목수국 '리빙 B'", 'P12 (컬러팟)', 500, 7500),
  ];
  const p = buildProposal(rows, masters, termRows, { genus: '목수국' });
  assert.deepEqual(p.cards.map((c) => c.name), ['리빙 B', '리빙 A']);
  assert.deepEqual(p.cards[0].rows.map((r) => r.sku), ['r4']);
  assert.equal(p.cards[0].award, 'KVBC 금상');
  assert.deepEqual(p.cards[1].rows.map((r) => [r.spec, r.specNote, r.few]), [['P9', '', false], ['P12', '컬러팟', true]]);
  assert.equal(p.rowCount, 3);
  const all = buildProposal(rows, masters, termRows, { genus: '목수국', onlyInStock: false });
  assert.equal(all.rowCount, 4);
});

test('series terms are added only when every card shares the series', () => {
  const masters = [master('mA', "목수국 'A'", '소형', 60, 70), master('mB', "목수국 'B'", '대형', 100, 120)];
  const rows = [row('r1', 'mA', "목수국 'A'", 'P9', 10, 1), row('r2', 'mB', "목수국 'B'", 'P9', 10, 1)];
  const p = buildProposal(rows, masters, termRows, { genus: '목수국' });
  assert.deepEqual(p.terms.lines, ['**품종당 5박스부터** 주문', '재고는 10월 기준', 'PBR 품종입니다']);
  assert.equal(p.terms.seriesTiles.length, 2);
  assert.deepEqual(p.terms.legend, ['판매가: 원/주', '규격: P9']);
  const mixed = buildProposal(rows, [masters[0], { ...masters[1], series: '' }], termRows, { genus: '목수국' });
  assert.equal(mixed.terms.lines.length, 2);
  assert.equal(mixed.terms.seriesTiles.length, 0);
  assert.equal(mergeTerms([], []).few, 300);
});

test('ten varieties lay out as 3x2 pages with the height chart beside the last card', () => {
  const masters = Array.from({ length: 10 }, (_, i) => master(`m${i}`, `목수국 '품종${i}'`, ['대형', '중형', '소형'][i % 3], 60 + i, 70 + i));
  const rows = masters.map((m, i) => row(`r${i}`, m.id, m.name, 'P9', 100 + i * 100, 6500));
  const p = buildProposal(rows, masters, termRows, { genus: '목수국' });
  const cardPages = p.pages.filter((pg) => pg.kind === 'cards');
  assert.equal(cardPages.length, 2);
  assert.deepEqual(cardPages.map((pg) => pg.rows.map((r) => r.map((s) => s.kind === 'chart' ? 'chart' : 'card').join(','))), [
    ['card,card,card', 'card,card,card'],
    ['card,card,card', 'card,chart'],
  ]);
  assert.equal(p.pages.at(-1).kind, 'info');
  assert.equal(p.pages.at(-1).orderRows.length, 10);
});

test('varieties without a master keep price and stock but are reported as missing info', () => {
  const rows = [row('r1', null, "목수국 '새 품종'", 'P9', 50, 6500), row('r2', null, "목수국 '새 품종'", 'P12 (컬러팟)', 20, 7500)];
  const p = buildProposal(rows, [], termRows, { genus: '목수국' });
  assert.equal(p.cards.length, 1);
  assert.equal(p.cards[0].rows.length, 2);
  assert.deepEqual(p.missing, ['새 품종']);
  assert.equal(p.cards[0].latin, "Hydrangea pan. Living 'X'®");
  assert.equal(p.pages.filter((pg) => pg.kind === 'cards')[0].rows[0].some((s) => s.kind === 'chart'), false);
});

test('name filter and review flags', () => {
  const masters = [master('mA', "목수국 '리빙 A'", '소형', 60, 70, { review: '확인 필요' }), master('mB', "목수국 '라임라이트'", '대형', 100, 120)];
  const rows = [row('r1', 'mA', '', 'P9', 10, 1), row('r2', 'mB', '', 'P9', 10, 1)];
  const p = buildProposal(rows, masters, termRows, { genus: '목수국', query: '리빙' });
  assert.deepEqual(p.cards.map((c) => c.name), ['리빙 A']);
  assert.deepEqual(p.needsCheck, ['리빙 A']);
});

test('page parameters are trimmed, limited and round-trip', () => {
  const p = readParams({ genus: ' 목수국 ', q: ['리빙', 'x'], all: '1', title: '' });
  assert.deepEqual(p, { genus: '목수국', q: '리빙', all: true, title: '' });
  assert.equal(proposalTitle(p), '오픈가든 제안서 (목수국 · 리빙)');
  assert.deepEqual(readParams(Object.fromEntries(new URLSearchParams(toQuery(p)))), p);
  assert.equal(readParams({ genus: 'x'.repeat(100) }).genus.length, 40);
  assert.equal(todayLabel(new Date('2026-10-29T16:00:00Z')), '2026. 10. 30');
});
