import test from 'node:test';
import assert from 'node:assert/strict';
import { deviceOf, isBot, normalizeCode, randomCode, rangeOf, referrerHost, summarize, targetProblem } from '../src/lib/link-stats.ts';

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Safari/604.1';
const GALAXY = 'Mozilla/5.0 (Linux; Android 15; SM-S928N) AppleWebKit/537.36 Chrome/130.0 Mobile Safari/537.36';

test('기기 구분: iPhone의 "like Mac OS X"를 Mac으로 읽지 않는다', () => {
  assert.equal(deviceOf(IPHONE), 'iPhone');
  assert.equal(deviceOf(GALAXY), 'Android');
  assert.equal(deviceOf('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari/605.1.15'), 'Mac');
  assert.equal(deviceOf('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130'), 'Windows');
  assert.equal(deviceOf(''), '기타');
});

test('로봇은 세지 않는다: 카톡 미리보기·검색 로봇·빈 UA', () => {
  assert.equal(isBot('facebookexternalhit/1.1; kakaotalk-scrap/1.0'), true);
  assert.equal(isBot('Mozilla/5.0 (compatible; Googlebot/2.1)'), true);
  assert.equal(isBot('Mozilla/5.0 (compatible; Yeti/1.1; +https://naver.me/spd)'), true);
  assert.equal(isBot(''), true);
  assert.equal(isBot(null), true);
  assert.equal(isBot(IPHONE), false);
  assert.equal(isBot(GALAXY + ' KAKAOTALK 11.0.0'), false); // 카톡 인앱 브라우저는 사람
});

test('짧은 주소 코드', () => {
  assert.equal(normalizeCode(' IPark '), 'ipark');
  assert.equal(normalizeCode('hbm-2026'), 'hbm-2026');
  assert.equal(normalizeCode('ab'), null);
  assert.equal(normalizeCode('-abc'), null);
  assert.equal(normalizeCode("a' OR 1=1"), null); // 수식에 그대로 들어가므로 따옴표를 통과시키면 안 된다
  assert.match(randomCode(), /^[a-z2-9]{6}$/);
  assert.equal(randomCode(() => 0), 'aaaaaa');
});

test('넘길 주소 검사', () => {
  const origin = 'https://app.open-garden.co.kr';
  assert.equal(targetProblem('https://open-garden.co.kr/docent/ipark.html', origin), null);
  assert.ok(targetProblem('open-garden.co.kr', origin));
  assert.ok(targetProblem('javascript:alert(1)', origin));
  assert.ok(targetProblem('https://app.open-garden.co.kr/r/ipark', origin)); // 자기 자신으로 도는 고리
  assert.equal(targetProblem('https://app.open-garden.co.kr/library', origin), null);
});

test('기간·유입', () => {
  assert.equal(rangeOf('7'), 7);
  assert.equal(rangeOf('12'), 30);
  assert.equal(rangeOf(undefined), 30);
  assert.equal(referrerHost('https://www.instagram.com/p/abc'), 'instagram.com');
  assert.equal(referrerHost(''), '');
});

const scan = (at, visitor, extra = {}) => ({ at, device: 'iPhone', country: 'KR', city: 'Seoul', visitor, referrer: '', ...extra });

test('요약: 한국 날짜로 자르고, 순 방문자는 같은 해시를 한 번만', () => {
  const scans = [
    scan('2026-11-11T15:30:00.000Z', 'a'), // 한국 11/12 00:30
    scan('2026-11-11T14:59:00.000Z', 'a'), // 한국 11/11 23:59
    scan('2026-11-11T03:00:00.000Z', 'b', { device: 'Android', country: 'SG', city: 'Singapore' }),
    scan('2026-11-05T03:00:00.000Z', 'c'), // 7일 밖
  ];
  const s = summarize(scans, 7, '2026-11-12');
  assert.equal(s.total, 3);
  assert.equal(s.unique, 2);
  assert.equal(s.last, '2026-11-12');
  assert.equal(s.buckets.length, 7);
  assert.deepEqual(s.buckets.at(-1), { key: '2026-11-12', label: '11/12', total: 1, unique: 1 });
  assert.deepEqual(s.buckets.at(-2), { key: '2026-11-11', label: '11/11', total: 2, unique: 2 });
  assert.deepEqual(s.devices, [{ name: 'iPhone', count: 2, percent: 67 }, { name: 'Android', count: 1, percent: 33 }]);
  assert.equal(s.countries[0].name, 'KR');
  assert.equal(s.referrers[0].name, '직접 · QR');
});

