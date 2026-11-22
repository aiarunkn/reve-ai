/**
 * Browser-side Supabase Auth: email magic link (OTP), no passwords.
 *
 * Guests can try Reve freely up to a small daily allowance (see api/_limits.js); past that,
 * the server answers 429 with { signIn: true } and the app opens the sign-in sheet.
 *
 * One Supabase client for the whole app — this is the client Realtime reuses too
 * (see sharedClient.js). Its session is persisted, and its access token is sent as
 * `Authorization: Bearer <token>` on every /api call.
 */
import { createClient } from '@supabase/supabase-js';

let client;
export function supabase() {
  const url = import.meta.env.VITE_SUPABASE_URL;
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return (client ??= createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } }));
}

let session = null;
let ready = null;
const listeners = new Set();

/** Loads the persisted session once, and keeps it current. Safe to call more than once. */
export function bootstrapAuth() {
  const c = supabase();
  if (!c) return Promise.resolve(null);
  if (!ready) {
    ready = c.auth.getSession().then(({ data }) => (session = data?.session || null));
    c.auth.onAuthStateChange((_event, next) => {
      session = next;
      listeners.forEach((fn) => fn(currentUser()));
    });
  }
  return ready;
}

/** Fires with the current user (or null) on sign-in, sign-out and token refresh. */
export function onAuthChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function currentUser() {
  return session?.user ? { id: session.user.id, email: session.user.email || '' } : null;
}

/** `{ Authorization: 'Bearer ...' }` when signed in, or `{}` for a guest. */
export async function authHeaders() {
  await bootstrapAuth();
  return session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {};
}

export async function sendMagicLink(email) {
  const c = supabase();
  if (!c) throw new Error('Sign-in isn’t set up yet: add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.');
  const emailRedirectTo = `${window.location.origin}${window.location.pathname}`;
  const { error } = await c.auth.signInWithOtp({ email, options: { emailRedirectTo } });
  if (error) throw error;
}

/** Thrown by every /api client on a 429. `signIn` is true when the caller was a guest. */
export class RateLimited extends Error {
  constructor(json = {}) {
    super(json.error || 'You’ve dreamed a lot today — the moon resets at midnight.');
    this.name = 'RateLimited';
    this.kind = json.kind;
    this.limit = json.limit;
    this.signIn = !!json.signIn;
  }
}

export async function signOut() {
  const c = supabase();
  if (c) await c.auth.signOut();
  session = null;
  listeners.forEach((fn) => fn(null));
}

// start loading the persisted session as soon as anything imports this module
bootstrapAuth();
