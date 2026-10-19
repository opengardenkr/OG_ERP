import Link from "next/link";

import { ErrorState } from "@/components/data-state";
import { ComposeSlot } from "@/components/event-composer";
import { EventLink } from "@/components/event-link";
import { eventTime } from "@/components/event-list";
import { shiftMonth, WEEKDAYS } from "@/lib/calendar/month";
import { isoWeek } from "@/lib/calendar/week";
import {
  dayTone,
  eventRange,
  offDays,
  type PortalEvent,
} from "@/lib/calendar/types";
import type { Result } from "@/lib/result";

/**
 * 월간 달력.
 *
 * 여러 날에 걸친 일정은 한 줄 막대로 이어서 그린다 — 날마다 같은 제목이
 * 따로 뜨면 하루짜리 일정 여러 개처럼 보인다.
 * 주가 넘어가면 막대를 그 주의 끝에서 끊고 다음 주에서 다시 시작한다.
 */
const LANE_H = 18;

type Bar = {
  event: PortalEvent;
  /** 이 주 안에서의 시작·끝 칸(0~6) */
  from: number;
  to: number;
  lane: number;
  /** 앞뒤 주로 이어지는지 — 끊긴 쪽은 모서리를 각지게 둔다 */
  continuesLeft: boolean;
  continuesRight: boolean;
};

/** 한 주에 놓일 막대들. 겹치면 아래 줄로 내린다. */
function layoutWeek(week: string[], events: PortalEvent[]): Bar[] {
  const first = week[0];
  const last = week[6];

  const spans = events
    .map((event) => ({ event, ...eventRange(event) }))
    .filter((span) => span.start <= last && span.end >= first)
    .sort((a, b) => a.start.localeCompare(b.start) || b.end.localeCompare(a.end));

  const lanes: number[] = []; // 각 줄이 어디까지 찼는지(칸 번호)
  const bars: Bar[] = [];

  for (const span of spans) {
    const from = Math.max(0, week.indexOf(span.start));
    const to = span.end >= last ? 6 : week.indexOf(span.end);

    let lane = lanes.findIndex((filled) => filled < from);
    if (lane === -1) lane = lanes.length;
    lanes[lane] = to;

    bars.push({
      event: span.event,
      from,
      to,
      lane,
      continuesLeft: span.start < first,
      continuesRight: span.end > last,
    });
  }

  return bars;
}

function tint(color: string | undefined): React.CSSProperties {
  if (!color) return { background: "#eceef1", color: "#44546f" };
  return { background: `${color}26`, color, borderLeft: `2px solid ${color}` };
}

