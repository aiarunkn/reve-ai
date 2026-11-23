/**
 * /api/_art — shared picture cache for shared worlds (Supabase Storage bucket "world-art").
 * Files starting with "_" in /api are helpers, not endpoints.
 *
 * One painting per (world, kind): a place, a portrait, a moment, or a place's photo credit
 * (stored as JSON under its own kind, e.g. "credit0"). Whoever gets the claim paints it and
 * uploads it; everyone else downloads the same file. Images travel as base64 in the JSON body,
 * the same way every other image already does in this app (api/media.js, api/story.js's begin).
 */
import { db, httpError } from './_db.js';

export const BUCKET = 'world-art';
const SIGNED_URL_SECONDS = 60 * 60; // 1 hour
const STALE_SECONDS = 180; // 3 minutes: a claim older than this can be taken by someone else

const EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'application/json': 'json' };
const extFor = (mime) => EXT[mime] || 'bin';
export const pathFor = (code, kind, mime) => `w/${code}/${kind}.${extFor(mime)}`;

/** Every ready picture for one world, as short-lived signed URLs. Never another world's. */
export async function listReadyArt(code) {
  const r = await db().from('world_art').select('kind, path, mime').eq('world_code', code).eq('status', 'ready');
  if (r.error) throw httpError(502, `Database error (art): ${r.error.message}`);
  const out = {};
  await Promise.all((r.data || []).map(async (row) => {
    if (!row.path) return;
    const signed = await db().storage.from(BUCKET).createSignedUrl(row.path, SIGNED_URL_SECONDS);
    if (signed.data?.signedUrl) out[row.kind] = { url: signed.data.signedUrl, mime: row.mime };
  }));
  return out;
}

/**
 * Atomically claim a kind to paint it, via the claim_art() Postgres function (one DB round trip,
 * serialized per world+kind so two players racing for the same kind can't both win it).
 */
export async function claimArt(code, kind, playerId) {
  const r = await db().rpc('claim_art', { p_world_code: code, p_kind: kind, p_claimed_by: playerId, p_stale_seconds: STALE_SECONDS });
  if (r.error) throw httpError(502, `Database error (claimArt): ${r.error.message}`);
  const row = Array.isArray(r.data) ? r.data[0] : r.data;
  if (!row) throw httpError(502, 'claim_art returned nothing.');
  if (row.status === 'ready') {
    const signed = await db().storage.from(BUCKET).createSignedUrl(row.path, SIGNED_URL_SECONDS);
    return { ready: true, url: signed.data?.signedUrl, mime: row.mime };
  }
  if (row.status === 'wait') return { wait: true };
  return { claimed: true };
}

/** Upload a painting and mark it ready. Only the player holding the claim can do this. */
export async function putArt(code, kind, playerId, mime, base64) {
  if (!base64 || typeof base64 !== 'string') throw httpError(400, 'Missing image data.');
  const bytes = Buffer.from(base64, 'base64');
  if (bytes.length > 4 * 1024 * 1024) throw httpError(413, 'That picture is too large to cache.');
  const path = pathFor(code, kind, mime);
  const up = await db().storage.from(BUCKET).upload(path, bytes, { contentType: mime || 'application/octet-stream', upsert: true });
  if (up.error) throw httpError(502, `Storage error (putArt): ${up.error.message}`);
  const r = await db()
    .from('world_art')
    .update({ status: 'ready', path, mime, updated_at: new Date().toISOString() })
    .eq('world_code', code)
    .eq('kind', kind)
    .eq('claimed_by', playerId)
    .select('kind')
    .maybeSingle();
  if (r.error) throw httpError(502, `Database error (putArt): ${r.error.message}`);
  if (!r.data) throw httpError(409, 'You no longer hold the claim for that picture.');
  return { ok: true };
}
