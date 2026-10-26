/** Server configuration only. Never send the returned credentials to a client. */
export type GoogleCredentials = { clientId: string; clientSecret: string };
type Environment = Readonly<Record<string, string | undefined>>;

export const PREVIEW_GOOGLE_SETUP_MESSAGE =
  "Preview Google 로그인이 설정되지 않았습니다. 관리자에게 Preview 전용 OAuth 설정을 요청하세요.";

export function googleCredentials(env: Environment): GoogleCredentials | null {
  if (env.VERCEL_ENV === "preview") {
    const clientId = env.OG_PREVIEW_GOOGLE_CLIENT_ID?.trim();
    const clientSecret = env.OG_PREVIEW_GOOGLE_CLIENT_SECRET?.trim();
    // Do not let Auth.js infer AUTH_GOOGLE_* when Preview keys are absent.
    return clientId && clientSecret ? { clientId, clientSecret } : null;
  }
  return {
    clientId: env.AUTH_GOOGLE_ID?.trim() ?? "",
    clientSecret: env.AUTH_GOOGLE_SECRET?.trim() ?? "",
  };
}
