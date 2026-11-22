/**
 * /api/story — the narrator of Reve AI's interactive stories (Claude, Anthropic SDK).
 *
 * POST { action, ... }
 *   begin      { premise, players, photos? }       -> JSON: story bible + opening chapter
 *   turn       { story, actions }                   -> streamed narration, then "\u001e" + JSON record of consequences
 *   return     { story, awayHours }                 -> JSON: "previously…" recap + what happened while you were away
 *   summarize  { story, turns }                     -> JSON: folded story-so-far summary
 *
 * Shared worlds: a turn may carry { shared: { code, playerId, token } } instead of a story.
 * The server then loads that player's view of the world from the database (it never trusts
 * a story sent by the browser), narrates, and saves the turn for everyone.
 *
 * Built for several players from the start: a round carries one action per player.
 * Players who haven't joined yet are played by the narrator, true to their description.
 * Needs ANTHROPIC_API_KEY on the server; without it every call answers 501.
 * Every action is rate-limited per caller (see ./_limits.js) before it ever reaches Claude.
 */
import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { sharedConfigured, loadAs, narratorView, insertTurn } from './_db.js';
import { enforce } from './_limits.js';

const MODEL = 'claude-opus-5-5';
// If a reply is ever declined by a safety classifier, the API retries it on a fallback model.
const FALLBACK = { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' };
const MOODS = ['nostalgic', 'weightless', 'bittersweet', 'electric', 'quietlyHappy'];
const RECORD_SEPARATOR = '\u001e';
const SOUNDS = ['fireplace', 'rain', 'wind', 'water', 'crowd', 'quiet'];

let client;
export const anthropic = () => (client ??= new Anthropic());

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
      case 'begin': {
        const { ok, status, body: limitBody } = await enforce(req, 'world');
        if (!ok) return send(res, status, limitBody);
        return send(res, 200, await begin(body));
      }
      case 'turn': {
        const { identity, ok, status, body: limitBody } = await enforce(req, 'turn');
        if (!ok) return send(res, status, limitBody);
        return await turn(res, body, identity);
      }
      case 'return': {
        const { ok, status, body: limitBody } = await enforce(req, 'recap');
        if (!ok) return send(res, status, limitBody);
        return send(res, 200, await welcomeBack(body));
      }
      case 'summarize': {
        const { ok, status, body: limitBody } = await enforce(req, 'recap');
        if (!ok) return send(res, status, limitBody);
        return send(res, 200, await summarize(body));
      }
      default: return send(res, 400, { error: 'Unknown action' });
    }
  } catch (err) {
    console.error('[story]', err);
    if (res.headersSent) return res.end();
    if (err instanceof Anthropic.RateLimitError) return send(res, 429, { error: 'The narrator is busy — try again in a moment.' });
    if (err instanceof Anthropic.AuthenticationError) return send(res, 401, { error: 'The Anthropic API key was rejected.' });
    if (err instanceof Anthropic.APIError) return send(res, err.status || 502, { error: err.message });
    return send(res, err.status || 500, { error: err.message || 'Something went wrong' });
  }
}

/* ------------------------------------------------------------------ */
/*  The narrator's craft                                               */
/* ------------------------------------------------------------------ */

