import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { MonthCalendar } from "@/components/month-calendar";
import { WeekCalendar } from "@/components/week-calendar";
import { EventList } from "@/components/event-list";
import { EventComposerProvider } from "@/components/event-composer";
import { getEvents, getWritableCalendars } from "@/lib/calendar/events";
import { gridRange, monthGrid, parseMonth } from "@/lib/calendar/month";
import { weekDays, weekRange } from "@/lib/calendar/week";
import { validDate } from "@/lib/calendar/validation";
import { todayInSeoul } from "@/lib/date";
import { CalendarLinks } from "@/components/calendar-links";

export default async function CalendarPage({ searchParams }: PageProps<"/calendar">) {
  const { m, d, view: requestedView } = await searchParams;
  const today = todayInSeoul();
  const date = typeof d === "string" && validDate(d) ? d : today;
  const view = requestedView === "week" || requestedView === "day" ? requestedView : "month";
  const { year, month } = parseMonth(typeof m === "string" ? m : date.slice(0, 7), today);
  const weeks = monthGrid(year, month);
  const days = weekDays(date);
  const range = view === "month" ? gridRange(weeks) : view === "week" ? weekRange(days) : { from: new Date(`${date}T00:00:00+09:00`), to: new Date(`${date}T23:59:59+09:00`) };
  const [events, calendars] = await Promise.all([getEvents(range.from, range.to), getWritableCalendars()]);
  const shift = (amount: number) => new Date(Date.parse(`${date}T00:00:00Z`) + amount * 86400000).toISOString().slice(0, 10);
  return (
    <EventComposerProvider calendars={calendars}>
      <AppShell title="일정" action={<CalendarLinks date={date} />}>
        <div className="mb-4 flex flex-wrap items-center gap-2">
          {([['month', '월'], ['week', '주'], ['day', '일']] as const).map(([key, label]) => <Link key={key} href={`/calendar?view=${key}&d=${date}`} className={view === key ? "btn-primary" : "btn"} aria-current={view === key ? "page" : undefined}>{label}</Link>)}
          <span className="text-xs text-muted">한국 시간 · 기존 업무는 원본 그대로 함께 표시</span>
          <Link href="/todos" className="ml-auto text-xs text-muted underline">기존 업무 전체 보기 (날짜 없는 업무 포함)</Link>
        </div>
        {view !== "month" ? <div className="mb-3 flex items-center justify-between gap-2"><Link className="btn" href={`/calendar?view=${view}&d=${shift(view === "week" ? -7 : -1)}`}>이전</Link><h2 className="text-sm font-semibold">{view === "week" ? `${days[0]} ~ ${days[6]}` : date}</h2><div className="flex gap-2"><Link className="btn" href={`/calendar?view=${view}&d=${today}`}>오늘</Link><Link className="btn" href={`/calendar?view=${view}&d=${shift(view === "week" ? 7 : 1)}`}>다음</Link></div></div> : null}
        {view === "month" ? <MonthCalendar year={year} month={month} weeks={weeks} today={today} result={events} /> : view === "week" ? <WeekCalendar days={days} today={today} result={events} /> : <EventList result={events} emptyMessage="이 날짜에 등록된 일정이 없습니다. 위의 일정 추가로 등록하세요." />}
      </AppShell>
    </EventComposerProvider>
  );
}
