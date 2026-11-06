import { redirect } from "next/navigation";

/** 일정 화면은 없앴다(2026-11-06). 일정은 대시보드의 이번 주/다음 주 달력에서 보고 등록한다. */
export default function Page() {
  redirect("/");
}
