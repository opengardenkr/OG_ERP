import { redirect } from "next/navigation";

/** 옛 주소. 속명 제안서가 유일한 제안서가 되어 /proposal 로 옮겼다(2026-11-06). */
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(await searchParams)) if (typeof value === "string") params.set(key, value);
  redirect(params.size ? `/proposal?${params}` : "/proposal");
}
