"use server";

import { refresh } from "next/cache";

import { auth } from "@/lib/auth";
import { getWritableCalendars } from "@/lib/calendar/events";
import {
  createGoogleEvent,
  deleteGoogleEvent,
  type EventInput,
  updateGoogleEvent,
} from "@/lib/calendar/write";
import { fail, ok, type Result } from "@/lib/result";

export type ActionState = { error: string | null };

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^\d{2}:\d{2}$/;
/** 구글 일정 ID. 반복 일정의 한 번은 `원본_20261019T050000Z` 꼴이다. */
const EVENT_ID = /^[A-Za-z0-9_-]{1,1024}$/;

/**
 * 서버 액션은 누구나 부를 수 있는 입구다. 매번 세션을 확인하고,
 * 화면이 보낸 캘린더가 이 사람이 쓸 수 있는 캘린더인지 서버가 다시 본다.
 */
async function writeAccess(calendarId: string): Promise<Result<string>> {
  const session = await auth();
  if (!session?.user.member) throw new Error("로그인이 필요하다");
  if (!session.accessToken) {
    return fail("구글 로그인이 만료됐다. 로그아웃했다가 다시 로그인해라.");
  }

  const writable = await getWritableCalendars();
  if (!writable.some((calendar) => calendar.id === calendarId)) {
    return fail("그 캘린더에는 일정을 넣거나 고칠 수 없다.");
  }
  return ok(session.accessToken);
}

function readForm(formData: FormData): Result<EventInput> {
  const text = (name: string) => String(formData.get(name) ?? "").trim();

  const title = text("title");
  if (!title) return fail("제목을 적어라.");

  const allDay = formData.get("allDay") === "on";
  const startDate = text("startDate");
  const endDate = text("endDate") || startDate;
  if (!DATE.test(startDate) || !DATE.test(endDate)) return fail("날짜를 확인해라.");

  const startTime = text("startTime");
  const endTime = text("endTime");
  if (!allDay && (!TIME.test(startTime) || !TIME.test(endTime))) {
    return fail("시각을 확인해라.");
  }

  const start = allDay ? startDate : `${startDate}T${startTime}`;
  const end = allDay ? endDate : `${endDate}T${endTime}`;
  if (allDay ? end < start : end <= start) return fail("끝이 시작보다 빠르다.");

  return ok({
    title,
    allDay,
    startDate,
    endDate,
    startTime: allDay ? undefined : startTime,
    endTime: allDay ? undefined : endTime,
    location: text("location"),
    // 고치기 창은 설명을 건드렸을 때만 보낸다. 구글에서 넣은 링크·서식을 지키려고.
    description: formData.has("description") ? text("description") : undefined,
    colorId: text("colorId"),
  });
}

export async function createEventAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const calendarId = String(formData.get("calendarId") ?? "");
  const access = await writeAccess(calendarId);
  if (!access.ok) return { error: access.message };

  const input = readForm(formData);
  if (!input.ok) return { error: input.message };

  const result = await createGoogleEvent(calendarId, input.data, access.data);
  if (!result.ok) return { error: result.message };

  // 방금 넣은 일정이 바로 보여야 한다. 안 보이면 실패한 줄 알고 또 누른다.
  refresh();
  return { error: null };
}

export async function updateEventAction(
  calendarId: string,
  eventId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  if (!EVENT_ID.test(eventId)) return { error: "알 수 없는 일정이다." };
  const access = await writeAccess(calendarId);
  if (!access.ok) return { error: access.message };

  const input = readForm(formData);
  if (!input.ok) return { error: input.message };

  const result = await updateGoogleEvent(calendarId, eventId, input.data, access.data);
  if (!result.ok) return { error: result.message };

  refresh();
  return { error: null };
}

export async function deleteEventAction(
  calendarId: string,
  eventId: string,
): Promise<ActionState> {
  if (!EVENT_ID.test(eventId)) return { error: "알 수 없는 일정이다." };
  const access = await writeAccess(calendarId);
  if (!access.ok) return { error: access.message };

  const result = await deleteGoogleEvent(calendarId, eventId, access.data);
  if (!result.ok) return { error: result.message };

  refresh();
  return { error: null };
}
