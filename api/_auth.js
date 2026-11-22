/**
 * /api/_auth — who is calling the server: a signed-in Supabase Auth user, or a guest.
 * Files starting with "_" in /api are helpers, not endpoints.
 */
import { createHash } from 'node:crypto';
import { db, sharedConfigured } from './_db.js';

/** Verifies the bearer token with the service-role client. Returns { userId, email } or null. */
export async function getUser(req) {
  const header = req.headers.authorization || req.headers.Authorization;
  const token = typeof header === 'string' ? header.match(/^Bearer\s+(.+)$/i)?.[1] : null;
  if (!token || !sharedConfigured()) return null;
  try {
    const { data, error } = await db().auth.getUser(token);
    if (error || !data?.user) return null;
    return { userId: data.user.id, email: data.user.email || '' };
  } catch (err) {
    console.warn('[_auth] getUser failed', err.message);
    return null;
  }
}

function clientIp(req) {
  const fwd = req.headers['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd.trim()) return fwd.split(',')[0].trim();
  return req.socket?.remoteAddress || 'unknown';
}

/** A stable, anonymous key for a guest device: sha256(ip + a server-only salt). The raw IP is never stored. */
export function guestKey(req) {
  const salt = process.env.RATE_LIMIT_SALT || '';
  return `guest:${createHash('sha256').update(`${clientIp(req)}:${salt}`).digest('hex')}`;
}

/**
 * Who is calling, for rate limiting and for linking shared-world players to accounts.
 * An invalid or expired bearer token is treated exactly like no token: a guest, never another user.
 */
export async function identify(req) {
  const user = await getUser(req);
  if (user) return { userId: user.userId, email: user.email, subject: `user:${user.userId}`, isGuest: false };
  return { userId: null, email: null, subject: guestKey(req), isGuest: true };
}