const NARRATOR = `You are the narrator of an interactive story in Reve AI. The players chose this world and live inside it; your job is to make it feel alive, consistent and consequential, so that it is worth returning to for months.

How a scene is written (the app shows it one beat at a time, like a visual novel):
- Write the scene as a sequence of short beats, separated by a blank line. Each beat is EITHER
  - narration: 1-2 sentences in the second person, present tense, about what you see, hear, smell or feel; or
  - one line of dialogue, written exactly as  Name: what they say  (the character's name as in the cast, a colon, then the words, with no quotation marks and no "she says").
- Never mix dialogue into a narration beat. Never write lines for the player characters: they speak through their own choices.
- 4-8 beats per turn. Vivid and specific, never purple. Plain text: no headings, no lists, no markdown except *italics*.

Continuity (this matters most):
- Pick up exactly where the last beat ended. The first beat shows the immediate result of what the player just did or said.
- Stay in the current place, with the characters already present, unless the player moves or someone visibly arrives.
- Characters answer what was actually said to them, in their own voice, acting on their own wants. They remember the ledger; never reset or forget.
- One scene, one tension. Follow the thread already in play. Introduce at most one new name, place or mystery in a turn, and only when the scene needs it.
- Never decide a player's feelings, words or big actions beyond what they chose. Players who have not joined yet are played by you, true to their description, without big irreversible choices.
- End on a beat that invites the player to respond: usually a character's line, often a question to you.
- The 3 suggested choices are things the player could say or do in direct response to that last beat: distinct in spirit (e.g. warm, bold, guarded), each under 10 words, written as the player's own line or action.
- Keep the world's facts consistent with the bible and the ledger.

Boundaries:
- Create original characters and stories. If a premise names a famous book, film or game place, give the player that kind of place, faithfully in feel (its architecture, light, sounds and mood), but under your own original name, with your own original characters and lore; do not reproduce or continue copyrighted stories or characters.
- Mature themes (danger, grief, romance, rivalry) are welcome when the story calls for them; keep anything sexual off-page.
- If a player seems to be in real distress or danger outside the story, step gently out of the fiction to care for them directly and suggest reaching out to someone they trust or to local support.`;

const Bible = z.object({
  title: z.string().describe('Title of the story, 1-5 words'),
  tagline: z.string().describe('One line, under 14 words'),
  setting: z.string().describe('2-3 sentences: where and when, what is at stake'),
  tone: z.string().describe('A few words, e.g. "bittersweet, witty, candlelit"'),
  mood: z.enum(MOODS),
  places: z.array(z.object({
    name: z.string(),
    description: z.string().describe('2 sensory sentences'),
    photo_index: z.number().int().describe('Index of the photo this place is painted from, or -1'),
    sounds: z.array(z.enum(SOUNDS)).describe('1-2 ambient sounds you hear in this place'),
    photo_search: z.array(z.string()).describe('2 searches for a real stock photo that looks like this place, most specific first, 2-3 plain words each, say "interior" for indoor places, e.g. ["gothic library interior", "old library"]. Describe what it looks like; never franchise or character names'),
  })).describe('3-5 places; the first one is where the story opens. Every provided photo becomes exactly one place'),
  cast: z.array(z.object({
    name: z.string(),
    role: z.string().describe('Under 8 words'),
    look: z.string().describe('1 sentence'),
    personality: z.string().describe('1-2 sentences'),
    voice: z.string().describe('How they talk'),
    wants: z.string().describe('What they are after'),
    secret: z.string(),
    bond: z.string().describe('How they relate to the players at the start, under 18 words'),
    voice_tone: z.enum(['low', 'medium', 'high']).describe('Where their speaking voice sits, used for read-aloud'),
  })).describe('2-4 non-player characters with their own goals; the first one is the person in the opening scene'),
  threads: z.array(z.string()).describe('3 open storylines, each under 14 words'),
  protagonist: z.object({
    name: z.string(),
    look: z.string().describe('1 sentence'),
    want: z.string().describe('What they want most, 1 sentence'),
    secret: z.string().describe('A secret only they and the narrator know'),
    tag: z.string().describe('A short label shown under their name, e.g. "House Ashgrove · Year 5" or "Painter · Montparnasse"'),
  }).describe('The player character. If the player described themselves, use that; otherwise invent someone who fits the premise'),
  opening: z.object({
    chapter_title: z.string(),
    time: z.string().describe('In-world time, e.g. "Spring 1926 — a Tuesday, near midnight"'),
    narration: z.string().describe('The opening scene as 5-8 beats in the scene format (blank line between beats; dialogue as "Name: words"). Open inside the place: first what you see, hear and smell; then the first cast member, already in the room, notices you; end on their line to you'),
    scene: z.number().int().describe('Index of the place where the story opens (normally 0)'),
    choices: z.array(z.string()).describe('3 suggested replies to the last line, under 10 words each'),
  }),
});

