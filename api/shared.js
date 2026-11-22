/**
 * /api/shared — shared worlds (one desired reality, many players).
 *
 * POST { action, ... }
 *   peek      { code }                                   -> { title, tagline, mood, players: [{name,color}] }
 *   create    { story, player: { name, color } }         -> { code, playerId, token, ...world }   (opens up a solo story)
 *   join      { code, name, color, about? }              -> { code, playerId, token, ...world }   (writes your arrival scene)
 *   load      { code, playerId, token }                  -> { world, players, turns }
 *   art       { code, playerId, token }                   -> { art: { kind: { url } } }            (ready pictures, signed URLs)
 *   claimArt  { code, playerId, token, kind }             -> { claimed: true } | { wait: true } | { ready: true, url }
 *   putArt    { code, playerId, token, kind, mime, data }  -> { ok: true }                          (base64 upload; marks it ready)
 *
 * Needs SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (and ANTHROPIC_API_KEY for join) on the server.
 * The device token is returned once and only its hash is stored. `create` and `join` count against
 * the "world"/"join" rate limits, and joining also writes an AI arrival, which counts against "turn".
 */
import { sharedConfigured, loadWorld, loadAs, insertTurn, insertPlayer, forBrowser, db, httpError, newToken, hashToken } from './_db.js';
import { listReadyArt, claimArt as claimArtRow, putArt as putArtRow } from './_art.js';
import { enforce, checkRateLimit } from './_limits.js';
import { identify } from './_auth.js';
import { arrive } from './story.js';
import { viewFor, worldFromStory, newCode, normalizeCode, isCode, PLAYER_COLORS } from '../src/shared/worldState.js';

const MAX_PLAYERS = 8;

export default async function handler(req, res) {
  if (!sharedConfigured()) {
    return send(res, 501, { error: 'not-configured', message: 'Shared worlds need SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY on the server.' });
  }
  const origin = req.headers.origin;
  if (origin && new URL(origin).host !== req.headers.host) return send(res, 403, { error: 'Forbidden origin' });
  if (req.method !== 'POST') return send(res, 405, { error: 'Use POST' });

  try {
    const body = req.body && typeof req.body === 'object' ? req.body : await readJson(req);
    switch (body.action) {
      case 'peek': return send(res, 200, await peek(body));
      case 'create': {
        const { identity, ok, status, body: limitBody } = await enforce(req, 'world');
        if (!ok) return send(res, status, limitBody);
        return send(res, 200, await create(body, identity));
      }
      case 'join': {
        const { identity, ok, status, body: limitBody } = await enforce(req, 'join');
        if (!ok) return send(res, status, limitBody);
        return send(res, 200, await join(body, identity, req));
      }
      case 'load': {
        const identity = await identify(req);
        const data = await loadAs({ ...body, code: normalizeCode(body.code), userId: identity.userId });
        return send(res, 200, forBrowser(data, data.me.id));
      }
      case 'art': return send(res, 200, await art(body));
      case 'claimArt': return send(res, 200, await claim(body));
      case 'putArt': return send(res, 200, await put(body));
      default: return send(res, 400, { error: 'Unknown action' });
    }
  } catch (err) {
    console.error('[shared]', err);
    return send(res, err.status || 500, err.body || { error: err.message || 'Something went wrong' });
  }
}

async function peek({ code }) {
  const { world, players } = await loadWorld(normalizeCode(code));
  return { code: world.code, title: world.bible.title, tagline: world.bible.tagline, mood: world.bible.mood, players: players.map((p) => ({ name: p.name, color: p.color })) };
}

const cleanName = (s) => String(s || '').replace(/\s+/g, ' ').trim().slice(0, 40);
const cleanColor = (c) => (PLAYER_COLORS.includes(c) ? c : PLAYER_COLORS[0]);

