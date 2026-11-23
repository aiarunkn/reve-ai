/**
 * Server-only access to shared worlds in Supabase (service-role key; never sent to the browser).
 * Files starting with "_" in /api are helpers, not endpoints.
 */
import { createClient } from '@supabase/supabase-js';
import { createHash, randomBytes } from 'node:crypto';
import { viewFor, isCode } from '../src/shared/worldState.js';

let client;
export const sharedConfigured = () => !!(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
export const db = () =>
  (client ??= createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  }));

export const httpError = (status, message) => Object.assign(new Error(message), { status });
export const newToken = () => randomBytes(24).toString('base64url');
export const hashToken = (t) => createHash('sha256').update(String(t)).digest('hex');

const MAX_TURNS = 600;

function check(result, what) {
  if (result.error) throw httpError(502, `Database error (${what}): ${result.error.message}`);
  return result.data;
}

/** The whole world: its bible, everyone in it, and the turns (oldest first). */
export async function loadWorld(code) {
  if (!isCode(code)) throw httpError(400, 'That code should be 6 letters.');
  const s = db();
  const [w, p, t] = await Promise.all([
    s.from('worlds').select('*').eq('code', code).maybeSingle(),
    s.from('players').select('*').eq('world_code', code).order('created_at'),
    s.from('turns').select('*').eq('world_code', code).order('id', { ascending: false }).limit(MAX_TURNS),
  ]);
  const world = check(w, 'world');
  if (!world) throw httpError(404, 'No world with that code. Check the letters?');
  return { world, players: check(p, 'players'), turns: check(t, 'turns').reverse() };
}

/** Load a world and confirm this device really is that player. */
export async function loadAs({ code, playerId, token, userId }) {
  const data = await loadWorld(code);
  let me = data.players.find((p) => p.id === playerId);
  if (!me || !token || me.token_hash !== hashToken(token)) throw httpError(403, 'This device isn’t in that world yet. Join it from the invite link.');
  // a signed-in player whose device token predates their account: attach it, once
  if (userId && !me.user_id) {
    const r = await db().from('players').update({ user_id: userId }).eq('id', me.id).select('*').maybeSingle();
    if (!r.error && r.data) {
      me = r.data;
      data.players = data.players.map((p) => (p.id === me.id ? me : p));
    }
  }
  return { ...data, me };
}

/** The story object the narrator works from, for one player. */
export const narratorView = ({ world, players, turns, me }) => viewFor(world, players, turns, me);

export async function insertTurn(code, playerId, { kind = 'turn', actions = [], narration, record }) {
  const r = await db().from('turns').insert({ world_code: code, player_id: playerId, kind, actions, narration, record }).select('id, created_at').single();
  return check(r, 'save turn');
}

export async function insertPlayer(code, player) {
  const r = await db().from('players').insert({ world_code: code, ...player }).select('*').single();
  return check(r, 'add player');
}

/** What the browser may see: no tokens, and only your own secret. */
export function forBrowser({ world, players, turns }, myId) {
  return {
    world: { code: world.code, premise: world.premise, bible: world.bible, base: world.base, created_at: world.created_at },
    players: players.map(({ token_hash, secret, want, about, user_id, ...p }) => (p.id === myId ? { ...p, secret, want, about } : p)),
    turns,
  };
}
