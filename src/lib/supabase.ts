import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

if (!url || !anonKey) {
  // Fails loudly in dev rather than silently shipping a client that can
  // never reach the leaderboard.
  console.warn(
    "Wordezy Scramble: VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY are not set — " +
      "the daily leaderboard will not load. Copy .env.example to .env.local and fill them in."
  );
}

export const supabase = createClient(url ?? "", anonKey ?? "");

export interface SessionResult {
  ok: boolean;
  /** Set when sign-in failed for a reason the UI should explain, e.g. the
   *  project's "Allow anonymous sign-ins" toggle is off. */
  reason?: "anonymous_disabled" | "unknown";
}

/**
 * Ensures the current visitor has a Supabase auth session (anonymous by
 * default), so a daily win counts toward the leaderboard from the first
 * play — same pattern as Wordezy and When & Where. Never throws: callers
 * check `ok` and branch on `reason` instead of hitting a raw
 * "not authenticated" error from the first RPC call.
 */
export async function ensureSession(): Promise<SessionResult> {
  const { data } = await supabase.auth.getSession();
  if (data.session) return { ok: true };

  const { error } = await supabase.auth.signInAnonymously();
  if (!error) return { ok: true };

  const code = (error as { code?: string })?.code || "";
  const msg = error.message || "";
  if (code === "anonymous_provider_disabled" || /anonymous sign-ins are disabled/i.test(msg)) {
    return { ok: false, reason: "anonymous_disabled" };
  }
  return { ok: false, reason: "unknown" };
}

export async function parseSupabaseError(error: unknown): Promise<string> {
  if (!error) return "An unexpected error occurred.";
  const err = error as { context?: { json?: () => Promise<{ message?: string; error?: string }> }; message?: string };
  try {
    if (err.context && typeof err.context.json === "function") {
      const body = await err.context.json();
      if (body.message || body.error) return body.message || body.error || "";
    }
  } catch {
    // fall through to the plain message
  }
  return err.message || "An unexpected error occurred.";
}
