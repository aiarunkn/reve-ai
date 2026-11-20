import { useEffect } from 'react';
import { motion } from 'framer-motion';
import { Sprout, Plus } from 'lucide-react';
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

export default function WorldMap({ memories, onEnter, onPlant, restoreScroll }) {
  useEffect(() => {
    if (restoreScroll) window.scrollTo(0, restoreScroll);
  }, [restoreScroll]);

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
          <p className="mb-3 text-[11px] uppercase tracking-[0.45em] text-gold/70">a memory sanctuary</p>
          <h1 className="font-serif text-5xl font-medium italic leading-[0.95] text-parchment text-glow sm:text-7xl">
            Reve AI
          </h1>
          <p className="mt-5 max-w-md font-serif text-lg italic text-parchment/65 sm:text-xl">
            Small, luminous moments, kept floating where you can always find your way back to them.
          </p>
          <motion.button
            type="button"
            onClick={onPlant}
            whileHover={{ scale: 1.04 }}
            whileTap={{ scale: 0.97 }}
            className="btn-lantern mt-9 inline-flex items-center gap-2.5 rounded-full px-7 py-3.5 text-sm font-medium tracking-wide"
          >
            <Plus size={18} strokeWidth={2.2} />
            Plant a Memory Seed
          </motion.button>
          <p className="mt-4 text-xs text-parchment/40">
            {memories.length} {memories.length === 1 ? 'memory' : 'memories'} glowing in your world
          </p>
        </motion.header>

        <section
          aria-label="Memory portals"
          className="mt-20 grid grid-cols-1 justify-items-center gap-x-10 gap-y-20 sm:mt-24 sm:grid-cols-2 lg:grid-cols-3 lg:gap-y-28"
        >
          {memories.map((m, i) => (
            <div key={m.id} className={OFFSETS[i % OFFSETS.length]}>
              <MemoryPortal memory={m} index={i} onEnter={onEnter} />
            </div>
          ))}

          {/* an empty island waiting for a seed */}
          <div className={OFFSETS[memories.length % OFFSETS.length]}>
            <motion.button
              type="button"
              onClick={onPlant}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1, y: [0, -8, 0] }}
              transition={{ opacity: { delay: 0.8, duration: 1 }, y: { duration: 7, repeat: Infinity, ease: 'easeInOut' } }}
              className="group flex flex-col items-center"
              aria-label="Plant a new memory seed"
            >
              <div className="flex h-56 w-40 flex-col items-center justify-center gap-3 rounded-t-full border border-dashed border-gold/30 bg-white/[0.02] text-parchment/45 transition-colors duration-500 group-hover:border-gold/60 group-hover:bg-lantern/5 group-hover:text-lantern sm:h-64 sm:w-48">
                <Sprout size={28} strokeWidth={1.4} />
                <span className="px-4 text-center font-serif text-lg italic leading-snug">an empty island, waiting</span>
              </div>
              <Island glow="#8e7cc3" variant={memories.length} className="-mt-3 w-52 opacity-70 sm:w-60" />
            </motion.button>
          </div>
        </section>
      </main>
    </div>
  );
}
