import { test } from "node:test";
import assert from "node:assert/strict";

// No SUPABASE_* env here, so getSupabase() throws and rateLimit hits its
// catch branch -> exercises the fail-open / fail-closed policy.
delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;

const { clientIp, rateLimit } = await import("./ratelimit.js");

test("clientIp takes the first x-forwarded-for hop", () => {
  assert.equal(clientIp({ headers: { "x-forwarded-for": "1.2.3.4, 5.6.7.8" } }), "1.2.3.4");
});

test("clientIp falls back to x-real-ip then socket", () => {
  assert.equal(clientIp({ headers: { "x-real-ip": "9.9.9.9" } }), "9.9.9.9");
  assert.equal(clientIp({ headers: {}, socket: { remoteAddress: "10.0.0.1" } }), "10.0.0.1");
  assert.equal(clientIp({ headers: {} }), "unknown");
});

test("fails open by default when the backend is unavailable", async () => {
  const r = await rateLimit({ headers: {} }, "submit", 5, 600);
  assert.equal(r.allowed, true);
});

test("fails closed when explicitly requested", async () => {
  const r = await rateLimit({ headers: {} }, "transcribe", 5, 600, { failOpen: false });
  assert.equal(r.allowed, false);
});
