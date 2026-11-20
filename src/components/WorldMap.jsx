import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Sprout, Plus, Sparkles } from 'lucide-react';
import { loadScenes } from '../services/worldStore';
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

export default function WorldMap({ memories, worlds = [], onEnter, onEnterWorld, onPlant, onImagine, restoreScroll }) {
  useEffect(() => {
    if (restoreScroll) window.scrollTo(0, restoreScroll);
  }, [restoreScroll]);
  const covers = useWorldCovers(worlds);
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
            Turn your own photos into a world you belong to, and meet the one who lives there.
          </p>
          <div className="mt-9 flex flex-col items-center gap-3 sm:flex-row">
            <motion.button
              type="button"
              onClick={onImagine}
              whileHover={{ scale: 1.04 }}
              whileTap={{ scale: 0.97 }}
              className="btn-lantern inline-flex items-center gap-2.5 rounded-full px-7 py-3.5 text-sm font-medium tracking-wide"
            >
              <Sparkles size={18} strokeWidth={2} />
              Imagine a World
            </motion.button>
            <button type="button" onClick={onPlant} className="glass-btn inline-flex items-center gap-2 rounded-full px-5 py-3 text-sm text-parchment/80 hover:text-parchment">
              <Plus size={16} /> Plant a Memory Seed
            </button>
          </div>
        </motion.header>

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