function playersBlock(players = []) {
  return players.map((p, i) => {
    const who = i === 0 ? 'Player 1 (the one reading now, "you")' : `Player ${i + 1}`;
    if (p.remote) {
      return `${who}: ${p.name} — another real person living in this same world, in their own scenes. Never speak, act, feel or decide for them. They can appear in your scene only if they are in the same place, and then only in passing (seen across a room, a note they left, a rumour about them).${p.look ? `\n  Look: ${p.look}` : ''}`;
    }
    const status = p.joined === false ? ' — has not joined yet: you play them, true to this description' : '';
    return `${who}: ${p.name}${status}
  Look: ${p.look || '—'}
  Wants: ${p.want || '—'}
  ${p.description ? `As described: ${p.description}\n  ` : ''}Secret (known only to them and to you): ${p.secret || '—'}`;
  }).join('\n');
}

async function begin({ premise, players = [], photos = [] }) {
  if (!premise || typeof premise !== 'string') throw httpError(400, 'Describe your story first.');
  if (!Array.isArray(players)) throw httpError(400, 'Players must be a list.');
  const invent = !players[0]?.name;
  if (photos.length > 5) throw httpError(400, 'Up to 5 photos.');
  const images = photos.map((p, i) => {
    const m = typeof p === 'string' && p.match(/^data:(image\/(?:jpeg|png|webp));base64,(.+)$/);
    if (!m) throw httpError(400, `Photo ${i + 1} is not an image data URL.`);
    return { type: 'image', source: { type: 'base64', media_type: m[1], data: m[2] } };
  });

  const response = await anthropic().messages.parse({
    model: MODEL,
    max_tokens: 16000,
    output_config: { effort: 'medium', format: zodOutputFormat(Bible) },
    system: `${NARRATOR}\n\nRight now you are setting up a brand-new story: its world, its places, its cast, its open threads and its opening scene. The opening drops the player straight into a moment. If the premise names a place (\"a common room under the lake\", \"a night market in Seoul\"), the story opens IN that place, at a specific hour, with one person there. Keep the setup small and coherent: few names, one clear tension to start. Write in the language of the premise.`,
    messages: [{
      role: 'user',
      content: [
        ...images.flatMap((img, i) => [{ type: 'text', text: `Photo ${i} (make it a place in the story):` }, img]),
        { type: 'text', text: `PREMISE\n${premise.slice(0, 2000)}\n\n${invent ? 'THE PLAYER\nThe player has not described themselves: invent the protagonist they will play, someone who fits the premise and is interesting to be.' : `THE PLAYERS\n${playersBlock(players)}`}\n\n${photos.length ? `There are ${photos.length} photos; each becomes exactly one place.` : 'There are no photos; invent the places.'}` },
      ],
    }],
  });
  if (response.stop_reason === 'refusal') throw httpError(422, 'This story couldn’t be started from that premise.');
  if (!response.parsed_output) throw httpError(502, 'The story came back incomplete — please try again.');
  return response.parsed_output;
}

/* ------------------------------------------------------------------ */
/*  A turn: narration streams, then the consequences are recorded      */
/* ------------------------------------------------------------------ */

const Record = z.object({
  scene: z.number().int().describe('Index of the place the scene is now in'),
  time: z.string().describe('In-world time after this turn'),
  choices: z.array(z.string()).describe('3 suggested replies or moves for Player 1, responding to the last beat, under 10 words each'),
  consequences: z.array(z.object({
    text: z.string().describe('Under 14 words, e.g. "Léa will remember you lied about the gallery"'),
    kind: z.enum(['relationship', 'promise', 'secret', 'item', 'place', 'thread', 'reputation']),
  })).describe('0-3 lasting consequences of what the players did this turn'),
  relationships: z.array(z.object({
    character: z.string(),
    player: z.string(),
    change: z.number().int().describe('-2 to 2'),
    note: z.string().describe('Under 12 words, why'),
  })),
  facts: z.array(z.string()).describe('New facts that are now canon, each under 16 words'),
  threads_opened: z.array(z.string()),
  threads_closed: z.array(z.string()).describe('Exact text of threads that were resolved'),
  chapter_end: z.string().describe('If this turn ends a chapter, the title of the next chapter; otherwise empty'),
});

