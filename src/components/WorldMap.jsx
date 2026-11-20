import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Feather, ArrowRight } from 'lucide-react';
import { loadPlaceImages } from '../services/storyStore';
import { getMood } from '../data/moods';
import Landscape from './Landscape';
import ParticleCanvas from './ParticleCanvas';
import MemoryPortal from './MemoryPortal';

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
      x.font = 'italic 34px "Cormorant Garamond", serif'; x.textAlign = 'center';
      // wrap the title to fit inside the arch (about 200px wide), at most three lines
      const lines = [];
      for (const word of s.title.split(' ')) {
        const tryLine = lines.length ? `${lines[lines.length - 1]} ${word}` : word;
        if (lines.length && x.measureText(tryLine).width <= 190) lines[lines.length - 1] = tryLine;
        else lines.push(word);
      }
      lines.slice(0, 3).forEach((l, i, all) => x.fillText(l, 150, 215 + (i - (all.length - 1) / 2) * 40));
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

export default function WorldMap({ stories = [], onEnterStory, onBegin, restoreScroll }) {
  useEffect(() => {
    if (restoreScroll) window.scrollTo(0, restoreScroll);
  }, [restoreScroll]);
  const [premise, setPremise] = useState('');
  const storyCovers = useStoryCovers(stories);
  const storyPortals = [...stories].sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || '')).map((s) => ({ id: s.id, title: s.title, mood: s.mood, createdAt: s.updatedAt || s.createdAt, image: storyCovers[s.id] || null }));

  return (
    <div className="relative min-h-dvh">
      <Landscape />
      <div className="pointer-events-none fixed inset-0">
        <ParticleCanvas modes={['stars', 'fireflies']} density={0.9} />
      </div>

      <main className="relative z-10 mx-auto max-w-6xl px-5 pb-40 pt-[18vh] sm:px-8">
        <motion.header
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1.4, ease: [0.22, 1, 0.36, 1] }}
          className="flex flex-col items-center text-center"
        >
          <h1 className="font-serif text-5xl font-medium italic leading-[0.95] text-parchment text-glow sm:text-7xl">Reve</h1>
          <p className="mt-5 max-w-md font-serif text-xl italic text-parchment/70">Where do you want to be tonight?</p>
          <form
            onSubmit={(e) => { e.preventDefault(); const p = premise.trim(); if (p.length >= 3) onBegin(p); }}
            className="mt-9 flex w-full max-w-xl items-center gap-2 rounded-full border border-gold/40 bg-midnight/60 p-1.5 pl-5 shadow-[0_0_40px_-10px_rgba(245,184,90,0.5)] backdrop-blur"
          >
            <Feather size={18} className="shrink-0 text-gold" />
            <input
              value={premise}
              onChange={(e) => setPremise(e.target.value)}
              maxLength={600}
              placeholder="a candlelit common room under a lake, past midnight"
              aria-label="Describe where your story begins"
              className="min-w-0 flex-1 bg-transparent py-2.5 text-[15px] text-parchment placeholder:text-parchment/40 focus:outline-none"
            />
            <button type="submit" disabled={premise.trim().length < 3} className="btn-lantern inline-flex items-center gap-1.5 rounded-full px-5 py-2.5 text-sm font-medium disabled:opacity-40 disabled:[animation:none]">
              Enter <ArrowRight size={15} />
            </button>
          </form>
          <p className="mt-3 text-xs text-parchment/45">A place, a time, a feeling. You'll wake up inside it.</p>
        </motion.header>

        {storyPortals.length > 0 && (
          <>
            <SectionTitle sub="Pick up where you left off.">Your stories</SectionTitle>
            <section aria-label="Your stories" className="mt-14 grid grid-cols-1 justify-items-center gap-x-10 gap-y-20 sm:grid-cols-2 lg:grid-cols-3 lg:gap-y-28">
              {storyPortals.map((s, i) => (
                <div key={s.id} className={OFFSETS[i % OFFSETS.length]}>
                  <MemoryPortal memory={s} index={i} onEnter={() => onEnterStory(s.id)} />
                </div>
              ))}
            </section>
          </>
        )}
      </main>
    </div>
  );
}
