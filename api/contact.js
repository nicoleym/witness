import { getSupabase } from "./_supabase.js";
import { verifyToken } from "./_lib/token.js";
import { checkOrigin } from "./_lib/origin.js";
import { rateLimit, tooMany } from "./_lib/ratelimit.js";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!checkOrigin(req)) {
    return res.status(403).json({ error: "Forbidden" });
  }

  const limit = await rateLimit(req, "contact", 10, 600);
  if (!limit.allowed) return tooMany(res, limit.retryAfter);

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};
    const claim = verifyToken(typeof body.token === "string" ? body.token : "");
    if (!claim) {
      return res.status(401).json({ error: "Your session expired. Please reload." });
    }
    const id = claim.id;
    const fullName = typeof body.fullName === "string" ? body.fullName.trim() : "";
    const email = typeof body.email === "string" ? body.email.trim() : "";

    if (fullName.length < 1 || fullName.length > 200) {
      return res.status(400).json({ error: "Please enter your full name" });
    }
    if (!EMAIL_RE.test(email) || email.length > 320) {
      return res.status(400).json({ error: "Please enter a valid email" });
    }

    const supabase = getSupabase();
    const { error } = await supabase
      .from("submissions")
      .update({ full_name: fullName, email: email })
      .eq("id", id);

    if (error) {
      console.error("contact update error:", error);
      return res.status(500).json({ error: "Could not save contact details" });
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("contact handler error:", err);
    return res.status(500).json({ error: "Server error" });
  }
}