const RECORD_TOOL = {
  name: 'record_turn',
  description: 'Record what this turn changed in the story: where we are, what time it is, lasting consequences, relationship changes, new canon facts, opened/closed threads, and three suggested next moves. Call it exactly once, after the narration.',
  strict: true,
  eager_input_streaming: true,
  input_schema: {
    type: 'object',
    additionalProperties: false,
    required: ['scene', 'time', 'choices', 'consequences', 'relationships', 'facts', 'threads_opened', 'threads_closed', 'chapter_end'],
    properties: {
      scene: { type: 'integer' },
      time: { type: 'string' },
      choices: { type: 'array', items: { type: 'string' } },
      consequences: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['text', 'kind'],
          properties: {
            text: { type: 'string' },
            kind: { type: 'string', enum: ['relationship', 'promise', 'secret', 'item', 'place', 'thread', 'reputation'] },
          },
        },
      },
      relationships: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['character', 'player', 'change', 'note'],
          properties: {
            character: { type: 'string' },
            player: { type: 'string' },
            change: { type: 'integer', enum: [-2, -1, 0, 1, 2] },
            note: { type: 'string' },
          },
        },
      },
      facts: { type: 'array', items: { type: 'string' } },
      threads_opened: { type: 'array', items: { type: 'string' } },
      threads_closed: { type: 'array', items: { type: 'string' } },
      chapter_end: { type: 'string' },
    },
  },
};

function bibleBlock(story) {
  const b = story.bible;
  return `STORY: ${b.title} — ${b.tagline}
Setting: ${b.setting}
Tone: ${b.tone}

PLACES (index: name — description)
${b.places.map((p, i) => `${i}: ${p.name} — ${p.description}`).join('\n')}

CAST
${b.cast.map((c) => `- ${c.name}, ${c.role}. ${c.look} ${c.personality} Voice: ${c.voice} Wants: ${c.wants} Secret: ${c.secret}`).join('\n')}

PLAYERS
${playersBlock(story.players)}`;
}

function ledgerBlock(story) {
  const L = story.ledger || {};
  const rel = Object.entries(L.relationships || {}).map(([k, v]) => {
    const [character, player] = k.split('::');
    return `- ${character} → ${player}: ${v.score >= 0 ? '+' : ''}${v.score}${v.notes?.length ? ` (${v.notes.slice(-2).join('; ')})` : ''}`;
  }).join('\n');
  const open = (L.threads || []).filter((t) => t.status === 'open').map((t) => `- ${t.text}`).join('\n');
  return `THE LEDGER (canon — never contradict it)
Chapter ${story.chapter?.n || 1}: ${story.chapter?.title || ''}
Time now: ${story.time || 'unknown'}
Current place: ${story.bible.places[story.scene ?? 0]?.name || '—'}
Story so far: ${L.summary || '(just beginning)'}
Facts:
${(L.facts || []).slice(-40).map((f) => `- ${f}`).join('\n') || '- (none yet)'}
Open threads:
${open || '- (none)'}
Relationships (score from -10 hostile to +10 devoted):
${rel || '- (all neutral so far)'}${meanwhileBlock(story)}`;
}

/** Shared worlds: what the other players lived recently. Canon, but not this player's scene. */
function meanwhileBlock(story) {
  const items = story.meanwhile || [];
  if (!items.length) return '';
  return `

MEANWHILE, ELSEWHERE IN THIS SAME WORLD (other players' scenes; canon, never contradict them)
${items.map((m) => `- ${m.player}${m.place ? ` at ${m.place}` : ''}: ${m.did ? `${m.did} → ` : ''}${(m.narration || m.preview || '').replace(/\s+/g, ' ').slice(0, 500)}`).join('\n')}
Let these ripple into Player 1's scene only through what they could notice: a changed object, a rumour, a character's new mood or what they let slip. Do not retell them, and do not move Player 1 to where the others are.`;
}

/** The last few rounds, as conversation turns: players' actions -> narration. */
function recentRounds(story) {
  const out = [];
  for (const t of (story.recent || []).slice(-6)) {
    const acts = (t.actions || []).map((a) => `${a.player}: ${a.text}`).join('\n');
    out.push({ role: 'user', content: acts || '(the story continues)' });
    if (t.narration) out.push({ role: 'assistant', content: t.narration.slice(0, 3000) });
  }
  return out;
}

