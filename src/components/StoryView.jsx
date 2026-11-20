import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowLeft, BookMarked, SendHorizontal, MapPin, Hourglass, Volume2, VolumeX, Headphones, Play, Square, Brush } from 'lucide-react';
import ConsequenceChip from './ConsequenceChip';
import ParticleCanvas from './ParticleCanvas';
import StoryJournal from './StoryJournal';
import { getMood } from '../data/moods';
import { loadStory, saveStory, loadPlaceImages, applyRecord } from '../services/storyStore';
import { playTurn, welcomeBack, summarizeTurns, NotConfiguredError } from '../services/storyClient';
import { getAsset, onAsset } from '../services/assetStore';
import { ensureStoryArt, illustrateMoment, ImagesNotConfigured } from '../services/storyArt';
import { readAloud, voiceSupported } from '../services/voiceService';
import { ambient } from '../services/ambientAudio';

const pref = (k, d) => { try { const v = localStorage.getItem(k); return v === null ? d : v === '1'; } catch { return d; } };
const setPref = (k, v) => { try { localStorage.setItem(k, v ? '1' : '0'); } catch { /* private mode */ } };

const AWAY_HOURS_FOR_RECAP = 8;
const KEEP_VERBATIM = 6; // rounds sent in full; older ones get folded into the summary
const SUMMARIZE_AFTER = 10;

function Narration({ text }) {
  return (
    <div className="space-y-4 font-serif text-[1.22rem] leading-[1.75] text-parchment/90 sm:text-[1.3rem]">
      {text.split(/\n{2,}/).filter(Boolean).map((p, i) => (
        <p key={i}>
          {p.split(/(\*[^*\n]+\*)/g).map((part, k) => (/^\*[^*]+\*$/.test(part) ? <em key={k}>{part.slice(1, -1)}</em> : <span key={k}>{part}</span>))}
        </p>
      ))}
    </div>
  );
}

