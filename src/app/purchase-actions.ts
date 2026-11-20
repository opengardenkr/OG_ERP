"use server";

import {
  createPurchaseOrder,
  setPurchaseStatus,
  trashPurchaseOrder,
  updatePurchaseOrder,
} from "@/lib/airtable/purchase-orders";
import { auth } from "@/lib/auth";
import { checkPoInput, isPoStatus } from "@/lib/purchase-order";

export type PurchaseActionState = { error: string | null; id?: string };

/** 서버 액션은 누구나 부를 수 있는 입구다. 매번 세션을 확인한다. */
async function requireMember(): Promise<string> {
  const session = await auth();
  const member = session?.user.member;
  if (!member) throw new Error("로그인이 필요하다");
  return member;
}

const RECORD_ID = /^rec[A-Za-z0-9]{14}$/;
const message = (error: unknown, fallback: string) => (error instanceof Error ? error.message : fallback);

/** 만들기(id 없음) / 고치기. 화면은 JSON 한 덩어리로 보낸다 — 품목 줄이 많아 FormData로는 다루기 번거롭다. */
export async function savePurchaseOrderAction(id: string | null, json: string): Promise<PurchaseActionState> {
  const member = await requireMember();
  if (id !== null && !RECORD_ID.test(id)) return { error: "잘못된 발주서다." };
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return { error: "보낸 내용을 읽지 못했다." };
  }
  const input = checkPoInput(raw);
  if ("error" in input) return { error: input.error };

  try {
    if (id === null) return { error: null, id: await createPurchaseOrder(input, member) };
    if (!(await updatePurchaseOrder(id, input, member))) return { error: "발주서를 찾지 못했다(삭제됐을 수 있다)." };
    return { error: null, id };
  } catch (error) {
    return { error: message(error, "저장하지 못했다.") };
  }
}

export async function setPurchaseStatusAction(id: string, status: string): Promise<PurchaseActionState> {
  const member = await requireMember();
  if (!RECORD_ID.test(id)) return { error: "잘못된 발주서다." };
  if (!isPoStatus(status)) return { error: "없는 상태다." };
  try {
    if (!(await setPurchaseStatus(id, status, member))) return { error: "발주서를 찾지 못했다." };
    return { error: null, id };
  } catch (error) {
    return { error: message(error, "바꾸지 못했다.") };
  }
}

export async function trashPurchaseOrderAction(id: string): Promise<PurchaseActionState> {
  const member = await requireMember();
  if (!RECORD_ID.test(id)) return { error: "잘못된 발주서다." };
  try {
    if (!(await trashPurchaseOrder(id, member))) return { error: "발주서를 찾지 못했다." };
    return { error: null, id };
  } catch (error) {
    return { error: message(error, "지우지 못했다.") };
  }
}
