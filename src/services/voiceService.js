/**
 * Reading stories aloud: a narrator voice plus a distinct voice for each character.
 *
 * Today this uses the browser's built-in voices (free; quality depends on the device).
 * The narration is split into segments by speaker here, so swapping in a paid voice
 * service later only means implementing `speakSegment` with audio from /api/media
 * (see api/media.js → voice) when VITE_VOICE_PROVIDER=server.
 */
import { ambient } from './ambientAudio';

export const voiceSupported = typeof window !== 'undefined' && 'speechSynthesis' in window;
const PROVIDER = import.meta.env.VITE_VOICE_PROVIDER || 'browser';

let voicesPromise;
function getVoices() {
  if (!voicesPromise) {
    voicesPromise = new Promise((resolve) => {
      const now = speechSynthesis.getVoices();
      if (now.length) return resolve(now);
      const done = () => resolve(speechSynthesis.getVoices());
      speechSynthesis.addEventListener?.('voiceschanged', done, { once: true });
      setTimeout(done, 1500);
    });
  }
  return voicesPromise;
}

const QUOTE = /(“[^”]+”|"[^"]+")/; // used with split (capturing group keeps the quotes)
const IS_QUOTE = /^(“[^”]+”|"[^"]+")$/;
const clean = (t) => t.replace(/\*([^*]+)\*/g, '$1').replace(/\s+/g, ' ').trim();

/**
 * Split narration into [{ speaker, text }], attributing each quoted line to the
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

const hash = (s) => [...s].reduce((h, c) => Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0, 2166136261);
const PITCH = { low: 0.78, medium: 1, high: 1.22 };

/** Pick a narrator voice and one voice per character, preferring the story's language and nicer voices. */
async function castVoices(story, lang) {
  const all = await getVoices();
  const base = (lang || document.documentElement.lang || navigator.language || 'en').slice(0, 2).toLowerCase();
  let pool = all.filter((v) => v.lang?.toLowerCase().startsWith(base));
  if (!pool.length) pool = all;
  const score = (v) => (/(premium|enhanced|natural|neural)/i.test(v.name) ? 3 : 0) + (/google|microsoft|samantha|daniel|karen|moira/i.test(v.name) ? 1 : 0) + (v.localService ? 0 : 0.5);
  pool = [...pool].sort((a, b) => score(b) - score(a));
  const narrator = pool[0] || null;
  const voices = { narrator: { voice: narrator, pitch: 1, rate: 0.96 } };
  voices[story.players[0].name] = { voice: narrator, pitch: 1.08, rate: 1 };
  story.bible.cast.forEach((c) => {
    const others = pool.length > 1 ? pool.slice(1) : pool;
    voices[c.name] = { voice: others[hash(c.name) % others.length] || narrator, pitch: PITCH[c.voice_tone] ?? (0.85 + (hash(c.name) % 30) / 100), rate: 1 };
  });
  return voices;
}

/**
 * Read a passage aloud. Returns a controller { stop() } and calls onDone() at the end.
 * onSpeaker(name) fires as each voice starts, so the UI can show who is talking.
 */
export async function readAloud(story, text, { onDone, onSpeaker, lang } = {}) {
  if (!voiceSupported || PROVIDER !== 'browser') { onDone?.(); return { stop() {} }; }
  speechSynthesis.cancel();
  const segments = segmentNarration(text, story.bible.cast, story.players[0].name);
  const voices = await castVoices(story, lang);
  let stopped = false;
  ambient.duck?.(true);
  const finish = () => { ambient.duck?.(false); onSpeaker?.(null); onDone?.(); };

  let i = 0;
  const next = () => {
    if (stopped) return;
    if (i >= segments.length) return finish();
    const seg = segments[i++];
    const v = voices[seg.speaker] || voices.narrator;
    const u = new SpeechSynthesisUtterance(seg.text);
    if (v.voice) { u.voice = v.voice; u.lang = v.voice.lang; }
    u.pitch = v.pitch;
    u.rate = v.rate;
    u.onstart = () => onSpeaker?.(seg.speaker);
    u.onend = next;
    u.onerror = next;
    speechSynthesis.speak(u);
  };
  next();
  return {
    stop() {
      stopped = true;
      speechSynthesis.cancel();
      finish();
    },
  };
}
