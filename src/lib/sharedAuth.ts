// One sign-in for every BGameWorld game.
//
// Each game runs on its own subdomain (wordezy.bgameworld.com,
// sortezy.bgameworld.com, ...). Supabase normally keeps the login in that
// subdomain's localStorage, so a player had to sign up again in every game.
// This storage keeps the login in a cookie for the whole .bgameworld.com
// domain instead, so signing in once works everywhere, including on
// bgameworld.com itself. Off bgameworld.com (local development) it falls back
// to localStorage.
//
// Keep this file identical in every game repo.

export const SHARED_AUTH_KEY = 'bgw-auth';
const LEGACY_KEY = 'sb-hkcvtoozpeybwehqtiif-auth-token'; // where each game kept its own login before
const CHUNK = 3000; // characters per cookie; browsers allow about 4 KB per cookie
const MAX_AGE = 60 * 60 * 24 * 400; // 400 days, the most browsers keep a cookie

function sharedDomain(): string | null {
  if (typeof location === 'undefined') return null;
  const h = location.hostname;
  return h === 'bgameworld.com' || h.endsWith('.bgameworld.com') ? '.bgameworld.com' : null;
}

function readCookie(name: string): string | null {
  const prefix = name + '=';
  for (const part of document.cookie.split('; ')) if (part.startsWith(prefix)) return part.slice(prefix.length);
  return null;
}

function writeCookie(domain: string, name: string, value: string, maxAge: number) {
  document.cookie = `${name}=${value}; Domain=${domain}; Path=/; Max-Age=${maxAge}; SameSite=Lax; Secure`;
}

function clearChunks(domain: string, key: string, from: number) {
  for (let i = from; readCookie(`${key}.${i}`) !== null; i++) writeCookie(domain, `${key}.${i}`, '', 0);
}

export const sharedAuthStorage = {
  getItem(key: string): string | null {
    const d = sharedDomain();
    if (!d) {
      try { return localStorage.getItem(key); } catch { return null; }
    }
    const parts: string[] = [];
    for (let i = 0; ; i++) {
      const v = readCookie(`${key}.${i}`);
      if (v === null) break;
      parts.push(v);
    }
    if (!parts.length) return null;
    try { return decodeURIComponent(parts.join('')); } catch { return null; }
  },
  setItem(key: string, value: string): void {
    const d = sharedDomain();
    if (!d) {
      try { localStorage.setItem(key, value); } catch { /* storage unavailable */ }
      return;
    }
    const enc = encodeURIComponent(value);
    const n = Math.ceil(enc.length / CHUNK);
    for (let i = 0; i < n; i++) writeCookie(d, `${key}.${i}`, enc.slice(i * CHUNK, (i + 1) * CHUNK), MAX_AGE);
    clearChunks(d, key, n); // remove pieces left over from a longer, older login
  },
  removeItem(key: string): void {
    const d = sharedDomain();
    if (!d) {
      try { localStorage.removeItem(key); } catch { /* storage unavailable */ }
      return;
    }
    clearChunks(d, key, 0);
  },
};

function isRegistered(raw: string | null): boolean {
  try {
    const s = raw ? JSON.parse(raw) : null;
    return !!(s && s.user && !s.user.is_anonymous && s.refresh_token);
  } catch {
    return false;
  }
}

/**
 * Carries a login this game saved the old way into the shared one, so nobody
 * loses their progress when the games switch to shared sign-in. A registered
 * account wins over a guest one; otherwise an existing shared login is kept.
 * Call once, before creating the Supabase client.
 */
export function adoptLegacySession(): void {
  if (!sharedDomain()) return;
  let legacy: string | null = null;
  try { legacy = localStorage.getItem(LEGACY_KEY); } catch { return; }
  if (!legacy) return;
  const shared = sharedAuthStorage.getItem(SHARED_AUTH_KEY);
  if (!shared || (isRegistered(legacy) && !isRegistered(shared))) sharedAuthStorage.setItem(SHARED_AUTH_KEY, legacy);
  // Move, don't copy: once carried over, the old login must not come back
  // (otherwise signing out would be undone the next time this game opens).
  try { localStorage.removeItem(LEGACY_KEY); } catch { /* storage unavailable */ }
}

/** The auth options every game passes to createClient. */
export function sharedAuthOptions() {
  adoptLegacySession();
  return { storage: sharedAuthStorage, storageKey: SHARED_AUTH_KEY, persistSession: true, autoRefreshToken: true };
}
