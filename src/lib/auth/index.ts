import NextAuth from "next-auth";

import { authConfig } from "@/lib/auth/config";

// Server callers need the Google token for calendar requests.
export const { auth, signIn, signOut } = NextAuth(authConfig);

// The same session callback also serves /api/auth/session. Never serialize
// the Google token to the browser; keep it only in the server session above.
export const { handlers } = NextAuth({
  ...authConfig,
  callbacks: {
    ...authConfig.callbacks,
    session(args) {
      const session = authConfig.callbacks.session(args);
      delete session.accessToken;
      return session;
    },
  },
});
