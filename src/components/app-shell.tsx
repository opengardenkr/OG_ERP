import { Nav } from "@/components/nav";
import { UpdateNotice } from "@/components/update-notice";
import { getAppRelease } from "@/lib/app-release";
import { auth, signOut } from "@/lib/auth";

/**
 * 로그인한 화면의 공통 틀. 사이드바 + 본문.
 * 좁은 화면에서는 사이드바가 위쪽 가로 막대가 된다.
 * 로그인 화면은 이 틀을 쓰지 않는다.
 */
export async function AppShell({
  title,
  subtitle,
  action,
  children,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  const session = await auth();

  return (
    <div className="mx-auto flex w-full max-w-[1180px] flex-col gap-5 px-4 py-5 sm:flex-row sm:gap-6">
      <aside className="sm:sticky sm:top-5 sm:flex sm:h-[calc(100vh-40px)] sm:w-[200px] sm:shrink-0 sm:flex-col sm:border-r sm:border-line sm:pr-4">
        <div className="mb-4 flex items-center gap-2">
          <span className="inline-flex h-[22px] w-[22px] items-center justify-center rounded-[3px] bg-brand-600 text-xs font-bold text-white">
            O
          </span>
          <span className="text-sm font-bold">오픈가든</span>
        </div>

        <Nav />

        <div className="mt-4 flex items-center gap-2 border-t border-line pt-3.5 sm:mt-auto">
          <span className="inline-flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full bg-brand-600 text-[11px] font-semibold text-white">
            {session?.user.member?.slice(0, 1) ?? "?"}
          </span>
          <div>
            <p className="text-xs font-semibold">{session?.user.member}</p>
            <form
              data-og-ignore-draft
              action={async () => {
                "use server";
                await signOut({ redirectTo: "/login" });
              }}
            >
              <button type="submit" className="text-[11px] text-muted hover:text-ink">
                로그아웃
              </button>
            </form>
          </div>
        </div>
        <UpdateNotice current={getAppRelease()} />
      </aside>

      <main className="min-w-0 flex-1">
        <header className="mb-[18px] flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold">{title}</h1>
            {subtitle ? (
              <p className="mt-[3px] text-[13px] text-muted">{subtitle}</p>
            ) : null}
          </div>
          {action}
        </header>

        {children}
      </main>
    </div>
  );
}

export function Section({
  title,
  children,
  action,
}: {
  title: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <section className="mt-[26px] first:mt-0">
      <div className="mb-2.5 flex items-baseline justify-between gap-3">
        <h2 className="section-title">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}
