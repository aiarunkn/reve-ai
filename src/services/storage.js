const KEY = 'memory-sanctuary:v1';

/** Load the user's planted memories (seed memories are not stored). */
export function loadMemories() {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * Persist memories. Returns false if the browser refused (quota full,
 * private mode…) so the UI can tell the user the memory is kept for this visit only.
 */
export function saveMemories(memories) {
  try {
    localStorage.setItem(KEY, JSON.stringify(memories));
    return true;
  } catch (err) {
    console.warn('[sanctuary] could not persist memories:', err);
    return false;
  }
}
