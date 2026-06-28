import { getSupabase } from "./_supabase.js";

const MAX_LEN = 5000;

// Keeps a single transcript row per submission, mirroring the current text.
// Called as an auto-save right after transcription, on advance (Skip), and on
// Delete (empty text). It updates the existing row instead of inserting a new
// one, so repeated saves never create duplicates.
export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};
    const id = typeof body.id === "string" ? body.id.trim() : "";
    const text = typeof body.text === "string" ? body.text.trim() : "";

    if (!id) {
      return res.status(400).json({ error: "Missing submission id" });
    }
    if (text.length > MAX_LEN) {
      return res.status(400).json({ error: "Your message is too long" });
    }

    const supabase = getSupabase();

    // Empty text clears any stored transcript for this submission (e.g. Delete).
    if (!text) {
      const { error: delErr } = await supabase
        .from("transcriptions")
        .delete()
        .eq("submission_id", id);
      if (delErr) {
        console.error("transcription delete error:", delErr);
        return res.status(500).json({ error: "Could not save your message" });
      }
      return res.status(200).json({ ok: true });
    }

    // Update the existing transcript row for this submission, or insert the first.
    const { data: existing, error: selErr } = await supabase
      .from("transcriptions")
      .select("id")
      .eq("submission_id", id)
      .limit(1)
      .maybeSingle();
    if (selErr) {
      console.error("transcription lookup error:", selErr);
      return res.status(500).json({ error: "Could not save your message" });
    }

    let dbError;
    if (existing) {
      ({ error: dbError } = await supabase
        .from("transcriptions")
        .update({ text: text })
        .eq("id", existing.id));
    } else {
      ({ error: dbError } = await supabase
        .from("transcriptions")
        .insert({ submission_id: id, text: text }));
    }
    if (dbError) {
      console.error("transcription save error:", dbError);
      return res.status(500).json({ error: "Could not save your message" });
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("transcription handler error:", err);
    return res.status(500).json({ error: "Server error" });
  }
}
