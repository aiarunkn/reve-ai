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
  return `${styleLine(story)}\nA half-length character portrait of ${c.name}, ${c.role}. ${c.look} Expression shows: ${c.personality} Plain softly lit background in the story's palette.\n${GUARD}`;
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

/* ------------------------------ background art queue ------------------------------ */

const running = new Set();

/**
 * Draw anything a story is still missing: places without a photo, and cast portraits.
 * Runs once per story at a time, one image after another, and announces each as it lands.
 */
export async function ensureStoryArt(story) {
  if (imagesOff || running.has(story.id)) return;
  running.add(story.id);
  try {
    const jobs = [];
    for (let i = 0; i < story.bible.places.length; i++) {
      if (!(await getAsset(story.id, `place${i}`))) jobs.push({ kind: `place${i}`, prompt: placePrompt(story, i), shape: 'landscape' });
    }
    for (let k = 0; k < story.bible.cast.length; k++) {
      if (!(await getAsset(story.id, `portrait${k}`))) jobs.push({ kind: `portrait${k}`, prompt: portraitPrompt(story, story.bible.cast[k]), shape: 'portrait' });
    }
    for (const job of jobs) {
      try {
        const blob = await generateImage(job.prompt, job.shape);
        await putAsset(story.id, job.kind, blob);
        emitAsset(story.id, job.kind);
      } catch (err) {
        if (err instanceof ImagesNotConfigured) return;
        console.warn('[art] could not draw', job.kind, err.message);
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

