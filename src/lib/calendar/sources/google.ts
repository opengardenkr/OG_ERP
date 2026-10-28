import "server-only";

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

/** 캘린더 자체의 색. 일정에 따로 정한 색이 없을 때 쓴다. */
type Palette = {
  /** calendarId -> hex */
  calendar: Record<string, string>;
  writable: Set<string>;
};

/** 대한민국 공휴일 캘린더인가. 이 캘린더는 색을 고정으로 칠한다. */
export function isHolidayCalendar(calendarId: string): boolean {
  return calendarId.includes("#holiday@group.v.calendar.google.com");
}

async function fetchJson<T>(url: string, accessToken: string): Promise<T | null> {
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
    // 색을 바꾸면 곧 반영돼야 한다. 색표는 가벼우니 짧게 잡는다.
    cache: "no-store",
  });
  if (!response.ok) return null;
  return (await response.json()) as T;
}

type CalendarListItem = {
  id: string;
  summary?: string;
  summaryOverride?: string;
  backgroundColor?: string;
  accessRole?: string;
};

/** 내 구글 캘린더 목록. 실패하면 빈 목록 — 색·이름이 빠질 뿐 화면은 산다. */
async function getCalendarList(accessToken: string): Promise<CalendarListItem[]> {
  const list = await fetchJson<{ items?: CalendarListItem[] }>(
    "https://www.googleapis.com/calendar/v3/users/me/calendarList",
    accessToken,
  );
  return list?.items ?? [];
}

/**
 * 캘린더 색을 읽는다. 실패해도 일정은 보여야 하므로 빈 표를 돌려준다 —
 * 색이 없으면 회색으로 그릴 뿐 화면이 죽지는 않는다.
 */
async function getPalette(accessToken: string): Promise<Palette> {
  const calendar: Record<string, string> = {};
  const writable = new Set<string>();
  for (const item of await getCalendarList(accessToken)) {
    if (item.accessRole === "owner" || item.accessRole === "writer") writable.add(item.id);
    if (item.backgroundColor) calendar[item.id] = item.backgroundColor;
  }
  return { calendar, writable };
}

type GoogleEvent = {
  id: string;
  etag?: string;
  recurringEventId?: string;
  status?: string;
  summary?: string;
  colorId?: string;
  location?: string;
  description?: string;
  htmlLink?: string;
  organizer?: { email?: string; displayName?: string };
  creator?: { email?: string; displayName?: string };
  start?: { date?: string; dateTime?: string };
  end?: { date?: string; dateTime?: string };
};

function toPortalEvent(
  event: GoogleEvent,
  calendarId: string,
  palette: Palette,
): PortalEvent | null {
  const start = event.start?.dateTime ?? event.start?.date;
  if (!start) return null; // 시작이 없는 일정은 그릴 수 없다

  // 공휴일 캘린더는 설명 첫 줄에 "공휴일"(쉬는 날) / "기념일"(안 쉬는 날)을 적어 보낸다.
  const holiday = isHolidayCalendar(calendarId);
  const offDay = holiday && (event.description ?? "").startsWith("공휴일");

  return {
    id: `google:${calendarId}:${event.id}`,
    google: { calendarId, eventId: event.id, etag: event.etag ?? "", colorId: event.colorId, recurring: Boolean(event.recurringEventId), editable: !holiday && palette.writable.has(calendarId) },
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
      : (eventColorHex(event.colorId) ?? palette.calendar[calendarId]),
  };
}

async function fetchOne(
  calendarId: string,
  accessToken: string,
  from: Date,
  to: Date,
  palette: Palette,
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
    .map((event) => toPortalEvent(event, calendarId, palette))
    .filter((event): event is PortalEvent => event !== null);
}

export async function getGoogleEvents(
  calendarIds: string[],
  accessToken: string,
  from: Date,
  to: Date,
): Promise<PortalEvent[]> {
  const palette = await getPalette(accessToken);
  const pages = await Promise.all(
    calendarIds.map((id) => fetchOne(id, accessToken, from, to, palette)),
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
  const list = await getCalendarList(accessToken);
  const byId = new Map(list.map((item) => [item.id.toLowerCase(), item]));

  return ids
    .filter((id) => !isHolidayCalendar(id))
    .flatMap((id) => {
      const item = byId.get(id.toLowerCase());
      if (!item || (item.accessRole !== "owner" && item.accessRole !== "writer")) {
        return [];
      }
      return [
        {
          id,
          name: item.summaryOverride ?? item.summary ?? id,
          color: item.backgroundColor,
        },
      ];
    });
}