async function turn(res, body, identity) {
  let { story, actions } = body;
  let shared = null;
  if (body.shared) {
    if (!sharedConfigured()) throw httpError(503, 'Shared worlds need SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY on the server.');
    shared = await loadAs({ ...body.shared, userId: identity?.userId });
    story = narratorView(shared);
    // you can only ever act as yourself
    actions = (actions || []).slice(0, 1).map((a) => ({ player: shared.me.name, text: String(a?.text || '') }));
  }
  if (!story?.bible) throw httpError(400, 'Missing story.');
  if (!Array.isArray(actions) || !actions.some((a) => a?.text?.trim())) throw httpError(400, 'What do you do?');
  const act = actions.filter((a) => a?.text?.trim()).map((a) => `${a.player}: ${String(a.text).slice(0, 1500)}`).join('\n');

  const stream = anthropic().beta.messages.stream({
    model: MODEL,
    max_tokens: 8000,
    ...FALLBACK,
    output_config: { effort: 'medium' },
    cache_control: { type: 'ephemeral' },
    system: [
      { type: 'text', text: `${NARRATOR}\n\n${bibleBlock(story)}` },
      { type: 'text', text: ledgerBlock(story) },
    ],
    tools: [RECORD_TOOL],
    tool_choice: { type: 'auto' },
    messages: [
      ...recentRounds(story),
      { role: 'user', content: `${act}\n\nContinue the scene from exactly this moment, as beats. Then call record_turn exactly once.` },
    ],
  });

  res.statusCode = 200;
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('X-Accel-Buffering', 'no');
  let narration = '';
  stream.on('text', (delta) => { narration += delta; res.write(delta); });

  let record = null;
  let stopReason = null;
  try {
    const message = await stream.finalMessage();
    stopReason = message.stop_reason;
    const block = message.content.find((b) => b.type === 'tool_use' && b.name === 'record_turn');
    if (block && stopReason !== 'max_tokens' && stopReason !== 'refusal') {
      const parsed = Record.safeParse(block.input);
      if (parsed.success) record = parsed.data;
      else console.warn('[story] record_turn failed validation', parsed.error.issues.slice(0, 3));
    }
  } catch (err) {
    if (err instanceof Anthropic.APIError) throw err;
    console.warn('[story] could not read record_turn', err); // malformed tool JSON: keep the narration, skip the record
  }
  if (shared && narration.trim()) {
    try {
      const saved = await insertTurn(shared.world.code, shared.me.id, { kind: 'turn', actions, narration: narration.trim(), record });
      return res.end(`${RECORD_SEPARATOR}${JSON.stringify({ record, stopReason, saved })}`);
    } catch (err) {
      console.error('[story] could not save shared turn', err);
      return res.end(`${RECORD_SEPARATOR}${JSON.stringify({ record, stopReason, saveError: err.message })}`);
    }
  }
  res.end(`${RECORD_SEPARATOR}${JSON.stringify({ record, stopReason })}`);
}

/* ------------------------------------------------------------------ */
/*  Arriving in a shared world                                          */
/* ------------------------------------------------------------------ */

const Arrival = z.object({
  look: z.string().describe('How the new player looks here, 1 sentence, built from what they said about themselves'),
  tag: z.string().describe('A short label under their name, e.g. "New arrival · Year 5" or "Painter · Montparnasse"'),
  want: z.string().describe('What they want most in this world, 1 sentence'),
  secret: z.string().describe('A secret only they and the narrator know, that ties them to this world'),
  scene: z.number().int().describe('Index of the place they wake up in'),
  time: z.string().describe('In-world time as they arrive'),
  narration: z.string().describe('Their arrival scene as 5-8 beats in the scene format: they wake up or step into one place; first what they see, hear and smell; one small sign that others already live here (something another player did); then a cast member notices them; end on that character\'s line to them'),
  choices: z.array(z.string()).describe('3 suggested replies to the last line, under 10 words each'),
});