export default function StoryView({ storyId, onExit, onDelete, notify }) {
  const [story, setStory] = useState(null);
  const [places, setPlaces] = useState([]);
  const [draft, setDraft] = useState('');
  const [live, setLive] = useState(null); // narration streaming in
  const [busy, setBusy] = useState(false);
  const [journal, setJournal] = useState(false);
  const [recap, setRecap] = useState(null);
  const [error, setError] = useState('');
  const [soundOn, setSoundOn] = useState(() => pref('reve-ai:story-sound', false));
  const [autoRead, setAutoRead] = useState(() => pref('reve-ai:story-read', false));
  const [speaking, setSpeaking] = useState(null); // { turn, speaker }
  const [moments, setMoments] = useState({}); // turn index -> image URL
  const [portraits, setPortraits] = useState([]);
  const [drawing, setDrawing] = useState(null);
  const [artOff, setArtOff] = useState(false);
  const speechRef = useRef(null);
  const storyRef = useRef(null);
  const scrollRef = useRef(null);
  const abortRef = useRef(null);
  storyRef.current = story;

  const commit = useCallback((next) => {
    setStory(next);
    saveStory(next);
  }, []);

  // load the story, and welcome you back if you've been away
  useEffect(() => {
    let alive = true;
    let urls = [];
    (async () => {
      const s = await loadStory(storyId);
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
      ensureStoryArt(s); // draws missing places and portraits in the background
      const awayHours = (Date.now() - new Date(s.lastPlayedAt).getTime()) / 36e5;
      if (awayHours >= AWAY_HOURS_FOR_RECAP && s.turns.length > 1) {
        setBusy(true);
        try {
          const back = await welcomeBack(s, awayHours);
          if (!alive) return;
          const interlude = { kind: 'interlude', actions: [], narration: back.recap, events: back.away_events.map((e) => e.text), choices: back.choices, consequences: [], at: new Date().toISOString(), awayHours };
          const next = {
            ...s,
            time: back.time || s.time,
            lastPlayedAt: new Date().toISOString(),
            ledger: { ...s.ledger, facts: [...s.ledger.facts, ...back.away_events.map((e) => e.fact)].slice(-80) },
            turns: [...s.turns, interlude],
          };
          commit(next);
          setRecap(interlude);
        } catch (err) {
          if (!(err instanceof NotConfiguredError)) console.warn('[story] recap failed', err);
        } finally {
          if (alive) setBusy(false);
        }
      }
    })();
    return () => { alive = false; urls.forEach((u) => u && URL.revokeObjectURL(u)); abortRef.current?.abort(); };
  }, [storyId, commit]);

  // new illustrations arriving from the background art queue
  useEffect(() => onAsset(storyId, async (kind) => {
    const blob = await getAsset(storyId, kind);
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const m = kind.match(/^(place|portrait|moment)(\d+)$/);
    if (!m) return;
    const i = Number(m[2]);
    if (m[1] === 'place') setPlaces((p) => { const n = [...p]; n[i] = url; return n; });
    if (m[1] === 'portrait') setPortraits((p) => { const n = [...p]; n[i] = url; return n; });
    if (m[1] === 'moment') setMoments((p) => ({ ...p, [i]: url }));
  }), [storyId]);

  // ambience follows the story's feeling; voices stop when you leave
  useEffect(() => {
    if (soundOn && story) ambient.play(story.bible.mood);
    else ambient.stop();
  }, [soundOn, story?.bible.mood]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => { ambient.stop(); speechRef.current?.stop(); }, []);

  const listen = useCallback(async (turnIndex) => {
    speechRef.current?.stop();
    const s = storyRef.current;
    const t = s?.turns[turnIndex];
    if (!t?.narration) return;
    setSpeaking({ turn: turnIndex, speaker: null });
    speechRef.current = await readAloud(s, t.narration, {
      onSpeaker: (speaker) => setSpeaking((cur) => (cur ? { ...cur, speaker } : cur)),
      onDone: () => setSpeaking((cur) => (cur?.turn === turnIndex ? null : cur)),
    });
  }, []);
  const stopListening = () => { speechRef.current?.stop(); setSpeaking(null); };

  const illustrate = async (turnIndex) => {
    if (drawing !== null) return;
    setDrawing(turnIndex);
    setError('');
    try {
      await illustrateMoment(storyRef.current, turnIndex);
      const cur = storyRef.current;
      commit({ ...cur, turns: cur.turns.map((t, i) => (i === turnIndex ? { ...t, art: true } : t)) });
    } catch (err) {
      if (err instanceof ImagesNotConfigured) { setArtOff(true); setError('Illustrations need an OpenAI API key on the server (OPENAI_API_KEY).'); }
      else setError(err.message);
    } finally {
      setDrawing(null);
    }
  };

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [story?.turns.length, live]);

  // fold older rounds into the running summary so long stories stay fast and cheap
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
    setError('');
    setBusy(true);
    setLive('');
    const me = story.players[0];
    const actions = [{ player: me.name, text: t }];
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      const { narration, record } = await playTurn(story, actions, setLive, ctrl.signal);
      if (!narration) throw new Error('The narrator fell silent — try again.');
      const index = story.turns.length;
      const turn = { kind: 'turn', chapter: story.chapter.n, actions, narration, choices: record?.choices || [], consequences: record?.consequences || [], time: record?.time, at: new Date().toISOString() };
      let next = applyRecord({ ...story, turns: [...story.turns, turn], lastPlayedAt: new Date().toISOString() }, record, index);
      if (next.chapter.n !== story.chapter.n) {
        next = { ...next, turns: [...next.turns, { kind: 'chapter', chapter: next.chapter.n, title: next.chapter.title, actions: [], at: new Date().toISOString() }] };
        notify?.(`✦ Chapter ${next.chapter.n}: ${next.chapter.title}`);
      }
      commit(next);
      maybeSummarize(next);
      if (autoRead) setTimeout(() => listen(index), 50);
    } catch (err) {
      if (err.name === 'AbortError') return;
      setDraft(t);
      setError(err instanceof NotConfiguredError ? 'The narrator needs an Anthropic API key to continue this story.' : err.message);
    } finally {
      setLive(null);
      setBusy(false);
    }
  };

  if (!story) return <div className="fixed inset-0 bg-midnight" />;

  const mood = getMood(story.bible.mood);
  const last = [...story.turns].reverse().find((t) => t.choices?.length);
  const place = story.bible.places[story.scene];
  const bg = places[story.scene];
  const me = story.players[0];

  return (
    <div className="fixed inset-0 overflow-clip" style={{ background: mood.bg[0] }}>
      <AnimatePresence mode="sync">
        {bg ? (
          <motion.img key={bg} src={bg} alt="" className="absolute inset-0 h-full w-full object-cover" initial={{ opacity: 0, scale: 1.1 }} animate={{ opacity: 0.55, scale: 1.02 }} exit={{ opacity: 0 }} transition={{ opacity: { duration: 1.8 }, scale: { duration: 30, ease: 'linear' } }} />
        ) : (
          <motion.div key={`g${story.scene}`} className="absolute inset-0" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} style={{ background: `radial-gradient(80% 60% at 50% 20%, ${mood.secondary}55, transparent), linear-gradient(180deg, ${mood.bg[1]}, ${mood.bg[0]})` }} />
        )}
      </AnimatePresence>
      <div className="pointer-events-none absolute inset-0 opacity-70"><ParticleCanvas modes={mood.particles} density={0.5} /></div>
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/70 via-black/55 to-black/80" />

      {/* top bar */}
      <header className="absolute inset-x-0 top-0 z-20 flex items-center justify-between gap-3 bg-gradient-to-b from-black/90 via-black/70 to-transparent px-4 pb-8 pt-[max(0.75rem,env(safe-area-inset-top))] sm:px-6 sm:pt-5">
        <button type="button" onClick={onExit} className="glass-btn inline-flex items-center gap-2 rounded-full px-3.5 py-2 text-sm text-parchment/85"><ArrowLeft size={16} /> <span className="hidden sm:inline">World Map</span></button>
        <div className="min-w-0 text-center">
          <p className="truncate font-serif text-lg italic text-parchment sm:text-2xl">{story.bible.title}</p>
          <p className="truncate text-[10px] uppercase tracking-[0.22em]" style={{ color: mood.primary }}>Chapter {story.chapter.n} · {story.time}</p>
        </div>
        <div className="flex items-center gap-1.5">
          <button type="button" onClick={() => { const v = !soundOn; setSoundOn(v); setPref('reve-ai:story-sound', v); }} aria-pressed={soundOn} aria-label={soundOn ? 'Turn ambience off' : 'Turn ambience on'} title="Ambient sound" className="glass-btn rounded-full p-2.5 text-parchment/80" style={soundOn ? { color: mood.primary, borderColor: `${mood.primary}88` } : undefined}>
            {soundOn ? <Volume2 size={16} /> : <VolumeX size={16} />}
          </button>
          {voiceSupported && (
            <button type="button" onClick={() => { const v = !autoRead; setAutoRead(v); setPref('reve-ai:story-read', v); if (!v) stopListening(); }} aria-pressed={autoRead} aria-label={autoRead ? 'Stop reading new passages aloud' : 'Read new passages aloud'} title="Read aloud" className="glass-btn rounded-full p-2.5 text-parchment/80" style={autoRead ? { color: mood.primary, borderColor: `${mood.primary}88` } : undefined}>
              <Headphones size={16} />
            </button>
          )}
          <button type="button" onClick={() => setJournal(true)} className="glass-btn inline-flex items-center gap-2 rounded-full px-3.5 py-2 text-sm text-parchment/85"><BookMarked size={16} /> <span className="hidden sm:inline">Journal</span></button>
        </div>
      </header>

      {/* the story so far */}
      <div ref={scrollRef} className="absolute inset-0 overflow-y-auto pb-56 pt-24">
        <div className="mx-auto max-w-2xl px-5 sm:px-8">
          {place && <p className="mb-6 text-center text-[11px] uppercase tracking-[0.3em] text-parchment/45"><MapPin size={11} className="mr-1 inline" />{place.name}</p>}
          {story.turns.map((t, i) => (
            <section key={i} className="mb-10">
              {t.kind === 'opening' && <ChapterMark n={1} title={story.bible.opening.chapter_title} mood={mood} />}
              {t.kind === 'chapter' && <ChapterMark n={t.chapter} title={t.title} mood={mood} />}
              {t.kind === 'turn' && (
                <p className="mb-4 border-l-2 pl-3 text-[15px] italic text-parchment/70" style={{ borderColor: mood.primary }}>
                  {t.actions.map((a) => <span key={a.player} className="block"><span className="not-italic text-parchment/45">{a.player === me.name ? 'You' : a.player}:</span> {a.text}</span>)}
                </p>
              )}
              {moments[i] && (
                <motion.img src={moments[i]} alt="An illustration of this moment" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 1 }} className="mb-5 w-full rounded-2xl border border-white/10 object-cover" style={{ boxShadow: `0 20px 60px -20px ${mood.glow}` }} />
              )}
              {t.narration && <Narration text={t.narration} />}
              {t.narration && (
                <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-parchment/45">
                  {voiceSupported && (speaking?.turn === i ? (
                    <button type="button" onClick={stopListening} className="inline-flex items-center gap-1.5 hover:text-parchment" style={{ color: mood.primary }}>
                      <Square size={11} fill="currentColor" /> {speaking.speaker && speaking.speaker !== 'narrator' ? `${speaking.speaker.split(' ')[0]} is speaking…` : 'Reading…'}
                    </button>
                  ) : (
                    <button type="button" onClick={() => listen(i)} className="inline-flex items-center gap-1.5 hover:text-parchment"><Play size={11} fill="currentColor" /> Listen</button>
                  ))}
                  {!moments[i] && !artOff && (
                    <button type="button" onClick={() => illustrate(i)} disabled={drawing !== null} className="inline-flex items-center gap-1.5 hover:text-parchment disabled:opacity-50">
                      <Brush size={12} /> {drawing === i ? 'Painting this moment…' : 'Illustrate this moment'}
                    </button>
                  )}
                </div>
              )}
              {t.kind === 'interlude' && (
                <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                  <p className="flex items-center gap-2 text-[11px] uppercase tracking-[0.25em]" style={{ color: mood.primary }}><Hourglass size={12} /> while you were away</p>
                  <ul className="mt-2 space-y-1.5">{(t.events || []).map((e, k) => <li key={k} className="font-serif text-lg leading-snug text-parchment/80">{e}</li>)}</ul>
                </div>
              )}
              {t.consequences?.length > 0 && (
                <div className="mt-4 flex flex-wrap gap-2">{t.consequences.map((c, k) => <ConsequenceChip key={k} c={c} mood={mood} />)}</div>
              )}
            </section>
          ))}
          {live !== null && (
            <section className="mb-10">
              {live ? <Narration text={live} /> : (
                <p className="flex items-center gap-2 font-serif text-lg italic text-parchment/50">
                  the story turns
                  {[0, 1, 2].map((d) => <motion.span key={d} className="h-1.5 w-1.5 rounded-full" style={{ background: mood.primary }} animate={{ opacity: [0.2, 1, 0.2] }} transition={{ duration: 1.2, repeat: Infinity, delay: d * 0.2 }} />)}
                </p>
              )}
            </section>
          )}
        </div>
      </div>

      {/* what do you do? */}
      <div className="absolute inset-x-0 bottom-0 z-20 bg-gradient-to-t from-black/90 via-black/70 to-transparent px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-10">
        <div className="mx-auto max-w-2xl">
          {!busy && last?.choices?.length > 0 && (
            <div className="mb-3 flex flex-wrap gap-2">
              {last.choices.slice(0, 3).map((c) => (
                <button key={c} type="button" onClick={() => act(c)} className="rounded-full border px-3.5 py-1.5 text-left text-sm text-parchment/85 transition-colors hover:text-parchment" style={{ borderColor: `${mood.primary}55`, background: `${mood.primary}10` }}>{c}</button>
              ))}
            </div>
          )}
          {error && <p className="mb-2 text-sm text-rose-300/90">{error}</p>}
          <form onSubmit={(e) => { e.preventDefault(); act(); }} className="flex items-end gap-2">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); act(); } }}
              rows={1}
              maxLength={1500}
              disabled={busy}
              placeholder={`What does ${me.name} do or say?`}
              className="max-h-32 min-h-[48px] flex-1 resize-none rounded-2xl border border-white/15 bg-midnight/70 px-4 py-3 text-[15px] text-parchment placeholder:text-parchment/35 focus:border-gold/50 focus:outline-none disabled:opacity-50"
            />
            <button type="submit" disabled={!draft.trim() || busy} className="rounded-full p-3.5 text-midnight disabled:opacity-30" style={{ background: mood.primary }} aria-label="Act"><SendHorizontal size={18} /></button>
          </form>
        </div>
      </div>

      <AnimatePresence>
        {recap && (
          <motion.div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-5 backdrop-blur-md" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} role="dialog" aria-modal="true" aria-label="Previously">
            <motion.div initial={{ y: 20, scale: 0.97 }} animate={{ y: 0, scale: 1 }} className="w-full max-w-lg rounded-3xl border px-7 py-8 text-center" style={{ borderColor: `${mood.primary}44`, background: `linear-gradient(180deg, ${mood.bg[1]}f5, ${mood.bg[0]}fa)` }}>
              <p className="text-[10px] uppercase tracking-[0.35em]" style={{ color: mood.primary }}>welcome back · {recap.awayHours >= 48 ? `${Math.round(recap.awayHours / 24)} days away` : `${Math.round(recap.awayHours)} hours away`}</p>
              <h2 className="mt-2 font-serif text-3xl italic text-parchment">Previously…</h2>
              <p className="mt-4 font-serif text-lg leading-relaxed text-parchment/85">{recap.narration}</p>
              {recap.events?.length > 0 && (
                <div className="mt-5 text-left">
                  <p className="text-[11px] uppercase tracking-[0.25em] text-parchment/45">while you were away</p>
                  <ul className="mt-2 space-y-1.5">{recap.events.map((e, k) => <li key={k} className="font-serif leading-snug text-parchment/75">· {e}</li>)}</ul>
                </div>
              )}
              <button type="button" onClick={() => setRecap(null)} className="btn-lantern mt-7 rounded-full px-6 py-2.5 text-sm font-medium">Step back in</button>
            </motion.div>
          </motion.div>
        )}
        {journal && <StoryJournal story={story} mood={mood} places={places} portraits={portraits} onClose={() => setJournal(false)} onDelete={onDelete} />}
      </AnimatePresence>
    </div>
  );
}

function ChapterMark({ n, title, mood }) {
  return (
    <div className="mb-8 mt-4 text-center">
      <p className="text-[10px] uppercase tracking-[0.4em]" style={{ color: mood.primary }}>Chapter {n}</p>
      <p className="mt-1 font-serif text-3xl italic text-parchment text-glow">{title}</p>
      <div className="mx-auto mt-3 h-px w-20" style={{ background: `linear-gradient(90deg, transparent, ${mood.primary}, transparent)` }} />
    </div>
  );
}
