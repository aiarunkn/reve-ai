/**
 * /api/_limits — per-day rate limits, so one viral post can't drain the Anthropic/OpenAI credits.
 * Files starting with "_" in /api are helpers, not endpoints.
 *
 * Call `enforce(req, kind)` before ever calling Claude/OpenAI for that kind of work.
 * It returns { identity, ok } and, when ok is false, { status: 429, body } ready to send back.
 *
 * Kinds and defaults (signed-in / guest), overridable with the env JSON RATE_LIMITS, e.g.
 *   RATE_LIMITS={"turn":{"signedIn":300},"image":{"guest":5}}
 * A per-kind global daily ceiling (across everyone) acts as a circuit breaker, overridable with
 * the env JSON GLOBAL_DAILY_CAPS, e.g. GLOBAL_DAILY_CAPS={"turn":20000}.
 */
import { db, sharedConfigured } from './_db.js';
import { identify } from './_auth.js';

export const KINDS = ['turn', 'world', 'join', 'image', 'recap'];

const DEFAULTS = {
  turn: { signedIn: 150, guest: 15 },
  world: { signedIn: 6, guest: 1 },
  join: { signedIn: 10, guest: 2 },
  image: { signedIn: 60, guest: 10 },
  recap: { signedIn: 40, guest: 5 },
};

const GLOBAL_DEFAULTS = {
  turn: 20000,
  world: 2000,
  join: 2000,
  image: 8000,
  recap: 4000,
};

function parseJsonEnv(name) {
  const raw = process.env[name];
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    console.warn(`[_limits] ${name} is not valid JSON — ignoring it`);
    return {};
  }
}

export function limitFor(kind, isGuest) {
  const base = DEFAULTS[kind];
  if (!base) throw new Error(`Unknown rate-limit kind: ${kind}`);
  const o = parseJsonEnv('RATE_LIMITS')[kind] || {};
  const v = isGuest ? o.guest : o.signedIn;
  return Number.isFinite(v) ? v : isGuest ? base.guest : base.signedIn;
}

export function globalCapFor(kind) {
  const v = parseJsonEnv('GLOBAL_DAILY_CAPS')[kind];
  return Number.isFinite(v) ? v : GLOBAL_DEFAULTS[kind] ?? Infinity;
}

/** +1 a counter via the atomic Postgres function; -1 means refused (over the limit). */
async function bumpUsage(subject, kind, limit) {
  const { data, error } = await db().rpc('bump_usage', { p_subject: subject, p_kind: kind, p_limit: limit });
  if (error) {
    // the DB is the safety net here, not the feature itself: a transient error shouldn't lock everyone out
    console.error('[_limits] bump_usage failed', error.message);
    return 0;
  }
  return data;
}

const MIDNIGHT_MESSAGE = 'You’ve dreamed a lot today — the moon resets at midnight.';

/**
 * Checks (and consumes) one unit of `kind` for this caller. Call this right before the AI call
 * it guards, never after. Returns { ok: true } or { ok: false, status: 429, body }.
 */
export async function checkRateLimit(identity, kind) {
  if (!sharedConfigured()) return { ok: true }; // no DB configured: nothing to meter against yet

  const globalCap = globalCapFor(kind);
  if ((await bumpUsage(`global:${kind}`, kind, globalCap)) === -1) {
    return { ok: false, status: 429, body: { error: `${MIDNIGHT_MESSAGE} (This is very popular right now.)`, kind, limit: globalCap, signIn: false } };
  }

  const limit = limitFor(kind, identity.isGuest);
  if ((await bumpUsage(identity.subject, kind, limit)) === -1) {
    return {
      ok: false,
      status: 429,
      body: { error: identity.isGuest ? `${MIDNIGHT_MESSAGE} Sign in to keep dreaming.` : MIDNIGHT_MESSAGE, kind, limit, signIn: identity.isGuest },
    };
  }
  return { ok: true };
}

export { identify };

/** identify() + checkRateLimit() in one call, for the common case. */
export async function enforce(req, kind) {
  const identity = await identify(req);
  const result = await checkRateLimit(identity, kind);
  return { identity, ...result };
}
