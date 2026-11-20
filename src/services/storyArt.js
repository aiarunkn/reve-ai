/**
 * Illustrations for stories, drawn by the image model behind /api/media.
 * Every image of one story shares a style line, so places, portraits and moments
 * look like they come from the same book. Images are generated once and cached
 * in IndexedDB (place<i>, portrait<i>, moment<turnIndex>).
 */
import { getAsset, putAsset, emitAsset } from './assetStore';

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
  const res = await fetch(ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'image', prompt, shape }) });
  if (res.status === 501 || res.status === 404) {
    imagesOff = true;
    throw new ImagesNotConfigured();
  }
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

/**
 * A real photo of a place from a free photo library (see api/media.js → photo).
 * Saves it as place<i> with its credit as credit<i>. Returns true if one was found.
 */
export async function findPlacePhoto(story, i) {
  const queries = photoSearches(story.bible.places[i]);
  if (!queries.length) return false;
  try {
    const res = await fetch(ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'photo', queries }) });
    if (!res.ok) return false;
    const json = await res.json();
    if (!json.image) return false;
    await putAsset(story.id, `place${i}`, await (await fetch(json.image)).blob());
    if (json.credit) await putAsset(story.id, `credit${i}`, json.credit);
    return true;
  } catch (err) {
    console.warn('[photo]', err.message);
    return false;
  }
}

/** A place's picture: a real photo first, an AI painting if none is found (and images are set up). */
async function drawPlace(story, i) {
  if (await findPlacePhoto(story, i)) return true;
  if (imagesOff) return false;
  await putAsset(story.id, `place${i}`, await generateImage(placePrompt(story, i), 'landscape'));
  return true;
}

/* ------------------------------ background art queue ------------------------------ */

const running = new Set();

/** Paint one place or portrait now (used to have the opening room ready before you step in). */
export async function paintNow(story, kind) {
  const m = kind.match(/^(place|portrait)(\d+)$/);
  if (!m || (await getAsset(story.id, kind))) return;
  const i = Number(m[2]);
  if (m[1] === 'place') return drawPlace(story, i);
  await putAsset(story.id, kind, await generateImage(portraitPrompt(story, story.bible.cast[i]), 'portrait'));
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

    const jobs = [
      ...missingPlaces.slice(0, 1).map((i) => ({ kind: `place${i}`, run: () => drawPlace(story, i) })),
      ...missingCast.map((k) => ({ kind: `portrait${k}`, run: async () => { if (imagesOff) return false; await putAsset(story.id, `portrait${k}`, await generateImage(portraitPrompt(story, story.bible.cast[k]), 'portrait')); return true; } })),
      ...missingPlaces.slice(1).map((i) => ({ kind: `place${i}`, run: () => drawPlace(story, i) })),
    ];
    for (const job of jobs) {
      try {
        if (await job.run()) emitAsset(story.id, job.kind);
      } catch (err) {
        if (!(err instanceof ImagesNotConfigured)) console.warn('[art] could not draw', job.kind, err.message);
      }
    }
  } finally {
    running.delete(story.id);
  }
}

export async function illustrateMoment(story, turnIndex) {
  const blob = await generateImage(momentPrompt(story, story.turns[turnIndex]), 'landscape');
  await putAsset(story.id, `moment${turnIndex}`, blob);
  emitAsset(story.id, `moment${turnIndex}`);
  return blob;
}

