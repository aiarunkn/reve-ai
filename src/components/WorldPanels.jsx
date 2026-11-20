import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { BookOpen, Feather, X, Trash2, Sparkles } from 'lucide-react';
import { askForStory, NotConfiguredError } from '../services/reveClient';
import { STAGES } from '../services/worldStore';
import { Avatar } from './WorldChat';

const STAGE_ORDER = ['stranger', 'acquaintance', 'friend', 'confidant', 'kindred'];

function splitStory(raw) {
  const m = raw.match(/^\s*#\s*(.+)\n?/);
  return m ? { title: m[1].trim(), body: raw.slice(m[0].length).trim() } : { title: '', body: raw.trim() };
}

/* ------------------------------ Stories ------------------------------ */

export function StoriesTab({ world, mood, scenes, onUpdate, onAsleep, onScene }) {
  const c = world.bible.character;
  const [sceneIndex, setSceneIndex] = useState(null);
  const [prompt, setPrompt] = useState('');
  const [live, setLive] = useState(null); // { raw, sceneIndex } while being told
  const [reading, setReading] = useState(null);
  const [error, setError] = useState('');
  const abortRef = useRef(null);
  const stories = world.stories || [];
  const asleep = !!world.bible.asleep;

  useEffect(() => () => abortRef.current?.abort(), []);

  const ask = async () => {
    if (live || asleep) return;
    setError('');
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    const at = sceneIndex;
    if (at !== null) onScene(at);
    setLive({ raw: '', sceneIndex: at });
    try {
      const raw = await askForStory(world, { sceneIndex: at ?? undefined, prompt: prompt.trim() || undefined }, (soFar) => setLive({ raw: soFar, sceneIndex: at }), ctrl.signal);
      const { title, body } = splitStory(raw);
      if (body) {
        const story = { id: `story-${Date.now().toString(36)}`, title: title || 'An untitled story', text: body, sceneIndex: at, createdAt: new Date().toISOString() };
        onUpdate((w) => ({ ...w, stories: [story, ...(w.stories || [])] }));
        setReading(story);
        setPrompt('');
      }
    } catch (err) {
      if (err.name === 'AbortError') return;
      if (err instanceof NotConfiguredError) onAsleep();
      setError(err.message);
    } finally {
      setLive(null);
    }
  };

  const shown = live ? { ...splitStory(live.raw), sceneIndex: live.sceneIndex, live: true } : reading;

  return (
    <div className="h-full overflow-y-auto px-5 py-5">
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
        <p className="font-serif text-lg italic text-parchment">Ask {c.name} for a story</p>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {[null, ...world.bible.scenes.map((_, i) => i)].map((i) => (
            <button
              key={i ?? 'any'}
              type="button"
              onClick={() => setSceneIndex(i)}
              className="rounded-full border px-3 py-1 text-xs transition-colors"
              style={sceneIndex === i ? { borderColor: mood.primary, color: mood.primary, background: `${mood.primary}14` } : { borderColor: 'rgba(255,255,255,0.12)', color: 'rgba(243,233,215,0.6)' }}
            >
              {i === null ? 'anywhere' : world.bible.scenes[i].name}
            </button>
          ))}
        </div>
        <input
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          maxLength={300}
          placeholder="About… (optional) — the night the lights went out"
          className="mt-3 w-full rounded-xl border border-white/10 bg-midnight/40 px-3 py-2 text-sm text-parchment placeholder:text-parchment/35 focus:border-gold/50 focus:outline-none"
        />
        <button
          type="button"
          onClick={ask}
          disabled={!!live || asleep}
          className="mt-3 inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium text-midnight disabled:opacity-40"
          style={{ background: mood.primary }}
        >
          <Feather size={15} /> {live ? `${c.name} is telling it…` : 'Tell me a story'}
        </button>
        {asleep && <p className="mt-2 text-xs text-parchment/45">Stories begin once this world wakes up (it needs an API key).</p>}
        {error && <p className="mt-2 text-sm text-rose-300/90">{error}</p>}
      </div>

      <h3 className="mb-2 mt-6 text-[11px] uppercase tracking-[0.25em] text-parchment/45">Stories you’ve been told</h3>
      {stories.length === 0 && <p className="font-serif italic text-parchment/45">None yet. The first one is always the strangest.</p>}
      <ul className="space-y-2">
        {stories.map((s) => (
          <li key={s.id}>
            <button type="button" onClick={() => setReading(s)} className="flex w-full items-center gap-3 rounded-xl border border-white/5 bg-white/[0.02] p-2.5 text-left transition-colors hover:border-gold/30">
              {s.sceneIndex != null && scenes[s.sceneIndex] ? <img src={scenes[s.sceneIndex]} alt="" className="h-11 w-11 rounded-lg object-cover" /> : <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-white/5"><BookOpen size={16} className="text-parchment/40" /></span>}
              <span className="min-w-0">
                <span className="block truncate font-serif text-lg text-parchment">{s.title}</span>
                <span className="text-[11px] text-parchment/45">{new Date(s.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}{s.sceneIndex != null ? ` · ${world.bible.scenes[s.sceneIndex]?.name}` : ''}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>

      {createPortal(
      <AnimatePresence>
        {shown && (
          <StoryReader
            story={shown}
            image={shown.sceneIndex != null ? scenes[shown.sceneIndex] : scenes[0]}
            mood={mood}
            teller={c.name}
            onClose={() => { if (!shown.live) setReading(null); }}
            onDelete={shown.live ? null : () => { onUpdate((w) => ({ ...w, stories: (w.stories || []).filter((x) => x.id !== shown.id) })); setReading(null); }}
          />
        )}
      </AnimatePresence>,
      document.body
      )}
    </div>
  );
}

function StoryReader({ story, image, mood, teller, onClose, onDelete }) {
  return (
    <motion.div className="fixed inset-0 z-[60] overflow-y-auto bg-midnight/85 backdrop-blur-md" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} role="dialog" aria-modal="true" aria-label={story.title || 'A story'}>
      <div className="relative mx-auto max-w-2xl px-5 pb-20 pt-6 sm:pt-12">
        <div className="sticky top-3 z-10 flex justify-end gap-2">
          {onDelete && <button type="button" onClick={onDelete} className="glass-btn rounded-full p-2.5 text-parchment/50 hover:text-rose-200" aria-label="Delete story"><Trash2 size={16} /></button>}
          {!story.live && <button type="button" onClick={onClose} className="glass-btn rounded-full p-2.5 text-parchment/80" aria-label="Close story"><X size={16} /></button>}
        </div>
        {image && (
          <div className="relative -mt-8 overflow-hidden rounded-t-[999px] border border-gold/30" style={{ boxShadow: `0 0 70px -15px ${mood.glow}` }}>
            <img src={image} alt="" className="aspect-[4/3] w-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-t from-midnight via-transparent to-transparent" />
          </div>
        )}
        <p className="mt-6 text-center text-[10px] uppercase tracking-[0.35em]" style={{ color: mood.primary }}>a story told by {teller}</p>
        <h2 className="mt-2 text-center font-serif text-4xl italic leading-tight text-parchment text-glow">{story.title || '…'}</h2>
        <div className="mt-8 space-y-5 font-serif text-[1.3rem] leading-[1.7] text-parchment/90">
          {(story.text ?? story.body ?? '').split(/\n{2,}/).filter(Boolean).map((p, i) => (
            <motion.p key={i} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>{p}</motion.p>
          ))}
          {story.live && <span className="inline-block h-5 w-2 animate-pulse rounded-sm align-middle" style={{ background: mood.primary }} />}
        </div>
      </div>
    </motion.div>
  );
}

/* ------------------------------ World (the bible) ------------------------------ */

export function WorldTab({ world, mood, scenes, onScene }) {
  const b = world.bible;
  const c = b.character;
  return (
    <div className="h-full space-y-6 overflow-y-auto px-5 py-5">
      <p className="font-serif text-xl italic leading-relaxed text-parchment/85">{b.essence}</p>
      <section>
        <h3 className="mb-2 text-[11px] uppercase tracking-[0.25em] text-parchment/45">Places</h3>
        <ul className="space-y-2">
          {b.scenes.map((s, i) => (
            <li key={i}>
              <button type="button" onClick={() => onScene(i)} className="flex w-full gap-3 rounded-xl border border-white/5 bg-white/[0.02] p-2.5 text-left transition-colors hover:border-gold/30">
                {scenes[i] && <img src={scenes[i]} alt="" className="h-14 w-14 shrink-0 rounded-lg object-cover" />}
                <span>
                  <span className="block font-serif text-lg text-parchment">{s.name}</span>
                  <span className="block text-sm leading-snug text-parchment/60">{s.description}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </section>
      {!b.asleep && (
        <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
          <div className="flex items-center gap-3">
            <Avatar name={c.name} mood={mood} size={48} />
            <div>
              <p className="font-serif text-2xl text-parchment">{c.name}</p>
              <p className="text-xs text-parchment/55">{c.role}</p>
            </div>
          </div>
          <p className="mt-3 text-sm leading-relaxed text-parchment/75">{c.appearance}</p>
          <p className="mt-2 text-sm leading-relaxed text-parchment/75">{c.personality}</p>
          <p className="mt-3 text-xs italic text-parchment/40">They have a secret. You’ll have to earn it.</p>
        </section>
      )}
      {b.lore?.length > 0 && (
        <section>
          <h3 className="mb-2 text-[11px] uppercase tracking-[0.25em] text-parchment/45">Small truths of this world</h3>
          <ul className="space-y-2">
            {b.lore.map((l, i) => (
              <li key={i} className="flex gap-2 font-serif text-lg leading-snug text-parchment/80"><Sparkles size={14} className="mt-1.5 shrink-0" style={{ color: mood.primary }} />{l}</li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

/* ------------------------------ Memory ------------------------------ */

export function MemoryTab({ world, mood, onUpdate, reflecting }) {
  const c = world.bible.character;
  const mem = world.memory;
  const stage = STAGE_ORDER.indexOf(mem.relationship);

  const forget = () => {
    if (!window.confirm(`Ask ${c.name} to forget everything about you? Your conversations and their memories will be erased. Stories stay.`)) return;
    onUpdate((w) => ({ ...w, memory: { summary: '', facts: [], growth: [], relationship: 'stranger', conversations: 0 }, messages: [], unreflected: 0 }));
  };

  return (
    <div className="h-full space-y-6 overflow-y-auto px-5 py-5">
      <section>
        <h3 className="mb-3 text-[11px] uppercase tracking-[0.25em] text-parchment/45">You and {c.name}</h3>
        <div className="flex gap-1.5">
          {STAGE_ORDER.map((s, i) => (
            <div key={s} className="h-1.5 flex-1 rounded-full" style={{ background: i <= stage ? mood.primary : 'rgba(255,255,255,0.1)', boxShadow: i === stage ? `0 0 10px ${mood.glow}` : 'none' }} />
          ))}
        </div>
        <p className="mt-2 font-serif text-xl text-parchment">{STAGES[mem.relationship]?.label}</p>
        <p className="text-xs text-parchment/50">{STAGES[mem.relationship]?.hint} · {mem.conversations || 0} conversations remembered{reflecting ? ' · remembering…' : ''}</p>
      </section>

      <section>
        <h3 className="mb-2 text-[11px] uppercase tracking-[0.25em] text-parchment/45">In {c.name}’s words</h3>
        <p className="font-serif text-lg italic leading-relaxed text-parchment/80">{mem.summary || `${c.name} doesn’t know you yet. Talk a while, and they’ll begin to remember.`}</p>
      </section>

      <section>
        <h3 className="mb-2 text-[11px] uppercase tracking-[0.25em] text-parchment/45">What they know about you</h3>
        {(mem.facts || []).length === 0 && <p className="text-sm text-parchment/45">Nothing yet.</p>}
        <ul className="space-y-1.5">
          {(mem.facts || []).map((f, i) => (
            <li key={`${i}-${f}`} className="group flex items-start justify-between gap-2 rounded-lg px-2 py-1 text-sm text-parchment/80 hover:bg-white/[0.04]">
              <span>{f}</span>
              <button
                type="button"
                onClick={() => onUpdate((w) => ({ ...w, memory: { ...w.memory, facts: w.memory.facts.filter((_, k) => k !== i) } }))}
                className="shrink-0 text-parchment/30 opacity-100 hover:text-rose-200 sm:opacity-0 sm:group-hover:opacity-100"
                aria-label={`Let ${c.name} forget this`}
              >
                <X size={14} />
              </button>
            </li>
          ))}
        </ul>
      </section>

      {(mem.growth || []).length > 0 && (
        <section>
          <h3 className="mb-2 text-[11px] uppercase tracking-[0.25em] text-parchment/45">How they’ve changed</h3>
          <ul className="space-y-2">
            {mem.growth.map((g, i) => <li key={i} className="font-serif text-lg italic leading-snug text-parchment/75">{g}</li>)}
          </ul>
        </section>
      )}

      <button type="button" onClick={forget} className="text-xs text-parchment/40 underline-offset-4 hover:text-rose-200 hover:underline">Ask {c.name} to forget me</button>
    </div>
  );
}
