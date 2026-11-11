"use server";

import { SHORT_LINK_ORIGIN } from "@/config/site";
import { addLink, codeTaken, editLink, setLinkActive } from "@/lib/airtable/links";
import { auth } from "@/lib/auth";
import { LINK_CATEGORIES, normalizeCode, randomCode, targetProblem, type LinkCategory } from "@/lib/link-stats";

export type LinkActionState = { error: string | null; done?: boolean; id?: string };

async function requireMember(): Promise<string> {
  const session = await auth();
  const member = session?.user.member;
  if (!member) throw new Error("로그인이 필요하다");
  return member;
}

const RECORD_ID = /^rec[A-Za-z0-9]{14}$/;

function readCommon(formData: FormData):
  | { error: string }
  | { name: string; target: string; category: LinkCategory; memo: string } {
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "링크 이름을 적어라." };
  const target = String(formData.get("target") ?? "").trim();
  const problem = targetProblem(target, SHORT_LINK_ORIGIN);
  if (problem) return { error: problem };
  const category = String(formData.get("category") ?? "");
  if (!(LINK_CATEGORIES as readonly string[]).includes(category)) return { error: "분류를 골라라." };
  return { name, target, category: category as LinkCategory, memo: String(formData.get("memo") ?? "").trim() };
}

export async function createLinkAction(formData: FormData): Promise<LinkActionState> {
  const author = await requireMember();
  const common = readCommon(formData);
  if ("error" in common) return { error: common.error };

  try {
    const wanted = String(formData.get("code") ?? "").trim();
    let code: string;
    if (wanted) {
      const normalized = normalizeCode(wanted);
      if (!normalized) return { error: "짧은 주소는 영문 소문자·숫자·하이픈 3~32자로 적어라." };
      if (await codeTaken(normalized)) return { error: "이미 쓰는 짧은 주소다. 다른 것으로 적어라." };
      code = normalized;
    } else {
      code = randomCode();
      for (let i = 0; i < 4 && (await codeTaken(code)); i += 1) code = randomCode();
    }
    const id = await addLink({ ...common, code, author });
    return { error: null, done: true, id };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "만들지 못했다." };
  }
}

export async function updateLinkAction(id: string, formData: FormData): Promise<LinkActionState> {
  await requireMember();
  if (!RECORD_ID.test(id)) return { error: "잘못된 링크다." };
  const common = readCommon(formData);
  if ("error" in common) return { error: common.error };
  try {
    await editLink(id, common);
    return { error: null, done: true, id };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "고치지 못했다." };
  }
}

export async function setLinkActiveAction(id: string, active: boolean): Promise<LinkActionState> {
  await requireMember();
  if (!RECORD_ID.test(id)) return { error: "잘못된 링크다." };
  try {
    await setLinkActive(id, active);
    return { error: null, done: true, id };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "바꾸지 못했다." };
  }
}
