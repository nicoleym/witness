import { getSupabase, VALID_OPTIONS } from "./_supabase.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};
    const selections = Array.isArray(body.selections) ? body.selections : [];

    // Keep only known option values — ignore anything unexpected.
    const clean = selections.filter((s) => VALID_OPTIONS.includes(s));
    if (clean.length < 2) {
      return res.status(400).json({ error: "Please select at least two options" });
    }

    const willingToTestify = clean.includes("willing-to-testify");

    // One column per option (hyphens → underscores), 'YES' when checked.
    const row = { user_agent: req.headers["user-agent"] || null };
    for (const opt of VALID_OPTIONS) {
      row[opt.replace(/-/g, "_")] = clean.includes(opt) ? "YES" : null;
    }

    const supabase = getSupabase();
    const { data, error } = await supabase
      .from("submissions")
      .insert(row)
      .select("id")
      .single();

    if (error) {
      console.error("submit insert error:", error);
      return res.status(500).json({ error: "Could not save submission" });
    }

    return res.status(200).json({ id: data.id, willingToTestify });
  } catch (err) {
    console.error("submit handler error:", err);
    return res.status(500).json({ error: "Server error" });
  }
}
