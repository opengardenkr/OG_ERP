/**
 * 화면이 다루는 일정의 공통 모양.
 * 출처가 달라도 화면은 이 타입 하나만 안다. (원칙 9)
 *
 * 새 출처를 더할 때 = `sources/`에 파일 하나 + 등록 한 줄.
 * 그보다 많이 고쳐야 한다면 설계가 틀린 것이다.
 */
export type PortalEventType =
  | "구글일정"
  | "공휴일" // 쉬는 날(대체공휴일 포함)
  | "기념일" // 이름은 있지만 쉬지 않는 날(어버이날·국군의날 등)
  | "할일"
  | "연차"
  | "휴가"
  | "출장";

export type PortalEvent = {
  id: string;
  google?: { calendarId: string; eventId: string; etag: string; colorId?: string; recurring?: boolean; editable: boolean };
  title: string;
  /** 종일 일정은 YYYY-MM-DD, 시간 일정은 ISO */
  start: string;
  end?: string;
  allDay: boolean;
  source: "google" | "airtable";
  type: PortalEventType;
  owner?: string;
  location?: string;
  description?: string;
  /** 원본으로 가는 링크 */
  href?: string;
  /**
   * 막대 색(hex). 구글 일정은 사용자가 구글에서 지정한 색을 그대로 쓴다 —
   * 공휴일은 빨강, 박람회는 노랑처럼 규칙을 바꾸려고 코드를 고칠 이유가 없다.
   */
  color?: string;
};

/** 한국 기준 날짜(YYYY-MM-DD). 달력 칸에 넣을 때 쓴다. */
export function eventDate(value: string): string {
  if (value.length === 10) return value; // 이미 YYYY-MM-DD
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));
}

/** 시작 시각 순. 종일 일정이 먼저 온다. */
export function byStart(a: PortalEvent, b: PortalEvent): number {
  if (a.allDay !== b.allDay) return a.allDay ? -1 : 1;
  return a.start.localeCompare(b.start);
}

/**
 * 일정이 덮는 날짜 범위(양끝 포함).
 *
 * **끝 날짜를 다음 날로 주는 건 구글의 규칙이다**(9/14 하루짜리면 end=9/15).
 * 그래서 구글에서 온 종일 일정만 하루를 뺀다. 우리 데이터(할 일 기간)는
 * 끝 날짜가 곧 마지막 날이므로 그대로 쓴다 — 여기서 빼면 하루가 줄어든다.
 */
export function eventRange(event: PortalEvent): { start: string; end: string } {
  const start = eventDate(event.start);
  if (!event.end) return { start, end: start };

  let end = eventDate(event.end);
  if (event.allDay && event.source === "google") {
    const previous = new Date(`${end}T00:00:00Z`);
    previous.setUTCDate(previous.getUTCDate() - 1);
    end = previous.toISOString().slice(0, 10);
  }

  return { start, end: end < start ? start : end };
}

/** 쉬는 날(공휴일) 날짜 모음. 달력이 날짜 숫자를 빨갛게 칠할 때 쓴다. */
export function offDays(events: PortalEvent[]): Set<string> {
  const days = new Set<string>();
  for (const event of events) {
    if (event.type !== "공휴일") continue;
    const { start, end } = eventRange(event);
    for (let d = start; d <= end; ) {
      days.add(d);
      const next = new Date(`${d}T00:00:00Z`);
      next.setUTCDate(next.getUTCDate() + 1);
      d = next.toISOString().slice(0, 10);
    }
  }
  return days;
}

/** 날짜 숫자 색: 쉬는 날·일요일 빨강, 토요일 파랑, 나머지 기본. */
export function dayTone(day: string, off: Set<string>): "red" | "blue" | null {
  const weekday = new Date(`${day}T00:00:00Z`).getUTCDay();
  if (off.has(day) || weekday === 0) return "red";
  if (weekday === 6) return "blue";
  return null;
}

/** 일정을 넣을 수 있는 캘린더. 등록 창의 선택지. */
export type WritableCalendar = {
  id: string;
  name: string;
  color?: string;
};
