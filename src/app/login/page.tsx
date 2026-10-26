import { googleCredentials, PREVIEW_GOOGLE_SETUP_MESSAGE } from "@/lib/auth/google-credentials";
import { signIn } from "@/lib/auth";
import { loginReturnPath } from "@/lib/auth/return-path";

export default async function LoginPage({
  searchParams,
}: PageProps<"/login">) {
  const { error, from } = await searchParams;
  const redirectTo = loginReturnPath(from);
  const previewSetupMissing = googleCredentials(process.env) === null;

  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-6 py-16">
      <h1 className="text-xl font-semibold">오픈가든 포털</h1>
      <p className="mt-2 text-sm text-muted">
        회사 구글 계정으로 로그인한다.
      </p>

      {previewSetupMissing ? (
        <p role="alert" className="mt-6 rounded-md bg-red-50 px-4 py-3 text-sm text-red-800">
          {PREVIEW_GOOGLE_SETUP_MESSAGE}
        </p>
      ) : error ? (
        <p className="mt-6 rounded-md bg-red-50 px-4 py-3 text-sm text-red-800">
          로그인할 수 없는 계정이다. 회사 계정인지 확인하고,
          그래도 안 되면 관리자에게 알린다.
        </p>
      ) : null}

      <form
        className="mt-8"
        action={async () => {
          "use server";
          if (!googleCredentials(process.env)) return;
          await signIn("google", { redirectTo });
        }}
      >
        <button
          type="submit"
          disabled={previewSetupMissing}
          className="btn-primary w-full py-3"
        >
          구글 계정으로 로그인
        </button>
      </form>
    </main>
  );
}
