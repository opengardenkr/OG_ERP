"use server";

import { isAdmin } from "@/config/users";
import { cancelEntry, recordEntry, saveCosts } from "@/lib/airtable/sales";
import { PAY_KINDS, PAY_METHODS, type PayKind } from "@/lib/sales";
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

const clean = (v: FormDataEntryValue | null, max: number) => String(v ?? "").replace(/[\x00-\x1f]/g, " ").trim().slice(0, max);

/** 장부 한 줄: 입금(나눠 받기) · 환불(차액 돌려주기) · 조정(끝전·에누리). 날짜는 비워도 된다(옛 건 정리). */
export async function recordEntryAction(_prev: SalesActionState, form: FormData): Promise<SalesActionState> {
  try {
    const who = await member();
    const id = String(form.get("id") ?? "");
    if (!REC.test(id)) return { error: "잘못된 요청입니다." };
    const kind = String(form.get("kind") ?? "입금") as PayKind;
    if (!(PAY_KINDS as readonly string[]).includes(kind)) return { error: "구분을 골라 주세요." };
    const amount = Number(String(form.get("amount") ?? "").replace(/[,\s₩원]/g, ""));
    const date = String(form.get("date") ?? "").trim();
    if (date && (!DATE.test(date) || Number.isNaN(Date.parse(date)))) return { error: "날짜를 확인해 주세요." };
    if (date > todayInSeoul()) return { error: "날짜가 오늘보다 뒤입니다." };
    const method = String(form.get("method") ?? "");
    const r = await recordEntry(id, {
      kind, amount, date, method: (PAY_METHODS as readonly string[]).includes(method) ? method : "", memo: clean(form.get("memo"), 200),
      over: form.get("over") === "on",
    }, who);
    if (!r.ok) return { error: r.message };
    const { balance, overpaid } = r.data;
    return { error: null, done: `${kind}을 적었습니다. ${overpaid ? `돌려줄 돈 ₩${overpaid.toLocaleString("ko-KR")}` : balance ? `남은 돈 ₩${balance.toLocaleString("ko-KR")}` : "다 받았습니다."}` };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "저장하지 못했습니다." };
  }
}

export async function cancelEntryAction(_prev: SalesActionState, form: FormData): Promise<SalesActionState> {
  try {
    const who = await member();
    const id = String(form.get("id") ?? "");
    if (!REC.test(id)) return { error: "잘못된 요청입니다." };
    const r = await cancelEntry(id, who);
    return r.ok ? { error: null, done: "취소했습니다." } : { error: r.message };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "취소하지 못했습니다." };
  }
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
