// Proxies a short audio clip to ElevenLabs Speech-to-Text and returns the
// transcript. The API key stays server-side and is never exposed to the browser.

const MAX_BYTES = 25 * 1024 * 1024; // ~25MB — plenty for a spoken paragraph.

// Receive the raw audio body ourselves instead of letting Vercel parse it.
export const config = { api: { bodyParser: false } };

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    console.error("transcribe: ELEVENLABS_API_KEY is not configured");
    return res.status(500).json({ error: "Transcription is not configured" });
  }

  try {
    const chunks = [];
    let total = 0;
    for await (const chunk of req) {
      total += chunk.length;
      if (total > MAX_BYTES) {
        return res.status(413).json({ error: "Audio is too large" });
      }
      chunks.push(chunk);
    }
    const buffer = Buffer.concat(chunks);
    if (buffer.length === 0) {
      return res.status(400).json({ error: "No audio received" });
    }

    const contentType = req.headers["content-type"] || "audio/webm";

    const form = new FormData();
    form.append("model_id", "scribe_v1");
    form.append("file", new Blob([buffer], { type: contentType }), "audio.webm");

    const r = await fetch("https://api.elevenlabs.io/v1/speech-to-text", {
      method: "POST",
      headers: { "xi-api-key": apiKey },
      body: form,
    });

    if (!r.ok) {
      const detail = await r.text();
      console.error("transcribe: ElevenLabs error", r.status, detail);
      return res.status(502).json({ error: "Could not transcribe audio" });
    }

    const data = await r.json();
    return res.status(200).json({ text: (data && data.text) || "" });
  } catch (err) {
    console.error("transcribe handler error:", err);
    return res.status(500).json({ error: "Server error" });
  }
}
