/**
 * 포털을 쓸 수 있는 사람 목록.
 *
 * ┌───────────────────────────────────────────────────────────┐
 * │  여기 이메일 두 줄만 실제 구글 계정으로 바꾸면 된다.        │
 * │  여기 없는 이메일은 로그인이 거부된다.                      │
 * └───────────────────────────────────────────────────────────┘
 *
 * 이름은 Airtable `할일.담당자` 단일선택 값과 글자까지 똑같아야 한다.
 * 다르면 "내 할 일"이 빈 목록으로 나온다.
 */
export const MEMBERS = {
  "info@open-garden.co.kr": "이시형",
  "jun@open-garden.co.kr": "배병준",
} as const satisfies Record<string, string>;

/** Airtable `할일.담당자`가 가질 수 있는 값 */
export type MemberName = (typeof MEMBERS)[keyof typeof MEMBERS];

/** 로그인한 이메일 → 담당자 이름. 목록에 없으면 null */
export function memberNameOf(email: string | null | undefined): MemberName | null {
  if (!email) return null;
  const name = MEMBERS[email.toLowerCase() as keyof typeof MEMBERS];
  return name ?? null;
}

/**
 * 매출 > 마진 화면을 볼 수 있는 사람(2026-11-06 사용자 요청: "접근 나만").
 * 포털 화면만 막는다 — Airtable 표 자체는 두 사람 다 연다.
 */
export const ADMIN_MEMBERS: readonly MemberName[] = ["이시형"];

export const isAdmin = (member: string | null | undefined) =>
  !!member && (ADMIN_MEMBERS as readonly string[]).includes(member);
