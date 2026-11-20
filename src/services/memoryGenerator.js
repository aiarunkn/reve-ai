/**
 * memoryGenerator — turns a photo + a feeling into a painterly memory image.
 *
 *   generateMemoryImage(source, moodKey) -> Promise<dataURL>
 *
 * Default path: a fully client-side "oil-paint" pipeline on <canvas>
 *   1. downscale            (keeps localStorage small and the filter fast)
 *   2. Kuwahara filter      (flat, brush-like regions with preserved edges)
 *   3. mood colour grade    (split-toning, saturation, contrast, warmth)
 *   4. bloom                (soft light halation around highlights)
 *   5. mood wash, grain, vignette
 *
 * AI path: set VITE_IMAGE_AI_PROVIDER to 'openai' or 'replicate' and fill in
 * stylizeWithAI() below. If it throws, we fall back to the local pipeline,
 * so the sanctuary never breaks.
 */

/* ------------------------------------------------------------------ */
/*  Config                                                             */
/* ------------------------------------------------------------------ */

export const AI_CONFIG = {
  provider: import.meta.env.VITE_IMAGE_AI_PROVIDER || 'local', // 'local' | 'openai' | 'replicate'
  // Strongly recommended: a backend proxy URL that holds the secret key server-side.
  endpoint: import.meta.env.VITE_IMAGE_AI_ENDPOINT || '',
  timeoutMs: 90_000,
  // Anything prefixed VITE_ is bundled into the browser — use only for local experiments.
  apiKey: import.meta.env.VITE_IMAGE_AI_KEY || '',
};

const MAX_SIDE = 860;
const JPEG_QUALITY = 0.84;

/** Per-feeling colour grade. Tones are [r,g,b] 0–255. */
export const MOOD_GRADES = {
  nostalgic: {
    shadow: [52, 28, 60], highlight: [255, 196, 120], shadowAmt: 0.42, highlightAmt: 0.3,
    saturation: 0.82, contrast: 1.06, brightness: 1.02, wash: 'rgba(255, 170, 80, 0.16)',
  },
  weightless: {
    shadow: [14, 22, 70], highlight: [205, 222, 255], shadowAmt: 0.5, highlightAmt: 0.26,
    saturation: 0.78, contrast: 1.04, brightness: 0.98, wash: 'rgba(120, 150, 255, 0.14)',
  },
  bittersweet: {
    shadow: [44, 24, 70], highlight: [244, 186, 204], shadowAmt: 0.46, highlightAmt: 0.28,
    saturation: 0.72, contrast: 1.02, brightness: 0.98, wash: 'rgba(200, 130, 200, 0.14)',
  },
  electric: {
    shadow: [40, 0, 80], highlight: [120, 245, 255], shadowAmt: 0.5, highlightAmt: 0.3,
    saturation: 1.3, contrast: 1.16, brightness: 0.98, wash: 'rgba(255, 60, 200, 0.12)',
  },
  quietlyHappy: {
    shadow: [70, 46, 36], highlight: [255, 240, 196], shadowAmt: 0.3, highlightAmt: 0.32,
    saturation: 0.95, contrast: 1.02, brightness: 1.07, wash: 'rgba(255, 210, 140, 0.16)',
  },
};

/* ------------------------------------------------------------------ */
/*  Public API                                                         */
/* ------------------------------------------------------------------ */

/**
 * @param {File|Blob|string|HTMLCanvasElement|HTMLImageElement} source
 * @param {string} moodKey
 * @param {{ onFallback?: (err: Error) => void }} [options]
 * @returns {Promise<string>} JPEG data URL
 */
export async function generateMemoryImage(source, moodKey, { onFallback } = {}) {
  if (AI_CONFIG.provider !== 'local') {
    try {
      const aiImage = await stylizeWithAI(source, moodKey);
      // AI results can be multi-megabyte PNGs: re-encode so they fit in localStorage.
      return await compressImage(aiImage);
    } catch (err) {
      console.warn('[memoryGenerator] AI stylization unavailable, using local painter.', err);
      onFallback?.(err);
    }
  }
  return stylizeLocally(source, moodKey);
}

