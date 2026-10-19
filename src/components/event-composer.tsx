"use client";

import {
  createContext,
  useActionState,
  useContext,
  useState,
  useTransition,
} from "react";

import {
  createEventAction,
  deleteEventAction,
  updateEventAction,
  type ActionState,
} from "@/app/calendar-actions";
import { Modal } from "@/components/modal";
import { EVENT_COLORS } from "@/lib/calendar/colors";
import {
  eventRange,
  type GoogleRef,
  type PortalEvent,
  type WritableCalendar,
} from "@/lib/calendar/types";

/**
 * 일정 창. 포털을 떠나지 않고 구글 캘린더 일정을 만들고, 보고, 고치고, 지운다.
 *
 * - 만들기: [일정 추가] 버튼이나 달력의 빈 칸. 칸에서 열면 날짜·시각이 채워져 있다.
 * - 고치기: 달력의 구글 일정을 누르면 같은 창이 값이 채워진 채로 열린다.
 * - 보기: 공휴일·남이 보낸 초대처럼 고칠 수 없는 일정은 내용만 보여준다.
 *
 * 반복 규칙·첨부·초대처럼 드문 설정은 구글로 넘긴다. (원칙 3)
 */

type Draft = { date: string; hour?: number; allDay: boolean };

type Target =
  | { kind: "create"; draft: Draft }
  | { kind: "edit"; event: PortalEvent; ref: GoogleRef }
  | { kind: "view"; event: PortalEvent };

type Editor = {
  create: (draft?: Partial<Draft>) => void;
  open: (event: PortalEvent) => void;
};

const EditorContext = createContext<Editor | null>(null);

/** 창을 여는 손잡이. 창 바깥(일정 화면이 아닌 곳)에서는 null이다. */
export function useEventEditor(): Editor | null {
  return useContext(EditorContext);
}

const SEOUL = "Asia/Seoul";
const pad = (n: number) => String(n).padStart(2, "0");

function todayInSeoul(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: SEOUL }).format(new Date());
}

function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000)
    .toISOString()
    .slice(0, 10);
}

/** ISO 시각 → 한국 기준 날짜·시각 */
function seoulParts(iso: string): { date: string; time: string } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: SEOUL,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(iso));
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    time: `${get("hour")}:${get("minute")}`,
  };
}

/** 한 시간 뒤. 자정을 넘기면 23:59에서 멈춘다 — 하루를 넘기는 일정은 날짜를 직접 고친다. */
function hourLater(time: string): string {
  const [h, m] = time.split(":").map(Number);
  return h >= 23 ? "23:59" : `${pad(h + 1)}:${pad(m)}`;
}

/**
 * 구글 웹에서 링크·서식을 넣으면 설명이 HTML로 온다. 읽을 수 있는 글로 바꾼다.
 * 화면에는 글자로만 넣으므로(React가 이스케이프) 태그가 실행될 일은 없다.
 */
function plainText(value: string): string {
  if (!/<[a-z!/]/i.test(value)) return value;
  return value
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .trim();
}

const DAY_LABEL = new Intl.DateTimeFormat("ko-KR", {
  timeZone: SEOUL,
  month: "long",
  day: "numeric",
  weekday: "short",
});

function dayLabel(date: string): string {
  return DAY_LABEL.format(new Date(`${date}T12:00:00+09:00`));
}

/** "10월 19일 (월) 14:00 ~ 15:00" 같은 한 줄 */
function whenLabel(event: PortalEvent): string {
  if (event.allDay) {
    const { start, end } = eventRange(event);
    return start === end ? `${dayLabel(start)} 종일` : `${dayLabel(start)} ~ ${dayLabel(end)}`;
  }
  const start = seoulParts(event.start);
  if (!event.end) return `${dayLabel(start.date)} ${start.time}`;
  const end = seoulParts(event.end);
  return start.date === end.date
    ? `${dayLabel(start.date)} ${start.time} ~ ${end.time}`
    : `${dayLabel(start.date)} ${start.time} ~ ${dayLabel(end.date)} ${end.time}`;
}

