/**
 * Browser side of shared worlds (see api/shared.js and src/shared/worldState.js).
 *
 * - Your identity in a world (player id + device token) lives in localStorage.
 * - The world itself is always loaded from the server; this device only caches pictures.
 * - Live updates: a Supabase Realtime channel per world carries "someone just played" pings
 *   and who's here right now. Without VITE_SUPABASE_* it falls back to checking every 20s.
 */
import { supabase, authHeaders, RateLimited } from './authClient';
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

export { RateLimited };

async function post(body) {
  const res = await fetch(ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(await authHeaders()) }, body: JSON.stringify(body) });
  const json = (await res.json().catch(() => null)) || {};
  if (res.status === 501 || (res.status === 404 && !json.error)) throw new SharedNotConfigured();
  if (res.status === 429) throw new RateLimited(json);
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
  const assets = await Promise.all(kinds.map(async (k) => [k, await getAsset(story.id, k)]));
  const present = assets.filter(([, a]) => a);
  await Promise.all(present.map(([k, a]) => putAsset(view.id, k, a)));
  await deleteStory(story.id);
  remember(view);
  offerArt(data.code, present); // friends get these right away, instead of painting them again
  return view;
}

/* ------------------------------ the shared picture cache ------------------------------ */

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1] || '');
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}
const textToBase64 = (s) => btoa(unescape(encodeURIComponent(s)));

/** Ready pictures for a shared world, as `{ kind: { url, mime } }`. */
export async function sharedArt(code) {
  const id = identityFor(code);
  if (!id) return {};
  const { art } = await post({ action: 'art', code, ...id });
  return art || {};
}

/** Claim a kind to paint it: `{ claimed: true }` | `{ wait: true }` | `{ ready: true, url, mime }`. */
export async function claimSharedArt(code, kind) {
  const id = identityFor(code);
  if (!id) return { claimed: true }; // not actually in this world: paint locally, offer nothing
  return post({ action: 'claimArt', code, kind, ...id });
}

/** Upload a painted picture (base64) and mark it ready for everyone. */
export async function putSharedArt(code, kind, mime, data) {
  const id = identityFor(code);
  if (!id) return { ok: false };
  return post({ action: 'putArt', code, kind, mime, data, ...id });
}

/** Best-effort: offer pictures this device already painted, so friends don't repaint them. */
function offerArt(code, assets) {
  Promise.all(assets.map(async ([kind, value]) => {
    try {
      const claim = await claimSharedArt(code, kind);
      if (!claim.claimed) return; // already cached, or someone else is already painting it
      if (kind.startsWith('credit')) await putSharedArt(code, kind, 'application/json', textToBase64(JSON.stringify(value)));
      else await putSharedArt(code, kind, value.type || 'image/jpeg', await blobToBase64(value));
    } catch (err) {
      console.warn('[art] could not offer', kind, err.message);
    }
  })).catch(() => {});
}

/** Forget a world on this device (it carries on for everyone else). */
export async function leaveShared(code) {
  try { localStorage.removeItem(ID_KEY(code)); } catch { /* ignore */ }
  await deleteStory(`w-${code}`);
}

/* ------------------------------ live: pings + who's here ------------------------------ */

const live = () => supabase();

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
