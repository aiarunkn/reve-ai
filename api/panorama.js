/**
 * /api/panorama — server-side bridge to Blockade Labs Skybox AI ("Image2Pano").
 *
 * Runs as a Vercel Serverless Function in production, and inside the Vite dev
 * server locally (see vite.config.js). The secret BLOCKADE_API_KEY never reaches the browser.
 *
 *   POST /api/panorama            { image: <data URL>, prompt }  -> { id }
 *   GET  /api/panorama?id=123                                    -> { status, url, error }
 *   GET  /api/panorama?id=123&download=1                         -> the panorama JPEG bytes
 *
 * Env:
 *   BLOCKADE_API_KEY   required — without it every call answers 501 and the app
 *                      quietly keeps its in-browser painted panorama.
 *   BLOCKADE_STYLE_ID  optional — Skybox style to paint with (list them at
 *                      GET https://backend.blockadelabs.com/api/v1/skybox/styles). Default 155.
 */
const BASE = 'https://backend.blockadelabs.com/api/v1';
const MAX_IMAGE_BYTES = 3.5 * 1024 * 1024;

export default async function handler(req, res) {
  const key = process.env.BLOCKADE_API_KEY;
  if (!key) return send(res, 501, { error: 'AI panoramas are not configured (BLOCKADE_API_KEY is missing).' });

  // Light protection against other websites spending your credits from their pages.
  // (It does not stop scripted abuse — see README for real rate limiting.)
  const origin = req.headers.origin;
  if (origin && new URL(origin).host !== req.headers.host) return send(res, 403, { error: 'Forbidden origin' });

  try {
    if (req.method === 'POST') return await create(req, res, key);
    if (req.method === 'GET') return await status(req, res, key);
    return send(res, 405, { error: 'Method not allowed' });
  } catch (err) {
    console.error('[panorama]', err);
    return send(res, err.status || 500, { error: err.message || 'Panorama request failed' });
  }
}

async function create(req, res, key) {
  const body = req.body && typeof req.body === 'object' ? req.body : await readJson(req);
  const { image, prompt } = body || {};
  const match = typeof image === 'string' && image.match(/^data:(image\/(?:jpeg|png|webp));base64,(.+)$/);
  if (!match) return send(res, 400, { error: 'Expected an image data URL.' });
  if (!prompt || typeof prompt !== 'string') return send(res, 400, { error: 'Missing prompt.' });

  const bytes = Buffer.from(match[2], 'base64');
  if (bytes.length > MAX_IMAGE_BYTES) return send(res, 413, { error: 'Image too large.' });

  const form = new FormData();
  form.append('skybox_style_id', String(Number(process.env.BLOCKADE_STYLE_ID) || 155));
  form.append('prompt', prompt.slice(0, 380));
  form.append('image_to_pano_init_image', new Blob([bytes], { type: match[1] }), 'memory.jpg');

  const r = await fetch(`${BASE}/skybox`, { method: 'POST', headers: { 'x-api-key': key }, body: form });
  const json = await r.json().catch(() => ({}));
  if (!r.ok) {
    return send(res, r.status, { error: json.error || json.message || `Blockade responded ${r.status}` });
  }
  return send(res, 200, { id: json.id, status: json.status });
}

async function status(req, res, key) {
  const q = new URL(req.url, 'http://x').searchParams;
  const id = q.get('id');
  if (!/^\d+$/.test(id || '')) return send(res, 400, { error: 'Invalid id.' });

  const r = await fetch(`${BASE}/imagine/requests/${id}`, { headers: { 'x-api-key': key } });
  const json = await r.json().catch(() => ({}));
  if (!r.ok) return send(res, r.status, { error: json.error || json.message || `Blockade responded ${r.status}` });
  const job = json.request || json.response || json;

  if (q.get('download') && job.status === 'complete' && job.file_url) {
    const img = await fetch(job.file_url);
    if (!img.ok) return send(res, 502, { error: 'Could not fetch the panorama image.' });
    res.statusCode = 200;
    res.setHeader('Content-Type', img.headers.get('content-type') || 'image/jpeg');
    res.setHeader('Cache-Control', 'private, max-age=86400');
    res.end(Buffer.from(await img.arrayBuffer()));
    return;
  }

  return send(res, 200, { status: job.status, url: job.file_url || null, error: job.error_message || null });
}

function send(res, code, body) {
  res.statusCode = code;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
}

async function readJson(req) {
  const chunks = [];
  let size = 0;
  for await (const c of req) {
    size += c.length;
    if (size > 6 * 1024 * 1024) throw Object.assign(new Error('Request too large'), { status: 413 });
    chunks.push(c);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
}
