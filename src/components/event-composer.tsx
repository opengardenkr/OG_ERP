"use client";

import { createContext, useActionState, useContext, useState } from "react";

import { createEventAction, type ActionState } from "@/app/calendar-actions";
import { Modal } from "@/components/modal";
import { EVENT_COLORS } from "@/lib/calendar/colors";
import type { WritableCalendar } from "@/lib/calendar/types";

/**
 * 일정 등록 창. 포털을 떠나지 않고 구글 캘린더에 일정을 넣는다.
 *
 * 화면 어디서든(버튼, 달력 칸) `open()`으로 연다. 달력 칸에서 열면
 * 그 날짜·시각이 채워져 있다 — 날짜를 다시 고르게 하지 않는다.
 * 반복·첨부처럼 드문 설정은 "구글에서 자세히"로 넘긴다. (원칙 3)
 */

type Draft = { date: string; hour?: number; allDay: boolean };

const ComposerContext = createContext<((draft?: Partial<Draft>) => void) | null>(null);

function todayInSeoul(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date());
}

const pad = (n: number) => String(n).padStart(2, "0");

function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000)
    .toISOString()
    .slice(0, 10);
}

/** 한 시간 뒤. 자정을 넘기면 23:59에서 멈춘다 — 하루를 넘기는 일정은 날짜를 직접 고친다. */
function hourLater(time: string): string {
  const [h, m] = time.split(":").map(Number);
  return h >= 23 ? "23:59" : `${pad(h + 1)}:${pad(m)}`;
}

export function EventComposerProvider({
  calendars,
  children,
}: {
  calendars: WritableCalendar[];
  children: React.ReactNode;
}) {
  const [draft, setDraft] = useState<Draft | null>(null);
  // 열 때마다 새 폼으로 — 지난번 입력이 남아 있지 않게.
  const [serial, setSerial] = useState(0);

  const open = (next?: Partial<Draft>) => {
    setDraft({ date: next?.date ?? todayInSeoul(), hour: next?.hour, allDay: next?.allDay ?? false });
    setSerial((n) => n + 1);
  };
  const close = () => setDraft(null);

  return (
    <ComposerContext.Provider value={open}>
      {children}
      <Modal open={draft !== null} onClose={close} title="일정 만들기" width="max-w-xl">
        {draft ? (
          <EventForm key={serial} draft={draft} calendars={calendars} onDone={close} />
        ) : null}
      </Modal>
    </ComposerContext.Provider>
  );
}

/** [일정 추가] 버튼. 창은 오늘 날짜로 열린다. */
export function ComposeButton({
  className = "btn-primary",
  children = "일정 추가",
}: {
  className?: string;
  children?: React.ReactNode;
}) {
  const open = useContext(ComposerContext);
  if (!open) return null;
  return (
    <button type="button" onClick={() => open()} className={className}>
      {children}
    </button>
  );
}

/**
 * 달력의 빈 칸. 누르면 그 날짜(·시각)로 창이 열린다.
 * 일정 막대는 이 칸 위에 겹쳐 있으므로 막대를 누르면 막대가 받는다.
 */
export function ComposeSlot({
  date,
  hour,
  allDay = false,
  className = "",
  style,
}: {
  date: string;
  hour?: number;
  allDay?: boolean;
  className?: string;
  style?: React.CSSProperties;
}) {
  const open = useContext(ComposerContext);
  if (!open) return <div className={className} style={style} />;

  const label = allDay ? `${date} 종일 일정 추가` : `${date} ${hour ?? ""}시 일정 추가`;
  return (
    <div
      role="button"
      tabIndex={-1}
      aria-label={label}
      title="눌러서 일정 추가"
      onClick={() => open({ date, hour, allDay })}
      className={`cursor-pointer hover:bg-brand-50 ${className}`}
      style={style}
    />
  );
}

function Field({
  label,
  required = false,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-semibold text-muted">
        {label}
        {required ? <span className="ml-0.5 text-danger">*</span> : null}
      </span>
      {children}
    </label>
  );
}

