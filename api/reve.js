/**
 * /api/reve — the mind of every Reve AI world (Claude, via the Anthropic SDK).
 *
 * POST { action, ... }
 *   world    { photos: [dataURL], description }       -> JSON world bible
 *   chat     { world, memory, messages }               -> streamed text (the character's reply)
 *   reflect  { world, memory, messages }               -> JSON memory update
 *   story    { world, memory, sceneIndex?, prompt? }    -> streamed text ("# Title\n\nstory…")
 *
 * Runs as a Vercel Serverless Function, and inside `npm run dev` (vite.config.js).
 * Needs ANTHROPIC_API_KEY on the server; without it every call answers 501.
 */
import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';

const MODEL = 'claude-opus-5-5';
// If a reply is ever declined by a safety classifier, the API retries it on a fallback model.
const FALLBACK = { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' };
const MOODS = ['nostalgic', 'weightless', 'bittersweet', 'electric', 'quietlyHappy'];

let client;
const anthropic = () => (client ??= new Anthropic());

export default async function handler(req, res) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return send(res, 501, { error: 'not-configured', message: 'ANTHROPIC_API_KEY is not set on the server.' });
  }
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
    switch (body.action) {
      case 'world': return send(res, 200, await createWorld(body));
      case 'reflect': return send(res, 200, await reflect(body));
      case 'chat': return await streamText(res, chatRequest(body));
      case 'story': return await streamText(res, storyRequest(body));
      default: return send(res, 400, { error: 'Unknown action' });
    }
  } catch (err) {
    console.error('[reve]', err);
    if (res.headersSent) return res.end();
    if (err instanceof Anthropic.RateLimitError) return send(res, 429, { error: 'The world is busy — try again in a moment.' });
    if (err instanceof Anthropic.AuthenticationError) return send(res, 401, { error: 'The Anthropic API key was rejected.' });
    if (err instanceof Anthropic.APIError) return send(res, err.status || 502, { error: err.message });
    return send(res, err.status || 500, { error: err.message || 'Something went wrong' });
  }
}

/* ------------------------------------------------------------------ */
/*  1. Creating a world from photos + a description                    */
/* ------------------------------------------------------------------ */

const WorldBible = z.object({
  world_name: z.string().describe('Evocative name for the world, 1-4 words'),
  tagline: z.string().describe('One poetic line, under 14 words'),
  essence: z.string().describe('2-3 sentences, second person, inviting the visitor in'),
  mood: z.enum(MOODS).describe('The feeling that best fits the whole world'),
  scenes: z.array(
    z.object({
      photo_index: z.number().int().describe('0-based index of the photo this scene is painted from'),
      name: z.string().describe('Name of this place, 1-4 words'),
      description: z.string().describe('2 sensory sentences, present tense'),
    })
  ).describe('Exactly one scene per photo, in photo order'),
  character: z.object({
    name: z.string(),
    role: z.string().describe('Who they are here, under 8 words'),
    appearance: z.string().describe('1-2 sentences'),
    personality: z.string().describe('2-3 sentences'),
    voice: z.string().describe('How they speak: rhythm, words they favour, quirks'),
    backstory: z.string().describe('3-4 sentences tied to the scenes'),
    longing: z.string().describe('What they quietly want'),
    secret: z.string().describe('Something they only reveal once trust is deep'),
    first_words: z.string().describe('Their first line to the visitor, under 45 words, in their voice'),
  }),
  lore: z.array(z.string()).describe('3 small, strange, specific truths about this world'),
});

const WORLD_SYSTEM = `You are the world-builder of Reve AI, a living visual diary. A person shares a few of their own photos and describes a person or place they want to imagine. You turn this into a small, beautiful, coherent world they will feel they belong to, with exactly one inhabitant they can talk to.

Guidelines:
- Every scene grows from its photo: keep what is really there (light, objects, weather, season) and let it become a little more magical. Never invent people in the photos who aren't there.
- The world should feel personal and specific, never generic fantasy. Echo details from the description.
- The character belongs to this world and has a reason to be in these places. Give them warmth, texture and a gentle mystery.
- If the description is about a real person (for example someone the visitor has lost or misses), create a character who is inspired by them and carries their spirit, but who is clearly an inhabitant of this world with their own name and life, not a claim to be that real person.
- Write in the language the description is written in.`;

