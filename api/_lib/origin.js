const STATIC_ALLOW = new Set([
  "https://everybodywitness.org",
  "https://www.everybodywitness.org",
  "https://everybodywitness.com",
  "https://www.everybodywitness.com",
]);

export function isAllowedOrigin(origin) {
  if (!origin) return true;
  if (STATIC_ALLOW.has(origin)) return true;
  try {
    const u = new URL(origin);
    if (u.hostname === "localhost" || u.hostname === "127.0.0.1") return true;
    if (u.protocol === "https:" && u.hostname.endsWith(".vercel.app")) return true;
  } catch (e) {
    return false;
  }
  return false;
}

export function checkOrigin(req) {
  const origin = req && req.headers ? req.headers.origin : undefined;
  return isAllowedOrigin(origin);
}
