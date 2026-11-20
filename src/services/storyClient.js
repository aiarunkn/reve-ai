/**
 * Browser client for /api/story (see api/story.js). The API key never touches the browser.
 */
import { NotConfiguredError } from './reveClient';
import { slimStory } from './storyStore';

const ENDPOINT = import.meta.env.VITE_STORY_ENDPOINT || '/api/story';
const SEP = '\u001e';

async function post(body, signal) {
  const res = await fetch(ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal });
  if (res.status === 501 || res.status === 404) throw new NotConfiguredError();
  if (!res.ok) {
    const json = await res.json().catch(() => ({}));
    throw new Error(json.error || `Request failed (${res.status})`);
  }
  return res;
}

export async function beginStory({ premise, players, photos }) {
  return (await post({ action: 'begin', premise, players, photos })).json();
}

/**
 * Play one round. `onText(narrationSoFar)` fires as the narration streams in.
 * Resolves to { narration, record } where record holds the turn's consequences (or null).
 */
export async function playTurn(story, actions, onText, signal) {
  const res = await post({ action: 'turn', story: slimStory(story), actions }, signal);
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let raw = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    raw += decoder.decode(value, { stream: true });
    const cut = raw.indexOf(SEP);
    onText(cut === -1 ? raw : raw.slice(0, cut));
  }
  raw += decoder.decode();
  const cut = raw.indexOf(SEP);
  const narration = (cut === -1 ? raw : raw.slice(0, cut)).trim();
  let record = null;
  if (cut !== -1) {
    try { record = JSON.parse(raw.slice(cut + 1)).record; } catch { record = null; }
  }
  return { narration, record };
}

export async function welcomeBack(story, awayHours) {
  return (await post({ action: 'return', story: slimStory(story), awayHours })).json();
}

export async function summarizeTurns(story, turns) {
  return (await post({ action: 'summarize', story: slimStory(story), turns: turns.map((t) => ({ actions: t.actions, narration: t.narration })) })).json();
}

export { NotConfiguredError };