/* ------------------------------------------------------------------ */
/*  AI placeholder hook                                                */
/* ------------------------------------------------------------------ */

const MOOD_PROMPTS = {
  nostalgic: 'warm lantern glow, golden rain, amber dusk, nostalgic',
  weightless: 'starry night sky, floating clouds, soft blue moonlight, weightless',
  bittersweet: 'twilight mist, lavender and rose haze, last light, bittersweet',
  electric: 'neon reflections, wet city streets, cyan and magenta glow, electric',
  quietlyHappy: 'gentle morning sunbeams, drifting dust, soft peach light, quietly happy',
};

export function buildPrompt(moodKey) {
  return `Repaint this photo as a hand-painted animated film background: painterly gouache brushwork, dreamy and intimate, ${
    MOOD_PROMPTS[moodKey] || ''
  }. Keep the original composition, subjects and framing.`;
}

/**
 * Drop your image-to-image integration in here.
 * Must resolve to an image URL or data URL; throw to fall back to the local painter.
 *
 * ⚠️ Never ship a secret key in front-end code for real users. Point
 *    VITE_IMAGE_AI_ENDPOINT at a tiny server function that adds the key.
 */
async function stylizeWithAI(source, moodKey) {
  // Send a modest JPEG, not the full-resolution original: faster upload, cheaper request.
  const imageDataUrl = await toDataURL(source, 1024);
  const prompt = buildPrompt(moodKey);

  // Option A — your own proxy (recommended). Expected to return { image: '<url or data url>' }.
  if (AI_CONFIG.endpoint) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), AI_CONFIG.timeoutMs);
    try {
      const res = await fetch(AI_CONFIG.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: AI_CONFIG.provider, image: imageDataUrl, prompt, mood: moodKey }),
        signal: ctrl.signal,
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || `AI proxy responded ${res.status}`);
      if (!json.image) throw new Error('AI proxy returned no image');
      return json.image;
    } finally {
      clearTimeout(timer);
    }
  }

  // Option B — direct calls (local experiments only). Uncomment one and fill in.
  //
  // OpenAI (image edits):
  //   const form = new FormData();
  //   form.append('model', 'gpt-image-1');
  //   form.append('image', await (await fetch(imageDataUrl)).blob(), 'memory.png');
  //   form.append('prompt', prompt);
  //   const r = await fetch('https://api.openai.com/v1/images/edits', {
  //     method: 'POST', headers: { Authorization: `Bearer ${AI_CONFIG.apiKey}` }, body: form,
  //   });
  //   const json = await r.json();
  //   return `data:image/png;base64,${json.data[0].b64_json}`;
  //
  // Replicate (any img2img model, e.g. an SDXL variant):
  //   const r = await fetch('https://api.replicate.com/v1/predictions', {
  //     method: 'POST',
  //     headers: { Authorization: `Bearer ${AI_CONFIG.apiKey}`, 'Content-Type': 'application/json', Prefer: 'wait' },
  //     body: JSON.stringify({ version: '<model-version-id>', input: { image: imageDataUrl, prompt, prompt_strength: 0.55 } }),
  //   });
  //   const json = await r.json();
  //   return Array.isArray(json.output) ? json.output[0] : json.output;

  throw new Error(`AI provider "${AI_CONFIG.provider}" is not configured yet`);
}

/* ------------------------------------------------------------------ */
/*  Local painterly pipeline                                           */
/* ------------------------------------------------------------------ */