/** Write a new player's way into a world others already live in. `story` is their view (see narratorView). */
export async function arrive(story) {
  const me = story.players[0];
  const response = await anthropic().messages.parse({
    model: MODEL,
    max_tokens: 8000,
    ...FALLBACK,
    output_config: { effort: 'medium', format: zodOutputFormat(Arrival) },
    system: [
      { type: 'text', text: `${NARRATOR}\n\n${bibleBlock(story)}` },
      { type: 'text', text: ledgerBlock(story) },
    ],
    messages: [{
      role: 'user',
      content: `${me.name} is joining this world for the first time, as a new player. ${me.description ? `They describe themselves: "${String(me.description).slice(0, 400)}". ` : 'They have not described themselves: make them someone who belongs here and is interesting to be. '}Write the moment they arrive. They live their own scenes from now on, in the same world and canon as everyone else. Write in the language of the story.`,
    }],
  });
  if (response.stop_reason === 'refusal') throw httpError(422, 'This world couldn’t take in that character. Try describing yourself differently.');
  if (!response.parsed_output) throw httpError(502, 'Your arrival came back incomplete. Please try again.');
  return response.parsed_output;
}

/* ------------------------------------------------------------------ */
/*  Coming back: recap + what the world did while you were away         */
/* ------------------------------------------------------------------ */

const Return = z.object({
  recap: z.string().describe('What has happened so far, in the narrator’s voice, 60-120 words, second person. It appears under a "Previously…" heading, so do not begin with that word'),
  away_events: z.array(z.object({
    text: z.string().describe('One small development, 1-2 sentences, that happened while the player was away'),
    fact: z.string().describe('The same development as a short canon fact'),
  })).describe('Small developments proportional to the time away; never undo the players’ choices'),
  time: z.string().describe('The in-world time now'),
  choices: z.array(z.string()).describe('3 short suggested moves for picking the story back up'),
});

async function welcomeBack({ story, awayHours }) {
  if (!story?.bible) throw httpError(400, 'Missing story.');
  const hours = Math.max(0, Number(awayHours) || 0);
  const n = hours < 24 ? 1 : hours < 24 * 7 ? 2 : 3;
  const away = hours < 24 ? `${Math.round(hours)} hours` : `${Math.round(hours / 24)} days`;
  const last = (story.recent || []).slice(-2).map((t) => t.narration).filter(Boolean).join('\n\n');
  const response = await anthropic().messages.parse({
    model: MODEL,
    max_tokens: 4000,
    output_config: { effort: 'low', format: zodOutputFormat(Return) },
    system: [
      { type: 'text', text: `${NARRATOR}\n\n${bibleBlock(story)}` },
      { type: 'text', text: ledgerBlock(story) },
    ],
    messages: [{
      role: 'user',
      content: `The first player is returning after ${away} away. Where we left off:\n\n${last.slice(-3000)}\n\nWrite a short "previously…" recap, and exactly ${n} small development${n > 1 ? 's' : ''} that happened in the world in the meantime (the cast lives on: letters, rumours, small changes; nothing that takes away the players' choices). The players' own characters stay where they were.`,
    }],
  });
  if (!response.parsed_output) throw httpError(502, 'The recap came back incomplete.');
  return response.parsed_output;
}

const Summary = z.object({ summary: z.string().describe('The story so far, under 250 words, keeping every consequence that still matters') });

async function summarize({ story, turns }) {
  if (!story?.bible || !Array.isArray(turns)) throw httpError(400, 'Missing story or turns.');
  const text = turns.map((t) => `${(t.actions || []).map((a) => `${a.player}: ${a.text}`).join(' / ')}\n${t.narration}`).join('\n\n').slice(-24000);
  const response = await anthropic().messages.parse({
    model: MODEL,
    max_tokens: 2000,
    output_config: { effort: 'low', format: zodOutputFormat(Summary) },
    system: `You keep the running summary of the interactive story "${story.bible.title}". Fold the new events into the existing summary. Keep names, choices and consequences that could matter later.`,
    messages: [{ role: 'user', content: `EXISTING SUMMARY\n${story.ledger?.summary || '(none)'}\n\nNEW EVENTS\n${text}` }],
  });
  if (!response.parsed_output) throw httpError(502, 'Summary came back incomplete.');
  return response.parsed_output;
}

/* ------------------------------------------------------------------ */
/*  helpers                                                            */
/* ------------------------------------------------------------------ */

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
