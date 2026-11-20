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