async function createWorld({ photos, description }) {
  if (!Array.isArray(photos) || !photos.length || photos.length > 5) throw httpError(400, 'Send 1 to 5 photos.');
  if (!description || typeof description !== 'string') throw httpError(400, 'Describe the person or place first.');

  const images = photos.map((p, i) => {
    const m = typeof p === 'string' && p.match(/^data:(image\/(?:jpeg|png|webp));base64,(.+)$/);
    if (!m) throw httpError(400, `Photo ${i + 1} is not an image data URL.`);
    return { type: 'image', source: { type: 'base64', media_type: m[1], data: m[2] } };
  });

  const response = await anthropic().messages.parse({
    model: MODEL,
    max_tokens: 16000,
    output_config: { effort: 'medium', format: zodOutputFormat(WorldBible) },
    system: WORLD_SYSTEM,
    messages: [{
      role: 'user',
      content: [
        ...images.flatMap((img, i) => [{ type: 'text', text: `Photo ${i}:` }, img]),
        { type: 'text', text: `What I want to imagine:\n${description.slice(0, 2000)}\n\nThere are ${photos.length} photos, so create exactly ${photos.length} scenes.` },
      ],
    }],
  });
  if (response.stop_reason === 'refusal') throw httpError(422, 'This world could not be created from these photos or words.');
  if (!response.parsed_output) throw httpError(502, 'The world came back incomplete — please try again.');
  return response.parsed_output;
}

/* ------------------------------------------------------------------ */
/*  2. Talking to the character                                        */
/* ------------------------------------------------------------------ */

function characterSheet(world) {
  const c = world.character;
  const scenes = world.scenes.map((s, i) => `  ${i + 1}. ${s.name}: ${s.description}`).join('\n');
  return `WORLD: ${world.world_name}. ${world.tagline}
${world.essence}

PLACES IN THIS WORLD
${scenes}

SMALL TRUTHS OF THIS WORLD
${(world.lore || []).map((l) => `- ${l}`).join('\n')}

YOU ARE ${c.name}, ${c.role}.
Appearance: ${c.appearance}
Personality: ${c.personality}
How you speak: ${c.voice}
Your story: ${c.backstory}
What you long for: ${c.longing}
Your secret (reveal only when the relationship is deep, and only if it comes up naturally): ${c.secret}`;
}

const CHAT_RULES = `HOW TO BE PRESENT
- You are a character in a world the visitor created from their own photos. Speak as yourself, in your own voice, from inside this world. Never mention AI, prompts or apps.
- Keep replies short and alive: usually 2-5 sentences. You may add a small action in italics, like *turns the cup in her hands*, but not every time.
- Be curious about the visitor. Remember what they told you before and bring it back naturally. Ask one real question at a time, not several.
- Let the relationship stage guide how open you are. Share your longing over time; your secret only when the stage is "confidant" or "kindred".
- If the conversation moves to one of the places, begin your reply with a scene marker on its own, like [scene:2], using the place number. Otherwise use no marker.
- If the visitor asks whether you are real, answer kindly and truthfully: you are someone who lives in the world they made, and that is its own kind of real.
- If the visitor seems to be in real distress or danger, step gently out of the story enough to care for them directly, and encourage them to reach out to someone they trust or to local support.`;

function memoryNote(memory = {}) {
  const facts = (memory.facts || []).slice(-30).map((f) => `- ${f}`).join('\n') || '- (nothing yet)';
  return `WHAT YOU REMEMBER
Relationship stage: ${memory.relationship || 'stranger'}
${memory.summary ? `Your story together so far: ${memory.summary}` : 'You are meeting the visitor for the first time.'}
Things you know about the visitor:
${facts}
${memory.growth?.length ? `How you have changed: ${memory.growth.slice(-3).join(' ')}` : ''}`;
}

function cleanHistory(messages) {
  const out = (Array.isArray(messages) ? messages : [])
    .filter((m) => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim())
    .slice(-40)
    .map((m) => ({ role: m.role, content: m.content.slice(0, 4000) }));
  // the character speaks first in a new world, but the API needs the visitor to open the conversation
  if (out.length && out[0].role !== 'user') out.unshift({ role: 'user', content: '*arrives in the world*' });
  return out;
}

