# Security

This document covers the application hardening in this repo and — just as
importantly — the operational controls that code cannot enforce. For a site
that collects witness statements about named individuals, the operational side
matters as much as the code.

## Application controls (implemented)

- **Signed request tokens.** `/api/submit` issues an HMAC-SHA256 token
  (`api/_lib/token.js`) bound to the new submission id, with a 7-day expiry.
  `/api/contact`, `/api/transcription`, and `/api/transcribe` require a valid
  token before any write. The raw submission id is never trusted from the
  client, so a leaked/guessed id can't be used to overwrite a submission.
  Requires the `SIGNING_SECRET` env var (Production + Preview + local).

- **Rate limiting** (`api/_lib/ratelimit.js`, `migrations/001_rate_limits.sql`).
  Per-IP limits via an atomic Supabase function:
  - submit: 5 / 10 min
  - contact: 10 / 10 min
  - transcription (text save): 30 / 10 min
  - transcribe (paid STT): 10 / hour
  Fails **open** if the backend is unreachable (availability over strictness);
  the paid `transcribe` endpoint is additionally gated by a required token.

- **Origin allowlist** (`api/_lib/origin.js`). State-changing endpoints reject
  foreign `Origin` headers (production domains, localhost, and `*.vercel.app`
  previews are allowed; a missing Origin is allowed since there are no cookies
  to abuse for CSRF).

- **Security headers** (`vercel.json`): a strict Content-Security-Policy
  (`script-src 'self'`, `style-src 'self'`, no `unsafe-inline`), HSTS,
  `X-Frame-Options: DENY` + `frame-ancestors 'none'` (clickjacking),
  `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, and a
  `Permissions-Policy` that allows only the microphone (for voice statements)
  and denies camera/geolocation/topics. The strict CSP is why the page's CSS
  and JS live in `styles.css` / `app.js` instead of inline.

## Deployment order (important)

1. Set `SIGNING_SECRET` in Vercel (Production + Preview) — see below.
2. Apply `migrations/001_rate_limits.sql` in the Supabase SQL Editor.
3. Deploy.

If you deploy before step 2, rate limiting simply fails open (no limiting)
until the migration is applied — it will not break the form.

### Generating SIGNING_SECRET

```
openssl rand -base64 32
```
Add it to Vercel (`vercel env add SIGNING_SECRET production` / `preview`) and to
local `.env.local`. Rotating it invalidates all outstanding tokens (in-progress
submissions would need to restart) but loses no stored data.

## Operational controls (you must own these — NOT enforced by code)

These are the realistic ways a determined attacker reaches the data, ranked:

1. **Supabase dashboard / account access.** Anyone who can log in reads
   everything. Enforce MFA on every account with access; minimize who has it.
2. **Service-role key custody.** `SUPABASE_SERVICE_ROLE_KEY` bypasses RLS
   entirely. Keep it only in Vercel env + local `.env*` (gitignored). Rotate it
   if a laptop or token is ever exposed. Never commit it.
3. **Vercel account.** Controls the code and all env vars. MFA; least-privilege
   team access.
4. **Data retention.** Define and enforce how long statements/contacts are kept
   and when they're deleted. Less retained data = less to leak.
5. **Logs.** `console.error` output lands in Vercel logs; check log retention and
   who can read it. Avoid logging PII.

## Recommended next step: encryption at rest

The biggest residual risk is that names, emails, and statements sit in Supabase
in **plaintext** — a database dump or dashboard access exposes them directly.
Application-level encryption (AES-256-GCM, key in Vercel env, separate from the
DB) would make a raw dump useless. It was intentionally deferred here because it
requires a deliberate key-backup / rotation procedure first: losing the key
means losing the data permanently. Treat this as the top follow-up before
collecting real witness data at scale.

## Before launch

Given the sensitivity, an independent human security review / pentest is
strongly recommended. The controls above close the obvious application-layer
holes but are necessary, not sufficient.
