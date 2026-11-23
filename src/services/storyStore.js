/**
 * Interactive stories. Each full story (bible, players, ledger, every turn) is kept
 * in IndexedDB; a small index of titles lives in localStorage for the map.
 * Shaped for several players: every turn is a round with one action per player.
 */
import { getAsset, putAsset, deleteAssetKinds } from './assetStore';
import { applyLedger, relKey, freshLedger, nextChapterTitle } from '../shared/worldState';

export { relKey };

const INDEX_KEY = 'reve-ai:stories';

export function loadStoryIndex() {
  try {
    const list = JSON.parse(localStorage.getItem(INDEX_KEY) || '[]');
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

export function saveIndex(list) {
  try { localStorage.setItem(INDEX_KEY, JSON.stringify(list)); } catch { /* full */ }
}

export const summaryOf = (s) => ({ id: s.id, shared: s.shared?.code, title: s.bible.title, tagline: s.bible.tagline, mood: s.bible.mood, createdAt: s.createdAt, updatedAt: s.updatedAt, chapter: s.chapter?.n || 1, players: s.players.map((p) => p.name) });

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
  const story = await loadStory(id);
  saveIndex(loadStoryIndex().filter((x) => x.id !== id));
  const kinds = ['story', ...Array.from({ length: 8 }, (_, i) => `place${i}`), ...Array.from({ length: 8 }, (_, i) => `portrait${i}`), ...Array.from({ length: 8 }, (_, i) => `credit${i}`)];
  (story?.turns || []).forEach((t, i) => t.art && kinds.push(`moment${i}`));
  await deleteAssetKinds(id, kinds);
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
    scene: clampScene(o.scene, bible.places.length) ?? 0,
    ledger: freshLedger(bible),
    turns: [{ kind: 'opening', chapter: 1, actions: [], narration: o.narration, choices: o.choices, consequences: [], at: now }],
  };
}

const clampScene = (i, n) => (Number.isInteger(i) && i >= 0 && i < n ? i : null);

/** Apply the narrator's record of a turn to the story (returns a new story object). */
export function applyRecord(story, record, turnIndex) {
  if (!record) return story;
  const next = nextChapterTitle(record);
  const chapter = next ? { n: (story.chapter?.n || 1) + 1, title: next, startedAt: turnIndex + 1 } : story.chapter;
  return {
    ...story,
    scene: clampScene(record.scene, story.bible.places.length) ?? story.scene,
    time: record.time || story.time,
    chapter,
    ledger: applyLedger(story.ledger, record, turnIndex, story.players[0].name),
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
