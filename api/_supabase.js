import { createClient } from "@supabase/supabase-js";

// Server-side Supabase client using the service-role key.
// These env vars are set in the Vercel project settings — never exposed to the browser.
const url = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

let client = null;

export function getSupabase() {
  if (!url || !serviceRoleKey) {
    throw new Error("Supabase env vars are not configured");
  }
  if (!client) {
    client = createClient(url, serviceRoleKey, {
      auth: { persistSession: false },
    });
  }
  return client;
}

// The canonical list of valid checkbox option values.
export const VALID_OPTIONS = [
  "know-garrett",
  "know-niket",
  "know-kathleen",
  "saw-tape",
  "saw-data",
  "saw-abuse",
  "saw-damages",
  "me-too",
  "willing-to-testify",
  "know-how-it-works",
];
