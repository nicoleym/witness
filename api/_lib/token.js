import crypto from "node:crypto";

const DEFAULT_TTL_SECONDS = 7 * 24 * 60 * 60;

function getSecret() {
  const s = process.env.SIGNING_SECRET;
  if (!s) throw new Error("SIGNING_SECRET is not configured");
  return s;
}

function b64url(input) {
  return Buffer.from(input).toString("base64url");
}

function fromB64url(str) {
  return Buffer.from(str, "base64url");
}

export function signToken(id, ttlSeconds = DEFAULT_TTL_SECONDS, nowMs = Date.now()) {
  const iat = Math.floor(nowMs / 1000);
  const payload = { id: String(id), iat: iat, exp: iat + ttlSeconds };
  const body = b64url(JSON.stringify(payload));
  const sig = crypto.createHmac("sha256", getSecret()).update(body).digest();
  return body + "." + b64url(sig);
}

export function verifyToken(token, nowMs = Date.now()) {
  if (typeof token !== "string" || token.length === 0) return null;

  const dot = token.indexOf(".");
  if (dot <= 0 || dot === token.length - 1) return null;

  const body = token.slice(0, dot);
  const providedSig = token.slice(dot + 1);

  const expectedSig = crypto.createHmac("sha256", getSecret()).update(body).digest();

  let provided;
  try {
    provided = fromB64url(providedSig);
  } catch (e) {
    return null;
  }
  if (provided.length !== expectedSig.length) return null;
  if (!crypto.timingSafeEqual(provided, expectedSig)) return null;

  let payload;
  try {
    payload = JSON.parse(fromB64url(body).toString("utf8"));
  } catch (e) {
    return null;
  }
  if (!payload || typeof payload.id !== "string" || !payload.id) return null;
  if (typeof payload.exp !== "number") return null;

  const now = Math.floor(nowMs / 1000);
  if (now >= payload.exp) return null;

  return { id: payload.id, iat: payload.iat, exp: payload.exp };
}