test('요약: 1년은 달 단위 13칸 이하, 빈 기간도 칸은 있다', () => {
  const s = summarize([scan('2026-03-01T03:00:00.000Z', 'a')], 365, '2026-11-12');
  assert.equal(s.buckets[0].key, '2025-11');
  assert.equal(s.buckets.at(-1).key, '2026-11');
  assert.equal(s.buckets.length, 13);
  assert.equal(s.buckets.find((b) => b.key === '2026-03').total, 1);
  const empty = summarize([], 30, '2026-11-12');
  assert.equal(empty.total, 0);
  assert.equal(empty.last, null);
  assert.equal(empty.buckets.length, 30);
});

test('QR 디자인: 두 가지 모양, 로고 자리는 가운데·작게', async () => {
  const { qrBody, qrStyleOf, qrSvg } = await import('../src/lib/qr-design.ts');
  assert.equal(qrStyleOf('frame'), 'frame');
  assert.equal(qrStyleOf('weird'), 'plain');
  assert.equal(qrStyleOf(null), 'plain');
  const url = 'https://app.open-garden.co.kr/r/ipark';
  const assets = { logo: 'data:image/png;base64,AAAA', scanMe: { path: 'M0 0h10v10h-10z', width: 10, capHeight: 10 } };
  const body = qrBody(url);
  assert.equal((body.size - body.logo.length) % 2, 0); // 정가운데
  assert.ok((body.logo.length / body.size) ** 2 < 0.08); // 가린 면적 8% 미만(H 복원 30% 안쪽)
  const plain = qrSvg(url, 'plain', assets);
  assert.equal(plain.width, plain.height);
  assert.match(plain.svg, /xlink:href="data:image\/png;base64,/);
  const frame = qrSvg(url, 'frame', assets);
  assert.ok(frame.height > frame.width); // 위에 SCAN ME
  assert.ok(!/<text/.test(frame.svg)); // 글자는 외곽선 — 글꼴 없이도 같은 모양
});

test('미리보기 페이지: og:url은 짧은 주소, 대상의 og:url·새로고침 이동은 없다', async () => {
  const { previewPage } = await import('../src/lib/link-stats.ts');
  const head = '<head><title>네덜란드 직수입 공동주문서 · 오픈가든</title>'
    + '<meta property="og:title" content="오픈가든 · 공동주문서"><meta property="og:url" content="https://open-garden.co.kr/o/AAA">'
    + '<meta property="og:image" content="https://open-garden.co.kr/assets/og-pool.jpg"><meta name="robots" content="noindex, nofollow">';
  const html = previewPage(head, 'https://app.open-garden.co.kr/r/nl-pool', 'https://open-garden.co.kr/o/AAA');
  assert.match(html, /<title>네덜란드 직수입 공동주문서/);
  assert.match(html, /og:image" content="https:\/\/open-garden.co.kr\/assets\/og-pool.jpg"/);
  assert.match(html, /og:url" content="https:\/\/app.open-garden.co.kr\/r\/nl-pool"/);
  assert.doesNotMatch(html, /og:url" content="https:\/\/open-garden.co.kr\/o\//);
  assert.doesNotMatch(html, /http-equiv="refresh"/);
  assert.equal((html.match(/og:url/g) || []).length, 1);
  const empty = previewPage('', 'https://app.open-garden.co.kr/r/x1y', 'https://e.com/a?b=1&c="2"');
  assert.match(empty, /og:url" content="https:\/\/app.open-garden.co.kr\/r\/x1y"/);
  assert.match(empty, /&quot;2&quot;/);
});
