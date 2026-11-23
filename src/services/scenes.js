/**
 * Turning the narrator's text into a scene you play through one beat at a time.
 *
 * The narrator writes beats separated by blank lines (see api/story.js → NARRATOR):
 *   narration, 1-2 sentences
 *   Name: a line of dialogue
 * Older stories were written as prose; for those a paragraph is a beat and the
 * speaker of any quoted line is guessed from the names around it.
 */

const QUOTES = /^["“”'‘’]+|["“”'‘’]+$/g;

const QUOTE = /(“[^”]+”|"[^"]+")/; // used with split (capturing group keeps the quotes)
const IS_QUOTE = /^(“[^”]+”|"[^"]+")$/;
const clean = (t) => t.replace(/\*([^*]+)\*/g, '$1').replace(/\s+/g, ' ').trim();

/**
 * Split narration into [{ speaker, text }] (used to turn a scene into beats), attributing each quoted line to the
 * character named nearest to it ("…," Théo says). Unattributed lines keep the
 * previous speaker in that paragraph, or fall back to the narrator.
 */
export function segmentNarration(text, cast, playerName) {
  const names = cast.map((c) => ({ full: c.name, first: c.name.split(' ')[0] }));
  const out = [];
  for (const para of text.split(/\n{2,}/)) {
    const parts = para.split(QUOTE).filter((p) => p && p.trim());
    let lastSpeaker = null;
    parts.forEach((part, i) => {
      if (!IS_QUOTE.test(part.trim())) {
        out.push({ speaker: 'narrator', text: clean(part) });
        return;
      }
      const after = (parts[i + 1] || '').slice(0, 90);
      const before = (parts[i - 1] || '').split(/[.!?]\s/).pop() || '';
      const near = (s) => names.find((n) => new RegExp(`\\b${n.first}\\b`).test(s));
      let who = near(after)?.full || near(before)?.full;
      if (!who && /\byou\b\s+(say|ask|whisper|reply|murmur|call|answer)/i.test(after + before)) who = playerName;
      who = who || lastSpeaker || 'narrator';
      lastSpeaker = who;
      out.push({ speaker: who, text: clean(part.trim().slice(1, -1)) });
    });
  }
  // merge neighbours spoken by the same voice
  return out.filter((s) => s.text).reduce((acc, s) => {
    const prev = acc[acc.length - 1];
    if (prev && prev.speaker === s.speaker) prev.text += ` ${s.text}`;
    else acc.push({ ...s });
    return acc;
  }, []);
}

export function toBeats(text, cast = [], playerName = '', segment = null) {
  if (!text) return [];
  const names = cast.map((c) => ({ full: c.name, first: c.name.split(' ')[0].toLowerCase(), lower: c.name.toLowerCase() }));
  const find = (label) => {
    const l = label.replace(/\*/g, '').trim().toLowerCase();
    return names.find((n) => n.lower === l || n.first === l || n.lower.includes(l) && l.length > 2)?.full;
  };
  const out = [];
  for (const raw of text.split(/\n+/)) {
    const para = raw.trim();
    if (!para) continue;
    const m = para.match(/^\**([^:*\n"“]{1,40}?)\**\s*:\s*(.+)$/s);
    const who = m && find(m[1]);
    if (who) {
      out.push({ speaker: who, text: m[2].trim().replace(QUOTES, '') });
      continue;
    }
    // prose with a quoted line in it: attribute it, but keep the whole paragraph
    let speaker = null;
    if (segment && /["“]/.test(para)) {
      speaker = segment(para, cast, playerName).find((s) => cast.some((c) => c.name === s.speaker))?.speaker || null;
    }
    out.push({ speaker: null, hint: speaker, text: para });
  }
  return out;
}

const SOUND_WORDS = [
  ['fireplace', /\b(fire|fireplace|hearth|embers?|candles?|torch)/i],
  ['rain', /\brain|drizzle|storm/i],
  ['water', /\b(lake|sea|ocean|river|underwater|waves?|harbou?r|shore|fountain)/i],
  ['wind', /\b(wind|cliff|rooftop|tower|moor|gale|breeze)/i],
  ['crowd', /\b(crowd|market|tavern|hall|bar|caf[eé]|station|party|ballroom|feast)/i],
];

/** The sounds of a place: what the narrator chose, or a guess from its description. */
export function placeSounds(place) {
  if (Array.isArray(place?.sounds) && place.sounds.length) return place.sounds.slice(0, 2);
  const text = `${place?.name || ''} ${place?.description || ''}`;
  const guessed = SOUND_WORDS.filter(([, re]) => re.test(text)).map(([k]) => k).slice(0, 2);
  return guessed.length ? guessed : ['quiet'];
}
