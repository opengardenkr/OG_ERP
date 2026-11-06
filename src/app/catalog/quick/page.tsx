import { redirect } from "next/navigation";

/** '현장 빠른등록'은 품종 관리와 같은 표에 같은 일을 해서 합쳤다(2026-11-06). */
export default function Page() {
  redirect("/catalog/manage");
}
