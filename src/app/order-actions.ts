"use server";

import { redirect } from "next/navigation";
import { readEditLines } from "@/lib/order-program";
import {
  adoptLink, deductStock, deleteProgram, deployLink, editOrderQuote, mergeOrders, refreshProgram, setLinkStatus, setProgramStatus,
} from "@/lib/airtable/order-programs";
import { auth } from "@/lib/auth";

export type OrderActionState = { error: string | null; done?: string; url?: string };

/** 서버 액션은 누구나 부를 수 있는 입구다. 매번 세션을 확인한다. */
async function member() {
  const session = await auth();
  const name = session?.user.member;
  if (!name) throw new Error("로그인이 필요합니다.");
  return name;
}

const REC = /^rec[A-Za-z0-9]{14}$/;
const id = (form: FormData, key: string) => {
  const v = String(form.get(key) ?? "");
  if (!REC.test(v)) throw new Error("잘못된 요청입니다.");
  return v;
};
const run = async (fn: () => Promise<OrderActionState>): Promise<OrderActionState> => {
  try {
    return await fn();
  } catch (e) {
    return { error: e instanceof Error ? e.message : "처리하지 못했습니다." };
  }
};

export async function deployLinkAction(_prev: OrderActionState, form: FormData): Promise<OrderActionState> {
  return run(async () => {
    const who = await member();
    const customer = String(form.get("customer") ?? "").trim().slice(0, 60);
    const phone = String(form.get("phone") ?? "").trim().slice(0, 30);
    if (!customer) return { error: "회사 이름을 적어 주세요." };
    if (phone && phone.replace(/\D/g, "").length < 9) return { error: "연락처를 확인해 주세요." };
    const r = await deployLink(id(form, "program"), { customer, phone, title: String(form.get("title") ?? "").trim().slice(0, 60) }, who);
    return r.ok ? { error: null, done: `${customer} 링크를 만들었습니다.`, url: r.data.url } : { error: r.message };
  });
}

export async function linkStatusAction(_prev: OrderActionState, form: FormData): Promise<OrderActionState> {
  return run(async () => {
    await member();
    const status = form.get("status") === "마감" ? "마감" : "사용";
    const r = await setLinkStatus(id(form, "link"), status);
    return r.ok ? { error: null, done: status === "마감" ? "링크를 닫았습니다." : "링크를 다시 열었습니다." } : { error: r.message };
  });
}

export async function programStatusAction(_prev: OrderActionState, form: FormData): Promise<OrderActionState> {
  return run(async () => {
    await member();
    const status = form.get("status") === "보관" ? "보관" : "사용";
    const r = await setProgramStatus(id(form, "program"), status);
    return r.ok ? { error: null, done: status === "보관" ? "보관했습니다." : "다시 꺼냈습니다." } : { error: r.message };
  });
}

export async function refreshStockAction(_prev: OrderActionState, form: FormData): Promise<OrderActionState> {
  return run(async () => {
    await member();
    const r = await refreshProgram(id(form, "program"));
    return r.ok ? { error: null, done: `지금 재고로 바꿨습니다 (링크 ${r.data}개).` } : { error: r.message };
  });
}

export async function mergeOrdersAction(_prev: OrderActionState, form: FormData): Promise<OrderActionState> {
  return run(async () => {
    const who = await member();
    const r = await mergeOrders(id(form, "link"), who);
    if (!r.ok) return { error: r.message };
    return { error: null, done: r.data.created ? `주문 ${r.data.orders}건을 ${r.data.number}로 합쳤습니다.` : `견적 ${r.data.number} (주문 ${r.data.orders}건)` };
  });
}

export async function deductStockAction(_prev: OrderActionState, form: FormData): Promise<OrderActionState> {
  return run(async () => {
    const who = await member();
    const r = await deductStock(id(form, "link"), who);
    if (!r.ok) return { error: r.message };
    return { error: null, done: `재고 ${r.data.lines}품목을 뺐습니다.${r.data.unmatched.length ? ` 못 맞춘 줄: ${r.data.unmatched.join(", ")}` : ""}` };
  });
}

export async function adoptLinkAction(_prev: OrderActionState, form: FormData): Promise<OrderActionState> {
  let target = "";
  const state = await run(async () => {
    const r = await adoptLink(id(form, "link"), await member());
    if (!r.ok) return { error: r.message };
    target = r.data.id;
    return { error: null };
  });
  // redirect는 예외로 동작하므로 try 밖에서 부른다
  if (target) redirect(`/catalog/${target}`);
  return state;
}

/** 주문 뒤 카톡·전화로 바뀐 내용 → 그 회사 견적(작성이면 그대로, 보냈으면 수정본) */
export async function editOrderAction(_prev: OrderActionState, form: FormData): Promise<OrderActionState> {
  return run(async () => {
    const who = await member();
    const reason = String(form.get("reason") ?? "").replace(/[\x00-\x1f]/g, " ").trim().slice(0, 200);
    if (!reason) return { error: "무엇이 바뀌었는지 한 줄 적어 주세요. 예: 11/6 카톡 — 세일러맨 2크레이트 추가" };
    let raw: unknown = null;
    try { raw = JSON.parse(String(form.get("lines") ?? "[]")); } catch { raw = null; }
    const lines = readEditLines(raw);
    if (!lines.ok) return { error: lines.message };
    const r = await editOrderQuote(id(form, "link"), lines.lines, reason, who);
    if (!r.ok) return { error: r.message };
    return { error: null, done: r.data.created ? `수정본 ${r.data.number}을 만들었습니다. 고객에게 다시 보내 주세요.` : `견적 ${r.data.number}에 반영했습니다.` };
  });
}

/** 보관한 주문서 지우기. 지우면 목록으로 돌아간다. */
export async function deleteProgramAction(_prev: OrderActionState, form: FormData): Promise<OrderActionState> {
  let done = false;
  const state = await run(async () => {
    await member();
    const r = await deleteProgram(id(form, "program"));
    if (!r.ok) return { error: r.message };
    done = true;
    return { error: null };
  });
  if (done) redirect("/catalog");
  return state;
}
