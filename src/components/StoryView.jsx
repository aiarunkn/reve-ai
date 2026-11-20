import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { BookMarked, SendHorizontal, MapPin, Hourglass, Volume2, VolumeX, Headphones, Square, Brush, Compass, BookOpen, Users, Globe, Menu, X, AudioLines, MoreHorizontal, UserPlus, ChevronRight } from 'lucide-react';
import ConsequenceChip from './ConsequenceChip';
import ParticleCanvas from './ParticleCanvas';
import StoryJournal from './StoryJournal';
import { getMood } from '../data/moods';
import { loadStory, saveStory, loadPlaceImages, applyRecord } from '../services/storyStore';
import { playTurn, welcomeBack, summarizeTurns, NotConfiguredError } from '../services/storyClient';
import { getAsset, onAsset } from '../services/assetStore';
import { ensureStoryArt, illustrateMoment, ImagesNotConfigured } from '../services/storyArt';
import { readAloud, voiceSupported, segmentNarration } from '../services/voiceService';
import { ambient } from '../services/ambientAudio';

const pref = (k, d) => { try { const v = localStorage.getItem(k); return v === null ? d : v === '1'; } catch { return d; } };
const setPref = (k, v) => { try { localStorage.setItem(k, v ? '1' : '0'); } catch { /* private mode */ } };

const AWAY_HOURS_FOR_RECAP = 8;
const KEEP_VERBATIM = 6; // rounds sent in full; older ones get folded into the summary
const SUMMARIZE_AFTER = 10;

