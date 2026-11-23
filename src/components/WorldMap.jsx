import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Feather, ArrowRight, Users, X } from 'lucide-react';
import { getAsset } from '../services/assetStore';
import Landscape from './Landscape';
import ParticleCanvas from './ParticleCanvas';
import StoryCover from './StoryCover';

/** Each story's cover: its first place behind, its first character in front (whatever has been painted so far). */
function useStoryCovers(stories) {
  const [covers, setCovers] = useState({});
  const key = stories.map((s) => s.id).join(',');
  useEffect(() => {
    let alive = true;
    const made = [];
    const url = (b) => { if (!(b instanceof Blob)) return null; const u = URL.createObjectURL(b); made.push(u); return u; };
    Promise.all(stories.map(async (s) => {
      const [bg, figure] = await Promise.all([getAsset(s.id, 'place0'), getAsset(s.id, 'portrait0')]);
      return [s.id, { bg: url(bg), figure: url(figure) }];
    })).then((pairs) => alive && setCovers(Object.fromEntries(pairs)));
    return () => { alive = false; made.forEach((u) => URL.revokeObjectURL(u)); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return covers;
}

function PrivacySheet({ open, onClose }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  return (
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 backdrop-blur-sm sm:items-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} role="dialog" aria-modal="true" aria-labelledby="privacy-title">
          <motion.div initial={{ y: 16 }} animate={{ y: 0 }} exit={{ y: 16 }} onClick={(e) => e.stopPropagation()} className="night-panel relative w-full max-w-md rounded-3xl p-7">
            <button type="button" onClick={onClose} className="absolute right-4 top-4 rounded-full p-2 text-parchment/60 hover:text-parchment" aria-label="Close"><X size={18} /></button>
            <h2 id="privacy-title" className="font-display text-3xl italic text-parchment">Privacy</h2>
            <ul className="mt-5 space-y-3 text-sm leading-relaxed text-parchment/75">
              <li>Your stories stay in this browser.</li>
              <li>We count anonymous visits and turns, never what you write, to see what people enjoy. No cookies.</li>
              <li>Each turn goes to the narrator, Claude by Anthropic, to write what happens next. We don’t keep it.</li>
              <li>A shared world is stored so friends with its code can join.</li>
              <li>No password. Sign in with an email link only if you want to.</li>
            </ul>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default function WorldMap({ stories = [], onEnterStory, onBegin, onJoin, restoreScroll, account }) {
  useEffect(() => {
    if (restoreScroll) window.scrollTo(0, restoreScroll);
  }, [restoreScroll]);
  const [premise, setPremise] = useState('');
  const [privacy, setPrivacy] = useState(false);
  const storyCovers = useStoryCovers(stories);
  const sorted = [...stories].sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
  const ready = premise.trim().length >= 3;

  return (
    <div className="relative min-h-dvh bg-[#050818]">
      <Landscape />
      <div className="pointer-events-none fixed inset-0">
        <ParticleCanvas modes={['stars', 'fireflies']} density={0.9} />
      </div>

      <div className="fixed right-4 top-[max(1rem,env(safe-area-inset-top))] z-30">{account}</div>

      <main className="relative z-10 mx-auto max-w-6xl px-5 pb-16 pt-[18vh] sm:px-8">
        <motion.header
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1.4, ease: [0.22, 1, 0.36, 1] }}
          className="flex flex-col items-center text-center"
        >
          <h1 className="font-display text-6xl font-medium italic leading-none text-parchment text-glow-gold sm:text-7xl">Reve</h1>
          <p className="mt-5 max-w-md font-display text-2xl italic text-parchment/70">Where do you want to be tonight?</p>
          <form
            onSubmit={(e) => { e.preventDefault(); if (ready) onBegin(premise.trim()); }}
            className="mt-9 flex w-full max-w-xl items-center gap-2 rounded-full border border-[#d9b36c]/40 bg-[#070b1f]/60 p-1.5 pl-5 shadow-[0_0_40px_-10px_rgba(245,184,90,0.5)] backdrop-blur"
          >
            <Feather size={18} className="shrink-0 text-[#d9b36c]" aria-hidden="true" />
            <input
              value={premise}
              onChange={(e) => setPremise(e.target.value)}
              maxLength={600}
              placeholder="a candlelit common room under a lake, past midnight"
              aria-label="Describe where your story begins"
              className="min-w-0 flex-1 bg-transparent py-2.5 text-base text-parchment placeholder:text-parchment/40 focus:outline-none"
            />
            <button type="submit" disabled={!ready} className="btn-gold inline-flex shrink-0 items-center gap-1.5 rounded-full px-5 py-2.5 text-sm font-medium disabled:opacity-40">
              Enter <ArrowRight size={15} aria-hidden="true" />
            </button>
          </form>
          <p className="mt-3 text-xs text-parchment/45">A place, a time, a feeling. You'll wake up inside it.</p>
          {onJoin && (
            <button type="button" onClick={onJoin} className="mt-5 inline-flex items-center gap-2 rounded-full border border-white/15 px-4 py-2 text-sm text-parchment/70 transition-colors hover:border-[#d9b36c]/50 hover:text-parchment">
              <Users size={15} className="text-[#d9b36c]" aria-hidden="true" /> Have a code? Join your friends
            </button>
          )}
        </motion.header>

        {sorted.length > 0 && (
          <>
            <div className="mt-24 text-center sm:mt-28">
              <h2 className="font-display text-4xl italic text-parchment text-glow-gold">Your stories</h2>
              <p className="mt-2 text-sm text-parchment/50">Pick up where you left off.</p>
            </div>
            <section aria-label="Your stories" className="mx-auto mt-12 flex max-w-5xl flex-wrap justify-center gap-4 sm:gap-6">
              {sorted.map((s, i) => (
                <div key={s.id} className="w-[calc(50%-0.5rem)] sm:w-52 lg:w-56">
                  <StoryCover story={s} cover={storyCovers[s.id]} index={i} onOpen={() => onEnterStory(s.id)} />
                </div>
              ))}
            </section>
          </>
        )}

        <footer className="mt-32 flex items-center justify-center gap-6 text-xs text-parchment/40">
          <button type="button" onClick={() => setPrivacy(true)} className="hover:text-parchment">Privacy</button>
          <span>© 2026 Reve</span>
        </footer>
      </main>

      <PrivacySheet open={privacy} onClose={() => setPrivacy(false)} />
    </div>
  );
}
