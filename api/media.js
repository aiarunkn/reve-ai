/**
 * /api/media — scene art (OpenAI image model) and a slot for a paid voice service.
 *
 * POST { action: 'image', prompt, shape: 'landscape' | 'portrait' | 'square' } -> { image: <data URL> }
 * POST { action: 'voice', text, voice }                                       -> 501 until a provider is added
 * POST { action: 'photo', queries: ['gothic library', ...] }                    -> { image: <data URL>, credit } | 404
 *
 * Photos of a place come from free photo libraries, never from scraped sites:
 *   PEXELS_API_KEY  optional, free at pexels.com/api — much better photos. Without it, Openverse
 *                   (openly licensed images, no key) is used, which has fewer good matches.
 *
 * Env (server-side only, no VITE_ prefix):
 *   OPENAI_API_KEY       required for images; without it, image calls answer 501 and the app
 *                        keeps its painted photos and gradients.
 *   OPENAI_IMAGE_MODEL   optional, default "gpt-image-2.5-flare" (fast everyday model).
 *   OPENAI_IMAGE_QUALITY optional, default "medium" ("low" is cheaper).
 *
 * Voices: the app speaks with the browser's built-in voices today. To upgrade, implement
 * `voice()` below with a voice provider and set VITE_VOICE_PROVIDER=server in the client.
 * (OpenAI's /v1/audio/speech models shut down on 2027-01-06, so they aren't used here.)
 */
const SIZES = { landscape: '1536x1024', portrait: '1024x1536', square: '1024x1024' };

export default async function handler(req, res) {
  const origin = req.headers.origin;
  if (origin && new URL(origin).host !== req.headers.host) return send(res, 403, { error: 'Forbidden origin' });
  if (req.method !== 'POST') return send(res, 405, { error: 'Use POST' });

  let body;
  try {
    body = req.body && typeof req.body === 'object' ? req.body : await readJson(req);
  } catch (err) {
    return send(res, err.status || 400, { error: err.message });
  }

  try {
    if (body.action === 'image') return send(res, 200, await image(body));
    if (body.action === 'voice') return voice(res, body);
    if (body.action === 'photo') {
      const found = await photo(body);
      return found ? send(res, 200, found) : send(res, 404, { error: 'No photo found.' });
    }
    return send(res, 400, { error: 'Unknown action' });
  } catch (err) {
    console.error('[media]', err);
    return send(res, err.status || 500, { error: err.message || 'Media request failed' });
  }
}

async function image({ prompt, shape = 'landscape' }) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw httpError(501, 'not-configured');
  if (!prompt || typeof prompt !== 'string') throw httpError(400, 'Missing prompt.');

  const r = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: process.env.OPENAI_IMAGE_MODEL || 'gpt-image-2.5-flare',
      prompt: prompt.slice(0, 3500),
      size: SIZES[shape] || SIZES.landscape,
      quality: process.env.OPENAI_IMAGE_QUALITY || 'medium',
      output_format: 'jpeg',
      output_compression: 82,
      n: 1,
    }),
  });
  const json = await r.json().catch(() => ({}));
  if (!r.ok) throw httpError(r.status === 400 && /safety|policy/i.test(json.error?.message || '') ? 422 : r.status, json.error?.message || `Image service responded ${r.status}`);
  const b64 = json.data?.[0]?.b64_json;
  if (!b64) throw httpError(502, 'The image service returned no image.');
  return { image: `data:image/jpeg;base64,${b64}` };
}

/* ------------------------------ photos of places ------------------------------ */

const PHOTO_TIMEOUT = 12000;

async function getJson(url, headers = {}) {
  const r = await fetch(url, { headers: { 'User-Agent': 'reve-ai/0.1 (story app)', ...headers }, signal: AbortSignal.timeout(PHOTO_TIMEOUT) });
  if (!r.ok) throw httpError(r.status, `Photo search responded ${r.status}`);
  return r.json();
}

async function pexels(query) {
  const key = process.env.PEXELS_API_KEY;
  if (!key) return null;
  const json = await getJson(`https://api.pexels.com/v1/search?${new URLSearchParams({ query, orientation: 'landscape', per_page: '8', size: 'large' })}`, { Authorization: key });
  const p = json.photos?.[0];
  return p && { url: p.src.large2x || p.src.large, credit: { author: p.photographer, link: p.url, source: 'Pexels' } };
}

async function openverse(query) {
  const json = await getJson(`https://api.openverse.org/v1/images/?${new URLSearchParams({ q: query, page_size: '20', aspect_ratio: 'wide', license_type: 'commercial', mature: 'false' })}`);
  // Openverse ranks loosely: keep the photo whose title and tags share the most words with the search
  const words = query.toLowerCase().split(/\s+/).filter((w) => w.length > 2);
  const score = (x) => {
    const text = `${x.title || ''} ${(x.tags || []).map((t) => t.name).join(' ')}`.toLowerCase();
    return words.filter((w) => text.includes(w.replace(/s$/, ''))).length;
  };
  const usable = (json.results || []).filter((x) => x.width >= 1000 && x.width > x.height && (!x.filetype || ['jpg', 'jpeg', 'png', 'webp'].includes(x.filetype)));
  const best = usable.map((x) => [score(x), x]).sort((p, q) => q[0] - p[0])[0];
  // need most of the words to match, or this search gives up and the next one is tried
  if (!best || best[0] < Math.max(1, Math.ceil(words.length * 0.6))) return null;
  const r = best[1];
  const license = `${(r.license || '').toUpperCase()}${r.license_version ? ` ${r.license_version}` : ''}`;
  return { url: r.url, credit: { author: r.creator || 'Unknown', link: r.foreign_landing_url || r.url, source: 'Openverse', license } };
}

/** First good landscape photo for any of the queries (most specific first). */
async function photo({ queries }) {
  const list = (Array.isArray(queries) ? queries : [queries]).map((q) => String(q || '').trim().slice(0, 80)).filter(Boolean).slice(0, 3);
  if (!list.length) throw httpError(400, 'Missing photo search.');
  for (const q of list) {
    for (const search of [pexels, openverse]) {
      let hit;
      try { hit = await search(q); } catch (err) { console.warn('[photo]', search.name, err.message); continue; }
      if (!hit) continue;
      try {
        const r = await fetch(hit.url, { headers: { 'User-Agent': 'reve-ai/0.1 (story app)' }, signal: AbortSignal.timeout(PHOTO_TIMEOUT) });
        const type = r.headers.get('content-type') || '';
        if (!r.ok || !type.startsWith('image/')) continue;
        const buf = Buffer.from(await r.arrayBuffer());
        if (buf.length > 3.5 * 1024 * 1024) continue; // keep the response under the hosting limit
        return { image: `data:${type.split(';')[0]};base64,${buf.toString('base64')}`, credit: hit.credit, query: q };
      } catch (err) {
        console.warn('[photo] download failed', err.message);
      }
    }
  }
  return null;
}

/** Placeholder for a paid voice provider: return audio bytes (e.g. audio/mpeg) for `text` in `voice`. */
function voice(res) {
  return send(res, 501, { error: 'not-configured', message: 'No voice provider is set up yet; the app uses browser voices.' });
}

function send(res, code, body) {
  res.statusCode = code;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
}

function httpError(status, message) {
  return Object.assign(new Error(message), { status });
}

async function readJson(req) {
  const chunks = [];
  let size = 0;
  for await (const c of req) {
    size += c.length;
    if (size > 1024 * 1024) throw httpError(413, 'Request too large.');
    chunks.push(c);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
}