export async function stylizeLocally(source, moodKey) {
  const grade = MOOD_GRADES[moodKey] || MOOD_GRADES.nostalgic;
  const img = await loadSource(source);

  const srcW = img.naturalWidth || img.width;
  const srcH = img.naturalHeight || img.height;
  const scale = Math.min(1, MAX_SIDE / Math.max(srcW, srcH));
  const w = Math.max(1, Math.round(srcW * scale));
  const h = Math.max(1, Math.round(srcH * scale));

  const canvas = makeCanvas(w, h);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, w, h);

  // 2 + 3: brushwork and colour grade, in one pass over the pixels
  const data = ctx.getImageData(0, 0, w, h);
  const radius = Math.max(2, Math.round(Math.max(w, h) / 210));
  const painted = kuwahara(data.data, w, h, radius);
  colorGrade(painted, grade);
  data.data.set(painted);
  ctx.putImageData(data, 0, 0);

  // 4: bloom — blur cheaply by downscaling, then screen it back on
  const small = makeCanvas(Math.max(1, Math.round(w / 12)), Math.max(1, Math.round(h / 12)));
  const sctx = small.getContext('2d');
  sctx.imageSmoothingQuality = 'high';
  sctx.drawImage(canvas, 0, 0, small.width, small.height);
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  ctx.globalAlpha = 0.32;
  ctx.drawImage(small, 0, 0, w, h);
  ctx.restore();

  // 5a: mood colour wash
  ctx.save();
  ctx.globalCompositeOperation = 'soft-light';
  ctx.fillStyle = grade.wash;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();

  // 5b: canvas grain
  ctx.save();
  ctx.globalCompositeOperation = 'overlay';
  ctx.globalAlpha = 0.1;
  ctx.fillStyle = ctx.createPattern(noiseTile(), 'repeat');
  ctx.fillRect(0, 0, w, h);
  ctx.restore();

  // 5c: warm vignette
  const vg = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.28, w / 2, h / 2, Math.hypot(w, h) * 0.6);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(12, 6, 24, 0.55)');
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, w, h);

  return canvas.toDataURL('image/jpeg', JPEG_QUALITY);
}

/**
 * Kuwahara filter using summed-area tables, so cost is O(pixels) regardless of radius.
 * For each pixel, look at the four overlapping quadrants around it and take the mean
 * colour of the one with the lowest luminance variance → painterly flat strokes.
 */
function kuwahara(src, w, h, r) {
  const W1 = w + 1;
  const N = W1 * (h + 1);
  const sR = new Float64Array(N);
  const sG = new Float64Array(N);
  const sB = new Float64Array(N);
  const sL = new Float64Array(N);
  const sL2 = new Float64Array(N);

  for (let y = 0; y < h; y++) {
    let rr = 0, rg = 0, rb = 0, rl = 0, rl2 = 0;
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const R = src[i], G = src[i + 1], B = src[i + 2];
      const L = 0.299 * R + 0.587 * G + 0.114 * B;
      rr += R; rg += G; rb += B; rl += L; rl2 += L * L;
      const k = (y + 1) * W1 + (x + 1);
      const up = k - W1;
      sR[k] = sR[up] + rr;
      sG[k] = sG[up] + rg;
      sB[k] = sB[up] + rb;
      sL[k] = sL[up] + rl;
      sL2[k] = sL2[up] + rl2;
    }
  }

  const out = new Uint8ClampedArray(src.length);
  const qx0 = [0, 0, 0, 0], qy0 = [0, 0, 0, 0], qx1 = [0, 0, 0, 0], qy1 = [0, 0, 0, 0];

  for (let y = 0; y < h; y++) {
    const yTop = y - r < 0 ? 0 : y - r;
    const yBot = y + r >= h ? h - 1 : y + r;
    for (let x = 0; x < w; x++) {
      const xL = x - r < 0 ? 0 : x - r;
      const xR = x + r >= w ? w - 1 : x + r;
      qx0[0] = xL; qy0[0] = yTop; qx1[0] = x;  qy1[0] = y;
      qx0[1] = x;  qy0[1] = yTop; qx1[1] = xR; qy1[1] = y;
      qx0[2] = xL; qy0[2] = y;    qx1[2] = x;  qy1[2] = yBot;
      qx0[3] = x;  qy0[3] = y;    qx1[3] = xR; qy1[3] = yBot;

      let bestVar = Infinity, bestN = 1;
      let a = 0, b = 0, c = 0, d = 0;
      for (let q = 0; q < 4; q++) {
        const A = qy0[q] * W1 + qx0[q];
        const Bk = qy0[q] * W1 + qx1[q] + 1;
        const C = (qy1[q] + 1) * W1 + qx0[q];
        const D = (qy1[q] + 1) * W1 + qx1[q] + 1;
        const n = (qx1[q] - qx0[q] + 1) * (qy1[q] - qy0[q] + 1);
        const mean = (sL[D] - sL[Bk] - sL[C] + sL[A]) / n;
        const v = (sL2[D] - sL2[Bk] - sL2[C] + sL2[A]) / n - mean * mean;
        if (v < bestVar) { bestVar = v; bestN = n; a = A; b = Bk; c = C; d = D; }
      }
      const o = (y * w + x) * 4;
      out[o] = (sR[d] - sR[b] - sR[c] + sR[a]) / bestN;
      out[o + 1] = (sG[d] - sG[b] - sG[c] + sG[a]) / bestN;
      out[o + 2] = (sB[d] - sB[b] - sB[c] + sB[a]) / bestN;
      out[o + 3] = src[o + 3];
    }
  }
  return out;
}

