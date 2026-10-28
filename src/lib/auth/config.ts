import Google from "next-auth/providers/google";
import type { NextAuthConfig } from "next-auth";
import type { JWT } from "@auth/core/jwt";

import { memberNameOf } from "@/config/users";
import { GOOGLE_SCOPE_PARAM } from "@/lib/auth/scopes";

import { googleCredentials, type GoogleCredentials } from "@/lib/auth/google-credentials";

/** 만료 1분 전부터 갱신한다. 경계에서 아슬아슬하게 실패하는 걸 막는다. */
const REFRESH_MARGIN_MS = 60_000;

/**
 * 구글 액세스 토큰은 한 시간이면 만료된다.
 * 세션은 그보다 오래 살아 있으므로 refresh token으로 조용히 갱신한다.
 * 갱신에 실패하면 토큰을 비우고 다시 로그인하게 둔다 — 깨진 토큰으로
 * 계속 시도하면 원인 모를 에러만 반복된다.
 */
async function refresh(token: JWT, credentials: GoogleCredentials): Promise<JWT> {
  if (!token.refreshToken) {
    return { ...token, accessToken: undefined, tokenError: "no_refresh_token" };
  }

  try {
    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: credentials.clientId,
        client_secret: credentials.clientSecret,
        grant_type: "refresh_token",
        refresh_token: token.refreshToken,
      }),
      cache: "no-store",
    });

    const body = (await response.json()) as {
      access_token?: string;
      expires_in?: number;
      refresh_token?: string;
    };

    if (!response.ok || !body.access_token) {
      return { ...token, accessToken: undefined, tokenError: "refresh_failed" };
    }

    return {
      ...token,
      accessToken: body.access_token,
      expiresAt: Date.now() + (body.expires_in ?? 3600) * 1000,
      // 구글이 새 refresh token을 주는 경우가 있다. 주면 갈아끼운다.
      refreshToken: body.refresh_token ?? token.refreshToken,
      tokenError: undefined,
    };
  } catch {
    return { ...token, accessToken: undefined, tokenError: "refresh_failed" };
  }
}

export function createAuthConfig(env: Readonly<Record<string, string | undefined>> = process.env) {
  const credentials = googleCredentials(env);
  const allowedHd = env.ALLOWED_HD?.trim() ?? "open-garden.co.kr";
  if (!credentials) {
    console.error("[auth] Preview Google OAuth disabled: OG_PREVIEW_GOOGLE_CLIENT_ID and OG_PREVIEW_GOOGLE_CLIENT_SECRET must both be set for this Preview branch. Production credentials are not used.");
  }
  return {
    providers: credentials ? [
      Google({
        clientId: credentials.clientId,
        clientSecret: credentials.clientSecret,
        authorization: {
          params: {
            // 구글 계정 선택 화면을 회사 도메인으로 제한한다.
            // 편의 기능일 뿐이므로 아래 signIn 에서 서버가 다시 검증한다.
            hd: allowedHd,
            scope: GOOGLE_SCOPE_PARAM,
            // refresh token은 offline + consent 로 요청해야 확실히 온다.
            // 동의 화면이 매번 뜨지만, 토큰이 만료된 채로 캘린더가 죽는 것보다 낫다.
            access_type: "offline",
            prompt: "consent",
          },
        },
      }),
    ] : [],
    pages: {
      signIn: "/login",
      error: "/login",
    },
    callbacks: {
      /**
       * 두 겹으로 막는다.
       * 1) 이메일 도메인이 회사 도메인인가  (hd 파라미터는 위조 가능하므로 여기서 다시 본다)
       * 2) config/users.ts 목록에 있는 사람인가
       */
      signIn({ profile }) {
        if (!credentials) return false;
        const email = profile?.email?.toLowerCase();
        if (!email) return false;
        if (!profile?.email_verified) return false;
        if (!email.endsWith(`@${allowedHd}`)) return false;
        return memberNameOf(email) !== null;
      },

      async jwt({ token, account }) {
        token.member = memberNameOf(token.email);
        if (!credentials) {
          return { ...token, accessToken: undefined, tokenError: "preview_oauth_not_configured" };
        }

        // 로그인 직후에만 account가 온다. 이때 토큰을 챙겨둔다.
        if (account) {
          return {
            ...token,
            accessToken: account.access_token,
            refreshToken: account.refresh_token ?? token.refreshToken,
            expiresAt: account.expires_at
              ? account.expires_at * 1000
              : Date.now() + 3600_000,
            tokenError: undefined,
          };
        }

        const expiresAt = token.expiresAt ?? 0;
        if (token.accessToken && Date.now() < expiresAt - REFRESH_MARGIN_MS) {
          return token;
        }

        return refresh(token, credentials);
      },

      session({ session, token }) {
        session.user.member = token.member ?? null;
        session.accessToken = token.accessToken;
        session.tokenError = token.tokenError;
        return session;
      },
    },
    session: { strategy: "jwt" },
    trustHost: true,
  } satisfies NextAuthConfig;
}

export const authConfig = createAuthConfig();
