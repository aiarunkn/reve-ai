/**
 * /api/media — scene art (OpenAI image model) and a slot for a paid voice service.
 *
 * POST { action: 'image', prompt, shape: 'landscape' | 'portrait' | 'square' } -> { image: <data URL> }
 * POST { action: 'voice', text, voice }                                       -> 501 until a provider is added
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
