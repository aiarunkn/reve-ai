import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Sprout, Plus, Sparkles, Feather, ArrowRight } from 'lucide-react';
import { loadScenes } from '../services/worldStore';
import { loadPlaceImages } from '../services/storyStore';
import { getMood } from '../data/moods';
import Landscape from './Landscape';
import ParticleCanvas from './ParticleCanvas';
import MemoryPortal from './MemoryPortal';
import Island from './Island';

// Staggered heights give the grid a floating, hand-placed feel.
// (Literal class strings so Tailwind can see them.)
const OFFSETS = [
  'sm:translate-y-0 lg:translate-y-0',
  'sm:translate-y-20 lg:translate-y-24',
  'sm:translate-y-0 lg:translate-y-8',
  'sm:translate-y-20 lg:translate-y-0',
  'sm:translate-y-0 lg:translate-y-24',
  'sm:translate-y-20 lg:translate-y-8',
];

/** First painted scene of each world, as an object URL, for its portal. */
function useWorldCovers(worlds) {
  const [covers, setCovers] = useState({});
  const key = worlds.map((w) => w.id).join(',');
  useEffect(() => {
    let alive = true;
    const made = [];
    Promise.all(worlds.map(async (w) => [w.id, (await loadScenes(w.id, 1))[0]])).then((pairs) => {
      pairs.forEach(([, u]) => u && made.push(u));
      if (alive) setCovers(Object.fromEntries(pairs));
    });
    return () => { alive = false; made.forEach((u) => URL.revokeObjectURL(u)); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return covers;
}

/** First painted place of each story, or a gradient card in the story's colours. */
function useStoryCovers(stories) {
  const [covers, setCovers] = useState({});
  const key = stories.map((s) => s.id).join(',');
  useEffect(() => {
    let alive = true;
    const made = [];
    Promise.all(stories.map(async (s) => {
      const [img] = await loadPlaceImages(s.id, 1);
      if (img) { made.push(img); return [s.id, img]; }
      const m = getMood(s.mood);
      const c = document.createElement('canvas');
      c.width = 300; c.height = 400;
      const x = c.getContext('2d');
      const g = x.createLinearGradient(0, 0, 0, 400);
      g.addColorStop(0, m.bg[0]); g.addColorStop(0.6, m.secondary); g.addColorStop(1, m.bg[1]);
      x.fillStyle = g; x.fillRect(0, 0, 300, 400);
      x.fillStyle = m.primary; x.globalAlpha = 0.85;
      x.font = 'italic 40px "Cormorant Garamond", serif'; x.textAlign = 'center';
      x.fillText(s.title.split(' ').slice(0, 2).join(' '), 150, 220);
      return [s.id, c.toDataURL('image/jpeg', 0.8)];
    })).then((pairs) => alive && setCovers(Object.fromEntries(pairs)));
    return () => { alive = false; made.forEach((u) => URL.revokeObjectURL(u)); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return covers;
}

function SectionTitle({ children, sub }) {
  return (
    <div className="mt-24 text-center sm:mt-28">
      <h2 className="font-serif text-3xl italic text-parchment text-glow sm:text-4xl">{children}</h2>
      {sub && <p className="mt-2 text-sm text-parchment/50">{sub}</p>}
    </div>
  );
}

function EmptyIsland({ onClick, label, icon: Icon, index }) {
  return (
    <div className={OFFSETS[index % OFFSETS.length]}>
      <motion.button
        type="button"
        onClick={onClick}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1, y: [0, -8, 0] }}
        transition={{ opacity: { delay: 0.8, duration: 1 }, y: { duration: 7, repeat: Infinity, ease: 'easeInOut' } }}
        className="group flex flex-col items-center"
        aria-label={label}
      >
        <div className="flex h-56 w-40 flex-col items-center justify-center gap-3 rounded-t-full border border-dashed border-gold/30 bg-white/[0.02] text-parchment/45 transition-colors duration-500 group-hover:border-gold/60 group-hover:bg-lantern/5 group-hover:text-lantern sm:h-64 sm:w-48">
          <Icon size={28} strokeWidth={1.4} />
          <span className="px-4 text-center font-serif text-lg italic leading-snug">{label}</span>
        </div>
        <Island glow="#8e7cc3" variant={index} className="-mt-3 w-52 opacity-70 sm:w-60" />
      </motion.button>
    </div>
  );
}

export default function WorldMap({ memories, worlds = [], stories = [], onEnter, onEnterWorld, onEnterStory, onPlant, onImagine, onBegin, restoreScroll }) {
  useEffect(() => {
    if (restoreScroll) window.scrollTo(0, restoreScroll);
  }, [restoreScroll]);
  const covers = useWorldCovers(worlds);
  const [premise, setPremise] = useState('');
  const storyCovers = useStoryCovers(stories);
  const storyPortals = [...stories].sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || '')).map((s) => ({ id: s.id, title: s.title, mood: s.mood, createdAt: s.updatedAt || s.createdAt, image: storyCovers[s.id] || null }));
  const worldPortals = worlds.map((w) => ({ id: w.id, title: w.bible.world_name, mood: w.bible.mood, createdAt: w.createdAt, image: covers[w.id] || null }));

  return (
    <div className="relative min-h-dvh">
      <Landscape />
      <div className="pointer-events-none fixed inset-0">
        <ParticleCanvas modes={['stars', 'fireflies']} density={0.9} />
      </div>

      <main className="relative z-10 mx-auto max-w-6xl px-5 pb-40 pt-14 sm:px-8 sm:pt-20">
        <motion.header
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1.4, ease: [0.22, 1, 0.36, 1] }}
          className="flex flex-col items-center text-center"
        >
          <p className="mb-3 text-[11px] uppercase tracking-[0.45em] text-gold/70">a living diary of imagined worlds</p>
          <h1 className="font-serif text-5xl font-medium italic leading-[0.95] text-parchment text-glow sm:text-7xl">
            Reve AI
          </h1>
          <p className="mt-5 max-w-md font-serif text-lg italic text-parchment/65 sm:text-xl">
            Live the stories you can’t live anywhere else. Your choices last, and the world remembers you.
          </p>
          <form
            onSubmit={(e) => { e.preventDefault(); const p = premise.trim(); if (p.length >= 8) onBegin(p); }}
            className="mt-9 flex w-full max-w-xl items-center gap-2 rounded-full border border-gold/40 bg-midnight/60 p-1.5 pl-5 shadow-[0_0_40px_-10px_rgba(245,184,90,0.5)] backdrop-blur"
          >
            <Feather size={18} className="shrink-0 text-gold" />
            <input
              value={premise}
              onChange={(e) => setPremise(e.target.value)}
              maxLength={600}
              placeholder="What world do you want to live in?"
              aria-label="Describe the world you want to live in"
              className="min-w-0 flex-1 bg-transparent py-2.5 text-[15px] text-parchment placeholder:text-parchment/45 focus:outline-none"
            />
            <button type="submit" disabled={premise.trim().length < 8} className="btn-lantern inline-flex items-center gap-1.5 rounded-full px-5 py-2.5 text-sm font-medium disabled:opacity-40 disabled:[animation:none]">
              Enter <ArrowRight size={15} />
            </button>
          </form>
          <p className="mt-3 text-xs text-parchment/45">e.g. “1920s Paris: my best friend and I are rival artists”</p>
          <div className="mt-6 flex flex-col items-center gap-3 sm:flex-row sm:flex-wrap sm:justify-center">
            <button type="button" onClick={onImagine} className="glass-btn inline-flex items-center gap-2 rounded-full px-5 py-3 text-sm text-parchment/80 hover:text-parchment">
              <Sparkles size={16} /> Imagine a World
            </button>
            <button type="button" onClick={onPlant} className="glass-btn inline-flex items-center gap-2 rounded-full px-5 py-3 text-sm text-parchment/80 hover:text-parchment">
              <Plus size={16} /> Plant a Memory Seed
            </button>
          </div>
        </motion.header>

        <SectionTitle sub={stories.length ? 'Pick up exactly where you left off.' : 'Describe an experience you want to live. Your decisions change what happens next.'}>
          Your stories
        </SectionTitle>
        <section aria-label="Your stories" className="mt-14 grid grid-cols-1 justify-items-center gap-x-10 gap-y-20 sm:grid-cols-2 lg:grid-cols-3 lg:gap-y-28">
          {storyPortals.map((s, i) => (
            <div key={s.id} className={OFFSETS[i % OFFSETS.length]}>
              <MemoryPortal memory={s} index={i} onEnter={() => onEnterStory(s.id)} />
            </div>
          ))}
          <EmptyIsland onClick={() => document.querySelector('input[aria-label="Describe the world you want to live in"]')?.focus()} label={stories.length ? 'begin another story' : 'begin your first story'} icon={Feather} index={stories.length} />
        </section>

        <SectionTitle sub={worlds.length ? 'Places built from your photos, each with someone waiting in it.' : 'Five photos and a few words become a place, and someone who lives there.'}>
          Your worlds
        </SectionTitle>
        <section aria-label="Your worlds" className="mt-14 grid grid-cols-1 justify-items-center gap-x-10 gap-y-20 sm:grid-cols-2 lg:grid-cols-3 lg:gap-y-28">
          {worldPortals.map((w, i) => (
            <div key={w.id} className={OFFSETS[i % OFFSETS.length]}>
              <MemoryPortal memory={w} index={i} onEnter={() => onEnterWorld(w.id)} />
            </div>
          ))}
          <EmptyIsland onClick={onImagine} label={worlds.length ? 'imagine another world' : 'imagine your first world'} icon={Sparkles} index={worlds.length} />
        </section>

        <SectionTitle sub="Single moments: a photo, a feeling and a letter to your future self.">Memory rooms</SectionTitle>
        <section
          aria-label="Memory portals"
          className="mt-14 grid grid-cols-1 justify-items-center gap-x-10 gap-y-20 sm:grid-cols-2 lg:grid-cols-3 lg:gap-y-28"
        >
          {memories.map((m, i) => (
            <div key={m.id} className={OFFSETS[i % OFFSETS.length]}>
              <MemoryPortal memory={m} index={i} onEnter={onEnter} />
            </div>
          ))}

          <EmptyIsland onClick={onPlant} label="an empty island, waiting" icon={Sprout} index={memories.length} />
        </section>
      </main>
    </div>
  );
}
