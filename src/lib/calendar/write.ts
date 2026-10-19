import "server-only";

import { EVENT_COLORS } from "@/lib/calendar/colors";
import { fail, ok, type Result } from "@/lib/result";

/**
 * 구글 캘린더 일정을 만들고, 고치고, 지운다.
 *
 * 화면(창)만 포털이 그리고, 저장은 구글이 한다 — 반복·알림·초대·모바일 앱은
 * 그대로 구글 몫이다. Airtable 데이터를 여기로 보내지 마라. (원칙 9)
 */

const API = "https://www.googleapis.com/calendar/v3/calendars";
const TIME_ZONE = "Asia/Seoul";

/** 창에서 받는 값. 만들기와 고치기가 같은 모양을 쓴다. */
export type EventInput = {
  title: string;
  allDay: boolean;
  /** YYYY-MM-DD */
  startDate: string;
  endDate: string;
  /** HH:MM. 종일이면 없다 */
  startTime?: string;
  endTime?: string;
  location: string;
  /** 고치기에서 undefined면 설명을 건드리지 않는다(구글의 서식을 지키려고) */
  description?: string;
  /** 구글 일정 색 번호. 비우면 캘린더 색 */
  colorId: string;
};

type GoogleTime = { date?: string; dateTime?: string; timeZone?: string };

/** 종일 일정의 끝은 구글 규칙상 **다음 날**로 보낸다. 읽을 때 빼는 것과 짝이다. */
function nextDay(date: string): string {
  const time = Date.parse(`${date}T00:00:00Z`) + 86_400_000;
  return new Date(time).toISOString().slice(0, 10);
}

function timesOf(input: EventInput): { start: GoogleTime; end: GoogleTime } {
  if (input.allDay) {
    return { start: { date: input.startDate }, end: { date: nextDay(input.endDate) } };
  }
  return {
    start: { dateTime: `${input.startDate}T${input.startTime}:00`, timeZone: TIME_ZONE },
    end: { dateTime: `${input.endDate}T${input.endTime}:00`, timeZone: TIME_ZONE },
  };
}

function validColor(colorId: string): string | undefined {
  return EVENT_COLORS.some((color) => color.id === colorId) ? colorId : undefined;
}

function eventUrl(calendarId: string, eventId?: string): string {
  const base = `${API}/${encodeURIComponent(calendarId)}/events`;
  return eventId ? `${base}/${encodeURIComponent(eventId)}` : base;
}

/** 사람이 할 일이 있는 실패는 무엇을 하라고 적어준다. */
function describe(status: number): string {
  if (status === 401) return "구글 로그인이 만료됐다. 로그아웃했다가 다시 로그인해라.";
  if (status === 403) {
    // 2026-10-01 이전에 로그인한 세션은 쓰기 권한이 없다.
    return "구글이 거부했다(403). 로그아웃했다가 다시 로그인해 캘린더 권한에 동의해라.";
  }
  if (status === 404 || status === 410) {
    return "그 일정이 이미 없다. 다른 곳에서 지워졌을 수 있다. 화면을 새로고침해라.";
  }
  return `구글 캘린더가 요청을 받지 않았다 (${status}).`;
}

async function call(
  url: string,
  accessToken: string,
  init: { method: string; body?: unknown } = { method: "GET" },
): Promise<Response> {
  return fetch(url, {
    method: init.method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(init.body ? { "Content-Type": "application/json" } : null),
    },
    body: init.body ? JSON.stringify(init.body) : undefined,
    cache: "no-store",
  });
}

export async function createGoogleEvent(
  calendarId: string,
  input: EventInput,
  accessToken: string,
): Promise<Result<null>> {
  const response = await call(eventUrl(calendarId), accessToken, {
    method: "POST",
    body: {
      summary: input.title,
      location: input.location || undefined,
      description: input.description || undefined,
      colorId: validColor(input.colorId),
      ...timesOf(input),
    },
  });
  return response.ok ? ok(null) : fail(describe(response.status));
}

/**
 * 고친다. 원본을 읽어 우리 칸만 바꾼 뒤 통째로 다시 쓴다(GET → PUT) —
 * 참석자·알림·첨부처럼 창에 없는 칸은 그대로 남는다. 구글도 PATCH보다 이쪽을 권한다.
 * 반복 일정의 한 번(인스턴스)을 고치면 그 날짜만 바뀐다.
 */
export async function updateGoogleEvent(
  calendarId: string,
  eventId: string,
  input: EventInput,
  accessToken: string,
): Promise<Result<null>> {
  const url = eventUrl(calendarId, eventId);

  const current = await call(url, accessToken);
  if (!current.ok) return fail(describe(current.status));
  const event = (await current.json()) as Record<string, unknown>;

  event.summary = input.title;
  if (input.location) event.location = input.location;
  else delete event.location;
  if (input.description !== undefined) {
    if (input.description) event.description = input.description;
    else delete event.description;
  }
  const colorId = validColor(input.colorId);
  if (colorId) event.colorId = colorId;
  else delete event.colorId;
  Object.assign(event, timesOf(input));

  const response = await call(url, accessToken, { method: "PUT", body: event });
  return response.ok ? ok(null) : fail(describe(response.status));
}

/** 지운다. 반복 일정의 한 번이면 그 날짜만 빠진다. 이미 없으면 성공으로 본다. */
export async function deleteGoogleEvent(
  calendarId: string,
  eventId: string,
  accessToken: string,
): Promise<Result<null>> {
  const response = await call(eventUrl(calendarId, eventId), accessToken, {
    method: "DELETE",
  });
  if (response.ok || response.status === 410) return ok(null);
  return fail(describe(response.status));
}
