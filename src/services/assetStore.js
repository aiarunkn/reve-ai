/**
 * Large assets (whole stories, place pictures, portraits, moments, scene images) live in
 * IndexedDB, which holds far more than localStorage. Keys look like `<ownerId>:<kind>`,
 * e.g. `story-…:place0`, `story-…:portrait1`, `world-…:scene2`.
 */
const DB = 'reve-ai';
const STORE = 'assets';
let dbPromise;

function db() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

function tx(mode, fn) {
  return db().then(
    (d) =>
      new Promise((resolve, reject) => {
        const t = d.transaction(STORE, mode);
        const out = fn(t.objectStore(STORE));
        t.oncomplete = () => resolve(out?.result);
        t.onerror = () => reject(t.error);
        t.onabort = () => reject(t.error);
      })
  );
}

export async function getAsset(id, kind) {
  try {
    return (await tx('readonly', (s) => s.get(`${id}:${kind}`))) || null;
  } catch {
    return null;
  }
}

export async function putAsset(id, kind, blob) {
  try {
    await tx('readwrite', (s) => s.put(blob, `${id}:${kind}`));
    return true;
  } catch (err) {
    console.warn('[assets] could not store', kind, err);
    return false;
  }
}

export async function deleteAssetKinds(id, kinds) {
  try {
    await tx('readwrite', (s) => kinds.forEach((k) => s.delete(`${id}:${k}`)));
  } catch {
    /* nothing to delete */
  }
}

/* tiny event bus so an open story hears when a picture painted in the background lands */
const listeners = new Map();
export function onAsset(id, fn) {
  if (!listeners.has(id)) listeners.set(id, new Set());
  listeners.get(id).add(fn);
  return () => listeners.get(id)?.delete(fn);
}
export function emitAsset(id, kind) {
  listeners.get(id)?.forEach((fn) => fn(kind));
}
