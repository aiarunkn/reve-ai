/**
 * Illustrations for stories, drawn by the image model behind /api/media.
 * Every image of one story shares a style line, so places, portraits and moments
 * look like they come from the same book. Images are generated once and cached
 * in IndexedDB (place<i>, portrait<i>, moment<turnIndex>).
 *
 * Shared worlds (story.shared?.code): a picture is painted once for the whole world and cached
 * in Supabase Storage (see api/shared.js → art/claimArt/putArt). Before painting any kind, this
 * device checks IndexedDB, then the shared cache, then claims it to paint it itself; if someone
 * else already claimed it, it waits a little and otherwise falls back to painting its own local
 * copy. Solo stories are unaffected: they always paint straight to IndexedDB, as before.
 */
import { getAsset, putAsset, emitAsset } from './assetStore';
import { authHeaders, RateLimited } from './authClient';
import { sharedArt, claimSharedArt, putSharedArt } from './sharedClient';

const ENDPOINT = import.meta.env.VITE_MEDIA_ENDPOINT || '/api/media';
let imagesOff = false; // flips to true once the server says no image key is configured

export class ImagesNotConfigured extends Error {
  constructor() {
    super('Illustrations need OPENAI_API_KEY on the server.');
    this.name = 'ImagesNotConfigured';
  }
}

const MOOD_LIGHT = {
  nostalgic: 'warm amber lamplight, dusky plum shadows, gold accents',
  weightless: 'cool moonlight, deep night blues, soft silver highlights',
  bittersweet: 'twilight lavender and rose, misty violet shadows',
  electric: 'neon cyan and magenta reflections, deep indigo night',
  quietlyHappy: 'soft morning sunlight, peach and cream, gentle greens',
};

const GUARD = 'Original characters and an original setting. No text, letters, logos, insignia or watermarks. Not a likeness of any real person or any existing franchise character.';

function styleLine(story) {
  return `Hand-painted animated-film illustration, soft gouache and watercolour textures, cinematic composition, ${story.bible.tone}. Light and palette: ${MOOD_LIGHT[story.bible.mood] || ''}.`;
}

export function placePrompt(story, i) {
  const p = story.bible.places[i];
  return `${styleLine(story)}\nA wide establishing view of "${p.name}" in ${story.bible.setting} ${p.description} No people in the foreground.\n${GUARD}`;
}

export function portraitPrompt(story, c) {
  return `${styleLine(story)}\nA three-quarter-length figure of ${c.name}, ${c.role}, standing centred and facing the viewer, as a character in a visual novel. ${c.look} Expression shows: ${c.personality} Plain dark, softly lit background in the story's palette, empty around the figure.\n${GUARD}`;
}

export function momentPrompt(story, turn) {
  const place = story.bible.places[story.scene] || story.bible.places[0];
  const text = turn.narration.replace(/\s+/g, ' ');
  const present = story.bible.cast.filter((c) => text.includes(c.name.split(' ')[0]));
  const me = story.players[0];
  const looks = [
    me.look ? `${me.name} (the protagonist): ${me.look}` : `${me.name} (the protagonist), seen from behind or in profile`,
    ...present.map((c) => `${c.name}: ${c.look}`),
  ].join(' ');
  return `${styleLine(story)}\nIllustrate this moment from the story, set in ${place?.name}: "${text.slice(0, 700)}"\nCharacters: ${looks}\n${GUARD}`;
}

export async function generateImage(prompt, shape = 'landscape') {
  if (imagesOff) throw new ImagesNotConfigured();
  const res = await fetch(ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(await authHeaders()) }, body: JSON.stringify({ action: 'image', prompt, shape }) });
  if (res.status === 501 || res.status === 404) {
    imagesOff = true;
    throw new ImagesNotConfigured();
  }
  if (res.status === 429) throw new RateLimited(await res.json().catch(() => ({})));
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.image) throw new Error(json.error || `Illustration failed (${res.status})`);
  return (await fetch(json.image)).blob();
}

/* ------------------------------ photos of places ------------------------------ */

