/**
 * 360° worlds around a memory.
 *
 *  paintPanorama(image, mood)            -> Blob   (instant, free, in-browser)
 *  startAIPanorama(photo, mood, title)   -> { jobId } | null   (Blockade Labs via /api/panorama)
 *  waitForAIPanorama(jobId)              -> Blob   (polls until the AI finishes)
 *
 * Panoramas are equirectangular (2:1). The photo's direction (straight ahead) is u = 0.5.
 */
import { getMood } from '../data/moods';
import { drawFit, loadImage, toBlob } from './depthEstimator';

const W = 2048;
const H = 1024;

/* ------------------------------------------------------------------ */
/*  Local painter                                                      */
/* ------------------------------------------------------------------ */

const NIGHT = new Set(['weightless', 'bittersweet', 'electric', 'nostalgic']);

export async function paintPanorama(source, moodKey) {
  const img = await loadImage(source);
  const mood = getMood(moodKey);
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d');

  // 1. sample the photo's sky / horizon / ground colours
  const tiny = drawFit(img, 24);
  const td = tiny.getContext('2d').getImageData(0, 0, tiny.width, tiny.height).data;
  const band = (y0, y1) => {
    let r = 0, g = 0, b = 0, n = 0;
    for (let y = Math.floor(y0 * tiny.height); y < Math.ceil(y1 * tiny.height); y++) {
      for (let x = 0; x < tiny.width; x++) {
        const i = (y * tiny.width + x) * 4;
        r += td[i]; g += td[i + 1]; b += td[i + 2]; n++;
      }
    }
    return [r / n, g / n, b / n];
  };
  const sky = band(0, 0.3);
  const mid = band(0.35, 0.65);
  const ground = band(0.7, 1);
  const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
  const rgb = (a, al = 1) => `rgba(${a.map((v) => Math.round(v)).join(',')},${al})`;

  // 2. sky-to-ground gradient, tinted by the feeling
  const zenith = mix(sky, hex(mood.bg[0]), 0.65);
  const horizon = mix(mid, hex(mood.secondary), 0.25);
  const nadir = mix(ground, [8, 8, 18], 0.55);
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, rgb(zenith));
  g.addColorStop(0.42, rgb(mix(sky, horizon, 0.5)));
  g.addColorStop(0.5, rgb(horizon));
  g.addColorStop(0.58, rgb(mix(ground, horizon, 0.4)));
  g.addColorStop(1, rgb(nadir));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  // 3. the photo, blurred and mirrored all the way around the horizon (seamless)
  const soft = drawFit(img, 64);
  const ring = document.createElement('canvas');
  ring.width = W;
  ring.height = H / 2;
  const rctx = ring.getContext('2d');
  rctx.imageSmoothingQuality = 'high';
  const seg = W / 4;
  for (let i = 0; i < 4; i++) {
    rctx.save();
    if (i % 2) {
      rctx.translate(seg * (i + 1), 0);
      rctx.scale(-1, 1);
      rctx.drawImage(soft, 0, 0, seg, ring.height);
    } else {
      rctx.drawImage(soft, seg * i, 0, seg, ring.height);
    }
    rctx.restore();
  }
  const fade = rctx.createLinearGradient(0, 0, 0, ring.height);
  fade.addColorStop(0, 'rgba(0,0,0,0)');
  fade.addColorStop(0.3, 'rgba(0,0,0,1)');
  fade.addColorStop(0.7, 'rgba(0,0,0,1)');
  fade.addColorStop(1, 'rgba(0,0,0,0)');
  rctx.globalCompositeOperation = 'destination-in';
  rctx.fillStyle = fade;
  rctx.fillRect(0, 0, W, ring.height);
  ctx.globalAlpha = 0.7;
  ctx.drawImage(ring, 0, H / 4);
  ctx.globalAlpha = 1;

  // 4. sky details
  const rand = seeded(hashStr(moodKey + img.width + img.height));
  if (NIGHT.has(moodKey)) {
    for (let i = 0; i < 900; i++) {
      const y = Math.pow(rand(), 1.6) * H * 0.45;
      ctx.fillStyle = `rgba(235,240,255,${0.25 + rand() * 0.7 * (1 - y / (H * 0.45))})`;
      const s = rand() < 0.05 ? 2.2 : 1.1;
      ctx.fillRect(rand() * W, y, s, s);
    }
  }
  if (moodKey === 'weightless') {
    glow(ctx, W * 0.82, H * 0.2, 160, [230, 235, 255], 0.35); // moon
    disc(ctx, W * 0.82, H * 0.2, 26, '#f2f0ff');
  }
  if (moodKey === 'quietlyHappy' || moodKey === 'nostalgic') {
    glow(ctx, W * 0.62, H * 0.3, 420, hex(mood.primary), 0.45); // low sun / lantern sky
  }
  // distant clouds
  for (let i = 0; i < 26; i++) {
    const y = H * (0.18 + rand() * 0.25);
    glow(ctx, rand() * W, y, 60 + rand() * 140, mix(hex(mood.primary), [255, 255, 255], 0.5), 0.06 + rand() * 0.06, 0.35);
  }

  // 5. layered distant hills, periodic so the 360° seam is invisible
  const layers = [
    { base: 0.53, amp: 0.05, col: mix(horizon, zenith, 0.55), alpha: 0.75 },
    { base: 0.565, amp: 0.035, col: mix(nadir, zenith, 0.4), alpha: 0.9 },
  ];
  layers.forEach((L, li) => {
    const phases = [1, 2, 3, 5, 8].map(() => rand() * Math.PI * 2);
    ctx.beginPath();
    ctx.moveTo(0, H);
    for (let x = 0; x <= W; x += 8) {
      const t = (x / W) * Math.PI * 2;
      const n = [1, 2, 3, 5, 8].reduce((s, k, j) => s + Math.sin(t * k + phases[j]) / (j + 1.4), 0);
      ctx.lineTo(x, H * (L.base - L.amp * n * (li ? 0.6 : 1)));
    }
    ctx.lineTo(W, H);
    ctx.closePath();
    ctx.fillStyle = rgb(L.col, L.alpha);
    ctx.fill();
  });

  // window lights / lanterns along the far hills
  for (let i = 0; i < 70; i++) {
    disc(ctx, rand() * W, H * (0.56 + rand() * 0.05), rand() * 1.6 + 0.6, `rgba(255,${190 + rand() * 50},120,${0.4 + rand() * 0.5})`);
  }

  // 6. mist band on the horizon + ground haze
  const mist = ctx.createLinearGradient(0, H * 0.45, 0, H * 0.7);
  mist.addColorStop(0, rgb(hex(mood.primary), 0));
  mist.addColorStop(0.5, rgb(mix(hex(mood.primary), [255, 255, 255], 0.3), 0.18));
  mist.addColorStop(1, rgb(hex(mood.primary), 0));
  ctx.fillStyle = mist;
  ctx.fillRect(0, H * 0.45, W, H * 0.25);

  return toBlob(c, 'image/jpeg', 0.88);
}

function glow(ctx, x, y, r, [cr, cg, cb], a, squash = 1) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(1, squash);
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
  g.addColorStop(0, `rgba(${cr},${cg},${cb},${a})`);
  g.addColorStop(1, `rgba(${cr},${cg},${cb},0)`);
  ctx.fillStyle = g;
  ctx.fillRect(-r, -r, r * 2, r * 2);
  ctx.restore();
}

function disc(ctx, x, y, r, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

function hashStr(s) {
  let h = 2166136261;
  for (const ch of String(s)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return h >>> 0;
}

export function seeded(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

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