export function MonthCalendar({
  year,
  month,
  weeks,
  today,
  result,
  compact = false,
}: {
  year: number;
  month: number;
  weeks: string[][];
  today: string;
  result: Result<PortalEvent[]>;
  /** 대시보드에 얹을 때. 이동 버튼을 숨기고 칸을 낮춘다. */
  compact?: boolean;
}) {
  if (!result.ok) return <ErrorState message={result.message} />;

  // 쉬는 날·일요일은 빨강, 토요일은 파랑. 기념일(안 쉬는 날)은 색을 바꾸지 않는다.
  const off = offDays(result.data);

  return (
    <div>
      <div className={`mb-3 flex items-center gap-2 ${compact ? "hidden" : ""}`}>
        <Link
          href={`/calendar?m=${shiftMonth(year, month, -1)}`}
          aria-label="이전 달"
          className="btn px-2 py-1"
        >
          ‹
        </Link>
        <Link
          href={`/calendar?m=${shiftMonth(year, month, 1)}`}
          aria-label="다음 달"
          className="btn px-2 py-1"
        >
          ›
        </Link>
        <span className="ml-1 font-semibold">
          {year}년 {month}월
        </span>
        <Link href="/calendar" className="btn ml-auto py-1">
          오늘
        </Link>
      </div>

      <div className="card overflow-hidden">
        {/* 요일 머리. 맨 앞은 주차 칸 */}
        <div className="grid grid-cols-[38px_repeat(7,minmax(0,1fr))] border-b border-line bg-canvas">
          <div className="py-1.5 text-center text-[10px] font-bold text-faint">주</div>
          {WEEKDAYS.map((day) => (
            <div
              key={day}
              className="border-l border-line py-1.5 text-center text-[11px] font-bold tracking-[0.04em] text-muted"
            >
              {day}
            </div>
          ))}
        </div>

        {weeks.map((week) => {
          const bars = layoutWeek(week, result.data);
          const lanes = bars.length > 0 ? Math.max(...bars.map((b) => b.lane)) + 1 : 0;
          const shown = compact ? Math.min(lanes, 2) : Math.min(lanes, 4);

          return (
            <div
              key={week[0]}
              className="grid grid-cols-[38px_repeat(7,minmax(0,1fr))] border-b border-line last:border-b-0"
            >
              {/* 주차 */}
              <div className="flex items-start justify-center bg-canvas pt-1.5 text-[11px] font-semibold text-faint">
                {isoWeek(week[0])}
              </div>

              <div className="relative col-span-7">
                {/* 날짜 칸 */}
                <div className="grid grid-cols-7">
                  {week.map((day) => {
                    const inMonth = Number(day.slice(5, 7)) === month;

                    // 빈 칸을 누르면 그 날짜로 종일 일정 창이 열린다.
                    return (
                      <ComposeSlot
                        key={day}
                        date={day}
                        allDay
                        className={`${compact ? "min-h-16" : "min-h-24"} border-l border-line px-1.5 pb-1 ${
                          inMonth ? "bg-surface" : "bg-canvas"
                        }`}
                        style={{ paddingTop: 4 + shown * LANE_H }}
                      />
                    );
                  })}
                </div>

                {/* 날짜 숫자는 칸 위에 겹쳐 둔다 */}
                <div className="pointer-events-none absolute inset-x-0 top-1 grid grid-cols-7">
                  {week.map((day) => {
                    const inMonth = Number(day.slice(5, 7)) === month;
                    const isToday = day === today;
                    const tone = dayTone(day, off);
                    return (
                      <div key={day} className="px-1.5">
                        <span
                          className={`inline-block rounded-[3px] px-1 text-[11px] ${
                            isToday
                              ? "bg-brand-600 font-bold text-white"
                              : `${tone === "red" ? "font-semibold text-[#d93025]" : tone === "blue" ? "text-[#1a73e8]" : "text-ink"} ${inMonth ? "" : "opacity-45"}`
                          }`}
                        >
                          {Number(day.slice(8, 10))}
                        </span>
                      </div>
                    );
                  })}
                </div>

                {/* 일정 막대 */}
                <div className="absolute inset-x-0" style={{ top: 22 }}>
                  {bars
                    .filter((bar) => bar.lane < shown)
                    .map((bar) => (
                      <div
                        key={bar.event.id}
                        title={bar.event.title}
                        className="absolute overflow-hidden text-[11px] leading-4"
                        style={{
                          top: bar.lane * LANE_H,
                          left: `calc(${(bar.from / 7) * 100}% + 3px)`,
                          width: `calc(${((bar.to - bar.from + 1) / 7) * 100}% - 6px)`,
                          borderRadius: 2,
                          ...tint(bar.event.color),
                          ...(bar.continuesLeft ? { borderLeft: "none" } : null),
                        }}
                      >
                        <EventLink
                          event={bar.event}
                          className="block w-full truncate px-1 hover:underline"
                          time={bar.event.allDay ? undefined : eventTime(bar.event)}
                        />
                      </div>
                    ))}

                  {/* 줄이 모자라면 몇 개 더 있는지 알린다 */}
                  {lanes > shown ? (
                    <div
                      className="absolute px-1.5 text-[11px] text-faint"
                      style={{ top: shown * LANE_H, left: 0 }}
                    >
                      +{lanes - shown}
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