/** Open up a solo story: it becomes a world with a code, and its author is the first player. */
async function create({ story, player }, identity) {
  if (!story?.bible?.places?.length || !Array.isArray(story.turns)) throw httpError(400, 'Missing story.');
  if (JSON.stringify(story).length > 1_500_000) throw httpError(413, 'This story is too long to share.');
  const me = story.players?.[0] || {};
  const name = cleanName(player?.name || me.name);
  if (!name) throw httpError(400, 'Choose a name first.');

  // find a free code
  let code;
  let prepared;
  for (let i = 0; i < 6 && !code; i++) {
    const c = newCode();
    const { world, turns } = worldFromStory(story, c);
    const r = await db().from('worlds').insert(world);
    if (!r.error) { code = c; prepared = turns; }
    else if (r.error.code !== '23505') throw httpError(502, `Database error (create): ${r.error.message}`);
  }
  if (!code) throw httpError(503, 'Couldn’t find a free code. Try again.');

  const token = newToken();
  const row = await insertPlayer(code, {
    name, color: cleanColor(player?.color), look: me.look || '', tag: me.tag || '', want: me.want || '', secret: me.secret || '', about: me.description || '', token_hash: hashToken(token), user_id: identity?.userId || null,
  });
  if (prepared.length) {
    const r = await db().from('turns').insert(prepared.map((t) => ({ world_code: code, player_id: row.id, ...t })));
    if (r.error) throw httpError(502, `Database error (copy turns): ${r.error.message}`);
  }
  const data = await loadWorld(code);
  return { code, playerId: row.id, token, ...forBrowser(data, row.id) };
}

/** A friend joins with a code: the narrator writes how they arrive, then they're in. */
async function join({ code: raw, name: rawName, color, about }, identity, req) {
  const code = normalizeCode(raw);
  if (!isCode(code)) throw httpError(400, 'That code should be 6 letters.');
  const name = cleanName(rawName);
  if (!name) throw httpError(400, 'What should people call you?');
  if (!process.env.ANTHROPIC_API_KEY) throw httpError(503, 'The narrator needs ANTHROPIC_API_KEY on the server.');
  const data = await loadWorld(code);
  if (data.players.length >= MAX_PLAYERS) throw httpError(409, `This world is full (${MAX_PLAYERS} dreamers).`);
  if (data.players.some((p) => p.name.toLowerCase() === name.toLowerCase())) throw httpError(409, `Someone here is already called ${name}. Pick another name?`);

  // the arrival itself is a narrator call, same cost as a turn
  const turnLimit = await checkRateLimit(identity, 'turn');
  if (!turnLimit.ok) throw Object.assign(new Error(turnLimit.body.error), { status: turnLimit.status, body: turnLimit.body });

  const draft = { id: 'arriving', name, color: cleanColor(color), about: String(about || '').slice(0, 400) };
  const arrival = await arrive(viewFor(data.world, data.players, data.turns, draft));

  const token = newToken();
  const row = await insertPlayer(code, {
    name, color: draft.color, about: draft.about, look: arrival.look, tag: arrival.tag, want: arrival.want, secret: arrival.secret, token_hash: hashToken(token), user_id: identity?.userId || null,
  });
  await insertTurn(code, row.id, {
    kind: 'arrival',
    narration: arrival.narration,
    record: { scene: arrival.scene, time: arrival.time, choices: arrival.choices, consequences: [] },
  });
  const fresh = await loadWorld(code);
  return { code, playerId: row.id, token, ...forBrowser(fresh, row.id) };
}

/* ------------------------------ the shared picture cache ------------------------------ */

const validKind = (k) => /^[a-z]+[0-9]{0,3}$/i.test(String(k || ''));

async function art({ code: raw, playerId, token }) {
  const code = normalizeCode(raw);
  await loadAs({ code, playerId, token }); // the device-token check: wrong token throws 403
  return { art: await listReadyArt(code) };
}

async function claim({ code: raw, playerId, token, kind }) {
  const code = normalizeCode(raw);
  if (!validKind(kind)) throw httpError(400, 'Invalid picture kind.');
  const { me } = await loadAs({ code, playerId, token });
  return claimArtRow(code, kind, me.id);
}

async function put({ code: raw, playerId, token, kind, mime, data }) {
  const code = normalizeCode(raw);
  if (!validKind(kind)) throw httpError(400, 'Invalid picture kind.');
  const { me } = await loadAs({ code, playerId, token });
  return putArtRow(code, kind, me.id, mime, data);
}

function send(res, code, body) {
  res.statusCode = code;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
}

async function readJson(req) {
  const chunks = [];
  let size = 0;
  for await (const c of req) {
    size += c.length;
    if (size > 6 * 1024 * 1024) throw httpError(413, 'Request too large.');
    chunks.push(c);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
}
