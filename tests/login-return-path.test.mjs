import assert from "node:assert/strict";
import { test } from "node:test";
import { loginReturnPath } from "../src/lib/auth/return-path.ts";

test("preserves protected destinations and catalog selection queries", () => {
  for (const path of ["/todos/rec123", "/calendar?view=week", "/tools/proposal.html?og_selection=abc_-", "/tools/catalog-bridge.html?og_selection=abc%3D"]) {
    assert.equal(loginReturnPath(path), path);
  }
});

test("rejects external redirects, malformed values and auth loops", () => {
  for (const path of [undefined, ["/todos"], "https://evil.test", "//evil.test", "/\\evil.test", "/\nevil.test", "/login", "/api/auth/signin", "/todos/../login"]) {
    assert.equal(loginReturnPath(path), "/");
  }
});
