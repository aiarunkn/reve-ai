/**
 * Shared worlds: one desired reality, many players, each living their own scenes.
 *
 * Pure functions, used by both the browser and the server (api/*), so both see the
 * world the same way:
 *   - the canon (facts, relationships, threads, chapter) is the fold of EVERY player's turns;
 *   - where you are, what time it is for you and what you just lived come from YOUR turns;
 *   - "meanwhile" is what the others did since you last played.
 */

export const PLAYER_COLORS = ['#f5b85a', '#e88aa8', '#8ec5ff', '#9be3b5', '#c7a6ff', '#ff9f6b', '#f3e9d7', '#6ee0e0'];

// no 0/O, 1/I/L: easy to read out loud across a room
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ';
export const CODE_LENGTH = 6;
export function newCode(random = Math.random) {
  return Array.from({ length: CODE_LENGTH }, () => CODE_ALPHABET[Math.floor(random() * CODE_ALPHABET.length)]).join('');
}
export const normalizeCode = (s) => String(s || '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, CODE_LENGTH);
export const isCode = (s) => /^[A-Z]{6}$/.test(s || '');

export const relKey = (character, player) => `${character}::${player}`;

export function freshLedger(bible) {
  return {
    summary: '',
    summarizedThrough: 0,
    facts: [],
    threads: (bible?.threads || []).map((t) => ({ text: t, status: 'open', since: 0 })),
    relationships: {},
  };
}

/** Fold one turn's record into the ledger. Returns a new ledger. */
export function applyLedger(L, record, turnIndex, actingPlayer) {
  if (!record) return L;
  const relationships = { ...L.relationships };
  for (const r of record.relationships || []) {
    if (!r.character || !r.change) continue;
    const k = relKey(r.character, r.player || actingPlayer);
    const prev = relationships[k] || { score: 0, notes: [] };
    relationships[k] = { score: Math.max(-10, Math.min(10, prev.score + r.change)), notes: [...prev.notes, r.note].filter(Boolean).slice(-4) };
  }
  const closed = new Set((record.threads_closed || []).map((t) => t.trim().toLowerCase()));
  const threads = L.threads.map((t) => (t.status === 'open' && closed.has(t.text.trim().toLowerCase()) ? { ...t, status: 'closed', closedAt: turnIndex } : t));
  for (const t of record.threads_opened || []) {
    if (t && !threads.some((x) => x.text.toLowerCase() === t.toLowerCase())) threads.push({ text: t, status: 'open', since: turnIndex });
  }
  return { ...L, facts: [...L.facts, ...(record.facts || [])].slice(-80), threads, relationships };
}

const clampScene = (i, n) => (Number.isInteger(i) && i >= 0 && i < n ? i : null);

/** The shared canon: ledger + chapter, from the world's starting point and every turn since. */
export function foldWorld(world, players, turns) {
  const names = Object.fromEntries(players.map((p) => [p.id, p.name]));
  let ledger = world.base?.ledger || freshLedger(world.bible);
  let chapter = world.base?.chapter || { n: 1, title: world.bible.opening?.chapter_title || '' };
  turns.forEach((t, i) => {
    const r = t.record;
    if (!r || r.imported) return; // imported turns are already part of base.ledger
    ledger = applyLedger(ledger, r, i, names[t.player_id]);
    if (r.chapter_end?.trim()) chapter = { n: chapter.n + 1, title: r.chapter_end.trim(), startedAt: i + 1 };
  });
  return { ledger, chapter };
}

/** First narration beat of a turn, for a one-line "meanwhile" preview. */
export function previewOf(turn) {
  if (turn.kind === 'arrival') return 'Woke up in this world for the first time.';
  const c = turn.record?.consequences?.[0]?.text;
  if (c) return c;
  const first = (turn.narration || '').split(/\n\s*\n/).map((s) => s.trim()).find(Boolean) || '';
  return first.replace(/^[^:\n]{1,40}:\s*/, '').replace(/\*/g, '').slice(0, 140);
}

const asTurn = (row) => ({
  kind: row.kind,
  actions: row.actions || [],
  narration: row.narration || '',
  choices: row.record?.choices || [],
  consequences: row.record?.consequences || [],
  time: row.record?.time,
  at: row.created_at,
  id: row.id,
});

const publicPlayer = (p, extra = {}) => ({ id: p.id, name: p.name, color: p.color, look: p.look || '', tag: p.tag || '', joined: true, ...extra });

/**
 * One player's view of a shared world, shaped like a solo story so the same screens
 * and the same narrator prompts work for both. `me` may be a player who hasn't joined yet
 * (used to write their arrival).
 */
export function viewFor(world, players, turns, me) {
  const { ledger, chapter } = foldWorld(world, players, turns);
  const mine = turns.filter((t) => t.player_id === me.id);
  const lastMine = mine[mine.length - 1];
  const lastPlaced = [...mine].reverse().find((t) => t.record && (t.record.scene != null || t.record.time));
  const n = world.bible.places.length;
  const scene = clampScene(lastPlaced?.record?.scene, n) ?? clampScene(world.base?.scene, n) ?? clampScene(world.bible.opening?.scene, n) ?? 0;
  const time = lastPlaced?.record?.time || world.base?.time || world.bible.opening?.time || '';

  const byId = Object.fromEntries(players.map((p) => [p.id, p]));
  const since = lastMine ? lastMine.id : 0;
  const others = turns.filter((t) => t.player_id !== me.id && t.narration);
  let meanwhile = others.filter((t) => t.id > since);
  const fresh = meanwhile.length > 0;
  if (!fresh) meanwhile = others.slice(-2); // nothing new: still let the narrator know the others exist
  meanwhile = meanwhile.slice(-6).map((t) => ({
    id: t.id,
    player: byId[t.player_id]?.name || 'Someone',
    color: byId[t.player_id]?.color,
    place: world.bible.places[clampScene(t.record?.scene, n) ?? 0]?.name,
    did: (t.actions || []).map((a) => a.text).join(' / '),
    preview: previewOf(t),
    narration: t.narration,
    at: t.created_at,
    fresh,
  }));

  const myTurns = mine.map(asTurn);
  return {
    id: `w-${world.code}`,
    shared: { code: world.code, playerId: me.id },
    premise: world.premise,
    bible: world.bible,
    players: [
      { ...publicPlayer(me), want: me.want || '', secret: me.secret || '', description: me.about || '' },
      ...players.filter((p) => p.id !== me.id).map((p) => publicPlayer(p, { remote: true })),
    ],
    chapter,
    time,
    scene,
    ledger,
    turns: myTurns,
    meanwhile,
    createdAt: world.created_at,
    updatedAt: turns[turns.length - 1]?.created_at || world.created_at,
    lastPlayedAt: lastMine?.created_at || world.created_at,
    // the narrator reads your own last few scenes verbatim
    recent: myTurns.filter((t) => t.narration).slice(-6).map((t) => ({ actions: t.actions, narration: t.narration })),
  };
}

/** Turn a solo story into the starting point of a shared world (its creator keeps everything). */
export function worldFromStory(story, code) {
  const turns = story.turns
    .filter((t) => t.narration)
    .map((t, i, all) => ({
      kind: t.kind === 'opening' ? 'opening' : t.kind === 'interlude' ? 'interlude' : 'turn',
      actions: t.actions || [],
      narration: t.narration,
      record: { imported: true, choices: t.choices || [], consequences: t.consequences || [], time: t.time, ...(i === all.length - 1 ? { scene: story.scene, time: story.time } : {}) },
      created_at: t.at,
    }));
  return {
    world: {
      code,
      premise: story.premise || story.bible.tagline || story.bible.title,
      bible: story.bible,
      base: { ledger: story.ledger, chapter: story.chapter, scene: story.scene, time: story.time },
    },
    turns,
  };
}
