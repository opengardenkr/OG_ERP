import { ErrorState } from "@/components/data-state";
import { ComposeSlot } from "@/components/event-composer";
import { EventLink } from "@/components/event-link";
import { NowLine } from "@/components/now-line";
import { WORK_END_HOUR, WORK_START_HOUR } from "@/config/workday";
import { isoWeek, minutesOfDay } from "@/lib/calendar/week";
import {
  dayTone,
  eventDate,
  eventRange,
  offDays,
  type PortalEvent,
} from "@/lib/calendar/types";
import type { Result } from "@/lib/result";

/**
 * 주간 캘린더. 구글 캘린더의 주 보기와 같은 모양 —
 * 왼쪽에 시간 눈금, 칸 안에 일정이 시각과 길이만큼 놓인다.
 *
 * 종일 일정과 할 일 마감은 시간이 없으므로 맨 위 띠에 따로 모은다.
 */

export const PX_PER_MIN = 52 / 60; // 한 시간 52px
/** 정규 시간 앞뒤로 한 시간씩 더 보여준다. 경계에 딱 붙은 일정이 잘려 보이지 않게. */
const PAD_HOURS = 1;

const WEEKDAYS = ["월", "화", "수", "목", "금", "토", "일"];

type Placed = PortalEvent & {
  top: number;
  height: number;
  /** 겹칠 때 나란히 놓으려고 */
  column: number;
  columns: number;
};

/** 겹치는 것끼리 묶어 나란히 놓는다. 서로 가리지 않게. */
function place(events: PortalEvent[], fromMin: number): Placed[] {
  const spans = events
    .map((event) => {
      const start = minutesOfDay(event.start);
      const end = endMinutes(event);
      return { event, start, end: Math.max(end, start + 30) };
    })
    .sort((a, b) => a.start - b.start);

  const placed: Placed[] = [];
  let group: typeof spans = [];

  const flush = () => {
    const columns: number[] = []; // 각 열의 마지막 끝 시각
    const assigned = group.map((span) => {
      let column = columns.findIndex((end) => end <= span.start);
      if (column === -1) column = columns.length;
      columns[column] = span.end;
      return { span, column };
    });

    for (const { span, column } of assigned) {
      placed.push({
        ...span.event,
        top: (span.start - fromMin) * PX_PER_MIN,
        height: (span.end - span.start) * PX_PER_MIN,
        column,
        columns: columns.length,
      });
    }
    group = [];
  };

  let groupEnd = -1;
  for (const span of spans) {
    if (group.length > 0 && span.start >= groupEnd) flush();
    group.push(span);
    groupEnd = Math.max(groupEnd, span.end);
  }
  if (group.length > 0) flush();

  return placed;
}

