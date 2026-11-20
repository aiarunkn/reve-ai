/**
 * Browser side of shared worlds (see api/shared.js and src/shared/worldState.js).
 *
 * - Your identity in a world (player id + device token) lives in localStorage.
 * - The world itself is always loaded from the server; this device only caches pictures.
 * - Live updates: a Supabase Realtime channel per world carries "someone just played" pings
 *   and who's here right now. Without VITE_SUPABASE_* it falls back to checking every 20s.
 */
import { createClient } from '@supabase/supabase-js';
import { viewFor, normalizeCode } from '../shared/worldState';
import { loadStoryIndex, saveIndex, summaryOf, deleteStory } from './storyStore';
import { getAsset, putAsset } from './assetStore';

const ENDPOINT = import.meta.env.VITE_SHARED_ENDPOINT || '/api/shared';
const ID_KEY = (code) => `reve-ai:shared:${code}`;

export class SharedNotConfigured extends Error {
  constructor() {
    super('Shared worlds aren’t switched on yet: add the Supabase keys on the server (see README → Shared worlds).');
    this.name = 'SharedNotConfigured';
  }
}

async function post(body) {
  const res = await fetch(ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const json = (await res.json().catch(() => null)) || {};
  if (res.status === 501 || (res.status === 404 && !json.error)) throw new SharedNotConfigured();
  if (!res.ok) throw Object.assign(new Error(json.error || json.message || `Request failed (${res.status})`), { status: res.status });
  return json;
}

/* ------------------------------ who you are in each world ------------------------------ */

export function identityFor(code) {
  try { return JSON.parse(localStorage.getItem(ID_KEY(code)) || 'null'); } catch { return null; }
}
function saveIdentity(code, id) {
  try { localStorage.setItem(ID_KEY(code), JSON.stringify(id)); } catch { /* private mode */ }
}
export const sharedCode = (storyId) => (storyId?.startsWith('w-') ? storyId.slice(2) : null);
export const inviteLink = (code) => `${window.location.origin}${window.location.pathname}#/w/${code}`;

function remember(view) {
  saveIndex([...loadStoryIndex().filter((x) => x.id !== view.id), summaryOf(view)]);
}

function toView(data, playerId) {
  const me = data.players.find((p) => p.id === playerId);
  if (!me) throw new Error('You’re no longer in this world.');
  return viewFor(data.world, data.players, data.turns, me);
}

/** Make sure a world you're in shows on your map (e.g. opened from an invite link on this device). */
export function ensureIndexed(code) {
  const id = `w-${code}`;
  if (loadStoryIndex().some((x) => x.id === id)) return;
  const now = new Date().toISOString();
  saveIndex([...loadStoryIndex(), { id, shared: code, title: 'A shared dream', tagline: '', mood: 'weightless', createdAt: now, updatedAt: now, chapter: 1, players: [] }]);
}

/* ------------------------------ actions ------------------------------ */

export const peekWorld = (code) => post({ action: 'peek', code: normalizeCode(code) });

/** Your view of a world you're in. */
export async function loadShared(code) {
  const id = identityFor(code);
  if (!id) throw Object.assign(new Error('Join this world first.'), { status: 403 });
  const view = toView(await post({ action: 'load', code, ...id }), id.playerId);
  remember(view);
  return view;
}

/** Join a friend's world. The narrator writes your arrival; resolves to your view. */
export async function joinShared(code, { name, color, about }) {
  const data = await post({ action: 'join', code: normalizeCode(code), name, color, about });
  saveIdentity(data.code, { playerId: data.playerId, token: data.token });
  const view = toView(data, data.playerId);
  remember(view);
  return view;
}

/** Open up one of your solo stories to friends. It keeps everything and moves to its new code. */
export async function shareStory(story, color) {
  const slim = { premise: story.premise, bible: story.bible, players: story.players.slice(0, 1), ledger: story.ledger, chapter: story.chapter, scene: story.scene, time: story.time, turns: story.turns };
  const data = await post({ action: 'create', story: slim, player: { name: story.players[0].name, color } });
  saveIdentity(data.code, { playerId: data.playerId, token: data.token });
  const view = toView(data, data.playerId);
  // keep the pictures this device already painted, so nothing is drawn twice
  const kinds = [...Array.from({ length: 8 }, (_, i) => [`place${i}`, `portrait${i}`, `credit${i}`]).flat()];
  await Promise.all(kinds.map(async (k) => { const a = await getAsset(story.id, k); if (a) await putAsset(view.id, k, a); }));
  await deleteStory(story.id);
  remember(view);
  return view;
}

/** Forget a world on this device (it carries on for everyone else). */
export async function leaveShared(code) {
  try { localStorage.removeItem(ID_KEY(code)); } catch { /* ignore */ }
  await deleteStory(`w-${code}`);
}

/* ------------------------------ live: pings + who's here ------------------------------ */

let realtime;
const live = () => {
  const url = import.meta.env.VITE_SUPABASE_URL;
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return (realtime ??= createClient(url, key, { auth: { persistSession: false } }));
};

/**
 * Listen to a world. `onPing({ playerId, name, color, preview })` fires when someone else plays;
 * `onHere([{ playerId, name, color }])` when people come and go.
 * Returns { announce(payload), close() }.
 */
export function connectLive(code, me, { onPing, onHere }) {
  const client = live();
  if (!client) {
    // no Realtime keys: check for news every 20 seconds instead
    const t = setInterval(() => onPing?.(null), 20000);
    onHere?.([{ playerId: me.id, name: me.name, color: me.color }]);
    return { announce() {}, close() { clearInterval(t); }, polling: true };
  }
  const channel = client.channel(`world:${code}`, { config: { presence: { key: me.id }, broadcast: { self: false } } });
  channel
    .on('broadcast', { event: 'turn' }, ({ payload }) => payload?.playerId !== me.id && onPing?.(payload))
    .on('presence', { event: 'sync' }, () => {
      const state = channel.presenceState();
      onHere?.(Object.values(state).map((list) => list[0]).filter(Boolean));
    })
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') channel.track({ playerId: me.id, name: me.name, color: me.color });
    });
  return {
    announce(payload) { channel.send({ type: 'broadcast', event: 'turn', payload: { playerId: me.id, name: me.name, color: me.color, ...payload } }); },
    close() { client.removeChannel(channel); },
  };
}
