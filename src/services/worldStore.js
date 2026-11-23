/**
 * Imagined worlds. Text (the world bible, memory, conversations, stories) lives in
 * localStorage; the painted scene images live in IndexedDB (assetStore).
 */
import { getAsset, putAsset, deleteAssetKinds } from './assetStore';

const KEY = 'reve-ai:worlds';
const MAX_MESSAGES = 200;

export function loadWorlds() {
  try {
    const list = JSON.parse(localStorage.getItem(KEY) || '[]');
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

export function saveWorlds(worlds) {
  try {
    const trimmed = worlds.map((w) => ({ ...w, messages: (w.messages || []).slice(-MAX_MESSAGES) }));
    localStorage.setItem(KEY, JSON.stringify(trimmed));
    return true;
  } catch (err) {
    console.warn('[worlds] could not save', err);
    return false;
  }
}

export const newMemory = () => ({ summary: '', facts: [], growth: [], relationship: 'stranger', conversations: 0 });

/** Merge what the character just reflected into their memory. */
export function applyReflection(memory, update) {
  const facts = [...(memory.facts || [])];
  for (const f of update.new_facts || []) {
    const fact = f.trim();
    if (fact && !facts.some((x) => x.toLowerCase() === fact.toLowerCase())) facts.push(fact);
  }
  return {
    ...memory,
    summary: update.summary || memory.summary,
    facts: facts.slice(-40),
    growth: update.growth ? [...(memory.growth || []), update.growth].slice(-8) : memory.growth || [],
    relationship: update.relationship || memory.relationship,
    conversations: (memory.conversations || 0) + 1,
  };
}

export async function saveScene(worldId, index, dataUrl) {
  const blob = await (await fetch(dataUrl)).blob();
  return putAsset(worldId, `scene${index}`, blob);
}

export async function loadScenes(worldId, count) {
  const blobs = await Promise.all(Array.from({ length: count }, (_, i) => getAsset(worldId, `scene${i}`)));
  return blobs.map((b) => (b ? URL.createObjectURL(b) : null));
}

export function deleteWorldAssets(worldId) {
  return deleteAssetKinds(worldId, ['scene0', 'scene1', 'scene2', 'scene3', 'scene4']);
}

export const STAGES = {
  stranger: { label: 'Stranger', hint: 'You just met.' },
  acquaintance: { label: 'Acquaintance', hint: 'Getting to know you.' },
  friend: { label: 'Friend', hint: 'Glad when you visit.' },
  confidant: { label: 'Confidant', hint: 'Trusts you with what they long for.' },
  kindred: { label: 'Kindred', hint: 'Has told you their secret.' },
};
