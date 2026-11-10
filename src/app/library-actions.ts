"use server";

import {
  addLibraryItem,
  LIBRARY_CATEGORIES,
  removeLibraryItem,
  type LibraryCategory,
} from "@/lib/airtable/library";
import { auth } from "@/lib/auth";

export type LibraryActionState = { error: string | null; done?: boolean };

/** Airtable 첨부 업로드 한도. 넘으면 PDF를 압축해서 올린다. */
const MAX_BYTES = 5 * 1024 * 1024;

async function requireMember(): Promise<string> {
  const session = await auth();
  const member = session?.user.member;
  if (!member) throw new Error("로그인이 필요하다");
  return member;
}

export async function uploadLibraryAction(
  _prev: LibraryActionState,
  formData: FormData,
): Promise<LibraryActionState> {
  const author = await requireMember();

  const title = String(formData.get("title") ?? "").trim();
  if (!title) return { error: "자료 제목을 적어라." };

  const category = String(formData.get("category") ?? "");
  if (!(LIBRARY_CATEGORIES as readonly string[]).includes(category)) {
    return { error: "분류를 골라라." };
  }

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "파일을 골라라." };
  if (file.size > MAX_BYTES) return { error: "5MB까지 올릴 수 있다. PDF를 줄여서 다시 올려라." };

  try {
    await addLibraryItem({
      title,
      description: String(formData.get("description") ?? "").trim(),
      category: category as LibraryCategory,
      author,
      file,
    });
    return { error: null, done: true };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "올리지 못했다." };
  }
}

export async function deleteLibraryAction(id: string): Promise<LibraryActionState> {
  await requireMember();
  try {
    await removeLibraryItem(id);
    return { error: null, done: true };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "지우지 못했다." };
  }
}
