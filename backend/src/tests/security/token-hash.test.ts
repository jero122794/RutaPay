// backend/src/tests/security/token-hash.test.ts
import assert from "node:assert";
import { test } from "node:test";
import { hashRefreshToken } from "../../shared/token-hash.js";

test("hashRefreshToken is deterministic for the same input", () => {
  const t = "header.payload.signature";
  assert.strictEqual(hashRefreshToken(t), hashRefreshToken(t));
});

test("hashRefreshToken produces different output for different tokens", () => {
  assert.notStrictEqual(hashRefreshToken("a"), hashRefreshToken("b"));
});