function colorGrade(px, g) {
  const [sr, sg, sb] = g.shadow;
  const [hr, hg, hb] = g.highlight;
  for (let i = 0; i < px.length; i += 4) {
    let r = px[i] * g.brightness, gr = px[i + 1] * g.brightness, b = px[i + 2] * g.brightness;
    const l = (0.299 * r + 0.587 * gr + 0.114 * b) / 255;

    // saturation around luminance
    const L = l * 255;
    r = L + (r - L) * g.saturation;
    gr = L + (gr - L) * g.saturation;
    b = L + (b - L) * g.saturation;

    // contrast around mid-grey
    r = (r - 128) * g.contrast + 128;
    gr = (gr - 128) * g.contrast + 128;
    b = (b - 128) * g.contrast + 128;

    // split-toning: shadows lean to one hue, highlights to another
    const ws = (1 - l) * (1 - l) * g.shadowAmt;
    const wh = l * l * g.highlightAmt;
    r += (sr - r) * ws + (hr - r) * wh;
    gr += (sg - gr) * ws + (hg - gr) * wh;
    b += (sb - b) * ws + (hb - b) * wh;

    px[i] = r; px[i + 1] = gr; px[i + 2] = b; // Uint8ClampedArray clamps for us
  }
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

let _noise;
function noiseTile() {
  if (_noise) return _noise;
  _noise = makeCanvas(128, 128);
  const ctx = _noise.getContext('2d');
  const id = ctx.createImageData(128, 128);
  for (let i = 0; i < id.data.length; i += 4) {
    const v = 110 + Math.random() * 145;
    id.data[i] = id.data[i + 1] = id.data[i + 2] = v;
    id.data[i + 3] = 255;
  }
  ctx.putImageData(id, 0, 0);
  return _noise;
}

function loadSource(source) {
  if (typeof HTMLCanvasElement !== 'undefined' && source instanceof HTMLCanvasElement) {
    return Promise.resolve(source);
  }
  if (typeof HTMLImageElement !== 'undefined' && source instanceof HTMLImageElement && source.complete) {
    return Promise.resolve(source);
  }
  return new Promise((resolve, reject) => {
    const img = new Image();
    let objectUrl;
    img.onload = () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      resolve(img);
    };
    img.onerror = () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      reject(new Error('Could not read this image. Try a JPG, PNG or WebP.'));
    };
    if (source instanceof Blob) {
      objectUrl = URL.createObjectURL(source);
      img.src = objectUrl;
    } else {
      if (/^https?:/.test(source)) img.crossOrigin = 'anonymous'; // keep the canvas readable
      img.src = source;
    }
  });
}

/** Draw any source into a JPEG data URL whose longest side is at most `maxSide`. */
async function toDataURL(source, maxSide = MAX_SIDE, quality = 0.9) {
  const img = await loadSource(source);
  const w0 = img.naturalWidth || img.width;
  const h0 = img.naturalHeight || img.height;
  const s = Math.min(1, maxSide / Math.max(w0, h0));
  const c = makeCanvas(Math.max(1, Math.round(w0 * s)), Math.max(1, Math.round(h0 * s)));
  const ctx = c.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', quality);
}

/** Re-encode an AI result (URL or data URL) to a storage-friendly JPEG. */
function compressImage(src) {
  return toDataURL(src, MAX_SIDE, JPEG_QUALITY);
}