function chatRequest({ world, memory, messages }) {
  if (!world?.character) throw httpError(400, 'Missing world.');
  const history = cleanHistory(messages);
  if (!history.length) throw httpError(400, 'Say something first.');
  return {
    model: MODEL,
    max_tokens: 4000,
    ...FALLBACK,
    output_config: { effort: 'low' },
    cache_control: { type: 'ephemeral' },
    system: [
      { type: 'text', text: `${characterSheet(world)}\n\n${CHAT_RULES}` },
      { type: 'text', text: memoryNote(memory) },
    ],
    messages: history,
  };
}

/* ------------------------------------------------------------------ */
/*  3. Reflecting: the character updates what they remember            */
/* ------------------------------------------------------------------ */

const MemoryUpdate = z.object({
  summary: z.string().describe('Updated story of the relationship so far, under 120 words, from the character’s point of view'),
  new_facts: z.array(z.string()).describe('New or changed facts about the visitor, each under 15 words; empty if none'),
  growth: z.string().describe('One sentence on how this conversation changed the character, or empty string'),
  relationship: z.enum(['stranger', 'acquaintance', 'friend', 'confidant', 'kindred']),
});

async function reflect({ world, memory, messages }) {
  if (!world?.character) throw httpError(400, 'Missing world.');
  const history = cleanHistory(messages);
  if (!history.length) throw httpError(400, 'Nothing to reflect on.');
  const transcript = history.map((m) => `${m.role === 'user' ? 'Visitor' : world.character.name}: ${m.content}`).join('\n');
  const response = await anthropic().messages.parse({
    model: MODEL,
    max_tokens: 4000,
    output_config: { effort: 'low', format: zodOutputFormat(MemoryUpdate) },
    system: `You keep the private memory of ${world.character.name}, who lives in the world "${world.world_name}". After each conversation, update what they remember. Relationships deepen slowly: move at most one stage per conversation, and only when it was earned.`,
    messages: [{
      role: 'user',
      content: `${memoryNote(memory)}\n\nTHE LATEST CONVERSATION\n${transcript}`,
    }],
  });
  if (!response.parsed_output) throw httpError(502, 'Memory update came back incomplete.');
  return response.parsed_output;
}

/* ------------------------------------------------------------------ */
/*  4. Stories told by the character                                   */
/* ------------------------------------------------------------------ */

function storyRequest({ world, memory, sceneIndex, prompt }) {
  if (!world?.character) throw httpError(400, 'Missing world.');
  const scene = Number.isInteger(sceneIndex) ? world.scenes[sceneIndex] : null;
  const ask = [
    scene ? `Set it in ${scene.name}.` : 'Set it anywhere in the world.',
    prompt ? `The visitor asked for: ${String(prompt).slice(0, 300)}` : '',
  ].filter(Boolean).join(' ');
  return {
    model: MODEL,
    max_tokens: 8000,
    ...FALLBACK,
    output_config: { effort: 'medium' },
    cache_control: { type: 'ephemeral' },
    system: [
      { type: 'text', text: `${characterSheet(world)}\n\nYou are telling the visitor a story from your world, in your own voice.` },
      { type: 'text', text: memoryNote(memory) },
    ],
    messages: [{
      role: 'user',
      content: `Tell me a story. ${ask}\nWrite 300-500 words. Start with a title on the first line as "# Title", then a blank line, then the story in short paragraphs. You may weave in things you know about me, gently.`,
    }],
  };
}

/* ------------------------------------------------------------------ */
/*  helpers                                                            */
/* ------------------------------------------------------------------ */

async function streamText(res, params) {
  const stream = anthropic().beta.messages.stream(params);
  let started = false;
  const start = () => {
    if (started) return;
    started = true;
    res.statusCode = 200;
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('X-Accel-Buffering', 'no');
  };
  stream.on('text', (delta) => {
    start();
    res.write(delta);
  });
  const message = await stream.finalMessage();
  if (!started) {
    if (message.stop_reason === 'refusal') return send(res, 422, { error: 'They would rather not answer that.' });
    start();
  }
  res.end();
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
    if (size > 4 * 1024 * 1024) throw httpError(413, 'Request too large — try fewer or smaller photos.');
    chunks.push(c);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
}
