import "server-only";

import { getTodosWithDueDate } from "@/lib/airtable/todos";
import type { PortalEvent } from "@/lib/calendar/types";
import { eventDate } from "@/lib/calendar/types";
import { categoryHex } from "@/lib/labels";

/**
 * 할 일을 일정으로 바꾼다.
 *
 * 구글로 밀어넣지 않는다. 읽을 때 합칠 뿐이다. (원칙 9)
 *
 * **시작일이 있으면 시작일부터 마감일까지 기간으로 그린다.**
 * 사흘 걸리는 일이 마감일 하루로만 찍히면, 그 일이 언제부터 잡혀 있는지
 * 달력에서 알 수 없다. 시작일이 없으면 마감일 하루짜리로 둔다.
 */
export async function getTodoEvents(
  from: Date,
  to: Date,
): Promise<PortalEvent[]> {
  const result = await getTodosWithDueDate();
  if (!result.ok) throw new Error(result.message);

  const start = eventDate(from.toISOString());
  const end = eventDate(to.toISOString());

  return result.data
    .filter((todo) => {
      if (todo.due === null) return false;
      // 기간이 조회 범위와 겹치면 그린다. 시작만 밖에 있어도 보여야 한다.
      const from = todo.start && todo.start < todo.due ? todo.start : todo.due;
      return from <= end && todo.due >= start;
    })
    .map((todo) => ({
      id: `todo:${todo.id}`,
      title: todo.status === "완료" ? `✓ ${todo.title}` : todo.title,
      start: todo.start && todo.start < (todo.due as string) ? todo.start : (todo.due as string),
      end: todo.due as string,
      allDay: true,
      source: "airtable" as const,
      type: "할일" as const,
      owner: todo.owner,
      description: todo.memo,
      href: `/todos/${todo.id}`,
      color: categoryHex(todo.category),
    }));
}
