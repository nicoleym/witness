import { test } from "node:test";
import assert from "node:assert/strict";
import { isAllowedOrigin, checkOrigin } from "./origin.js";

test("allows the production domains", () => {
  assert.ok(isAllowedOrigin("https://everybodywitness.org"));
  assert.ok(isAllowedOrigin("https://www.everybodywitness.org"));
  assert.ok(isAllowedOrigin("https://everybodywitness.com"));
});

test("allows localhost and vercel previews", () => {
  assert.ok(isAllowedOrigin("http://localhost:3000"));
  assert.ok(isAllowedOrigin("http://127.0.0.1:5173"));
  assert.ok(isAllowedOrigin("https://witness-abc123.vercel.app"));
});

test("allows a missing Origin header", () => {
  assert.ok(isAllowedOrigin(undefined));
  assert.ok(isAllowedOrigin(""));
});

test("rejects foreign origins", () => {
  assert.equal(isAllowedOrigin("https://evil.com"), false);
  assert.equal(isAllowedOrigin("https://everybodywitness.org.evil.com"), false);
  assert.equal(isAllowedOrigin("http://everybodywitness.vercel.app"), false);
  assert.equal(isAllowedOrigin("not a url"), false);
});

test("checkOrigin reads req.headers.origin", () => {
  assert.ok(checkOrigin({ headers: { origin: "https://everybodywitness.org" } }));
  assert.equal(checkOrigin({ headers: { origin: "https://evil.com" } }), false);
  assert.ok(checkOrigin({ headers: {} }));
});