function Narration({ text, compact = false }) {
  return (
    <div className={`space-y-3 font-serif text-parchment/90 ${compact ? 'text-[1.12rem] leading-[1.6] sm:text-[1.22rem]' : 'space-y-4 text-[1.22rem] leading-[1.75] sm:text-[1.3rem]'}`}>
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
  const [view, setView] = useState('explore'); // 'explore' (the scene) | 'story' (the whole story so far)
  const [writing, setWriting] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
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
  const me = story.players[0];
  const place = story.bible.places[story.scene];
  const lastNarrated = [...story.turns].reverse().find((t) => t.narration);
  const lastIndex = story.turns.lastIndexOf(lastNarrated);
  // an illustrated moment becomes the scene until the story moves on
  const bg = (live === null && moments[lastIndex]) || places[story.scene];
  const lastChoices = [...story.turns].reverse().find((t) => t.choices?.length)?.choices || [];
  const passage = live !== null ? live : lastNarrated?.narration || '';
  const segments = passage ? segmentNarration(passage, story.bible.cast, me.name) : [];
  const speakerName = [...segments].reverse().find((s) => story.bible.cast.some((c) => c.name === s.speaker))?.speaker;
  const speakerIndex = story.bible.cast.findIndex((c) => c.name === speakerName);
  const activity = recentActivity(story);

  const sideNav = (
    <nav className="space-y-1">
      {[
        { key: 'explore', label: 'Explore', icon: Compass, onClick: () => { setView('explore'); setNavOpen(false); } },
        { key: 'story', label: 'Your Story', icon: BookOpen, onClick: () => { setView('story'); setNavOpen(false); } },
        { key: 'characters', label: 'Characters', icon: Users, onClick: () => { setJournal(true); setNavOpen(false); } },
        { key: 'home', label: 'All worlds', icon: Globe, onClick: onExit },
      ].map(({ key, label, icon: Icon, onClick }) => (
        <button key={key} type="button" onClick={onClick} className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-[15px] transition-colors ${view === key ? 'bg-white/10 text-parchment' : 'text-parchment/65 hover:bg-white/5 hover:text-parchment'}`}>
          <Icon size={18} strokeWidth={1.6} /> {label}
        </button>
      ))}
    </nav>
  );

  const sidebar = (
    <div className="flex h-full flex-col gap-6 p-4">
      <div className="overflow-hidden rounded-2xl border border-white/10">
        {places[0] ? <img src={places[0]} alt="" className="aspect-[16/10] w-full object-cover" /> : <div className="aspect-[16/10] w-full" style={{ background: `linear-gradient(160deg, ${mood.secondary}, ${mood.bg[1]})` }} />}
        <div className="p-3">
          <p className="font-serif text-xl leading-tight text-parchment">{story.bible.title}</p>
          <p className="mt-0.5 text-xs text-parchment/55">{story.time}</p>
        </div>
      </div>
      {sideNav}
      <div className="mt-auto space-y-4">
        <div className="border-t border-white/10 pt-4">
          <p className="mb-2 text-[10px] uppercase tracking-[0.25em] text-parchment/45">Your character</p>
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-full font-serif text-lg text-midnight" style={{ background: `radial-gradient(circle at 40% 30%, ${mood.primary}, ${mood.secondary})` }}>{me.name[0]}</div>
            <div className="min-w-0">
              <p className="truncate text-[15px] text-parchment">{me.name}</p>
              {me.tag && <p className="truncate text-xs text-parchment/50">{me.tag}</p>}
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          <ToggleButton on={soundOn} onClick={() => { const v = !soundOn; setSoundOn(v); setPref('reve-ai:story-sound', v); }} label="Ambient sound" mood={mood}>{soundOn ? <Volume2 size={16} /> : <VolumeX size={16} />}</ToggleButton>
          {voiceSupported && <ToggleButton on={autoRead} onClick={() => { const v = !autoRead; setAutoRead(v); setPref('reve-ai:story-read', v); if (!v) stopListening(); }} label="Read new passages aloud" mood={mood}><Headphones size={16} /></ToggleButton>}
        </div>
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 flex overflow-clip" style={{ background: mood.bg[0] }}>
      {/* left: world, navigation, you */}
      <aside className="hidden w-64 shrink-0 border-r border-white/5 bg-black/40 lg:block">{sidebar}</aside>

      {/* centre: the scene */}
      <main className="relative min-w-0 flex-1 overflow-clip">
        <AnimatePresence mode="sync">
          {bg ? (
            <motion.img key={bg} src={bg} alt={place?.name || ''} className="absolute inset-0 h-full w-full object-cover" initial={{ opacity: 0, scale: 1.08 }} animate={{ opacity: 1, scale: 1.02 }} exit={{ opacity: 0 }} transition={{ opacity: { duration: 1.6 }, scale: { duration: 30, ease: 'linear' } }} />
          ) : (
            <motion.div key={`g${story.scene}`} className="absolute inset-0" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} style={{ background: `radial-gradient(70% 55% at 50% 30%, ${mood.secondary}66, transparent), linear-gradient(180deg, ${mood.bg[1]}, ${mood.bg[0]})` }} />
          )}
        </AnimatePresence>
        <div className="pointer-events-none absolute inset-0 opacity-70"><ParticleCanvas modes={mood.particles} density={0.5} /></div>
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/40 via-transparent to-black/70" />

        {/* top: mobile menu, place */}
        <div className="absolute inset-x-0 top-0 z-20 flex items-start justify-between gap-3 p-4">
          <button type="button" onClick={() => setNavOpen(true)} className="glass-btn rounded-full p-2.5 text-parchment/85 lg:hidden" aria-label="Open menu"><Menu size={18} /></button>
          <p className="hidden font-serif text-lg italic text-parchment/80 lg:block">Chapter {story.chapter.n} · {story.chapter.title}</p>
          <div className="glass-btn flex items-center gap-2 rounded-full px-3.5 py-2 text-sm text-parchment/90">
            <MapPin size={14} style={{ color: mood.primary }} /> {place?.name}
          </div>
        </div>

        {view === 'story' ? (
          /* the whole story so far, like a book */
          <div ref={scrollRef} className="absolute inset-0 z-10 overflow-y-auto bg-black/75 pb-24 pt-20 backdrop-blur-sm">
            <div className="mx-auto max-w-2xl px-5 sm:px-8">
              {story.turns.map((t, i) => (
                <section key={i} className="mb-10">
                  {t.kind === 'opening' && <ChapterMark n={1} title={story.bible.opening.chapter_title} mood={mood} />}
                  {t.kind === 'chapter' && <ChapterMark n={t.chapter} title={t.title} mood={mood} />}
                  {t.kind === 'turn' && <p className="mb-4 border-l-2 pl-3 text-[15px] italic text-parchment/70" style={{ borderColor: mood.primary }}>You: {t.actions.map((a) => a.text).join(' / ')}</p>}
                  {moments[i] && <img src={moments[i]} alt="" className="mb-5 w-full rounded-2xl border border-white/10" />}
                  {t.narration && <Narration text={t.narration} />}
                  {t.kind === 'interlude' && t.events?.length > 0 && (
                    <ul className="mt-4 space-y-1.5 rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                      {t.events.map((e, k) => <li key={k} className="font-serif text-lg text-parchment/80"><Hourglass size={12} className="mr-2 inline" style={{ color: mood.primary }} />{e}</li>)}
                    </ul>
                  )}
                  {t.consequences?.length > 0 && <div className="mt-4 flex flex-wrap gap-2">{t.consequences.map((c, k) => <ConsequenceChip key={k} c={c} mood={mood} />)}</div>}
                </section>
              ))}
              <button type="button" onClick={() => setView('explore')} className="btn-lantern mx-auto block rounded-full px-6 py-2.5 text-sm font-medium">Back to the scene</button>
            </div>
          </div>
        ) : (
          /* the moment you're in: who's speaking, what they said, what you do */
          <div className="absolute inset-x-0 bottom-0 z-20 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-8 sm:pb-6">
            <div className="glass mx-auto max-w-3xl rounded-3xl p-4 sm:p-5">
              <div className="flex gap-3 sm:gap-4">
                <div className="shrink-0">
                  {speakerIndex >= 0 && portraits[speakerIndex] ? (
                    <img src={portraits[speakerIndex]} alt={speakerName} className="h-12 w-12 rounded-full border object-cover sm:h-16 sm:w-16" style={{ borderColor: `${mood.primary}88` }} />
                  ) : (
                    <div className="flex h-12 w-12 items-center justify-center rounded-full font-serif text-xl text-midnight sm:h-16 sm:w-16" style={{ background: `radial-gradient(circle at 40% 30%, ${mood.primary}, ${mood.secondary})` }}>{(speakerName || '✦')[0]}</div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="mb-1.5 flex items-center justify-between gap-2">
                    <span className="rounded-full px-2.5 py-0.5 font-serif text-[15px] text-parchment" style={{ background: `${mood.secondary}66` }}>{speakerName || place?.name || story.bible.title}</span>
                    {voiceSupported && passage && live === null && (
                      speaking ? (
                        <button type="button" onClick={stopListening} className="rounded-full p-1.5" style={{ color: mood.primary }} aria-label="Stop reading"><Square size={14} fill="currentColor" /></button>
                      ) : (
                        <button type="button" onClick={() => listen(lastIndex)} className="rounded-full p-1.5 text-parchment/55 hover:text-parchment" aria-label="Listen"><AudioLines size={18} /></button>
                      )
                    )}
                  </div>
                  <div key={lastIndex} className="max-h-[34vh] overflow-y-auto pr-1">
                    {passage ? <Narration text={passage} compact /> : (
                      <p className="flex items-center gap-2 font-serif text-lg italic text-parchment/55">
                        the story turns {[0, 1, 2].map((d) => <motion.span key={d} className="h-1.5 w-1.5 rounded-full" style={{ background: mood.primary }} animate={{ opacity: [0.2, 1, 0.2] }} transition={{ duration: 1.2, repeat: Infinity, delay: d * 0.2 }} />)}
                      </p>
                    )}
                    {live === null && lastNarrated?.consequences?.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-1.5">{lastNarrated.consequences.map((c, k) => <ConsequenceChip key={k} c={c} mood={mood} small />)}</div>
                    )}
                  </div>
                </div>
              </div>

              {error && <p className="mt-3 text-sm text-rose-300/90">{error}</p>}

              {!busy && (writing ? (
                <form onSubmit={(e) => { e.preventDefault(); act(); setWriting(false); }} className="mt-4 flex items-end gap-2">
                  <textarea autoFocus value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); act(); setWriting(false); } if (e.key === 'Escape') setWriting(false); }} rows={1} maxLength={1500} placeholder={`What does ${me.name.split(' ')[0]} do or say?`} className="max-h-28 min-h-[46px] flex-1 resize-none rounded-2xl border border-white/15 bg-midnight/60 px-4 py-3 text-[15px] text-parchment placeholder:text-parchment/35 focus:border-gold/50 focus:outline-none" />
                  <button type="submit" disabled={!draft.trim()} className="rounded-full p-3.5 text-midnight disabled:opacity-30" style={{ background: mood.primary }} aria-label="Act"><SendHorizontal size={18} /></button>
                </form>
              ) : (
                <div className="mt-4 flex flex-wrap gap-2">
                  {lastChoices.slice(0, 3).map((c) => (
                    <button key={c} type="button" onClick={() => act(c)} className="flex-1 basis-[30%] rounded-xl border border-white/20 bg-black/20 px-4 py-2.5 text-left text-[15px] text-parchment/90 transition-colors hover:border-gold/60 hover:bg-white/5">{c}</button>
                  ))}
                  <button type="button" onClick={() => setWriting(true)} className="rounded-xl border border-white/20 bg-black/20 px-4 py-2.5 text-parchment/70 hover:border-gold/60 hover:text-parchment" aria-label="Write your own"><MoreHorizontal size={18} /></button>
                </div>
              ))}

              {!drawing && !moments[lastIndex] && !artOff && live === null && lastNarrated && (
                <button type="button" onClick={() => illustrate(lastIndex)} className="mt-3 inline-flex items-center gap-1.5 text-xs text-parchment/40 hover:text-parchment"><Brush size={12} /> Illustrate this moment</button>
              )}
              {drawing !== null && <p className="mt-3 text-xs text-parchment/50">Painting this moment…</p>}
            </div>
          </div>
        )}

      </main>

      {/* right: who's with you, what happened */}
      <aside className="hidden w-72 shrink-0 flex-col gap-6 overflow-y-auto border-l border-white/5 bg-black/40 p-5 xl:flex">
        <section>
          <h3 className="mb-3 font-serif text-xl text-parchment">With you in this world</h3>
          {story.players.slice(1).map((p) => (
            <div key={p.id} className="flex items-center gap-3 py-1.5">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 font-serif text-parchment">{p.name[0]}</div>
              <div className="min-w-0 flex-1"><p className="text-sm text-parchment">{p.name}</p><p className="text-xs text-parchment/45">played by the story for now</p></div>
            </div>
          ))}
          <button type="button" disabled className="mt-2 inline-flex w-full cursor-not-allowed items-center justify-center gap-2 rounded-xl border border-dashed border-white/15 px-3 py-2.5 text-sm text-parchment/45" title="Inviting friends arrives with the shared world (next step)">
            <UserPlus size={15} /> Invite a friend · soon
          </button>
        </section>
        <section>
          <h3 className="mb-3 font-serif text-xl text-parchment">Recent activity</h3>
          {activity.length === 0 && <p className="text-sm text-parchment/45">Your choices will leave traces here.</p>}
          <ul className="space-y-3">
            {activity.map((a, i) => (
              <li key={i} className="flex gap-3">
                <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full" style={{ background: mood.primary }} />
                <div className="min-w-0 flex-1"><p className="text-sm leading-snug text-parchment/80">{a.text}</p><p className="text-[11px] text-parchment/40">{ago(a.at)}</p></div>
              </li>
            ))}
          </ul>
        </section>
        <section className="mt-auto">
          <button type="button" onClick={() => setJournal(true)} className="flex w-full items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] p-3.5 text-left hover:border-gold/40">
            <BookMarked size={22} style={{ color: mood.primary }} />
            <span className="min-w-0 flex-1"><span className="block truncate text-[15px] text-parchment">{story.chapter.title}</span><span className="text-xs text-parchment/50">Chapter {story.chapter.n} · journal</span></span>
            <ChevronRight size={16} className="text-parchment/40" />
          </button>
        </section>
      </aside>

      {/* mobile menu */}
      <AnimatePresence>
        {navOpen && (
          <motion.div className="fixed inset-0 z-40 lg:hidden" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="absolute inset-0 bg-black/60" onClick={() => setNavOpen(false)} />
            <motion.div initial={{ x: -30 }} animate={{ x: 0 }} exit={{ x: -30 }} className="glass absolute inset-y-0 left-0 w-72">
              <button type="button" onClick={() => setNavOpen(false)} className="absolute right-3 top-3 rounded-full p-2 text-parchment/60" aria-label="Close menu"><X size={16} /></button>
              {sidebar}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

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

function ToggleButton({ on, onClick, label, mood, children }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={on} aria-label={label} title={label} className="glass-btn rounded-full p-3 text-parchment/70" style={on ? { color: mood.primary, borderColor: `${mood.primary}88` } : undefined}>
      {children}
    </button>
  );
}

/** The last few things that changed: consequences of your choices, and events while you were away. */
function recentActivity(story) {
  const items = [];
  for (const t of story.turns) {
    (t.consequences || []).forEach((c) => items.push({ text: c.text, at: t.at }));
    (t.events || []).forEach((e) => items.push({ text: e, at: t.at }));
  }
  return items.slice(-5).reverse();
}

function ago(iso) {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  if (m < 60 * 24) return `${Math.round(m / 60)}h ago`;
  const d = Math.round(m / 1440);
  return d === 1 ? 'yesterday' : `${d} days ago`;
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
