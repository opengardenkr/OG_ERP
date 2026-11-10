"use server";

import { addBizCert, removeBizCert, saveTaxInfo } from "@/lib/airtable/clients";
import { auth } from "@/lib/auth";
import { bizNoDigits, bizNoValid } from "@/lib/client-types";

export type ClientActionState = { error: string | null; done?: string };

/** 서버 액션은 누구나 부를 수 있는 입구다. 매번 세션을 확인한다. */
async function member() {
  const session = await auth();
  const name = session?.user.member;
  if (!name) throw new Error("로그인이 필요합니다.");
  return name;
}

const REC = /^rec[A-Za-z0-9]{14}$/;
const ATT = /^att[A-Za-z0-9]{14}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** Airtable 첨부 업로드 한도 5MB. */
const MAX_BYTES = 5 * 1024 * 1024;
const OK_TYPES = /^(image\/(jpeg|png|webp|heic|heif)|application\/pdf)$/;

const clean = (v: FormDataEntryValue | null, max: number) => String(v ?? "").replace(/[\x00-\x1f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);

/** 세금계산서용 사업자 정보 저장. 등록번호가 검증 규칙에 안 맞으면 경고만 하고 저장은 한다(확인 체크 없이도). */
export async function saveTaxInfoAction(_prev: ClientActionState, form: FormData): Promise<ClientActionState> {
  try {
    await member();
    const id = String(form.get("id") ?? "");
    if (!REC.test(id)) return { error: "잘못된 요청입니다." };
    const input = {
      bizNo: clean(form.get("bizNo"), 20), bizName: clean(form.get("bizName"), 100), ceo: clean(form.get("ceo"), 60),
      address: clean(form.get("address"), 200), bizType: clean(form.get("bizType"), 100), bizItem: clean(form.get("bizItem"), 100),
      invoiceEmail: clean(form.get("invoiceEmail"), 120),
    };
    const digits = bizNoDigits(input.bizNo);
    if (input.bizNo && digits.length !== 10) return { error: "사업자등록번호는 숫자 10자리입니다." };
    if (input.invoiceEmail && !EMAIL.test(input.invoiceEmail)) return { error: "계산서 이메일 모양을 확인해 주세요." };
    const r = await saveTaxInfo(id, input);
    if (!r.ok) return { error: r.message };
    return { error: null, done: input.bizNo && !bizNoValid(input.bizNo) ? "저장했습니다. 다만 등록번호가 검증 규칙에 맞지 않습니다 — 등록증과 한 번 더 대조해 주세요." : "저장했습니다." };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "저장하지 못했습니다." };
  }
}

/** 사업자등록증 올리기(사진·PDF, 5MB까지). */
export async function uploadBizCertAction(_prev: ClientActionState, form: FormData): Promise<ClientActionState> {
  try {
    await member();
    const id = String(form.get("id") ?? "");
    if (!REC.test(id)) return { error: "잘못된 요청입니다." };
    const file = form.get("file");
    if (!(file instanceof File) || file.size === 0) return { error: "파일을 골라 주세요." };
    if (file.size > MAX_BYTES) return { error: "5MB까지 올릴 수 있습니다. 사진을 줄이거나 PDF를 압축해 주세요." };
    if (file.type && !OK_TYPES.test(file.type)) return { error: "사진(JPG·PNG) 또는 PDF만 올릴 수 있습니다." };
    const r = await addBizCert(id, file);
    return r.ok ? { error: null, done: "올렸습니다." } : { error: r.message };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "올리지 못했습니다." };
  }
}

/** 잘못 올린 사업자등록증 빼기. 화면에서 한 번 더 묻는다. */
export async function removeBizCertAction(_prev: ClientActionState, form: FormData): Promise<ClientActionState> {
  try {
    await member();
    const id = String(form.get("id") ?? "");
    const att = String(form.get("att") ?? "");
    if (!REC.test(id) || !ATT.test(att)) return { error: "잘못된 요청입니다." };
    const r = await removeBizCert(id, att);
    return r.ok ? { error: null, done: "뺐습니다." } : { error: r.message };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "빼지 못했습니다." };
  }
}