export function WeekCalendar({
  days,
  today,
  result,
}: {
  days: string[];
  today: string;
  result: Result<PortalEvent[]>;
}) {
  if (!result.ok) return <ErrorState message={result.message} />;

  // 여러 날에 걸친 시간 일정(출장 3일 등)은 칸에 넣으면 첫날 30분짜리로 찌그러진다.
  // 구글처럼 종일 띠에 막대로 놓는다.
  const spansDays = (event: PortalEvent) => {
    const { start, end } = eventRange(event);
    return start !== end;
  };
  const timed = result.data.filter((event) => !event.allDay && !spansDays(event));
  const off = offDays(result.data);
  const allDay = result.data.filter((event) => event.allDay || spansDays(event));

  // 종일 일정을 여러 날 막대로 놓는다. 겹치면 아래 줄로.
  const first = days[0];
  const last = days[6];
  const lanesFilled: number[] = [];
  const allDayBars = allDay
    .map((event) => ({ event, ...eventRange(event) }))
    .filter((span) => span.start <= last && span.end >= first)
    .sort((a, b) => a.start.localeCompare(b.start) || b.end.localeCompare(a.end))
    .map((span) => {
      const from = Math.max(0, days.indexOf(span.start));
      const to = span.end >= last ? 6 : days.indexOf(span.end);
      let lane = lanesFilled.findIndex((filled) => filled < from);
      if (lane === -1) lane = lanesFilled.length;
      lanesFilled[lane] = to;
      return { event: span.event, from, to, lane };
    });
  const allDayLanes = lanesFilled.length;

  // 일정이 눈금 밖에 있으면 눈금을 넓힌다. 안 보이는 일정이 있으면 안 된다.
  const starts = timed.map((event) => Math.floor(minutesOfDay(event.start) / 60));
  const ends = timed.map((event) => Math.ceil(endMinutes(event) / 60));
  // 정규 시간이 기본 눈금이고, 그 밖에 일정이 있으면 넓힌다.
  const fromHour = Math.max(0, Math.min(WORK_START_HOUR - PAD_HOURS, ...starts));
  const toHour = Math.min(24, Math.max(WORK_END_HOUR + PAD_HOURS, ...ends));
  const fromMin = fromHour * 60;
  const hours = Array.from({ length: toHour - fromHour }, (_, i) => fromHour + i);
  const bodyHeight = (toHour - fromHour) * 60 * PX_PER_MIN;

  return (
    <div className="card overflow-hidden">
      {/* 날짜 머리. 맨 앞에 주차 */}
      <div className="grid grid-cols-[44px_repeat(7,minmax(0,1fr))] border-b border-line bg-canvas">
        <div className="flex flex-col items-center justify-center py-1.5">
          <span className="text-[9px] font-bold text-faint">주차</span>
          <span className="text-[13px] font-bold text-muted">{isoWeek(days[0])}</span>
        </div>
        {days.map((day, index) => {
          const isToday = day === today;
          const tone = dayTone(day, off);
          const toneClass =
            tone === "red" ? "text-[#d93025]" : tone === "blue" ? "text-[#1a73e8]" : "";
          return (
            <div key={day} className="border-l border-line px-2 py-1.5 text-center">
              <div className={`text-[11px] ${toneClass || "text-muted"}`}>
                {WEEKDAYS[index]}
              </div>
              <div
                className={`mx-auto mt-0.5 w-6 rounded-[3px] text-[13px] ${
                  isToday ? "bg-brand-600 font-bold text-white" : `font-medium ${toneClass}`
                }`}
              >
                {Number(day.slice(8, 10))}
              </div>
            </div>
          );
        })}
      </div>

      {/* 종일 · 마감 띠 — 여러 날 걸친 것은 이어서 그린다 */}
      <div className="grid grid-cols-[44px_repeat(7,minmax(0,1fr))] border-b border-line">
        <div className="px-1 py-1 text-right text-[10px] text-faint">종일</div>

        <div className="relative col-span-7" style={{ minHeight: 26 + allDayLanes * 18 }}>
          <div className="grid h-full grid-cols-7">
            {days.map((day) => (
              <ComposeSlot key={day} date={day} allDay className="border-l border-line" />
            ))}
          </div>

          <div className="absolute inset-x-0 top-1">
            {allDayBars.map((bar) => (
              <div
                key={bar.event.id}
                title={bar.event.title}
                className="absolute overflow-hidden text-[11px] leading-4"
                style={{
                  top: bar.lane * 18,
                  left: `calc(${(bar.from / 7) * 100}% + 3px)`,
                  width: `calc(${((bar.to - bar.from + 1) / 7) * 100}% - 6px)`,
                  borderRadius: 2,
                  ...tint(bar.event.color),
                }}
              >
                <EventLink
                  event={bar.event}
                  className="block w-full truncate px-1 hover:underline"
                />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 시간 격자 — 길어지면 이 안에서만 스크롤된다 */}
      <div className="grid max-h-[620px] grid-cols-[44px_repeat(7,minmax(0,1fr))] overflow-y-auto">
        <div>
          {hours.map((hour) => (
            <div
              key={hour}
              style={{ height: 60 * PX_PER_MIN }}
              className="relative border-t border-line first:border-t-0"
            >
              <span className="absolute -top-1.5 right-1 bg-surface px-0.5 text-[10px] text-faint">
                {String(hour).padStart(2, "0")}
              </span>
            </div>
          ))}
        </div>

        {days.map((day) => {
          const placed = place(
            timed.filter((event) => eventDate(event.start) === day),
            fromMin,
          );

          return (
            <div
              key={day}
              className="relative border-l border-line"
              style={{ height: bodyHeight }}
            >
              {/* 빈 시간 칸을 누르면 그 날짜·시각으로 창이 열린다 */}
              {hours.map((hour) => (
                <ComposeSlot
                  key={hour}
                  date={day}
                  hour={hour}
                  style={{ height: 60 * PX_PER_MIN }}
                  className={`border-t border-line first:border-t-0 ${
                    hour < WORK_START_HOUR || hour >= WORK_END_HOUR ? "bg-canvas" : ""
                  }`}
                />
              ))}

              {day === today ? (
                <NowLine fromMin={fromMin} pxPerMin={PX_PER_MIN} />
              ) : null}

              {placed.map((event) => (
                <div
                  key={event.id}
                  title={event.title}
                  className="absolute overflow-hidden rounded-[2px] text-[11px] leading-tight"
                  style={{
                    top: event.top,
                    height: event.height,
                    left: `${(event.column / event.columns) * 100}%`,
                    width: `${(1 / event.columns) * 100}%`,
                    ...tint(event.color),
                  }}
                >
                  <EventLink
                    event={event}
                    className="block h-full w-full px-1 py-px align-top hover:underline"
                  />
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** 끝 시각(분). 자정에 끝나는 일정(23:00~24:00)은 0분이 아니라 24시로 본다. */
function endMinutes(event: PortalEvent): number {
  if (!event.end) return minutesOfDay(event.start) + 60;
  if (eventDate(event.end) !== eventDate(event.start)) return 24 * 60;
  return minutesOfDay(event.end);
}

function tint(color: string | undefined): React.CSSProperties {
  if (!color) return { background: "#eceef1", color: "#44546f" };
  return { background: `${color}26`, color, borderLeft: `2px solid ${color}` };
}
