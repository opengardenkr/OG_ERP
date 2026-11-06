import Link from "next/link";

import { AppShell, Section } from "@/components/app-shell";
import { ComposeButton, EventComposerProvider } from "@/components/event-composer";
import { TodoAddButton } from "@/components/todo-add-button";
import { TodoBoard } from "@/components/todo-board";
import { WeekCalendar } from "@/components/week-calendar";
import { MEMBERS } from "@/config/users";
import { getCompletedToday, getOpenTodos } from "@/lib/airtable/todos";
import { getEvents, getWritableCalendars } from "@/lib/calendar/events";
import { weekDays, weekRange } from "@/lib/calendar/week";
import { auth } from "@/lib/auth";
import { todayInSeoul } from "@/lib/date";
import { fail, ok } from "@/lib/result";
import type { Todo } from "@/lib/todo-types";

/**
 * 대시보드 — 한 화면에 다 보인다.
 * 탭으로 나누지 않는다. 클릭해야 보이면 한눈에 보는 게 아니다.
 */
export default async function DashboardPage({ searchParams }: PageProps<"/">) {
  const session = await auth();
  const member = session?.user.member ?? null;
  const today = todayInSeoul();

  // 대시보드 달력은 이번 주와 다음 주까지만. 일정 화면은 없앴다(2026-11-06) — 일정은 여기서 보고 등록한다.
  const { w } = await searchParams;
  const nextWeek = w === "next";
  const days = weekDays(nextWeek ? addDays(today, 7) : today);
  const span = weekRange(days);

  const [open, done, events, calendars] = await Promise.all([
    member ? getOpenTodos() : Promise.resolve(fail<Todo[]>("로그인 정보를 읽지 못했다")),
    member
      ? getCompletedToday()
      : Promise.resolve(fail<Todo[]>("로그인 정보를 읽지 못했다")),
    getEvents(span.from, span.to),
    getWritableCalendars(),
  ]);

  // 보드는 남은 일 + 오늘 끝낸 일을 함께 본다.
  const board = open.ok && done.ok ? ok([...open.data, ...done.data]) : open;

  return (
    <EventComposerProvider calendars={calendars}>
      <AppShell
        title="대시보드"
        subtitle={today}
        action={
          member ? (
            <TodoAddButton members={Object.values(MEMBERS)} defaultOwner={member} />
          ) : null
        }
      >
        <Section
          title="할 일"
          action={
            <Link href="/todos" className="text-xs text-muted hover:text-ink">
              전체 보기 →
            </Link>
          }
        >
          <TodoBoard result={board} me={member} />
        </Section>

        <Section
          title={nextWeek ? "다음 주" : "이번 주"}
          action={
            <div className="flex items-center gap-2">
              <div className="flex">
                <Link
                  href="/"
                  scroll={false}
                  aria-current={nextWeek ? undefined : "page"}
                  className={`btn rounded-r-none px-2 py-1 text-xs ${nextWeek ? "" : "bg-canvas font-semibold"}`}
                >
                  이번 주
                </Link>
                <Link
                  href="/?w=next"
                  scroll={false}
                  aria-current={nextWeek ? "page" : undefined}
                  className={`btn -ml-px rounded-l-none px-2 py-1 text-xs ${nextWeek ? "bg-canvas font-semibold" : ""}`}
                >
                  다음 주
                </Link>
              </div>
              <ComposeButton className="btn px-2 py-1 text-xs">+ 일정</ComposeButton>
            </div>
          }
        >
          <WeekCalendar days={days} today={today} result={events} />
        </Section>
      </AppShell>
    </EventComposerProvider>
  );
}

function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000)
    .toISOString()
    .slice(0, 10);
}
