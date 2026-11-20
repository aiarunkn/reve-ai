import { seeded } from '../services/panoramaService.js';

/**
 * Split a message into up to `max` fragments that each read as a natural phrase:
 * sentences first, then clauses (commas, colons, dashes), and only then words.
 */
export function splitMessage(message, max = 5) {
  const text = message.trim().replace(/\s+/g, ' ');
  const words = text.split(' ').filter(Boolean);
  const n = Math.max(1, Math.min(max, words.length));

  const sentences = text.match(/[^.!?…]+[.!?…]*["'”’)]*\s*/g)?.map((s) => s.trim()).filter(Boolean) || [text];
  let parts = sentences.length >= n ? sentences : sentences.flatMap((s) => s.split(/(?<=[,;:—–])\s+/)).filter(Boolean);

  // too many pieces: merge the shortest neighbouring pair
  while (parts.length > n) {
    let best = 0;
    for (let i = 1; i < parts.length - 1; i++) {
      if (parts[i].length + parts[i + 1].length < parts[best].length + parts[best + 1].length) best = i;
    }
    parts.splice(best, 2, `${parts[best]} ${parts[best + 1]}`);
  }
  // too few: halve the longest piece at its middle word
  while (parts.length < n) {
    let longest = 0;
    parts.forEach((p, i) => { if (p.length > parts[longest].length) longest = i; });
    const w = parts[longest].split(' ');
    if (w.length < 2) break;
    const mid = Math.ceil(w.length / 2);
    parts.splice(longest, 1, w.slice(0, mid).join(' '), w.slice(mid).join(' '));
  }
  return parts;
}

/**
 * Where each fragment hides (yaw/pitch in radians, 0 = straight ahead at the photo).
 * The first one floats near the photo so you learn the game; the rest are scattered
 * all around you — including behind. Deterministic per memory.
 */
export function placeFragments(memoryId, count) {
  let h = 2166136261;
  for (const ch of memoryId) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  const rand = seeded(h >>> 0);
  const out = [{ yaw: (rand() < 0.5 ? -1 : 1) * (0.28 + rand() * 0.15), pitch: 0.12 + rand() * 0.1 }];
  for (let i = 1; i < count; i++) {
    const slot = (i / count) * Math.PI * 2;
    out.push({ yaw: slot + (rand() - 0.5) * 0.7, pitch: -0.15 + rand() * 0.5 });
  }
  return out;
}

const KEY = 'reve-ai:completed';
export function isCompleted(id) {
  try { return JSON.parse(localStorage.getItem(KEY) || '[]').includes(id); } catch { return false; }
}
export function markCompleted(id) {
  try {
    const list = new Set(JSON.parse(localStorage.getItem(KEY) || '[]'));
    list.add(id);
    localStorage.setItem(KEY, JSON.stringify([...list]));
  } catch { /* ignore */ }
}
