"use server";

import { refresh } from "next/cache";

import { auth } from "@/lib/auth";
import { getWritableCalendars } from "@/lib/calendar/events";
import { createGoogleEvent, deleteGoogleEvent } from "@/lib/calendar/write";

export type ActionState = { error: string | null };

import { validDate, validTime, validEventIdentity } from "@/lib/calendar/validation";

export async function createEventAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  // 서버 액션은 누구나 부를 수 있는 입구다. 매번 세션을 확인한다.
  const session = await auth();
  if (!session?.user.member) throw new Error("로그인이 필요하다");
  if (!session.accessToken) {
    return { error: "구글 로그인이 만료됐다. 로그아웃했다가 다시 로그인해라." };
  }

  const text = (name: string) => String(formData.get(name) ?? "").trim();

  const title = text("title");
  if (!title || title.length > 300) return { error: "제목을 1~300자로 입력하세요." };

  // 고를 수 있는 캘린더인지 서버가 다시 본다. 화면이 보낸 값을 그대로 믿지 않는다.
  const calendarId = text("calendarId");
  const writable = await getWritableCalendars();
  if (!writable.some((calendar) => calendar.id === calendarId)) {
    return { error: "그 캘린더에는 일정을 넣을 수 없다." };
  }

  const allDay = formData.get("allDay") === "on";
  const startDate = text("startDate");
  const endDate = text("endDate") || startDate;
  if (!validDate(startDate) || !validDate(endDate)) {
    return { error: "날짜를 확인해라." };
  }

  const startTime = text("startTime");
  const endTime = text("endTime");
  if (!allDay && (!validTime(startTime) || !validTime(endTime))) {
    return { error: "시각을 확인해라." };
  }

  const start = allDay ? startDate : `${startDate}T${startTime}`;
  const end = allDay ? endDate : `${endDate}T${endTime}`;
  if (allDay ? end < start : end <= start) {
    return { error: "끝이 시작보다 빠르다." };
  }

  const eventId = text("eventId");
  const etag = text("etag");
  if (eventId && !validEventIdentity(eventId, etag)) return { error: "일정 정보가 오래되었습니다. 새로고침하세요." };
  if (text("description").length > 8000 || text("location").length > 1000) return { error: "설명 또는 장소가 너무 깁니다." };
  try {
  const result = await createGoogleEvent(
    {
      calendarId,
      title,
      allDay,
      startDate,
      endDate,
      startTime: allDay ? undefined : startTime,
      endTime: allDay ? undefined : endTime,
      location: text("location"),
      description: text("description"),
      colorId: text("colorId") || undefined,
    },
    session.accessToken,
    eventId ? { eventId, etag } : undefined,
  );

  if (!result.ok) return { error: result.message };

  // 방금 넣은 일정이 바로 보여야 한다. 안 보이면 실패한 줄 알고 또 누른다.
  refresh();
  return { error: null };
  } catch { return { error: "일정 저장 응답을 확인하지 못했습니다. 새로고침으로 저장 여부를 확인한 후 다시 시도하세요." }; }
}

export async function deleteEventAction(formData: FormData): Promise<ActionState> {
  const session = await auth();
  if (!session?.user.member || !session.accessToken) return { error: "다시 로그인하세요." };
  const calendarId = String(formData.get("calendarId") ?? "");
  const eventId = String(formData.get("eventId") ?? "");
  const etag = String(formData.get("etag") ?? "");
  if (formData.get("confirmed") !== "yes" || !validEventIdentity(eventId, etag)) return { error: "삭제할 일정을 다시 확인하세요." };
  const writable = await getWritableCalendars();
  if (!writable.some(c => c.id === calendarId)) return { error: "이 캘린더를 수정할 권한이 없습니다." };
  try {
    const result = await deleteGoogleEvent(calendarId, eventId, etag, session.accessToken);
    if (!result.ok) return { error: result.message };
    refresh();
    return { error: null };
  } catch { return { error: "삭제 응답을 확인하지 못했습니다. 새로고침으로 상태를 확인하세요." }; }
}
