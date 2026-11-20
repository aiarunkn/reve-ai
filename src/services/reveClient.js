/**
 * Browser client for /api/reve (see api/reve.js). The API key never touches the browser.
 * Every call throws NotConfiguredError when the server has no ANTHROPIC_API_KEY yet.
 */
const ENDPOINT = import.meta.env.VITE_REVE_ENDPOINT || '/api/reve';

export class NotConfiguredError extends Error {
  constructor() {
    super('The world’s mind is asleep: ANTHROPIC_API_KEY is not set yet.');
    this.name = 'NotConfiguredError';
  }
}

async function post(body, signal) {
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  });
  if (res.status === 501 || res.status === 404) throw new NotConfiguredError();
  if (!res.ok) {
    const json = await res.json().catch(() => ({}));
    throw new Error(json.error || `Request failed (${res.status})`);
  }
  return res;
}

/** The few fields the server needs: keeps requests small and leaves the secret out. */
function slim(world) {
  return { world_name: world.bible.world_name, tagline: world.bible.tagline, essence: world.bible.essence, scenes: world.bible.scenes, lore: world.bible.lore, character: world.bible.character };
}
const talk = (messages) => messages.map(({ role, content }) => ({ role, content }));

export async function dreamWorld(photos, description) {
  const res = await post({ action: 'world', photos, description });
  return res.json();
}

export async function reflectOn(world, messages) {
  const res = await post({ action: 'reflect', world: slim(world), memory: world.memory, messages: talk(messages) });
  return res.json();
}

async function streamInto(res, onText) {
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let text = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    text += decoder.decode(value, { stream: true });
    onText(text);
  }
  text += decoder.decode();
  onText(text);
  return text;
}

export async function chatWith(world, messages, onText, signal) {
  const res = await post({ action: 'chat', world: slim(world), memory: world.memory, messages: talk(messages) }, signal);
  return streamInto(res, onText);
}

export async function askForStory(world, { sceneIndex, prompt }, onText, signal) {
  const res = await post({ action: 'story', world: slim(world), memory: world.memory, sceneIndex, prompt }, signal);
  return streamInto(res, onText);
}

/** "[scene:2] Hello" -> { scene: 1, text: "Hello" }  (scene is 0-based; null if absent) */
export function parseScene(raw, sceneCount) {
  const m = raw.match(/^\s*\[scene:\s*(\d+)\]\s*/i);
  if (!m) {
    // while streaming, hide a marker that hasn't finished arriving yet
    if (/^\s*\[(s(c(e(n(e(:\s*\d*)?)?)?)?)?)?$/i.test(raw)) return { scene: null, text: '' };
    return { scene: null, text: raw };
  }
  const n = Number(m[1]) - 1;
  return { scene: n >= 0 && n < sceneCount ? n : null, text: raw.slice(m[0].length) };
}

/** A gentle placeholder world for when no API key is configured yet. */
export function sleepingBible(description, photoCount) {
  const words = description.replace(/[^\p{L}\p{N}\s'-]/gu, ' ').split(/\s+/).filter((w) => w.length > 3);
  const pick = words.slice(0, 2).map((w) => w[0].toUpperCase() + w.slice(1).toLowerCase()).join(' ');
  return {
    world_name: pick ? `The ${pick} Dream` : 'A Quiet Dream',
    tagline: 'A world still waiting for its first breath.',
    essence: description.slice(0, 280),
    mood: 'weightless',
    scenes: Array.from({ length: photoCount }, (_, i) => ({ photo_index: i, name: `Place ${i + 1}`, description: 'A place from your photos, waiting to be named.' })),
    character: { name: 'The Sleeper', role: 'someone who has not woken yet', appearance: 'A soft silhouette, breathing slowly.', personality: '', voice: '', backstory: '', longing: '', secret: '', first_words: '' },
    lore: [],
    asleep: true,
  };
}
