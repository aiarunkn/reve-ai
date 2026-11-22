import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowLeft, Volume2, VolumeX, MoreHorizontal, SendHorizontal, Pencil, BookOpen, Users, UserPlus } from 'lucide-react';
import ParticleCanvas from './ParticleCanvas';
import StoryJournal from './StoryJournal';
import InviteSheet from './InviteSheet';
import { getMood } from '../data/moods';
import { loadStory, saveStory, loadPlaceImages, applyRecord } from '../services/storyStore';
import { playTurn, welcomeBack, summarizeTurns, NotConfiguredError } from '../services/storyClient';
import { RateLimited } from '../services/authClient';
import { getAsset, onAsset } from '../services/assetStore';
import { ensureStoryArt } from '../services/storyArt';
import { segmentNarration } from '../services/voiceService';
import { ambient } from '../services/ambientAudio';
import { toBeats, placeSounds } from '../services/scenes';
import { sharedCode, loadShared, connectLive, identityFor } from '../services/sharedClient';
import { previewOf } from '../shared/worldState';

const pref = (k, d) => { try { const v = localStorage.getItem(k); return v === null ? d : v === '1'; } catch { return d; } };
const setPref = (k, v) => { try { localStorage.setItem(k, v ? '1' : '0'); } catch { /* private mode */ } };

const AWAY_HOURS_FOR_RECAP = 8;
const KEEP_VERBATIM = 6; // rounds sent in full; older ones get folded into the summary
const SUMMARIZE_AFTER = 10;
const TYPE_MS = 18; // typewriter speed per character
// soft edges so a portrait stands in the room instead of sitting on it like a card
const STAGE_MASK = {
  maskImage: 'linear-gradient(to right, transparent, black 22%, black 78%, transparent), linear-gradient(to bottom, black 62%, transparent 95%)',
  WebkitMaskImage: 'linear-gradient(to right, transparent, black 22%, black 78%, transparent), linear-gradient(to bottom, black 62%, transparent 95%)',
  maskComposite: 'intersect',
  WebkitMaskComposite: 'source-in',
};

function Rich({ text }) {
  return text.split(/(\*[^*\n]+\*)/g).map((part, k) => (/^\*[^*]+\*$/.test(part) ? <em key={k}>{part.slice(1, -1)}</em> : <span key={k}>{part}</span>));
}

/** Types a line out; a click (handled by the parent) finishes it at once. */
function useTypewriter(text, key) {
  const [n, setN] = useState(0);
  useEffect(() => { setN(0); }, [key]);
  useEffect(() => {
    if (n >= text.length) return;
    const t = setTimeout(() => setN((x) => Math.min(text.length, x + 2)), TYPE_MS * 2);
    return () => clearTimeout(t);
  }, [n, text]);
  return [text.slice(0, n), n >= text.length, () => setN(text.length)];
}

/** The newest things the others did that this view hasn't shown yet. */
function newsSince(before, after) {
  const seen = Math.max(0, ...(before?.meanwhile || []).map((m) => m.id));
  return (after?.meanwhile || []).filter((m) => m.fresh && m.id > seen);
}

