/**
 * 추적 링크(링크 · QR)의 순수 규칙. 서버·화면·테스트가 같이 쓴다(server-only 아님).
 * 스캔 한 줄 = 짧은 주소가 한 번 열린 것.
 */

export const LINK_CATEGORIES = ["주문", "제안서", "도슨트", "웹사이트", "SNS", "인쇄물", "기타"] as const;
export type LinkCategory = (typeof LINK_CATEGORIES)[number];

export const RANGES = [7, 30, 90, 365] as const;
export type RangeDays = (typeof RANGES)[number];

export function rangeOf(value: string | undefined): RangeDays {
  const n = Number(value);
  return (RANGES as readonly number[]).includes(n) ? (n as RangeDays) : 30;
}

export type Scan = {
  /** ISO 시각 */
  at: string;
  device: string;
  /** ISO 국가 코드(KR) 또는 빈 문자열 */
  country: string;
  city: string;
  /** 같은 사람(같은 IP+브라우저)을 묶는 해시. 원래 값으로 되돌릴 수 없다. */
  visitor: string;
  referrer: string;
};

/** 링크 미리보기·검색 로봇. 사람이 연 것이 아니므로 세지 않는다. */
const BOT =
  /bot|crawl|spider|slurp|scrap|preview|facebookexternalhit|whatsapp|telegram|slack|discord|kakaotalk-scrap|yeti|daum|curl|wget|python|axios|node-fetch|go-http|headless|lighthouse|monitor|uptime|pingdom/i;

export function isBot(userAgent: string | null | undefined): boolean {
  if (!userAgent) return true;
  return BOT.test(userAgent);
}

export function deviceOf(userAgent: string | null | undefined): string {
  const ua = userAgent ?? "";
  if (/iPhone|iPod/.test(ua)) return "iPhone";
  if (/iPad/.test(ua)) return "iPad";
  if (/Android/.test(ua)) return "Android";
  if (/Windows/.test(ua)) return "Windows";
  if (/Macintosh|Mac OS X/.test(ua)) return "Mac";
  if (/Linux|CrOS/.test(ua)) return "Linux";
  return "기타";
}

/** 짧은 주소 끝부분. 소문자·숫자·하이픈 3~32자. 안 맞으면 null. */
export function normalizeCode(input: string | null | undefined): string | null {
  const code = (input ?? "").trim().toLowerCase();
  return /^[a-z0-9][a-z0-9-]{1,30}[a-z0-9]$/.test(code) ? code : null;
}

/** 헷갈리는 글자(0·o·1·l·i)를 뺀 6자. 손으로 옮겨 적어도 틀리지 않게. */
const ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";
export function randomCode(random: () => number = Math.random): string {
  let code = "";
  for (let i = 0; i < 6; i += 1) code += ALPHABET[Math.floor(random() * ALPHABET.length)];
  return code;
}

/** 넘길 주소 검사. 문제가 있으면 사람이 읽는 문구, 없으면 null. */
export function targetProblem(target: string, shortOrigin: string): string | null {
  let url: URL;
  try {
    url = new URL(target);
  } catch {
    return "주소는 https:// 로 시작하는 전체 주소로 적어라.";
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return "http(s) 주소만 넣을 수 있다.";
  if (url.origin === shortOrigin && url.pathname.startsWith("/r/")) {
    return "짧은 주소를 다시 짧은 주소로 넘길 수는 없다.";
  }
  return null;
}

/** 리퍼러에서 호스트만. 없으면 빈 문자열. */
export function referrerHost(referrer: string | null | undefined): string {
  if (!referrer) return "";
  try {
    return new URL(referrer).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

const SEOUL_DAY = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function seoulDay(iso: string): string {
  return SEOUL_DAY.format(new Date(iso));
}

function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}

export type Bucket = { key: string; label: string; total: number; unique: number };
export type Share = { name: string; count: number; percent: number };

export type Summary = {
  total: number;
  unique: number;
  /** 가장 최근 스캔의 한국 날짜. 없으면 null */
  last: string | null;
  buckets: Bucket[];
  devices: Share[];
  countries: Share[];
  cities: Share[];
  referrers: Share[];
};

function shares(values: string[], total: number, blank: string): Share[] {
  const counts = new Map<string, number>();
  for (const value of values) {
    const name = value || blank;
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "ko"))
    .map(([name, count]) => ({ name, count, percent: total ? Math.round((count / total) * 100) : 0 }));
}

/**
 * 기간(오늘 포함 최근 N일) 안의 스캔을 요약한다. 날짜는 한국 기준.
 * 90일까지는 하루 단위, 그보다 길면 달 단위 막대.
 */
export function summarize(scans: Scan[], days: RangeDays, today: string): Summary {
  const from = addDays(today, -(days - 1));
  const inRange = scans
    .map((scan) => ({ scan, day: seoulDay(scan.at) }))
    .filter(({ day }) => day >= from && day <= today);

  const byMonth = days > 90;
  const keys: string[] = [];
  if (byMonth) {
    for (let d = `${from.slice(0, 7)}-01`; d <= today; ) {
      keys.push(d.slice(0, 7));
      const [y, m] = d.split("-").map(Number);
      d = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;
    }
  } else {
    for (let d = from; d <= today; d = addDays(d, 1)) keys.push(d);
  }

  const totals = new Map<string, number>();
  const visitors = new Map<string, Set<string>>();
  for (const { scan, day } of inRange) {
    const key = byMonth ? day.slice(0, 7) : day;
    totals.set(key, (totals.get(key) ?? 0) + 1);
    if (!visitors.has(key)) visitors.set(key, new Set());
    visitors.get(key)!.add(scan.visitor || scan.at);
  }

  const buckets = keys.map<Bucket>((key) => ({
    key,
    label: byMonth ? `${Number(key.slice(5, 7))}월` : `${Number(key.slice(5, 7))}/${Number(key.slice(8, 10))}`,
    total: totals.get(key) ?? 0,
    unique: visitors.get(key)?.size ?? 0,
  }));

  const total = inRange.length;
  const list = inRange.map(({ scan }) => scan);
  return {
    total,
    unique: new Set(list.map((s) => s.visitor || s.at)).size,
    last: inRange.length ? inRange.map(({ day }) => day).sort().at(-1)! : null,
    buckets,
    devices: shares(list.map((s) => s.device), total, "기타"),
    countries: shares(list.map((s) => s.country), total, "알 수 없음"),
    cities: shares(list.map((s) => s.city), total, "알 수 없음"),
    referrers: shares(list.map((s) => s.referrer), total, "직접 · QR"),
  };
}

/** KR → 대한민국. 코드가 아니면 그대로. */
export function countryName(code: string): string {
  if (!/^[A-Z]{2}$/.test(code)) return code;
  try {
    return new Intl.DisplayNames(["ko"], { type: "region" }).of(code) ?? code;
  } catch {
    return code;
  }
}
