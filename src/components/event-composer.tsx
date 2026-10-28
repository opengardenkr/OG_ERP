"use client";

import { createContext, useActionState, useContext, useState } from "react";

import { createEventAction, deleteEventAction, type ActionState } from "@/app/calendar-actions";
import { Modal } from "@/components/modal";
import { EVENT_COLORS } from "@/lib/calendar/colors";
import { eventDate, eventRange, type PortalEvent, type WritableCalendar } from "@/lib/calendar/types";

/**
 * 일정 등록 창. 포털을 떠나지 않고 구글 캘린더에 일정을 넣는다.
 *
 * 화면 어디서든(버튼, 달력 칸) `open()`으로 연다. 달력 칸에서 열면
 * 그 날짜·시각이 채워져 있다 — 날짜를 다시 고르게 하지 않는다.
 * 편집·삭제도 같은 창에서 처리하고 원본 데이터는 Google에 유지한다.
 */

type Draft = { date: string; hour?: number; allDay: boolean; event?: PortalEvent };

const ComposerContext = createContext<((draft?: Partial<Draft>) => void) | null>(null);

function todayInSeoul(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date());
}

const pad = (n: number) => String(n).padStart(2, "0");

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
    setDraft({ date: next?.date ?? todayInSeoul(), hour: next?.hour, allDay: next?.allDay ?? false, event: next?.event });
    setSerial((n) => n + 1);
  };
  const close = () => setDraft(null);

  return (
    <ComposerContext.Provider value={open}>
      {children}
      <Modal open={draft !== null} onClose={close} title={draft?.event ? "일정 상세·수정" : "일정 만들기"} width="max-w-xl">
        {draft ? (
          <EventForm key={serial} draft={draft} calendars={calendars} onDone={close} />
        ) : null}
      </Modal>
    </ComposerContext.Provider>
  );
}

export function OpenEventButton({ event, className }: { event: PortalEvent; className?: string }) {
  const open = useContext(ComposerContext);
  return <button type="button" className={`text-left ${className ?? ""}`} onClick={() => open?.({ event, date: eventDate(event.start), allDay: event.allDay })} title={event.title}>{event.title}</button>;
}

/** [일정 추가] 버튼. 창은 오늘 날짜로 열린다. */
export function ComposeButton({
  className = "btn-primary",
  children = "일정 추가",
  date,
}: {
  className?: string;
  children?: React.ReactNode;
  date?: string;
}) {
  const open = useContext(ComposerContext);
  if (!open) return null;
  return (
    <button type="button" onClick={() => open(date ? { date } : undefined)} className={className}>
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
  const existing = draft.event;
  const editable = !existing || (existing.google?.editable && calendars.some(c => c.id === existing.google?.calendarId));
  const clock = (iso: string) => new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(iso));
  const firstTime = `${pad(draft.hour ?? 9)}:00`;
  const [title, setTitle] = useState(existing?.title ?? "");
  const [allDay, setAllDay] = useState(draft.allDay);
  const [startDate, setStartDate] = useState(draft.date);
  const [endDate, setEndDate] = useState(existing ? eventRange(existing).end : draft.date);
  const [startTime, setStartTime] = useState(existing && !existing.allDay ? clock(existing.start) : firstTime);
  const [endTime, setEndTime] = useState(existing?.end && !existing.allDay ? clock(existing.end) : hourLater(firstTime));
  const [location, setLocation] = useState(existing?.location ?? "");
  const [description, setDescription] = useState(existing?.description ?? "");
  const [calendarId, setCalendarId] = useState(existing?.google?.calendarId ?? calendars[0]?.id ?? "");
  const [colorId, setColorId] = useState(existing?.google?.colorId ?? "");
  const [confirmDelete, setConfirmDelete] = useState(false);

  const [state, action, pending] = useActionState<ActionState, FormData>(
    async (prev, formData) => {
      const next = formData.get("operation") === "delete" ? await deleteEventAction(formData) : await createEventAction(prev, formData);
      // 화면 새로고침은 서버 액션이 한다(`refresh()`).
      if (!next.error) onDone();
      return next;
    },
    { error: null },
  );

  if (!editable) {
    return <div className="space-y-3 p-5 text-sm"><h3 className="font-semibold">{existing?.title}</h3><p>{existing ? eventRange(existing).start : ""} ~ {existing ? eventRange(existing).end : ""} (한국 시간)</p>{existing && !existing.allDay ? <p>{clock(existing.start)} ~ {existing.end ? clock(existing.end) : ""}</p> : null}<p>{existing?.location}</p><p className="whitespace-pre-wrap">{existing?.description}</p><p className="text-muted">읽기 전용 일정입니다. 수정 권한이 있는 캘린더의 일정만 편집할 수 있습니다.</p><button type="button" className="btn" onClick={onDone}>닫기</button></div>;
  }
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
      {existing?.google ? <><input type="hidden" name="eventId" value={existing.google.eventId} /><input type="hidden" name="etag" value={existing.google.etag} /><input type="hidden" name="calendarId" value={calendarId} /></> : null}
      <input type="hidden" name="confirmed" value={confirmDelete ? "yes" : "no"} />
      <fieldset disabled={pending || confirmDelete} className="flex flex-col gap-4 px-5 py-5">
        <p className="text-xs text-muted">시간대: Asia/Seoul · Google 캘린더에 저장됩니다.{existing?.google?.recurring ? " 반복 일정 중 이 회차만 변경합니다." : ""}</p>
        <Field label="제목" required>
          <input
            name="title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            maxLength={300}
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
            maxLength={1000}
            name="location"
            value={location}
            onChange={(event) => setLocation(event.target.value)}
            className="field w-full"
          />
        </Field>

        <Field label="설명">
          <textarea
            maxLength={8000}
            name="description"
            rows={3}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            className="field w-full resize-y"
          />
        </Field>

        <Field label="캘린더">
          <select
            disabled={Boolean(existing)}
            name={existing ? undefined : "calendarId"}
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
      </fieldset>

      <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line px-5 py-3">
        {state.error ? <span role="alert" className="mr-auto text-sm text-danger">{state.error}</span> : null}
        {existing && !confirmDelete ? <button type="button" disabled={pending} className="btn mr-auto text-danger" onClick={() => setConfirmDelete(true)}>일정 삭제</button> : null}
        {confirmDelete ? <div role="alert" className="w-full space-y-2"><p className="text-sm">“{title}” 일정을 삭제할까요?{existing?.google?.recurring ? " 반복 일정 중 이 회차만 삭제합니다." : ""} Google 캘린더에서도 삭제됩니다.</p><button type="button" className="btn" disabled={pending} onClick={() => setConfirmDelete(false)}>돌아가기</button><button type="submit" name="operation" value="delete" disabled={pending} formNoValidate className="btn text-danger">{pending ? "삭제 중…" : "삭제 확인"}</button></div> : null}
        <button type="button" onClick={onDone} disabled={pending} className="btn">
          취소
        </button>
        <button type="submit" name="operation" value="save" disabled={pending || confirmDelete} className="btn-primary">
          {pending ? "저장 중…" : existing ? "변경 저장" : "만들기"}
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