export default function StoryView({ storyId, onExit, onDelete, notify, onShare, openInvite = false, onRateLimited }) {
  const code = sharedCode(storyId); // set when this is a shared world
  const [story, setStory] = useState(null);
  const [places, setPlaces] = useState([]);
  const [portraits, setPortraits] = useState([]);
  const [moments, setMoments] = useState({});
  const [live, setLive] = useState(null); // narration streaming in
  const [busy, setBusy] = useState(false);
  const [beat, setBeat] = useState(0); // which beat of the current scene you're on
  const [pending, setPending] = useState(null); // the line you just chose, while the narrator answers
  const [writing, setWriting] = useState(false);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');
  const [recap, setRecap] = useState(null);
  const [menu, setMenu] = useState(false);
  const [panel, setPanel] = useState(null); // 'journal' | 'book'
  const [credit, setCredit] = useState(null); // who took the photo of this place
  const [soundOn, setSoundOn] = useState(() => pref('reve-ai:story-sound', true));
  const [invite, setInvite] = useState(openInvite);
  const [here, setHere] = useState([]); // who's in this world right now
  const storyRef = useRef(null);
  const abortRef = useRef(null);
  const busyRef = useRef(false);
  const liveRef = useRef(null);
  const exitRef = useRef(onExit);
  storyRef.current = story;
  busyRef.current = busy;
  exitRef.current = onExit;

  // solo stories live on this device; shared worlds live on the server
  const commit = useCallback((next) => { setStory(next); if (!sharedCode(next.id)) saveStory(next); }, []);

  // load the story, and welcome you back if you've been away
  useEffect(() => {
    let alive = true;
    const urls = [];
    (async () => {
      let s;
      try {
        s = code ? await loadShared(code) : await loadStory(storyId);
      } catch (err) {
        notify?.(err.message || 'Couldn’t open this world.');
        if (alive) exitRef.current?.();
        return;
      }
      if (!alive || !s) return;
      setStory(s);
      loadPlaceImages(storyId, s.bible.places.length).then((u) => { urls.push(...u); if (alive) setPlaces(u); });
      Promise.all(s.bible.cast.map((_, k) => getAsset(storyId, `portrait${k}`))).then((bs) => {
        const u = bs.map((b) => (b ? URL.createObjectURL(b) : null));
        urls.push(...u);
        if (alive) setPortraits(u);
      });
      Promise.all(s.turns.map((t, i) => (t.art ? getAsset(storyId, `moment${i}`).then((b) => [i, b]) : null)).filter(Boolean)).then((pairs) => {
        const m = {};
        pairs.forEach(([i, b]) => { if (b) { m[i] = URL.createObjectURL(b); urls.push(m[i]); } });
        if (alive) setMoments(m);
      });
      ensureStoryArt(s); // paints missing places and portraits in the background
      if (code) {
        // shared worlds: no recap call needed, the others' scenes are the news
        const news = s.meanwhile.filter((m) => m.fresh);
        if (news.length && s.turns.length > 1) setRecap({ kind: 'meanwhile', items: news });
        return;
      }
      const awayHours = (Date.now() - new Date(s.lastPlayedAt).getTime()) / 36e5;
      if (awayHours >= AWAY_HOURS_FOR_RECAP && s.turns.length > 1) {
        setBusy(true);
        try {
          const back = await welcomeBack(s, awayHours);
          if (!alive) return;
          const interlude = { kind: 'interlude', actions: [], narration: back.recap, events: back.away_events.map((e) => e.text), choices: back.choices, consequences: [], at: new Date().toISOString(), awayHours };
          commit({
            ...s,
            time: back.time || s.time,
            lastPlayedAt: new Date().toISOString(),
            ledger: { ...s.ledger, facts: [...s.ledger.facts, ...back.away_events.map((e) => e.fact)].slice(-80) },
            turns: [...s.turns, interlude],
          });
          setRecap(interlude);
        } catch (err) {
          if (!(err instanceof NotConfiguredError) && !(err instanceof RateLimited)) console.warn('[story] recap failed', err);
        } finally {
          if (alive) setBusy(false);
        }
      }
    })();
    return () => { alive = false; urls.forEach((u) => u && URL.revokeObjectURL(u)); abortRef.current?.abort(); };
  }, [storyId, commit]); // eslint-disable-line react-hooks/exhaustive-deps

  // shared worlds: hear when someone else plays, and who's here right now
  const meId = story?.players[0]?.id;
  useEffect(() => {
    if (!code || !meId) return;
    const me = storyRef.current.players[0];
    const refresh = async () => {
      if (busyRef.current) return; // your own turn reloads the world when it lands
      const before = storyRef.current;
      const next = await loadShared(code).catch(() => null);
      if (!next || busyRef.current) return;
      setStory(next);
      const news = newsSince(before, next);
      const n = news[news.length - 1];
      if (n) notify?.(`✦ Meanwhile, ${n.player.split(' ')[0]}${n.place ? ` · ${n.place}` : ''}: ${n.preview}`);
      if (next.chapter.n !== before?.chapter.n) notify?.(`Chapter ${next.chapter.n}: ${next.chapter.title}`);
    };
    const conn = connectLive(code, me, { onPing: refresh, onHere: setHere });
    liveRef.current = conn;
    return () => { conn.close(); liveRef.current = null; };
  }, [code, meId]); // eslint-disable-line react-hooks/exhaustive-deps

  // new paintings arriving from the background art queue
  useEffect(() => onAsset(storyId, async (kind) => {
    const blob = await getAsset(storyId, kind);
    const m = blob && kind.match(/^(place|portrait|moment)(\d+)$/);
    if (!m) return;
    const url = URL.createObjectURL(blob);
    const i = Number(m[2]);
    if (m[1] === 'place') setPlaces((p) => { const n = [...p]; n[i] = url; return n; });
    if (m[1] === 'portrait') setPortraits((p) => { const n = [...p]; n[i] = url; return n; });
    if (m[1] === 'moment') setMoments((p) => ({ ...p, [i]: url }));
  }), [storyId]);

  // the room's sounds: the story's feeling, plus whatever this place sounds like
  const place = story?.bible.places[story.scene];
  const placeLoaded = !!places[story?.scene];
  useEffect(() => {
    if (story?.scene == null) return;
    let alive = true;
    getAsset(storyId, `credit${story.scene}`).then((c) => alive && setCredit(c || null));
    return () => { alive = false; };
  }, [storyId, story?.scene, placeLoaded]);
  const sounds = useMemo(() => (place ? placeSounds(place) : []), [place]);
  useEffect(() => {
    if (soundOn && story) ambient.play(story.bible.mood, sounds);
    else ambient.stop();
  }, [soundOn, story?.bible.mood, sounds.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => ambient.stop(), []);

  // fold older rounds into the running summary so long stories stay fast and coherent
  const maybeSummarize = useCallback(async (s) => {
    const narrated = s.turns.filter((t) => t.narration);
    const upto = narrated.length - KEEP_VERBATIM;
    if (upto - (s.ledger.summarizedThrough || 0) < SUMMARIZE_AFTER) return;
    try {
      const { summary } = await summarizeTurns(s, narrated.slice(s.ledger.summarizedThrough || 0, upto));
      const cur = storyRef.current;
      commit({ ...cur, ledger: { ...cur.ledger, summary, summarizedThrough: upto } });
    } catch (err) {
      console.warn('[story] summary failed', err);
    }
  }, [commit]);

  const act = async (text) => {
    const t = (text ?? draft).trim();
    if (!t || busy || !story) return;
    setDraft('');
    setWriting(false);
    setError('');
    setBusy(true);
    setPending(t);
    setBeat(0);
    setLive('');
    const actions = [{ player: story.players[0].name, text: t }];
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      const shared = code ? { code, ...identityFor(code) } : null;
      const { narration, record, saveError } = await playTurn(story, actions, setLive, ctrl.signal, shared);
      if (!narration) throw new Error('The scene went quiet. Try again.');
      if (code) {
        // the server saved your turn for everyone: reload your view of the world
        if (saveError) notify?.(`Your scene played, but couldn’t be saved for the others (${saveError}).`);
        const before = story;
        const next = await loadShared(code);
        setStory(next);
        liveRef.current?.announce({ preview: record?.consequences?.[0]?.text || previewOf({ narration }) });
        if (next.chapter.n !== before.chapter.n) notify?.(`Chapter ${next.chapter.n}: ${next.chapter.title}`);
        return;
      }
      const index = story.turns.length;
      const turn = { kind: 'turn', chapter: story.chapter.n, actions, narration, choices: record?.choices || [], consequences: record?.consequences || [], time: record?.time, at: new Date().toISOString() };
      let next = applyRecord({ ...story, turns: [...story.turns, turn], lastPlayedAt: new Date().toISOString() }, record, index);
      if (next.chapter.n !== story.chapter.n) {
        next = { ...next, turns: [...next.turns, { kind: 'chapter', chapter: next.chapter.n, title: next.chapter.title, actions: [], at: new Date().toISOString() }] };
        notify?.(`Chapter ${next.chapter.n}: ${next.chapter.title}`);
      }
      commit(next);
      maybeSummarize(next);
    } catch (err) {
      if (err.name === 'AbortError') return;
      setDraft(t);
      setBeat(Infinity);
      if (err instanceof RateLimited) { setError(err.message); onRateLimited?.(err); }
      else setError(err instanceof NotConfiguredError ? 'The narrator needs an Anthropic API key to continue this story.' : err.message);
    } finally {
      setLive(null);
      setPending(null);
      setBusy(false);
    }
  };

  /* ------------------------------ the current scene ------------------------------ */

  const me = story?.players[0];
  const lastNarrated = story ? [...story.turns].reverse().find((t) => t.narration) : null;
  const lastIndex = story ? story.turns.lastIndexOf(lastNarrated) : -1;
  const streaming = live !== null;

  const beats = useMemo(() => {
    if (!story) return [];
    const cast = story.bible.cast;
    const yourLine = (text) => ({ speaker: me.name, you: true, text });
    if (streaming) {
      const parsed = toBeats(live, cast, me.name, segmentNarration);
      // the last paragraph may still be arriving: only show finished beats (except the final flush)
      return [yourLine(pending), ...parsed.slice(0, Math.max(0, parsed.length - 1))];
    }
    if (!lastNarrated) return [];
    const said = lastNarrated.actions?.map((a) => a.text).join(' ');
    return [...(said ? [yourLine(said)] : []), ...toBeats(lastNarrated.narration, cast, me.name, segmentNarration)];
  }, [story, live, streaming, pending, lastNarrated, me]);

  const at = Math.min(beat, Math.max(0, beats.length - 1));
  const current = beats[at];
  const waiting = streaming && beat >= beats.length; // you've caught up with the narrator
  // keyed by the turn being shown, so the line isn't retyped when the streamed turn is saved
  const [typed, typedAll, finishTyping] = useTypewriter(current?.text || '', `${streaming ? story?.turns.length : lastIndex}:${at}`);

  // who's on stage: the last character who spoke, up to this beat
  const onStage = useMemo(() => {
    if (!story) return null;
    for (let i = at; i >= 0; i--) {
      const b = beats[i];
      const who = b && !b.you && (b.speaker || b.hint);
      if (who) {
        const k = story.bible.cast.findIndex((c) => c.name === who);
        if (k >= 0) return { name: who, index: k, speaking: i === at };
      }
    }
    return null;
  }, [beats, at, story]);

  const atEnd = !streaming && !busy && at >= beats.length - 1 && typedAll;
  const choices = atEnd ? (lastNarrated?.choices || []).slice(0, 3) : [];

  const advance = useCallback(() => {
    if (!current) return;
    if (!typedAll) return finishTyping();
    setBeat((b) => Math.min(Math.min(b, beats.length) + 1, streaming ? beats.length : beats.length - 1));
  }, [current, typedAll, finishTyping, streaming, beats.length]);

  // a fresh visit starts the current scene from its first beat
  useEffect(() => { setBeat(0); }, [storyId]);

  // space / enter / → to continue
  useEffect(() => {
    const onKey = (e) => {
      if (writing || panel || recap || menu || invite) return;
      if (e.key === ' ' || e.key === 'Enter' || e.key === 'ArrowRight') { e.preventDefault(); advance(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [advance, writing, panel, recap, menu, invite]);

  if (!story) return <div className="fixed inset-0 bg-midnight" />;

  const mood = getMood(story.bible.mood);
  const bg = (!streaming && moments[lastIndex]) || places[story.scene];
  const portrait = onStage ? portraits[onStage.index] : null;
  const nameTag = current?.you ? me.name.split(' ')[0] : current?.speaker || null;
  const online = new Set(here.map((h) => h.playerId));

  return (
    <div className="fixed inset-0 select-none overflow-clip" style={{ background: mood.bg[0] }}>
      {/* the place */}
      <AnimatePresence mode="sync">
        {bg ? (
          <motion.img key={bg} src={bg} alt={place?.name || ''} className="absolute inset-0 h-full w-full object-cover" initial={{ opacity: 0, scale: 1.08 }} animate={{ opacity: 1, scale: 1.02 }} exit={{ opacity: 0 }} transition={{ opacity: { duration: 1.6 }, scale: { duration: 40, ease: 'linear' } }} />
        ) : (
          <motion.div key={`g${story.scene}`} className="absolute inset-0" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} style={{ background: `radial-gradient(70% 55% at 50% 30%, ${mood.secondary}66, transparent), linear-gradient(180deg, ${mood.bg[1]}, ${mood.bg[0]})` }} />
        )}
      </AnimatePresence>
      <div className="pointer-events-none absolute inset-0 opacity-60"><ParticleCanvas modes={mood.particles} density={0.45} /></div>
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/50 via-transparent to-black/80" />

      {/* whoever is with you, standing in the room */}
      <AnimatePresence>
        {portrait && (
          <motion.img
            key={onStage.name}
            src={portrait}
            alt={onStage.name}
            className="pointer-events-none absolute bottom-0 left-1/2 h-[78vh] max-h-[860px] w-auto -translate-x-1/2 object-contain"
            style={{ ...STAGE_MASK, filter: onStage.speaking ? 'none' : 'brightness(0.7)' }}
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
          />
        )}
      </AnimatePresence>

      {/* top: back · where you are · sound · menu */}
      <div className="absolute inset-x-0 top-0 z-20 flex items-center justify-between gap-3 px-4 pt-[max(1rem,env(safe-area-inset-top))]">
        <button type="button" onClick={onExit} className="glass-btn rounded-full p-2.5 text-parchment/85" aria-label="Back to your stories"><ArrowLeft size={18} /></button>
        <div className="min-w-0 text-center">
          <p className="truncate font-serif text-lg text-parchment text-glow">{place?.name}</p>
          <p className="truncate text-[11px] uppercase tracking-[0.25em] text-parchment/50">{story.time}</p>
          {code && story.players.length > 1 && (
            <button type="button" onClick={() => setInvite(true)} className="mx-auto mt-1 flex items-center justify-center gap-1" aria-label={`${story.players.length} dreamers in this world`}>
              {story.players.slice(0, 8).map((p) => (
                <span key={p.id} title={`${p.name}${online.has(p.id) ? ' · here now' : ''}`} className="h-2 w-2 rounded-full transition-opacity" style={{ background: p.color, opacity: online.has(p.id) ? 1 : 0.35, boxShadow: online.has(p.id) ? `0 0 8px ${p.color}` : 'none' }} />
              ))}
            </button>
          )}
        </div>
        <div className="relative flex gap-2">
          <button type="button" onClick={() => { const v = !soundOn; setSoundOn(v); setPref('reve-ai:story-sound', v); }} aria-pressed={soundOn} className="glass-btn rounded-full p-2.5 text-parchment/85" aria-label={soundOn ? 'Mute sound' : 'Turn sound on'}>{soundOn ? <Volume2 size={18} /> : <VolumeX size={18} />}</button>
          <button type="button" onClick={() => setInvite(true)} className="glass-btn rounded-full p-2.5 text-parchment/85" aria-label={code ? 'Invite friends' : 'Dream together with friends'}><UserPlus size={18} /></button>
          <button type="button" onClick={() => setMenu((v) => !v)} className="glass-btn rounded-full p-2.5 text-parchment/85" aria-label="More" aria-expanded={menu}><MoreHorizontal size={18} /></button>
          {menu && (
            <div className="glass absolute right-0 top-12 w-52 overflow-hidden rounded-2xl py-1.5 text-sm">
              <button type="button" onClick={() => { setPanel('book'); setMenu(false); }} className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-parchment/85 hover:bg-white/5"><BookOpen size={15} /> The story so far</button>
              <button type="button" onClick={() => { setPanel('journal'); setMenu(false); }} className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-parchment/85 hover:bg-white/5"><Users size={15} /> Characters</button>
              {credit && (
                <a href={credit.link} target="_blank" rel="noreferrer noopener" className="block border-t border-white/10 px-4 py-2.5 text-xs leading-snug text-parchment/55 hover:text-parchment">
                  Photo: {credit.author} · {credit.source}{credit.license ? ` · ${credit.license}` : ''}
                </a>
              )}
            </div>
          )}
        </div>
      </div>

      {/* the line being said, one beat at a time */}
      <div className="absolute inset-x-0 bottom-0 z-20 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-6 sm:pb-6">
        <div className="mx-auto max-w-3xl">
          <AnimatePresence>
            {choices.length > 0 && !writing && (
              <motion.div className="mb-3 flex flex-col gap-2" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                {choices.map((c, i) => (
                  <motion.button
                    key={c}
                    type="button"
                    onClick={() => act(c)}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.08 * i }}
                    className="rounded-2xl border bg-black/55 px-5 py-3.5 text-left text-[16px] text-parchment backdrop-blur-md transition-colors hover:bg-black/70"
                    style={{ borderColor: `${mood.primary}55` }}
                  >
                    <Rich text={c} />
                  </motion.button>
                ))}
                <button type="button" onClick={() => setWriting(true)} className="inline-flex items-center gap-1.5 self-center py-1 text-sm text-parchment/60 hover:text-parchment"><Pencil size={13} /> or say something else</button>
              </motion.div>
            )}
          </AnimatePresence>

          {writing ? (
            <form onSubmit={(e) => { e.preventDefault(); act(); }} className="glass flex items-end gap-2 rounded-3xl p-3">
              <textarea autoFocus value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); act(); } if (e.key === 'Escape') setWriting(false); }} rows={2} maxLength={1500} placeholder={`What does ${me.name.split(' ')[0]} say or do?`} className="max-h-32 min-h-[52px] flex-1 resize-none bg-transparent px-2 py-1.5 text-[16px] text-parchment placeholder:text-parchment/40 focus:outline-none" />
              <button type="submit" disabled={!draft.trim()} className="rounded-full p-3.5 text-midnight disabled:opacity-30" style={{ background: mood.primary }} aria-label="Say it"><SendHorizontal size={18} /></button>
            </form>
          ) : (
            <button type="button" onClick={advance} className="glass relative block w-full rounded-3xl px-5 pb-5 pt-6 text-left sm:px-7" aria-label="Continue">
              {nameTag && (
                <span className="absolute -top-3.5 left-5 rounded-full px-3.5 py-1 font-serif text-[16px] text-midnight sm:left-7" style={{ background: current?.you ? me.color || '#f3e9d7' : mood.primary }}>{nameTag}</span>
              )}
              <div className="min-h-[4.5rem] font-serif text-[1.2rem] leading-[1.6] text-parchment sm:text-[1.3rem]">
                {waiting || (!current && busy) ? (
                  <span className="inline-flex items-center gap-1.5 pt-2">
                    {[0, 1, 2].map((d) => <motion.span key={d} className="h-1.5 w-1.5 rounded-full" style={{ background: mood.primary }} animate={{ opacity: [0.2, 1, 0.2] }} transition={{ duration: 1.2, repeat: Infinity, delay: d * 0.2 }} />)}
                  </span>
                ) : current ? (
                  <span className={current.speaker && !current.you ? '' : current.you ? 'italic text-parchment/85' : 'text-parchment/90'}><Rich text={typed} /></span>
                ) : null}
              </div>
              {error && <p className="mt-2 font-sans text-sm text-rose-300/90">{error}</p>}
              {current && !waiting && !atEnd && typedAll && (
                <motion.span className="absolute bottom-3 right-5 text-parchment/50" animate={{ opacity: [0.3, 1, 0.3] }} transition={{ duration: 1.6, repeat: Infinity }} aria-hidden>▾</motion.span>
              )}
            </button>
          )}
        </div>
      </div>

      {/* the whole story so far, like a book */}
      <AnimatePresence>
        {panel === 'book' && (
          <motion.div className="fixed inset-0 z-40 overflow-y-auto bg-black/85 pb-24 pt-16 backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="mx-auto max-w-2xl select-text px-5 font-serif text-[1.15rem] leading-[1.7] text-parchment/90 sm:px-8">
              <h2 className="mb-8 text-center text-3xl italic text-parchment">{story.bible.title}</h2>
              {story.turns.filter((t) => t.narration).map((t, i) => (
                <section key={i} className="mb-8 space-y-3">
                  {t.actions?.length > 0 && <p className="border-l-2 pl-3 italic text-parchment/70" style={{ borderColor: mood.primary }}>{t.actions.map((a) => a.text).join(' / ')}</p>}
                  {toBeats(t.narration, story.bible.cast, me.name, segmentNarration).map((b, k) => (
                    <p key={k}>{b.speaker ? <><span style={{ color: mood.primary }}>{b.speaker}:</span> <Rich text={b.text} /></> : <Rich text={b.text} />}</p>
                  ))}
                </section>
              ))}
              <button type="button" onClick={() => setPanel(null)} className="btn-lantern mx-auto block rounded-full px-6 py-2.5 font-sans text-sm font-medium">Back to the scene</button>
            </div>
          </motion.div>
        )}
        {panel === 'journal' && <StoryJournal story={story} mood={mood} places={places} portraits={portraits} onClose={() => setPanel(null)} onDelete={onDelete} />}
        {invite && <InviteSheet key="invite" story={story} here={here} mood={mood} onClose={() => setInvite(false)} onOpen={(color) => onShare?.(story, color)} />}
        {recap?.kind === 'meanwhile' && (
          <motion.div key="meanwhile" className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-5 backdrop-blur-md" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} role="dialog" aria-modal="true" aria-label="Meanwhile">
            <motion.div initial={{ y: 20, scale: 0.97 }} animate={{ y: 0, scale: 1 }} className="w-full max-w-lg rounded-3xl border px-7 py-8 text-center" style={{ borderColor: `${mood.primary}44`, background: `linear-gradient(180deg, ${mood.bg[1]}f5, ${mood.bg[0]}fa)` }}>
              <h2 className="font-serif text-3xl italic text-parchment">Meanwhile…</h2>
              <ul className="mt-5 space-y-4 text-left">
                {recap.items.slice(-4).map((m) => (
                  <li key={m.id} className="border-l-2 pl-4" style={{ borderColor: m.color || mood.primary }}>
                    <p className="text-[11px] uppercase tracking-[0.2em]" style={{ color: m.color || mood.primary }}>{m.player}{m.place ? ` · ${m.place}` : ''}</p>
                    <p className="mt-1 font-serif text-lg leading-snug text-parchment/85">{m.preview}</p>
                  </li>
                ))}
              </ul>
              <button type="button" onClick={() => { setRecap(null); setBeat(0); }} className="btn-lantern mt-7 rounded-full px-6 py-2.5 text-sm font-medium">Step back in</button>
            </motion.div>
          </motion.div>
        )}
        {recap && recap.kind !== 'meanwhile' && (
          <motion.div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-5 backdrop-blur-md" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} role="dialog" aria-modal="true" aria-label="Previously">
            <motion.div initial={{ y: 20, scale: 0.97 }} animate={{ y: 0, scale: 1 }} className="w-full max-w-lg rounded-3xl border px-7 py-8 text-center" style={{ borderColor: `${mood.primary}44`, background: `linear-gradient(180deg, ${mood.bg[1]}f5, ${mood.bg[0]}fa)` }}>
              <h2 className="font-serif text-3xl italic text-parchment">Previously…</h2>
              <p className="mt-4 font-serif text-lg leading-relaxed text-parchment/85">{recap.narration}</p>
              <button type="button" onClick={() => { setRecap(null); setBeat(0); }} className="btn-lantern mt-7 rounded-full px-6 py-2.5 text-sm font-medium">Step back in</button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