function EventForm({
  draft,
  calendars,
  onDone,
}: {
  draft: Draft;
  calendars: WritableCalendar[];
  onDone: () => void;
}) {
  const firstTime = `${pad(draft.hour ?? 9)}:00`;
  const [title, setTitle] = useState("");
  const [allDay, setAllDay] = useState(draft.allDay);
  const [startDate, setStartDate] = useState(draft.date);
  const [endDate, setEndDate] = useState(draft.date);
  const [startTime, setStartTime] = useState(firstTime);
  const [endTime, setEndTime] = useState(hourLater(firstTime));
  const [location, setLocation] = useState("");
  const [description, setDescription] = useState("");
  const [calendarId, setCalendarId] = useState(calendars[0]?.id ?? "");
  const [colorId, setColorId] = useState("");

  const [state, action, pending] = useActionState<ActionState, FormData>(
    async (prev, formData) => {
      const next = await createEventAction(prev, formData);
      // 화면 새로고침은 서버 액션이 한다(`refresh()`).
      if (!next.error) onDone();
      return next;
    },
    { error: null },
  );

  if (calendars.length === 0) {
    return (
      <div className="px-5 py-6 text-sm text-muted">
        일정을 넣을 수 있는 캘린더가 없다. 로그아웃했다가 다시 로그인해 캘린더
        권한에 동의했는지 확인해라.
      </div>
    );
  }

  const calendarColor = calendars.find((calendar) => calendar.id === calendarId)?.color;

  // 시작을 옮기면 끝이 시작보다 앞서지 않게 따라간다.
  const changeStartDate = (value: string) => {
    setStartDate(value);
    if (endDate < value) setEndDate(value);
  };
  const changeStartTime = (value: string) => {
    setStartTime(value);
    if (startDate === endDate && endTime <= value) setEndTime(hourLater(value));
  };

  return (
    <form data-og-saving={pending ? "true" : undefined} action={action}>
      <div className="flex flex-col gap-4 px-5 py-5">
        <Field label="제목" required>
          <input
            name="title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="일정 제목"
            className="field w-full"
            required
            autoFocus
          />
        </Field>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="allDay"
            checked={allDay}
            onChange={(event) => setAllDay(event.target.checked)}
          />
          종일
        </label>

        <div className="grid grid-cols-2 gap-4">
          <Field label="시작">
            <input
              name="startDate"
              type="date"
              value={startDate}
              onChange={(event) => changeStartDate(event.target.value)}
              className="field w-full"
              required
            />
            {allDay ? null : (
              <input
                name="startTime"
                type="time"
                value={startTime}
                onChange={(event) => changeStartTime(event.target.value)}
                className="field w-full"
                required
              />
            )}
          </Field>
          <Field label="끝">
            <input
              name="endDate"
              type="date"
              value={endDate}
              min={startDate}
              onChange={(event) => setEndDate(event.target.value)}
              className="field w-full"
              required
            />
            {allDay ? null : (
              <input
                name="endTime"
                type="time"
                value={endTime}
                onChange={(event) => setEndTime(event.target.value)}
                className="field w-full"
                required
              />
            )}
          </Field>
        </div>

        <Field label="장소">
          <input
            name="location"
            value={location}
            onChange={(event) => setLocation(event.target.value)}
            className="field w-full"
          />
        </Field>

        <Field label="설명">
          <textarea
            name="description"
            rows={3}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            className="field w-full resize-y"
          />
        </Field>

        <Field label="캘린더">
          <select
            name="calendarId"
            value={calendarId}
            onChange={(event) => setCalendarId(event.target.value)}
            className="field w-full"
          >
            {calendars.map((calendar) => (
              <option key={calendar.id} value={calendar.id}>
                {calendar.name}
              </option>
            ))}
          </select>
        </Field>

        <fieldset className="flex flex-col gap-1.5">
          <legend className="mb-1.5 text-xs font-semibold text-muted">색</legend>
          <input type="hidden" name="colorId" value={colorId} />
          <div className="flex flex-wrap gap-1.5">
            <Swatch
              hex={calendarColor ?? "#8993a4"}
              name="캘린더 색"
              selected={colorId === ""}
              onSelect={() => setColorId("")}
              wide
            />
            {EVENT_COLORS.map((color) => (
              <Swatch
                key={color.id}
                hex={color.hex}
                name={color.name}
                selected={colorId === color.id}
                onSelect={() => setColorId(color.id)}
              />
            ))}
          </div>
        </fieldset>
      </div>

      <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line px-5 py-3">
        {state.error ? (
          <span className="mr-auto text-sm text-danger">{state.error}</span>
        ) : (
          <a
            href={googleTemplateUrl({
              title,
              allDay,
              startDate,
              endDate,
              startTime,
              endTime,
              location,
              description,
              calendarId,
            })}
            target="_blank"
            rel="noreferrer"
            className="mr-auto text-xs text-muted hover:text-ink hover:underline"
          >
            반복·알림은 구글에서 ↗
          </a>
        )}
        <button type="button" onClick={onDone} className="btn">
          취소
        </button>
        <button type="submit" disabled={pending} className="btn-primary">
          {pending ? "만드는 중" : "만들기"}
        </button>
      </div>
    </form>
  );
}

function Swatch({
  hex,
  name,
  selected,
  onSelect,
  wide = false,
}: {
  hex: string;
  name: string;
  selected: boolean;
  onSelect: () => void;
  wide?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      title={name}
      aria-label={name}
      aria-pressed={selected}
      className={`flex h-6 items-center justify-center rounded-[3px] text-[11px] text-white ${
        wide ? "px-2" : "w-6"
      } ${selected ? "ring-2 ring-ink ring-offset-1" : ""}`}
      style={{ background: hex }}
    >
      {wide ? name : selected ? "✓" : null}
    </button>
  );
}

/** 지금 적은 내용을 그대로 채운 구글 등록 화면 주소. 반복·첨부가 필요할 때만 쓴다. */
function googleTemplateUrl(form: {
  title: string;
  allDay: boolean;
  startDate: string;
  endDate: string;
  startTime: string;
  endTime: string;
  location: string;
  description: string;
  calendarId: string;
}): string {
  const compact = (date: string) => date.replaceAll("-", "");
  const dates = form.allDay
    ? `${compact(form.startDate)}/${compact(addDays(form.endDate, 1))}`
    : `${compact(form.startDate)}T${form.startTime.replace(":", "")}00/` +
      `${compact(form.endDate)}T${form.endTime.replace(":", "")}00`;

  const url = new URL("https://calendar.google.com/calendar/render");
  url.searchParams.set("action", "TEMPLATE");
  url.searchParams.set("text", form.title);
  url.searchParams.set("dates", dates);
  url.searchParams.set("ctz", "Asia/Seoul");
  if (form.location) url.searchParams.set("location", form.location);
  if (form.description) url.searchParams.set("details", form.description);
  if (form.calendarId) url.searchParams.set("src", form.calendarId);
  return url.toString();
}