/** What to search a photo library for: the narrator's searches, or (older stories) the place's name. */
export function photoSearches(place) {
  if (Array.isArray(place?.photo_search) && place.photo_search.length) return place.photo_search.slice(0, 3);
  const name = (place?.name || '').replace(/^the\s+/i, '').trim();
  return name ? [name] : [];
}

/** Looks up a real photo of a place from a free photo library (see api/media.js → photo), without storing it. */
async function fetchPlacePhoto(story, i) {
  const queries = photoSearches(story.bible.places[i]);
  if (!queries.length) return null;
  try {
    const res = await fetch(ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(await authHeaders()) }, body: JSON.stringify({ action: 'photo', queries }) });
    if (!res.ok) return null;
    const json = await res.json();
    if (!json.image) return null;
    const blob = await (await fetch(json.image)).blob();
    return { blob, mime: blob.type || 'image/jpeg', credit: json.credit || null };
  } catch (err) {
    console.warn('[photo]', err.message);
    return null;
  }
}

/**
 * A real photo of a place from a free photo library. Saves it as place<i> with its credit
 * as credit<i>. Returns true if one was found. (Solo stories only call this directly.)
 */
export async function findPlacePhoto(story, i) {
  const photo = await fetchPlacePhoto(story, i);
  if (!photo) return false;
  await putAsset(story.id, `place${i}`, photo.blob);
  if (photo.credit) await putAsset(story.id, `credit${i}`, photo.credit);
  return true;
}

/** What actually paints one kind: a place (real photo first, then AI), a portrait, or a moment. */
async function paintKind(story, kind) {
  const place = kind.match(/^place(\d+)$/);
  if (place) {
    const i = Number(place[1]);
    const photo = await fetchPlacePhoto(story, i);
    if (photo) return photo;
    if (imagesOff) return null;
    return { blob: await generateImage(placePrompt(story, i), 'landscape'), mime: 'image/jpeg' };
  }
  const portrait = kind.match(/^portrait(\d+)$/);
  if (portrait) {
    if (imagesOff) return null;
    const c = story.bible.cast[Number(portrait[1])];
    return { blob: await generateImage(portraitPrompt(story, c), 'portrait'), mime: 'image/jpeg' };
  }
  const moment = kind.match(/^moment(\d+)$/);
  if (moment) {
    return { blob: await generateImage(momentPrompt(story, story.turns[Number(moment[1])]), 'landscape'), mime: 'image/jpeg' };
  }
  return null;
}

async function storeLocally(story, kind, result) {
  await putAsset(story.id, kind, result.blob);
  const i = kind.match(/^place(\d+)$/)?.[1];
  if (i != null && result.credit) await putAsset(story.id, `credit${i}`, result.credit);
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1] || '');
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}
const textToBase64 = (s) => btoa(unescape(encodeURIComponent(s)));

async function uploadToShared(code, kind, result) {
  await putSharedArt(code, kind, result.mime || 'image/jpeg', await blobToBase64(result.blob));
  const i = kind.match(/^place(\d+)$/)?.[1];
  if (i != null && result.credit) {
    await putSharedArt(code, `credit${i}`, 'application/json', textToBase64(JSON.stringify(result.credit)));
  }
}

async function downloadReady(story, kind, info) {
  const res = await fetch(info.url);
  if (!res.ok) throw new Error(`Could not download ${kind}`);
  const value = info.mime === 'application/json' ? await res.json() : await res.blob();
  await putAsset(story.id, kind, value);
}

/** If a place's photo credit is ready in the shared cache and we don't have it yet, grab it too. */
async function syncCredit(story, placeIndex, code) {
  const kind = `credit${placeIndex}`;
  if (await getAsset(story.id, kind)) return;
  const ready = await sharedArt(code).catch(() => ({}));
  if (ready[kind]) await downloadReady(story, kind, ready[kind]);
}

const WAIT_POLL_MS = 5000;
const WAIT_TIMEOUT_MS = 90000;

