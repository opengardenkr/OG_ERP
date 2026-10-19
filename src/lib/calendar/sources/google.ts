import "server-only";

import { cache } from "react";

import {
  eventColorHex,
  OBSERVANCE_GRAY,
  OFF_DAY_RED,
} from "@/lib/calendar/colors";
import type { PortalEvent, WritableCalendar } from "@/lib/calendar/types";

/**
 * 구글 캘린더에서 일정을 읽는다. 등록은 `calendar/write.ts`.
 *
 * `singleEvents=true`로 요청하면 **구글이 반복 일정을 펼쳐서** 준다.
 * 그래서 RRULE을 우리가 해석할 일이 없다. (원칙 3·9)
 */

const API = "https://www.googleapis.com/calendar/v3/calendars";

export class CalendarError extends Error {}


/** 대한민국 공휴일 캘린더인가. 이 캘린더는 색을 고정으로 칠한다. */
export function isHolidayCalendar(calendarId: string): boolean {
  return calendarId.includes("#holiday@group.v.calendar.google.com");
}

type CalendarListItem = {
  id: string;
  summary?: string;
  summaryOverride?: string;
  backgroundColor?: string;
  accessRole?: string;
};

/**
 * 내 구글 캘린더 목록(이름·색·권한). 실패하면 빈 목록 — 색이 회색이 되고
 * 고치기가 막힐 뿐 일정은 보인다.
 *
 * 한 요청 안에서는 한 번만 부른다(`cache`). 요청을 넘겨 캐시하지 않는다 —
 * fetch 캐시에 걸면 실패 응답까지 남아, 권한을 고친 뒤에도 한동안 막혀 보인다.
 */
const getCalendarList = cache(
  async (accessToken: string): Promise<CalendarListItem[]> => {
    const response = await fetch(
      "https://www.googleapis.com/calendar/v3/users/me/calendarList",
      { headers: { Authorization: `Bearer ${accessToken}` }, cache: "no-store" },
    );
    if (!response.ok) return [];
    const body = (await response.json()) as { items?: CalendarListItem[] };
    return body.items ?? [];
  },
);

type CalendarInfo = Map<string, CalendarListItem>;

async function getCalendarInfo(accessToken: string): Promise<CalendarInfo> {
  const list = await getCalendarList(accessToken);
  return new Map(list.map((item) => [item.id.toLowerCase(), item]));
}

function canWrite(item: CalendarListItem | undefined): boolean {
  return item?.accessRole === "owner" || item?.accessRole === "writer";
}

type GoogleEvent = {
  id: string;
  status?: string;
  summary?: string;
  colorId?: string;
  location?: string;
  description?: string;
  htmlLink?: string;
  recurringEventId?: string;
  eventType?: string;
  locked?: boolean;
  privateCopy?: boolean;
  guestsCanModify?: boolean;
  /** self: 이 캘린더가 주최자인가. 남이 보낸 초대면 빠져 있다(false) */
  organizer?: { email?: string; displayName?: string; self?: boolean };
  creator?: { email?: string; displayName?: string };
  start?: { date?: string; dateTime?: string };
  end?: { date?: string; dateTime?: string };
};

/**
 * 포털에서 고쳐도 되는 일정인가.
 * 남이 보낸 초대를 고치면 내 사본만 바뀌어 상대와 어긋난다. 생일·Gmail 일정 같은
 * 특수 일정은 구글이 고치기를 막는다. 그런 것은 내용만 보여주고 구글로 보낸다.
 */
function isEditable(event: GoogleEvent, calendar: CalendarListItem | undefined): boolean {
  if (!canWrite(calendar)) return false;
  if (event.locked || event.privateCopy) return false;
  if (event.eventType && event.eventType !== "default") return false;
  const organizedHere = !event.organizer || event.organizer.self === true;
  return organizedHere || event.guestsCanModify === true;
}

