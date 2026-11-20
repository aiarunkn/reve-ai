/**
 * 360° worlds around a memory.
 *
 *  paintPanorama(image, mood)            -> Blob   (free, in-browser; see panoramaPainter.js)
 *  startAIPanorama(photo, mood, title)   -> { jobId } | null   (Blockade Labs via /api/panorama)
 *  waitForAIPanorama(jobId)              -> Blob   (polls until the AI finishes)
 *
 * Panoramas are equirectangular (2:1). The photo's direction (straight ahead) is u = 0.5.
 */
import { drawFit, loadImage, toBlob } from './depthEstimator';

// the free in-browser painter lives in its own file
export { paintPanorama, seeded } from './panoramaPainter';

/* ------------------------------------------------------------------ */
/*  AI panorama (Blockade Labs Skybox AI, through our server function) */
/* ------------------------------------------------------------------ */

const ENDPOINT = import.meta.env.VITE_PANORAMA_ENDPOINT || '/api/panorama';

const MOOD_WORLDS = {
  nostalgic: 'warm lantern light, golden rain, amber dusk sky, cozy and nostalgic',
  weightless: 'a calm starry night, soft floating clouds, gentle blue moonlight, weightless and serene',
  bittersweet: 'twilight mist, lavender and rose haze, the last light of the day, bittersweet',
  electric: 'neon reflections on wet streets, cyan and magenta glow, rainy city night, electric',
  quietlyHappy: 'soft morning sunbeams, drifting dust in the light, peach and gold tones, quietly happy',
};

export function worldPrompt(moodKey, title = '') {
  const t = title ? `"${title.slice(0, 60)}", ` : '';
  return `${t}a dreamy hand-painted animated-film world continuing the scene of this photo, ${MOOD_WORLDS[moodKey] || ''}`.slice(0, 380);
}

/** Starts an AI panorama. Returns null (quietly) when no server or no key is configured. */
export async function startAIPanorama(photo, moodKey, title) {
  try {
    const small = await toBlob(drawFit(await loadImage(photo), 1024), 'image/jpeg', 0.9);
    const image = await blobToDataURL(small);
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image, prompt: worldPrompt(moodKey, title) }),
    });
    if (res.status === 404 || res.status === 501) return null; // no server function / no key
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json.id) throw new Error(json.error || `panorama request failed (${res.status})`);
    return { jobId: json.id };
  } catch (err) {
    console.warn('[panorama] AI panorama not started:', err);
    return null;
  }
}

/** Polls the job until complete, then returns the panorama as a (resized) JPEG Blob. */
export async function waitForAIPanorama(jobId, { timeoutMs = 8 * 60_000, onStatus } = {}) {
  const started = Date.now();
  let delay = 4000;
  while (Date.now() - started < timeoutMs) {
    const res = await fetch(`${ENDPOINT}?id=${encodeURIComponent(jobId)}`);
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error || `status check failed (${res.status})`);
    onStatus?.(json.status);
    if (json.status === 'complete') return fetchPanoramaImage(jobId, json.url);
    if (json.status === 'error' || json.status === 'abort') throw new Error(json.error || 'The AI could not paint this world.');
    await new Promise((r) => setTimeout(r, delay));
    delay = Math.min(delay * 1.3, 12000);
  }
  throw new Error('The AI world took too long.');
}

async function fetchPanoramaImage(jobId, url) {
  let img;
  try {
    img = await loadImage(url); // direct (needs CORS on the image host)
    drawFit(img, 8).getContext('2d').getImageData(0, 0, 1, 1); // throws if tainted
  } catch {
    const res = await fetch(`${ENDPOINT}?id=${encodeURIComponent(jobId)}&download=1`); // via our server
    if (!res.ok) throw new Error('Could not download the AI world.');
    img = await loadImage(await res.blob());
  }
  return toBlob(drawFit(img, 4096), 'image/jpeg', 0.86);
}

function blobToDataURL(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}