/** Polls the shared cache until `kind` is ready, or gives up after 90s. */
async function waitForArt(code, kind) {
  const started = Date.now();
  while (Date.now() - started < WAIT_TIMEOUT_MS) {
    await new Promise((r) => setTimeout(r, WAIT_POLL_MS));
    const ready = await sharedArt(code).catch(() => ({}));
    if (ready[kind]) return ready[kind];
  }
  return null;
}

/**
 * Paints (or fetches) one picture and caches it locally. Solo stories always paint straight to
 * IndexedDB. Shared worlds check the cache, claim the kind if nobody else is painting it, or wait
 * for whoever is; if nobody finishes in time, this device paints its own local copy instead.
 * Returns true if a NEW picture just landed locally (so the caller should announce it).
 */
async function resolveArt(story, kind) {
  if (await getAsset(story.id, kind)) return false;
  const code = story.shared?.code;
  const placeIndex = kind.match(/^place(\d+)$/)?.[1];

  if (!code) {
    const result = await paintKind(story, kind);
    if (!result) return false;
    await storeLocally(story, kind, result);
    return true;
  }

  const ready = await sharedArt(code).catch(() => ({}));
  if (ready[kind]) {
    await downloadReady(story, kind, ready[kind]);
    if (placeIndex != null && ready[`credit${placeIndex}`]) await downloadReady(story, `credit${placeIndex}`, ready[`credit${placeIndex}`]);
    return true;
  }

  const claim = await claimSharedArt(code, kind).catch(() => ({ claimed: true }));
  if (claim.ready) {
    await downloadReady(story, kind, claim);
    if (placeIndex != null) await syncCredit(story, placeIndex, code);
    return true;
  }
  if (claim.wait) {
    const found = await waitForArt(code, kind);
    if (found) {
      await downloadReady(story, kind, found);
      if (placeIndex != null) await syncCredit(story, placeIndex, code);
      return true;
    }
    // nobody finished in time: paint our own copy, without uploading (someone else may still land one)
    const result = await paintKind(story, kind);
    if (!result) return false;
    await storeLocally(story, kind, result);
    return true;
  }

  // we hold the claim: paint it, cache it, and share it with everyone else
  const result = await paintKind(story, kind);
  if (!result) return false;
  await storeLocally(story, kind, result);
  uploadToShared(code, kind, result).catch((err) => console.warn('[art] could not upload', kind, err.message));
  return true;
}

/* ------------------------------ background art queue ------------------------------ */

const running = new Set();

/** Paint one place or portrait now (used to have the opening room ready before you step in). */
export async function paintNow(story, kind) {
  if (!/^(place|portrait)\d+$/.test(kind)) return;
  await resolveArt(story, kind);
}

/**
 * Fill in anything a story is still missing: places (photo, else painting) and cast portraits.
 * Runs once per story at a time, one image after another, and announces each as it lands.
 */
export async function ensureStoryArt(story) {
  if (running.has(story.id)) return;
  running.add(story.id);
  try {
    // the room you're standing in and the people in it come first; the rest of the world after
    const here = story.scene || 0;
    const placeOrder = [here, ...story.bible.places.map((_, i) => i).filter((i) => i !== here)];
    const missingPlaces = [];
    for (const i of placeOrder) if (!(await getAsset(story.id, `place${i}`))) missingPlaces.push(i);
    const missingCast = [];
    for (let k = 0; k < story.bible.cast.length; k++) if (!(await getAsset(story.id, `portrait${k}`))) missingCast.push(k);

    const kinds = [
      ...missingPlaces.slice(0, 1).map((i) => `place${i}`),
      ...missingCast.map((k) => `portrait${k}`),
      ...missingPlaces.slice(1).map((i) => `place${i}`),
    ];
    for (const kind of kinds) {
      try {
        if (await resolveArt(story, kind)) emitAsset(story.id, kind);
      } catch (err) {
        if (!(err instanceof ImagesNotConfigured)) console.warn('[art] could not draw', kind, err.message);
      }
    }
  } finally {
    running.delete(story.id);
  }
}

export async function illustrateMoment(story, turnIndex) {
  const kind = `moment${turnIndex}`;
  await resolveArt(story, kind);
  const blob = await getAsset(story.id, kind);
  emitAsset(story.id, kind);
  return blob;
}
