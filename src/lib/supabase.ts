import { createClient } from "@supabase/supabase-js";

// The shared bgameworld Supabase project (the same one Wordezy uses). A
// project URL and publishable key are public by design: they ship inside every
// browser bundle, and the data is guarded by row-level security and the RPC
// grants. So they're built in as the fallback, and the VITE_ build variables
// only override them. Without a fallback, a deploy missing those variables
// crashed on load (createClient("") throws) and sat on the loading screen.
const PROJECT_URL = "https://hkcvtoozpeybwehqtiif.supabase.co";
const PUBLISHABLE_KEY = "sb_publishable_CGTFNipWN_1IeG28m4upSg_n2HSsGai";

const envUrl = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim();
const envKey = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim();

function makeClient() {
  try {
    return createClient(envUrl || PROJECT_URL, envKey || PUBLISHABLE_KEY);
  } catch (err) {
    // A malformed build variable shouldn't take the whole game down.
    console.warn("Wordezy Scramble: Supabase build variables are invalid, using the default project.", err);
    return createClient(PROJECT_URL, PUBLISHABLE_KEY);
  }
}

export const supabase = makeClient();

/** How long one sign-in step may take before the game stops waiting and
 *  plays offline. Generous enough for a slow mobile connection. */
export const BOOT_STEP_MS = 10000;

/** Resolves with `fallback` if `p` rejects or takes longer than `ms`. Never rejects. */
export function withTimeout<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(fallback), ms);
    p.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      () => {
        clearTimeout(timer);
        resolve(fallback);
      }
    );
  });
}

/** The signed-in user from the local session (no network round trip). */
export async function currentUser(): Promise<{ id: string; is_anonymous?: boolean } | null> {
  return withTimeout(
    supabase.auth.getSession().then(({ data }) => (data.session?.user as { id: string; is_anonymous?: boolean } | undefined) ?? null),
    BOOT_STEP_MS,
    null
  );
}

export interface SessionResult {
  ok: boolean;
  /** Set when sign-in failed for a reason the UI should explain, e.g. the
   *  project's "Allow anonymous sign-ins" toggle is off. */
  reason?: "anonymous_disabled" | "unknown";
}

/**
 * Ensures the current visitor has a Supabase auth session (anonymous by
 * default), so a daily win counts toward the leaderboard from the first
 * play. Never throws and never hangs: after BOOT_STEP_MS it gives up with
 * `ok: false`, and callers play offline instead.
 */
export function ensureSession(): Promise<SessionResult> {
  return withTimeout(signIn(), BOOT_STEP_MS, { ok: false, reason: "unknown" });
}

async function signIn(): Promise<SessionResult> {
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