export function EventComposerProvider({
  calendars,
  children,
}: {
  calendars: WritableCalendar[];
  children: React.ReactNode;
}) {
  const [target, setTarget] = useState<Target | null>(null);
  // 열 때마다 새 폼으로 — 지난번 입력이 남아 있지 않게.
  const [serial, setSerial] = useState(0);

  const show = (next: Target) => {
    setTarget(next);
    setSerial((n) => n + 1);
  };

  const editor: Editor = {
    create: (draft) =>
      show({
        kind: "create",
        draft: {
          date: draft?.date ?? todayInSeoul(),
          hour: draft?.hour,
          allDay: draft?.allDay ?? false,
        },
      }),
    open: (event) =>
      event.google?.editable
        ? show({ kind: "edit", event, ref: event.google })
        : show({ kind: "view", event }),
  };
  const close = () => setTarget(null);

  const title =
    target?.kind === "create" ? "일정 만들기" : target?.kind === "edit" ? "일정 고치기" : "일정";

  return (
    <EditorContext.Provider value={editor}>
      {children}
      <Modal open={target !== null} onClose={close} title={title} width="max-w-xl">
        {target?.kind === "view" ? (
          <EventDetails key={serial} event={target.event} onDone={close} />
        ) : target ? (
          <EventForm key={serial} target={target} calendars={calendars} onDone={close} />
        ) : null}
      </Modal>
    </EditorContext.Provider>
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
  const editor = useEventEditor();
  if (!editor) return null;
  return (
    <button type="button" onClick={() => editor.create()} className={className}>
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
  const editor = useEventEditor();
  if (!editor) return <div className={className} style={style} />;

  const label = allDay ? `${date} 종일 일정 추가` : `${date} ${hour ?? ""}시 일정 추가`;
  return (
    <div
      role="button"
      tabIndex={-1}
      aria-label={label}
      title="눌러서 일정 추가"
      onClick={() => editor.create({ date, hour, allDay })}
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

type Values = {
  title: string;
  allDay: boolean;
  startDate: string;
  endDate: string;
  startTime: string;
  endTime: string;
  location: string;
  description: string;
  calendarId: string;
  colorId: string;
};

function initialValues(
  target: Exclude<Target, { kind: "view" }>,
  calendars: WritableCalendar[],
): Values {
  if (target.kind === "create") {
    const { draft } = target;
    const startTime = `${pad(draft.hour ?? 9)}:00`;
    return {
      title: "",
      allDay: draft.allDay,
      startDate: draft.date,
      endDate: draft.date,
      startTime,
      endTime: hourLater(startTime),
      location: "",
      description: "",
      calendarId: calendars[0]?.id ?? "",
      colorId: "",
    };
  }

  const { event, ref } = target;
  const common = {
    title: event.title,
    location: event.location ?? "",
    description: plainText(event.description ?? ""),
    calendarId: ref.calendarId,
    colorId: ref.colorId ?? "",
  };

  if (event.allDay) {
    const { start, end } = eventRange(event);
    return { ...common, allDay: true, startDate: start, endDate: end, startTime: "09:00", endTime: "10:00" };
  }

  const start = seoulParts(event.start);
  const end = event.end ? seoulParts(event.end) : { date: start.date, time: hourLater(start.time) };
  return {
    ...common,
    allDay: false,
    startDate: start.date,
    endDate: end.date,
    startTime: start.time,
    endTime: end.time,
  };
}

function EventForm({
  target,
  calendars,
  onDone,
}: {
  target: Exclude<Target, { kind: "view" }>;
  calendars: WritableCalendar[];
  onDone: () => void;
}) {
  const editing = target.kind === "edit" ? target : null;
  const [values, setValues] = useState<Values>(() => initialValues(target, calendars));
  // 고치기에서 설명을 건드리지 않았으면 보내지 않는다 — 구글에서 넣은 링크·서식을 지킨다.
  const [descriptionTouched, setDescriptionTouched] = useState(!editing);
  const [deleting, startDelete] = useTransition();
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const set = <K extends keyof Values>(key: K, value: Values[K]) =>
    setValues((current) => ({ ...current, [key]: value }));

  const [state, action, pending] = useActionState<ActionState, FormData>(
    async (prev, formData) => {
      const next = editing
        ? await updateEventAction(editing.ref.calendarId, editing.ref.eventId, prev, formData)
        : await createEventAction(prev, formData);
      // 화면 새로고침은 서버 액션이 한다(`refresh()`).
      if (!next.error) onDone();
      return next;
    },
    { error: null },
  );

  if (!editing && calendars.length === 0) {
    return (
      <div className="px-5 py-6 text-sm text-muted">
        일정을 넣을 수 있는 캘린더가 없다. 로그아웃했다가 다시 로그인해 캘린더
        권한에 동의했는지 확인해라.
      </div>
    );
  }

  const calendar = calendars.find((item) => item.id === values.calendarId);

  // 시작을 옮기면 끝이 시작보다 앞서지 않게 따라간다.
  const changeStartDate = (value: string) =>
    setValues((current) => ({
      ...current,
      startDate: value,
      endDate: current.endDate < value ? value : current.endDate,
    }));
  const changeStartTime = (value: string) =>
    setValues((current) => ({
      ...current,
      startTime: value,
      endTime:
        current.startDate === current.endDate && current.endTime <= value
          ? hourLater(value)
          : current.endTime,
    }));

  const remove = () => {
    if (!editing) return;
    const question = editing.ref.recurring
      ? "이 날짜의 일정만 지운다. 반복 전체는 남는다. 지울까?"
      : "이 일정을 지운다. 구글 캘린더에서도 사라진다. 지울까?";
    if (!window.confirm(question)) return;

    setDeleteError(null);
    startDelete(async () => {
      const result = await deleteEventAction(editing.ref.calendarId, editing.ref.eventId);
      if (result.error) setDeleteError(result.error);
      else onDone();
    });
  };

  const error = deleteError ?? state.error;
  const busy = pending || deleting;

  return (
    <form action={action}>
      <div className="flex flex-col gap-4 px-5 py-5">
        {editing?.ref.recurring ? (
          <p className="rounded-[3px] bg-canvas px-3 py-2 text-xs text-muted">
            반복 일정이다. 여기서 고치거나 지우면 <b>이 날짜 하나만</b> 바뀐다.
            반복 전체는 아래 &ldquo;구글에서 열기&rdquo;로 고친다.
          </p>
        ) : null}

        <Field label="제목" required>
          <input
            name="title"
            value={values.title}
            onChange={(event) => set("title", event.target.value)}
            placeholder="일정 제목"
            className="field w-full"
            required
            autoFocus={!editing}
          />
        </Field>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="allDay"
            checked={values.allDay}
            onChange={(event) => set("allDay", event.target.checked)}
          />
          종일
        </label>

        <div className="grid grid-cols-2 gap-4">
          <Field label="시작">
            <input
              name="startDate"
              type="date"
              value={values.startDate}
              onChange={(event) => changeStartDate(event.target.value)}
              className="field w-full"
              required
            />
            {values.allDay ? null : (
              <input
                name="startTime"
                type="time"
                value={values.startTime}
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
              value={values.endDate}
              min={values.startDate}
              onChange={(event) => set("endDate", event.target.value)}
              className="field w-full"
              required
            />
            {values.allDay ? null : (
              <input
                name="endTime"
                type="time"
                value={values.endTime}
                onChange={(event) => set("endTime", event.target.value)}
                className="field w-full"
                required
              />
            )}
          </Field>
        </div>

        <Field label="장소">
          <input
            name="location"
            value={values.location}
            onChange={(event) => set("location", event.target.value)}
            className="field w-full"
          />
        </Field>

        <Field label="설명">
          <textarea
            name={descriptionTouched ? "description" : undefined}
            rows={3}
            value={values.description}
            onChange={(event) => {
              setDescriptionTouched(true);
              set("description", event.target.value);
            }}
            className="field w-full resize-y"
          />
        </Field>

        <Field label="캘린더">
          {editing ? (
            // 캘린더를 옮기는 건 구글에서 한다. 반복 일정은 한 번만 옮길 수도 없다.
            <span className="field w-full bg-canvas text-muted">
              {calendar?.name ?? editing.ref.calendarId}
            </span>
          ) : (
            <select
              name="calendarId"
              value={values.calendarId}
              onChange={(event) => set("calendarId", event.target.value)}
              className="field w-full"
            >
              {calendars.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          )}
        </Field>

        <fieldset className="flex flex-col gap-1.5">
          <legend className="mb-1.5 text-xs font-semibold text-muted">색</legend>
          <input type="hidden" name="colorId" value={values.colorId} />
          <div className="flex flex-wrap gap-1.5">
            <Swatch
              hex={calendar?.color ?? "#8993a4"}
              name="캘린더 색"
              selected={values.colorId === ""}
              onSelect={() => set("colorId", "")}
              wide
            />
            {EVENT_COLORS.map((color) => (
              <Swatch
                key={color.id}
                hex={color.hex}
                name={color.name}
                selected={values.colorId === color.id}
                onSelect={() => set("colorId", color.id)}
              />
            ))}
          </div>
        </fieldset>
      </div>

      <div className="border-t border-line px-5 py-3">
        {error ? <p className="mb-2 text-sm text-danger">{error}</p> : null}
        <div className="flex flex-wrap items-center gap-2">
          {editing ? (
            <button
              type="button"
              onClick={remove}
              disabled={busy}
              className="btn text-danger"
            >
              {deleting ? "지우는 중" : "삭제"}
            </button>
          ) : null}
          <a
            href={editing ? (editing.event.href ?? "#") : googleTemplateUrl(values)}
            target="_blank"
            rel="noreferrer"
            className="text-xs text-muted hover:text-ink hover:underline"
          >
            {editing ? "구글에서 열기 ↗" : "반복·알림은 구글에서 ↗"}
          </a>
          <span className="flex-1" />
          <button type="button" onClick={onDone} className="btn">
            취소
          </button>
          <button type="submit" disabled={busy} className="btn-primary">
            {pending ? (editing ? "저장 중" : "만드는 중") : editing ? "저장" : "만들기"}
          </button>
        </div>
      </div>
    </form>
  );
}

/** 고칠 수 없는 일정. 내용만 보여주고 구글로 가는 길을 남긴다. */
function EventDetails({ event, onDone }: { event: PortalEvent; onDone: () => void }) {
  const holiday = event.type === "공휴일" || event.type === "기념일";
  const description = plainText(event.description ?? "");

  return (
    <div>
      <div className="flex flex-col gap-3 px-5 py-5">
        <div className="flex items-start gap-2">
          <span
            aria-hidden
            className="mt-1.5 h-3 w-3 shrink-0 rounded-[2px]"
            style={{ background: event.color ?? "#8993a4" }}
          />
          <p className="text-base font-semibold">{event.title}</p>
        </div>
        <p className="text-sm">{whenLabel(event)}</p>
        {event.location ? <p className="text-sm text-muted">장소 · {event.location}</p> : null}
        {description ? <p className="text-sm whitespace-pre-wrap">{description}</p> : null}
        <p className="text-xs text-faint">
          {holiday
            ? `${event.type}은 구글 공휴일 캘린더가 정한다. 고칠 수 없다.`
            : "초대받은 일정이거나 쓰기 권한이 없는 캘린더라 여기서 고칠 수 없다."}
        </p>
      </div>
      <div className="flex items-center justify-end gap-2 border-t border-line px-5 py-3">
        {event.href && !holiday ? (
          <a
            href={event.href}
            target="_blank"
            rel="noreferrer"
            className="mr-auto text-xs text-muted hover:text-ink hover:underline"
          >
            구글에서 열기 ↗
          </a>
        ) : null}
        <button type="button" onClick={onDone} className="btn">
          닫기
        </button>
      </div>
    </div>
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
function googleTemplateUrl(form: Values): string {
  const compact = (date: string) => date.replaceAll("-", "");
  const dates = form.allDay
    ? `${compact(form.startDate)}/${compact(addDays(form.endDate, 1))}`
    : `${compact(form.startDate)}T${form.startTime.replace(":", "")}00/` +
      `${compact(form.endDate)}T${form.endTime.replace(":", "")}00`;

  const url = new URL("https://calendar.google.com/calendar/render");
  url.searchParams.set("action", "TEMPLATE");
  url.searchParams.set("text", form.title);
  url.searchParams.set("dates", dates);
  url.searchParams.set("ctz", SEOUL);
  if (form.location) url.searchParams.set("location", form.location);
  if (form.description) url.searchParams.set("details", form.description);
  if (form.calendarId) url.searchParams.set("src", form.calendarId);
  return url.toString();
}
