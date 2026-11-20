/**
 * estimateDepth(source, onProgress) -> Promise<Blob>  (grayscale PNG, white = near)
 *
 * Uses the in-browser Depth Anything model (see workers/depthWorker.js).
 * If the model can't load (offline, very old browser), falls back to a simple
 * heuristic depth so the scene still works.
 */
let worker;
let seq = 0;
const pending = new Map();

function getWorker() {
  if (!worker) {
    worker = new Worker(new URL('../workers/depthWorker.js', import.meta.url), { type: 'module' });
    worker.onmessage = ({ data }) => {
      const job = pending.get(data.id);
      if (!job) return;
      if (data.type === 'progress') job.onProgress?.(data.value, data.stage);
      else {
        pending.delete(data.id);
        data.type === 'done' ? job.resolve(data) : job.reject(new Error(data.message));
      }
    };
    worker.onerror = (e) => {
      pending.forEach((j) => j.reject(new Error(e.message || 'depth worker failed')));
      pending.clear();
      worker = null;
    };
  }
  return worker;
}

const DEPTH_INPUT = 518; // the model's native input size
const DEPTH_OUTPUT = 384; // stored map size (plenty for a smooth mesh)

export async function estimateDepth(source, onProgress) {
  const img = await loadImage(source);
  try {
    const input = await toBlob(drawFit(img, DEPTH_INPUT), 'image/jpeg', 0.92);
    const id = ++seq;
    const result = await new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject, onProgress });
      getWorker().postMessage({ id, blob: input });
    });
    return await depthToBlob(result, img);
  } catch (err) {
    console.warn('[depth] AI depth unavailable, using heuristic depth.', err);
    return heuristicDepth(img);
  }
}

/** Raw model output -> smoothed, normalized grayscale PNG with the photo's aspect. */
async function depthToBlob({ width, height, channels = 1, data }, img) {
  const src = document.createElement('canvas');
  src.width = width;
  src.height = height;
  const sctx = src.getContext('2d');
  const id = sctx.createImageData(width, height);
  let min = 255, max = 0;
  for (let i = 0; i < width * height; i++) {
    const v = data[i * channels];
    if (v < min) min = v;
    if (v > max) max = v;
  }
  const range = Math.max(1, max - min);
  for (let i = 0; i < width * height; i++) {
    const v = ((data[i * channels] - min) / range) * 255;
    id.data[i * 4] = id.data[i * 4 + 1] = id.data[i * 4 + 2] = v;
    id.data[i * 4 + 3] = 255;
  }
  sctx.putImageData(id, 0, 0);

  const ar = (img.naturalWidth || img.width) / (img.naturalHeight || img.height);
  const out = document.createElement('canvas');
  out.width = ar >= 1 ? DEPTH_OUTPUT : Math.round(DEPTH_OUTPUT * ar);
  out.height = ar >= 1 ? Math.round(DEPTH_OUTPUT / ar) : DEPTH_OUTPUT;
  const octx = out.getContext('2d');
  octx.imageSmoothingQuality = 'high';
  octx.drawImage(src, 0, 0, out.width, out.height);
  softBlur(out, 2);
  return toBlob(out, 'image/png');
}

/** No model? Lower parts of a photo are usually closer; brighter blobs pop slightly. */
function heuristicDepth(img) {
  const c = drawFit(img, 192);
  const ctx = c.getContext('2d');
  const id = ctx.getImageData(0, 0, c.width, c.height);
  for (let y = 0; y < c.height; y++) {
    for (let x = 0; x < c.width; x++) {
      const i = (y * c.width + x) * 4;
      const lum = (0.299 * id.data[i] + 0.587 * id.data[i + 1] + 0.114 * id.data[i + 2]) / 255;
      const v = (Math.pow(y / c.height, 1.6) * 0.75 + lum * 0.25) * 255;
      id.data[i] = id.data[i + 1] = id.data[i + 2] = v;
    }
  }
  ctx.putImageData(id, 0, 0);
  softBlur(c, 4);
  return toBlob(c, 'image/png');
}

/* ------------------------------ helpers ------------------------------ */

function softBlur(canvas, passes) {
  // blur by repeated down/up-scaling (works in every browser, unlike ctx.filter)
  const { width: w, height: h } = canvas;
  const tmp = document.createElement('canvas');
  tmp.width = Math.max(1, Math.round(w / 2));
  tmp.height = Math.max(1, Math.round(h / 2));
  const t = tmp.getContext('2d');
  const c = canvas.getContext('2d');
  t.imageSmoothingQuality = c.imageSmoothingQuality = 'high';
  for (let i = 0; i < passes; i++) {
    t.clearRect(0, 0, tmp.width, tmp.height);
    t.drawImage(canvas, 0, 0, tmp.width, tmp.height);
    c.globalAlpha = 0.6;
    c.drawImage(tmp, 0, 0, w, h);
    c.globalAlpha = 1;
  }
}

export function drawFit(img, maxSide) {
  const w0 = img.naturalWidth || img.width;
  const h0 = img.naturalHeight || img.height;
  const s = Math.min(1, maxSide / Math.max(w0, h0));
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w0 * s));
  c.height = Math.max(1, Math.round(h0 * s));
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, c.width, c.height);
  return c;
}

export function toBlob(canvas, type, quality) {
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('canvas export failed'))), type, quality)
  );
}

export function loadImage(source) {
  if (source instanceof HTMLCanvasElement || source instanceof HTMLImageElement) return Promise.resolve(source);
  return new Promise((resolve, reject) => {
    const img = new Image();
    let url;
    img.onload = () => { if (url) URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { if (url) URL.revokeObjectURL(url); reject(new Error('Could not read image')); };
    if (source instanceof Blob) { url = URL.createObjectURL(source); img.src = url; }
    else { if (/^https?:/.test(source)) img.crossOrigin = 'anonymous'; img.src = source; }
  });
}
