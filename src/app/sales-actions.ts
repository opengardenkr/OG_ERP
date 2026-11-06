"use server";

import { isAdmin } from "@/config/users";
import { recordPayment, saveCosts } from "@/lib/airtable/sales";
import { auth } from "@/lib/auth";
import { todayInSeoul } from "@/lib/date";

export type SalesActionState = { error: string | null; done?: string };

/** 서버 액션은 누구나 부를 수 있는 입구다. 매번 세션을 확인한다. */
async function member() {
  const session = await auth();
  const name = session?.user.member;
  if (!name) throw new Error("로그인이 필요합니다.");
  return name;
}

const REC = /^rec[A-Za-z0-9]{14}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export async function recordPaymentAction(_prev: SalesActionState, form: FormData): Promise<SalesActionState> {
  const who = await member();
  const id = String(form.get("id") ?? "");
  if (!REC.test(id)) return { error: "잘못된 요청입니다." };
  const amount = Number(String(form.get("amount") ?? "").replace(/[,\s₩원]/g, ""));
  const date = String(form.get("date") ?? "").trim() || todayInSeoul();
  if (!DATE.test(date) || Number.isNaN(Date.parse(date))) return { error: "입금일을 확인해 주세요." };
  if (date > todayInSeoul()) return { error: "입금일이 오늘보다 뒤입니다." };
  const result = await recordPayment(id, amount, date, who);
  return result.ok ? { error: null, done: result.data.payState === "완납" ? "완납 처리했습니다." : "입금을 기록했습니다." } : { error: result.message };
}

export async function saveCostsAction(_prev: SalesActionState, form: FormData): Promise<SalesActionState> {
  const who = await member();
  if (!isAdmin(who)) return { error: "마진은 대표만 고칠 수 있습니다." };
  const id = String(form.get("id") ?? "");
  if (!REC.test(id)) return { error: "잘못된 요청입니다." };
  const input: Record<string, string> = {};
  for (const [k, v] of form.entries()) if (k.startsWith("cost:")) input[k.slice(5)] = String(v);
  const result = await saveCosts(id, input);
  return result.ok ? { error: null, done: "원가를 저장했습니다." } : { error: result.message };
}
