import crypto from "node:crypto";
import { getSupabase } from "../_supabase.js";

export function clientIp(req) {
  const xff = req && req.headers ? req.headers["x-forwarded-for"] : null;
  if (xff) return String(xff).split(",")[0].trim();
  const real = req && req.headers ? req.headers["x-real-ip"] : null;
  if (real) return String(real);
  if (req && req.socket && req.socket.remoteAddress) return req.socket.remoteAddress;
  return "unknown";
}

// Keyed hash of the IP so the rate_limits table never stores a real address.
// SIGNING_SECRET is the key, so the digest isn't reversible via a rainbow table
// of the (small) IPv4 space. Truncated to 32 hex chars — ample to avoid
// collisions across distinct visitors.
export function hashIp(ip) {
  const secret = process.env.SIGNING_SECRET;
  if (!secret) throw new Error("SIGNING_SECRET is not configured");
  return crypto.createHmac("sha256", secret).update(String(ip)).digest("hex").slice(0, 32);
}

export async function rateLimit(req, name, max, windowSeconds, opts) {
  const failOpen = !opts || opts.failOpen !== false;
  try {
    const bucket = name + ":" + hashIp(clientIp(req));
    const supabase = getSupabase();
    const { data, error } = await supabase.rpc("rate_limit_hit", {
      p_bucket: bucket,
      p_max: max,
      p_window_seconds: windowSeconds,
    });
    if (error) {
      console.error("rate_limit rpc error:", error);
      return { allowed: failOpen, retryAfter: 0 };
    }
    const row = Array.isArray(data) ? data[0] : data;
    if (!row) return { allowed: failOpen, retryAfter: 0 };
    return { allowed: !!row.allowed, retryAfter: row.retry_after || 0 };
  } catch (e) {
    console.error("rate_limit error:", e);
    return { allowed: failOpen, retryAfter: 0 };
  }
}

export function tooMany(res, retryAfter) {
  if (retryAfter && retryAfter > 0) res.setHeader("Retry-After", String(retryAfter));
  return res.status(429).json({ error: "Too many requests. Please slow down and try again shortly." });
}
