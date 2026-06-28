import { test } from "node:test";
import assert from "node:assert/strict";

process.env.SIGNING_SECRET = "test-secret-do-not-use-in-prod";

const { signToken, verifyToken } = await import("./token.js");

const NOW = 1_700_000_000_000;

test("round-trips a valid token", () => {
  const t = signToken("abc-123", 3600, NOW);
  const v = verifyToken(t, NOW);
  assert.ok(v);
  assert.equal(v.id, "abc-123");
});

test("rejects a tampered payload", () => {
  const t = signToken("abc-123", 3600, NOW);
  const [body, sig] = t.split(".");
  const forged = Buffer.from(JSON.stringify({ id: "evil", iat: 1, exp: 9_999_999_999 })).toString("base64url");
  assert.equal(verifyToken(forged + "." + sig, NOW), null);
});

test("rejects a tampered signature", () => {
  const t = signToken("abc-123", 3600, NOW);
  const [body] = t.split(".");
  assert.equal(verifyToken(body + ".AAAA", NOW), null);
});

test("rejects an expired token", () => {
  const t = signToken("abc-123", 3600, NOW);
  const later = NOW + 3601 * 1000;
  assert.equal(verifyToken(t, later), null);
});

test("accepts a token just before expiry", () => {
  const t = signToken("abc-123", 3600, NOW);
  const justBefore = NOW + 3599 * 1000;
  assert.ok(verifyToken(t, justBefore));
});

test("rejects garbage and empty input", () => {
  assert.equal(verifyToken("", NOW), null);
  assert.equal(verifyToken("nodot", NOW), null);
  assert.equal(verifyToken("a.b.c", NOW), null);
  assert.equal(verifyToken(null, NOW), null);
  assert.equal(verifyToken(undefined, NOW), null);
});

test("a token signed with a different secret fails", () => {
  const t = signToken("abc-123", 3600, NOW);
  process.env.SIGNING_SECRET = "a-different-secret";
  assert.equal(verifyToken(t, NOW), null);
  process.env.SIGNING_SECRET = "test-secret-do-not-use-in-prod";
});
