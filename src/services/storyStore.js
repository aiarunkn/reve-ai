/**
 * Interactive stories. Each full story (bible, players, ledger, every turn) is kept
 * in IndexedDB; a small index of titles lives in localStorage for the map.
 * Shaped for several players: every turn is a round with one action per player.
 */
import { getAsset, putAsset, deleteAssetKinds } from './assetStore';

const INDEX_KEY = 'reve-ai:stories';

export function loadStoryIndex() {
  try {
    const list = JSON.parse(localStorage.getItem(INDEX_KEY) || '[]');
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function saveIndex(list) {
  try { localStorage.setItem(INDEX_KEY, JSON.stringify(list)); } catch { /* full */ }
}

const summaryOf = (s) => ({ id: s.id, title: s.bible.title, tagline: s.bible.tagline, mood: s.bible.mood, createdAt: s.createdAt, updatedAt: s.updatedAt, chapter: s.chapter?.n || 1, players: s.players.map((p) => p.name) });

export async function loadStory(id) {
  return getAsset(id, 'story');
}

export async function saveStory(story) {
  await putAsset(story.id, 'story', story);
  const idx = loadStoryIndex().filter((x) => x.id !== story.id);
  idx.push(summaryOf(story));
  saveIndex(idx);
}

export async function deleteStory(id) {
  saveIndex(loadStoryIndex().filter((x) => x.id !== id));
  await deleteAssetKinds(id, ['story', 'place0', 'place1', 'place2', 'place3', 'place4', 'place5']);
}

export async function savePlaceImage(storyId, index, dataUrl) {
  const blob = await (await fetch(dataUrl)).blob();
  return putAsset(storyId, `place${index}`, blob);
}

export async function loadPlaceImages(storyId, count) {
  const blobs = await Promise.all(Array.from({ length: count }, (_, i) => getAsset(storyId, `place${i}`)));
  return blobs.map((b) => (b ? URL.createObjectURL(b) : null));
}

/* ------------------------------ the ledger ------------------------------ */

export const relKey = (character, player) => `${character}::${player}`;

export function relationshipLabel(score) {
  if (score <= -6) return 'hostile';
  if (score <= -2) return 'wary';
  if (score < 2) return 'neutral';
  if (score < 6) return 'warm';
  return 'devoted';
}

/** A new story from the narrator's bible. */
export function storyFromBible(id, { premise, players, bible }) {
  const now = new Date().toISOString();
  const o = bible.opening;
  return {
    id,
    createdAt: now,
    updatedAt: now,
    lastPlayedAt: now,
    premise,
    players,
    bible,
    chapter: { n: 1, title: o.chapter_title },
    time: o.time,
    scene: clampScene(o.scene, bible.places.length),
    ledger: {
      summary: '',
      summarizedThrough: 0,
      facts: [],
      threads: bible.threads.map((t) => ({ text: t, status: 'open', since: 0 })),
      relationships: {},
    },
    turns: [{ kind: 'opening', chapter: 1, actions: [], narration: o.narration, choices: o.choices, consequences: [], at: now }],
  };
}

const clampScene = (i, n) => (Number.isInteger(i) && i >= 0 && i < n ? i : 0);

/** Apply the narrator's record of a turn to the story (returns a new story object). */
export function applyRecord(story, record, turnIndex) {
  if (!record) return story;
  const L = story.ledger;
  const relationships = { ...L.relationships };
  for (const r of record.relationships || []) {
    if (!r.character || !r.change) continue;
    const k = relKey(r.character, r.player || story.players[0].name);
    const prev = relationships[k] || { score: 0, notes: [] };
    relationships[k] = { score: Math.max(-10, Math.min(10, prev.score + r.change)), notes: [...prev.notes, r.note].filter(Boolean).slice(-4) };
  }
  const closed = new Set((record.threads_closed || []).map((t) => t.trim().toLowerCase()));
  const threads = L.threads.map((t) => (t.status === 'open' && closed.has(t.text.trim().toLowerCase()) ? { ...t, status: 'closed', closedAt: turnIndex } : t));
  for (const t of record.threads_opened || []) {
    if (t && !threads.some((x) => x.text.toLowerCase() === t.toLowerCase())) threads.push({ text: t, status: 'open', since: turnIndex });
  }
  const chapter = record.chapter_end?.trim() ? { n: (story.chapter?.n || 1) + 1, title: record.chapter_end.trim(), startedAt: turnIndex + 1 } : story.chapter;
  return {
    ...story,
    scene: clampScene(record.scene, story.bible.places.length) ?? story.scene,
    time: record.time || story.time,
    chapter,
    ledger: { ...L, facts: [...L.facts, ...(record.facts || [])].slice(-80), threads, relationships },
  };
}

/** What the server needs to narrate: the bible, the ledger and the last few rounds. */
export function slimStory(story) {
  return {
    bible: story.bible,
    players: story.players,
    ledger: story.ledger,
    chapter: story.chapter,
    time: story.time,
    scene: story.scene,
    recent: story.turns.filter((t) => t.narration).slice(-6).map((t) => ({ actions: t.actions, narration: t.narration })),
  };
}
