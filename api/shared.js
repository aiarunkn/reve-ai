/**
 * /api/shared — shared worlds (one desired reality, many players).
 *
 * POST { action, ... }
 *   peek    { code }                                   -> { title, tagline, mood, players: [{name,color}] }
 *   create  { story, player: { name, color } }         -> { code, playerId, token, ...world }   (opens up a solo story)
 *   join    { code, name, color, about? }              -> { code, playerId, token, ...world }   (writes your arrival scene)
 *   load    { code, playerId, token }                  -> { world, players, turns }
 *
 * Needs SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (and ANTHROPIC_API_KEY for join) on the server.
 * The device token is returned once and only its hash is stored.
 */
import { sharedConfigured, loadWorld, loadAs, insertTurn, insertPlayer, forBrowser, db, httpError, newToken, hashToken } from './_db.js';
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
      case 'create': return send(res, 200, await create(body));
      case 'join': return send(res, 200, await join(body));
      case 'load': {
        const data = await loadAs({ ...body, code: normalizeCode(body.code) });
        return send(res, 200, forBrowser(data, data.me.id));
      }
      default: return send(res, 400, { error: 'Unknown action' });
    }
  } catch (err) {
    console.error('[shared]', err);
    return send(res, err.status || 500, { error: err.message || 'Something went wrong' });
  }
}

async function peek({ code }) {
  const { world, players } = await loadWorld(normalizeCode(code));
  return { code: world.code, title: world.bible.title, tagline: world.bible.tagline, mood: world.bible.mood, players: players.map((p) => ({ name: p.name, color: p.color })) };
}

const cleanName = (s) => String(s || '').replace(/\s+/g, ' ').trim().slice(0, 40);
const cleanColor = (c) => (PLAYER_COLORS.includes(c) ? c : PLAYER_COLORS[0]);

/** Open up a solo story: it becomes a world with a code, and its author is the first player. */
async function create({ story, player }) {
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
    name, color: cleanColor(player?.color), look: me.look || '', tag: me.tag || '', want: me.want || '', secret: me.secret || '', about: me.description || '', token_hash: hashToken(token),
  });
  if (prepared.length) {
    const r = await db().from('turns').insert(prepared.map((t) => ({ world_code: code, player_id: row.id, ...t })));
    if (r.error) throw httpError(502, `Database error (copy turns): ${r.error.message}`);
  }
  const data = await loadWorld(code);
  return { code, playerId: row.id, token, ...forBrowser(data, row.id) };
}

/** A friend joins with a code: the narrator writes how they arrive, then they're in. */
async function join({ code: raw, name: rawName, color, about }) {
  const code = normalizeCode(raw);
  if (!isCode(code)) throw httpError(400, 'That code should be 6 letters.');
  const name = cleanName(rawName);
  if (!name) throw httpError(400, 'What should people call you?');
  if (!process.env.ANTHROPIC_API_KEY) throw httpError(503, 'The narrator needs ANTHROPIC_API_KEY on the server.');
  const data = await loadWorld(code);
  if (data.players.length >= MAX_PLAYERS) throw httpError(409, `This world is full (${MAX_PLAYERS} dreamers).`);
  if (data.players.some((p) => p.name.toLowerCase() === name.toLowerCase())) throw httpError(409, `Someone here is already called ${name}. Pick another name?`);

  const draft = { id: 'arriving', name, color: cleanColor(color), about: String(about || '').slice(0, 400) };
  const arrival = await arrive(viewFor(data.world, data.players, data.turns, draft));

  const token = newToken();
  const row = await insertPlayer(code, {
    name, color: draft.color, about: draft.about, look: arrival.look, tag: arrival.tag, want: arrival.want, secret: arrival.secret, token_hash: hashToken(token),
  });
  await insertTurn(code, row.id, {
    kind: 'arrival',
    narration: arrival.narration,
    record: { scene: arrival.scene, time: arrival.time, choices: arrival.choices, consequences: [] },
  });
  const fresh = await loadWorld(code);
  return { code, playerId: row.id, token, ...forBrowser(fresh, row.id) };
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
    if (size > 2 * 1024 * 1024) throw httpError(413, 'Request too large.');
    chunks.push(c);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
}