function toPortalEvent(
  event: GoogleEvent,
  calendarId: string,
  info: CalendarInfo,
): PortalEvent | null {
  const start = event.start?.dateTime ?? event.start?.date;
  if (!start) return null; // 시작이 없는 일정은 그릴 수 없다

  // 공휴일 캘린더는 설명 첫 줄에 "공휴일"(쉬는 날) / "기념일"(안 쉬는 날)을 적어 보낸다.
  const holiday = isHolidayCalendar(calendarId);
  const calendar = info.get(calendarId.toLowerCase());
  const offDay = holiday && (event.description ?? "").startsWith("공휴일");

  return {
    id: `google:${calendarId}:${event.id}`,
    title: event.summary?.trim() || "(제목 없음)",
    start,
    end: event.end?.dateTime ?? event.end?.date,
    allDay: Boolean(event.start?.date),
    source: "google",
    type: holiday ? (offDay ? "공휴일" : "기념일") : "구글일정",
    owner: event.creator?.displayName ?? event.creator?.email,
    location: event.location,
    description: holiday ? undefined : event.description,
    href: event.htmlLink,
    // 공휴일은 고정색. 나머지는 일정에 정한 색, 없으면 캘린더 색.
    color: holiday
      ? offDay
        ? OFF_DAY_RED
        : OBSERVANCE_GRAY
      : (eventColorHex(event.colorId) ?? calendar?.backgroundColor),
    google: {
      calendarId,
      eventId: event.id,
      colorId: event.colorId,
      editable: !holiday && isEditable(event, calendar),
      recurring: Boolean(event.recurringEventId),
    },
  };
}

async function fetchOne(
  calendarId: string,
  accessToken: string,
  from: Date,
  to: Date,
  info: CalendarInfo,
): Promise<PortalEvent[]> {
  const url = new URL(`${API}/${encodeURIComponent(calendarId)}/events`);
  url.searchParams.set("timeMin", from.toISOString());
  url.searchParams.set("timeMax", to.toISOString());
  url.searchParams.set("singleEvents", "true"); // 반복을 구글이 펼쳐 준다
  url.searchParams.set("orderBy", "startTime");
  url.searchParams.set("maxResults", "250");
  url.searchParams.set("timeZone", "Asia/Seoul");

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });

  if (response.status === 401) {
    throw new CalendarError("구글 로그인이 만료됐다. 다시 로그인해라.");
  }
  if (response.status === 403) {
    throw new CalendarError(
      "구글 캘린더 접근이 거부됐다(403). Calendar API가 켜져 있는지, " +
        "로그인할 때 캘린더 권한에 동의했는지 확인해라.",
    );
  }
  if (response.status === 404) {
    // 없는 캘린더 하나 때문에 화면 전체가 비면 안 된다.
    return [];
  }
  if (!response.ok) {
    throw new CalendarError(`구글 캘린더 ${response.status} (${calendarId})`);
  }

  const body = (await response.json()) as { items?: GoogleEvent[] };

  return (body.items ?? [])
    .filter((event) => event.status !== "cancelled")
    .map((event) => toPortalEvent(event, calendarId, info))
    .filter((event): event is PortalEvent => event !== null);
}

export async function getGoogleEvents(
  calendarIds: string[],
  accessToken: string,
  from: Date,
  to: Date,
): Promise<PortalEvent[]> {
  const info = await getCalendarInfo(accessToken);
  const pages = await Promise.all(
    calendarIds.map((id) => fetchOne(id, accessToken, from, to, info)),
  );
  return pages.flat();
}

/**
 * 포털에서 일정을 넣을 수 있는 캘린더.
 * 화면에 겹쳐 보는 캘린더 중 이 사람이 쓰기 권한을 가진 것만. 공휴일은 뺀다.
 * 순서는 `ids` 순서 그대로 — 맨 앞(공용)이 기본 선택이다.
 */
export async function getWritableGoogleCalendars(
  ids: string[],
  accessToken: string,
): Promise<WritableCalendar[]> {
  const info = await getCalendarInfo(accessToken);

  return ids
    .filter((id) => !isHolidayCalendar(id))
    .flatMap((id) => {
      const item = info.get(id.toLowerCase());
      if (!item || !canWrite(item)) return [];
      return [
        {
          id,
          name: item.summaryOverride ?? item.summary ?? id,
          color: item.backgroundColor,
        },
      ];
    });
}
