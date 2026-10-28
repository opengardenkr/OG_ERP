import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { test } from "node:test";
import { googleCredentials } from "../src/lib/auth/google-credentials.ts";

// Resolve the same @/ aliases as tsconfig without adding a test framework.
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith("@/")) {
      return nextResolve(new URL(`../src/${specifier.slice(2)}.ts`, import.meta.url).href, context);
    }
    return nextResolve(specifier, context);
  },
});
const { createAuthConfig } = await import("../src/lib/auth/config.ts");
const { Auth } = await import("@auth/core");

// Deliberately fake fixtures. No real credentials or external requests.
const keys = {
  AUTH_GOOGLE_ID: " production-id ", AUTH_GOOGLE_SECRET: " production-secret ",
  OG_PREVIEW_GOOGLE_CLIENT_ID: " preview-id ", OG_PREVIEW_GOOGLE_CLIENT_SECRET: " preview-secret ",
};
const expired = () => ({ email: "info@open-garden.co.kr", accessToken: "old", refreshToken: "refresh", expiresAt: 0 });

test("only exact preview environment selects separate trimmed keys", () => {
  assert.deepEqual(googleCredentials({ ...keys, VERCEL_ENV: "preview" }), { clientId: "preview-id", clientSecret: "preview-secret" });
  for (const VERCEL_ENV of ["production", "development", undefined, "custom"]) {
    assert.deepEqual(googleCredentials({ ...keys, VERCEL_ENV }), { clientId: "production-id", clientSecret: "production-secret" });
  }
  assert.deepEqual(googleCredentials({ VERCEL_ENV: "production", OG_PREVIEW_GOOGLE_CLIENT_ID: "p", OG_PREVIEW_GOOGLE_CLIENT_SECRET: "s" }), { clientId: "", clientSecret: "" });
});

test("missing or blank Preview keys fail closed without logging values", async (t) => {
  const logs = [];
  t.mock.method(console, "error", (...args) => logs.push(args.join(" ")));
  const request = t.mock.method(globalThis, "fetch", () => { throw new Error("unexpected request"); });
  for (const missing of [
    { OG_PREVIEW_GOOGLE_CLIENT_ID: undefined },
    { OG_PREVIEW_GOOGLE_CLIENT_SECRET: undefined },
    { OG_PREVIEW_GOOGLE_CLIENT_ID: "  " },
    { OG_PREVIEW_GOOGLE_CLIENT_SECRET: "\n" },
  ]) {
    const env = { ...keys, ...missing, VERCEL_ENV: "preview" };
    assert.equal(googleCredentials(env), null);
    const config = createAuthConfig(env);
    assert.deepEqual(config.providers, []);
    assert.equal(config.callbacks.signIn({ profile: { email: "info@open-garden.co.kr", email_verified: true } }), false);
    const token = await config.callbacks.jwt({ token: expired() });
    assert.equal(token.accessToken, undefined);
    assert.equal(token.tokenError, "preview_oauth_not_configured");
    // The actual Auth.js endpoint must not infer the production Google provider.
    const response = await Auth(new Request("https://preview.test/api/auth/providers"), {
      ...config, basePath: "/api/auth", secret: "test-only-secret",
    });
    assert.deepEqual(await response.json(), {});
  }
  assert.equal(request.mock.callCount(), 0);
  assert.ok(logs.some(line => line.includes("OG_PREVIEW_GOOGLE_CLIENT_ID")));
  for (const value of Object.values(keys)) assert.ok(!logs.join(" ").includes(value.trim()));
});

for (const environment of ["preview", "production", "development"]) {
  test(`${environment}: login provider and refresh use the same client`, async (t) => {
    const config = createAuthConfig({ ...keys, VERCEL_ENV: environment });
    const expected = environment === "preview" ? "preview" : "production";
    const provider = config.providers[0].options;
    assert.equal(provider.clientId, `${expected}-id`);
    assert.equal(provider.clientSecret, `${expected}-secret`);
    assert.equal(provider.authorization.params.access_type, "offline");
    assert.equal(provider.authorization.params.prompt, "consent");
    assert.ok(provider.authorization.params.scope.includes("calendar.events"));
    t.mock.method(globalThis, "fetch", async (url, init) => {
      assert.equal(url, "https://oauth2.googleapis.com/token");
      assert.equal(init.body.get("client_id"), provider.clientId);
      assert.equal(init.body.get("client_secret"), provider.clientSecret);
      assert.equal(init.body.get("refresh_token"), "refresh");
      assert.equal(init.cache, "no-store");
      return Response.json({ access_token: "new", refresh_token: "rotated", expires_in: 3600 });
    });
    const token = await config.callbacks.jwt({ token: expired() });
    assert.equal(token.accessToken, "new");
    assert.equal(token.refreshToken, "rotated");
    assert.equal(token.tokenError, undefined);
  });
}

test("member allowlist, verified email and configured domain remain enforced", () => {
  for (const VERCEL_ENV of ["production", "preview"]) {
    const config = createAuthConfig({ ...keys, VERCEL_ENV });
    const signIn = (email, email_verified = true) => config.callbacks.signIn({ profile: { email, email_verified } });
    assert.equal(signIn("INFO@OPEN-GARDEN.CO.KR"), true);
    assert.equal(signIn("jun@open-garden.co.kr"), true);
    assert.equal(signIn("other@open-garden.co.kr"), false);
    assert.equal(signIn("info@gmail.com"), false);
    assert.equal(signIn("info@open-garden.co.kr", false), false);
    assert.equal(signIn(undefined), false);
    const custom = createAuthConfig({ ...keys, VERCEL_ENV, ALLOWED_HD: "another.test" });
    assert.equal(custom.callbacks.signIn({ profile: { email: "info@open-garden.co.kr", email_verified: true } }), false);
  }
});

test("valid tokens avoid refresh; missing and rejected refresh tokens fail safely", async (t) => {
  const config = createAuthConfig({ ...keys, VERCEL_ENV: "preview" });
  const fetchMock = t.mock.method(globalThis, "fetch", async () => Response.json({ error: "invalid_grant" }, { status: 400 }));
  const valid = { ...expired(), expiresAt: Date.now() + 3600_000 };
  assert.equal((await config.callbacks.jwt({ token: valid })).accessToken, "old");
  assert.equal(fetchMock.mock.callCount(), 0);
  const missing = await config.callbacks.jwt({ token: { ...expired(), refreshToken: undefined } });
  assert.equal(missing.accessToken, undefined);
  assert.equal(missing.tokenError, "no_refresh_token");
  assert.equal(fetchMock.mock.callCount(), 0);
  const rejected = await config.callbacks.jwt({ token: expired() });
  assert.equal(rejected.accessToken, undefined);
  assert.equal(rejected.tokenError, "refresh_failed");
});
