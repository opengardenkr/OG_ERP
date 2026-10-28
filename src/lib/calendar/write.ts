import "server-only";

import { EVENT_COLORS } from "@/lib/calendar/colors";
import { fail, ok, type Result } from "@/lib/result";

/**
 * 구글 캘린더에 일정을 넣는다.
 *
 * 화면(등록 창)만 포털이 그리고, 저장은 구글이 한다 — 반복·알림·초대·모바일 앱은
 * 그대로 구글 몫이다. Airtable 데이터를 여기로 보내지 마라. (원칙 9)
 */

const API = "https://www.googleapis.com/calendar/v3/calendars";
const TIME_ZONE = "Asia/Seoul";

export type NewEvent = {
  calendarId: string;
  title: string;
  allDay: boolean;
  /** YYYY-MM-DD */
  startDate: string;
  endDate: string;
  /** HH:MM. 종일이면 없다 */
  startTime?: string;
  endTime?: string;
  location?: string;
  description?: string;
  /** 구글 일정 색 번호. 없으면 캘린더 색 */
  colorId?: string;
};

/** 종일 일정의 끝은 구글 규칙상 **다음 날**로 보낸다. 읽을 때 빼는 것과 짝이다. */
function nextDay(date: string): string {
  const time = Date.parse(`${date}T00:00:00Z`) + 86_400_000;
  return new Date(time).toISOString().slice(0, 10);
}

export async function createGoogleEvent(
  event: NewEvent,
  accessToken: string,
  existing?: { eventId: string; etag: string },
): Promise<Result<null>> {
  const body = {
    summary: event.title,
    location: event.location || "",
    description: event.description || "",
    colorId: EVENT_COLORS.some((color) => color.id === event.colorId)
      ? event.colorId
      : null,
    ...(event.allDay
      ? {
          start: { date: event.startDate, dateTime: null, timeZone: null },
          end: { date: nextDay(event.endDate), dateTime: null, timeZone: null },
        }
      : {
          start: { date: null, dateTime: `${event.startDate}T${event.startTime}:00`, timeZone: TIME_ZONE },
          end: { date: null, dateTime: `${event.endDate}T${event.endTime}:00`, timeZone: TIME_ZONE },
        }),
  };

  const response = await fetch(`${API}/${encodeURIComponent(event.calendarId)}/events${existing ? `/${encodeURIComponent(existing.eventId)}` : ""}`, {
    method: existing ? "PATCH" : "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...(existing ? { "If-Match": existing.etag } : {}),
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });

  if (response.ok) return ok(null);
  if (response.status === 412) return fail("다른 화면에서 변경된 일정입니다. 창을 닫고 새로고침 후 다시 시도하세요.");
  if (response.status === 404 || response.status === 410) return fail("이미 삭제되었거나 접근할 수 없는 일정입니다.");
  if (response.status === 401) {
    return fail("구글 로그인이 만료됐다. 로그아웃했다가 다시 로그인해라.");
  }
  if (response.status === 403) {
    // 2026-10-01 이전에 로그인한 세션은 쓰기 권한이 없다.
    return fail("일정을 넣을 권한이 없다. 로그아웃했다가 다시 로그인해 권한에 동의해라.");
  }
  return fail(`구글 캘린더가 일정을 받지 않았다 (${response.status}).`);
}

export async function deleteGoogleEvent(calendarId: string, eventId: string, etag: string, accessToken: string): Promise<Result<null>> {
  const response = await fetch(`${API}/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`, {
    method: "DELETE", headers: { Authorization: `Bearer ${accessToken}`, "If-Match": etag }, cache: "no-store",
  });
  if (response.ok || response.status === 410) return ok(null);
  if (response.status === 412) return fail("다른 화면에서 변경된 일정입니다. 새로고침 후 다시 확인하세요.");
  if (response.status === 403) return fail("이 일정을 삭제할 권한이 없습니다.");
  if (response.status === 401) return fail("로그인이 만료되었습니다. 다시 로그인하세요.");
  return fail(`일정을 삭제하지 못했습니다 (${response.status}).`);
}
