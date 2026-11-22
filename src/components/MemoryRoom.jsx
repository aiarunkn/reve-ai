import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowLeft, ChevronLeft, ChevronRight, Volume2, VolumeX, Trash2, Smartphone, Mail, Sparkles, Navigation } from 'lucide-react';
import ExploreScene from './ExploreScene';
import ParticleCanvas from './ParticleCanvas';
import { getMood } from '../data/moods';
import { splitMessage, placeFragments, isCompleted, markCompleted } from '../data/fragments';
import { useMemoryWorld } from '../hooks/useMemoryWorld';
import { formatMemoryDate } from '../hooks/useMemoryImage';
import { ambient } from '../services/ambientAudio';

const canUseMotion = typeof window !== 'undefined' && 'DeviceOrientationEvent' in window && 'ontouchstart' in window;

export default function MemoryRoom({ memory, index, total, onPrev, onNext, onExit, onDelete, soundOn, onToggleSound, panoPending }) {
  const mood = getMood(memory.mood);
  const weather = memory.weather || mood.particles;
  const { image, depth, pano, panoKind, progress } = useMemoryWorld(memory);

  const parts = useMemo(() => splitMessage(memory.message, 5), [memory.message]);
  const spots = useMemo(() => placeFragments(memory.id, parts.length), [memory.id, parts.length]);
  const [found, setFound] = useState(() => new Set());
  const [order, setOrder] = useState([]); // fragment indexes in the order they were caught
  const [letterOpen, setLetterOpen] = useState(false);
  const [completedBefore] = useState(() => isCompleted(memory.id));
  const [interacted, setInteracted] = useState(false);
  const [gyro, setGyro] = useState(false);
  const hintRef = useRef(null);
  const done = found.size === parts.length;

  const foundRef = useRef(found);
  foundRef.current = found;
  const collect = useCallback(
    (i) => {
      if (foundRef.current.has(i)) return;
      const next = new Set(foundRef.current);
      next.add(i);
      foundRef.current = next;
      setFound(next);
      setOrder((o) => [...o, i]);
      const complete = next.size === parts.length;
      if (soundOn) ambient.chime(memory.mood, complete);
      if (complete) {
        markCompleted(memory.id);
        setTimeout(() => setLetterOpen(true), 1100);
      }
    },
    [memory.id, memory.mood, parts.length, soundOn]
  );

  useEffect(() => {
    const t = setTimeout(() => setInteracted(true), 9000);
    const onKey = (e) => {
      if (e.key === 'Escape') (letterOpen ? setLetterOpen(false) : onExit());
    };
    window.addEventListener('keydown', onKey);
    return () => { clearTimeout(t); window.removeEventListener('keydown', onKey); };
  }, [letterOpen, onExit]);

  const enableMotion = async () => {
    try {
      if (typeof DeviceOrientationEvent.requestPermission === 'function') {
        const res = await DeviceOrientationEvent.requestPermission(); // iOS asks the user
        if (res !== 'granted') return;
      }
      setGyro((g) => !g);
    } catch { /* permission refused */ }
  };

  const latest = order.length ? parts[order[order.length - 1]] : null;

  return (
    <div className="fixed inset-0 overflow-clip bg-midnight select-none">
      <ExploreScene
        image={image}
        depth={depth}
        pano={pano}
        fragments={spots}
        found={found}
        onCollect={collect}
        onInteract={() => setInteracted(true)}
        hintRef={hintRef}
        color={mood.primary}
        gyro={gyro}
      />

      {/* weather + light, layered over the 3D world */}
      <div className="pointer-events-none absolute inset-0 opacity-80">
        <ParticleCanvas modes={weather} density={0.7} />
      </div>
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_45%,rgba(4,4,14,0.7)_100%)]" />
      <div className="grain pointer-events-none absolute inset-0" />

      {/* hint arrow toward the nearest hidden fragment (positioned by the scene) */}
      <div
        ref={hintRef}
        className="pointer-events-none absolute left-0 top-0 z-10 opacity-0 transition-opacity duration-500"
        style={{ color: mood.primary, filter: `drop-shadow(0 0 10px ${mood.glow})` }}
        aria-hidden="true"
      >
        <Navigation size={30} strokeWidth={1.6} className="rotate-90" fill="currentColor" fillOpacity={0.25} />
      </div>

      {/* top bar */}
      <div className="absolute inset-x-0 top-0 z-20 flex items-start justify-between gap-2 px-3 pt-[max(0.75rem,env(safe-area-inset-top))] sm:px-6 sm:pt-5">
        <button type="button" onClick={onExit} className="glass-btn inline-flex items-center gap-2 rounded-full px-3.5 py-2 text-sm text-parchment/85 hover:text-parchment">
          <ArrowLeft size={16} />
          <span className="hidden sm:inline">Return to World Map</span>
        </button>

        <div className="flex flex-col items-center gap-1.5 pt-0.5 text-center">
          <p className="font-serif text-lg italic leading-none text-parchment text-glow sm:text-2xl">{memory.title}</p>
        </div>

        <div className="flex items-center gap-1.5">
          {onDelete && (
            <button type="button" onClick={onDelete} className="glass-btn hidden rounded-full p-2.5 text-parchment/50 hover:text-rose-200 sm:block" aria-label="Release this memory" title="Release this memory">
              <Trash2 size={16} />
            </button>
          )}
          {canUseMotion && (
            <button type="button" onClick={enableMotion} aria-pressed={gyro} className="glass-btn rounded-full p-2.5 text-parchment/80" aria-label="Look around by moving your phone" style={gyro ? { borderColor: mood.primary, color: mood.primary } : undefined}>
              <Smartphone size={16} />
            </button>
          )}
          <button
            type="button"
            onClick={onToggleSound}
            aria-pressed={soundOn}
            className="glass-btn rounded-full p-2.5 text-parchment/80"
            aria-label={soundOn ? 'Turn soundscape off' : 'Turn soundscape on'}
            style={soundOn ? { borderColor: `${mood.primary}88`, color: mood.primary } : undefined}
          >
            {soundOn ? <Volume2 size={16} /> : <VolumeX size={16} />}
          </button>
        </div>
      </div>

      {/* fragment counter */}
      <div className="pointer-events-none absolute inset-x-0 top-[4.6rem] z-10 flex justify-center sm:top-24">
        <div className="glass-btn flex items-center gap-2 rounded-full px-3.5 py-1.5 text-xs text-parchment/85">
          <div className="flex gap-1">
            {parts.map((_, i) => (
              <motion.span
                key={i}
                className="h-2 w-2 rounded-full"
                animate={{ scale: found.has(i) ? [1, 1.8, 1] : 1, backgroundColor: found.has(i) ? mood.primary : 'rgba(243,233,215,0.2)' }}
                transition={{ duration: 0.6 }}
                style={found.has(i) ? { boxShadow: `0 0 8px ${mood.glow}` } : undefined}
              />
            ))}
          </div>
          <span>
            {done ? 'every fragment found' : `${found.size} / ${parts.length} memory fragments`}
          </span>
        </div>
      </div>

      {/* how to play */}
      <AnimatePresence>
        {!interacted && !progress && (
          <motion.div
            className="pointer-events-none absolute inset-x-0 top-1/2 z-10 flex -translate-y-1/2 justify-center px-6"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ delay: 1.6, duration: 0.8 }}
          >
            <div className="glass max-w-sm rounded-2xl px-5 py-4 text-center">
              <p className="font-serif text-xl italic text-parchment">You’re inside the memory.</p>
              <p className="mt-1.5 text-sm text-parchment/70">
                Drag to look around{canUseMotion ? '' : ', scroll to zoom, WASD to lean in'}. Find the {parts.length} glowing{' '}
                <span style={{ color: mood.primary }}>fragments</span> to recover your message.
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* depth model loading */}
      <AnimatePresence>
        {progress && (
          <motion.div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-midnight/80 px-8 text-center backdrop-blur-sm" initial={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 1 }}>
            <Sparkles size={26} style={{ color: mood.primary }} className="animate-pulse" />
            <p className="mt-4 font-serif text-2xl italic text-parchment text-glow">
              {progress.stage === 'thinking' ? 'Feeling out the shape of this memory…' : 'Waking the dream model…'}
            </p>
            {progress.stage !== 'thinking' && (
              <>
                <div className="mt-5 h-1 w-56 overflow-hidden rounded-full bg-white/10">
                  <div className="h-full rounded-full transition-[width] duration-300" style={{ width: `${Math.round(progress.value * 100)}%`, background: mood.primary }} />
                </div>
                <p className="mt-3 text-xs text-parchment/50">First visit only: downloading a small AI depth model (~27 MB).</p>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* AI world status */}
      {(panoPending || panoKind === 'ai') && (
        <div className="pointer-events-none absolute left-1/2 top-[7.1rem] z-10 -translate-x-1/2 sm:top-[8.4rem]">
          <p className="text-[10px] uppercase tracking-[0.25em] text-parchment/45">
            {panoKind === 'ai' ? '✦ world painted by AI' : '✦ AI is painting the world around you…'}
          </p>
        </div>
      )}

      {/* the letter, assembling as you find fragments */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 bg-gradient-to-t from-black/60 via-black/25 to-transparent px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-16">
        <div className="mx-auto max-w-2xl text-center">
          <AnimatePresence mode="wait">
            {latest ? (
              <motion.p
                key={latest}
                initial={{ opacity: 0, y: 12, filter: 'blur(6px)' }}
                animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.9 }}
                className="font-hand text-2xl leading-snug sm:text-3xl"
                style={{ color: '#fbe7c0', textShadow: `0 0 18px ${mood.glow}` }}
              >
                “{latest}”
              </motion.p>
            ) : (
              <motion.p key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="font-serif text-lg italic text-parchment/45">
                your message is scattered somewhere in this place…
              </motion.p>
            )}
          </AnimatePresence>
          {(done || completedBefore) && (
            <motion.button
              type="button"
              onClick={() => setLetterOpen(true)}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="pointer-events-auto mt-4 inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm text-parchment"
              style={{ borderColor: `${mood.primary}66`, background: `${mood.primary}1a` }}
            >
              <Mail size={15} style={{ color: mood.primary }} /> Read the whole letter
            </motion.button>
          )}
        </div>
      </div>

      {/* drift between memories */}
      {total > 1 && (
        <>
          <DriftButton side="left" onClick={onPrev} />
          <DriftButton side="right" onClick={onNext} />
        </>
      )}
      <span className="sr-only">Memory {index + 1} of {total}</span>

      {/* the complete letter */}
      <AnimatePresence>
        {letterOpen && <Letter memory={memory} mood={mood} onClose={() => setLetterOpen(false)} onExit={onExit} />}
      </AnimatePresence>
    </div>
  );
}

function Letter({ memory, mood, onClose, onExit }) {
  const words = memory.message.split(/\s+/);
  return (
    <motion.div className="absolute inset-0 z-40 flex items-center justify-center overflow-y-auto bg-midnight/60 p-5 backdrop-blur-md" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.8 }} role="dialog" aria-modal="true" aria-label="Your letter">
      <motion.div
        className="relative w-full max-w-xl rounded-3xl border px-7 py-9 text-center sm:px-12"
        style={{ borderColor: `${mood.primary}44`, background: `radial-gradient(120% 90% at 50% 0%, ${mood.glow}, transparent 60%), linear-gradient(180deg, ${mood.bg[1]}f2, ${mood.bg[0]}f7)`, boxShadow: `0 30px 90px -20px rgba(0,0,0,0.8), 0 0 80px -20px ${mood.glow}` }}
        initial={{ y: 30, scale: 0.96 }}
        animate={{ y: 0, scale: 1 }}
        transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
      >
        <p className="text-[10px] uppercase tracking-[0.35em]" style={{ color: mood.primary }}>a letter to your future self</p>
        <h2 className="mt-2 font-serif text-4xl italic text-parchment text-glow">{memory.title}</h2>
        <p className="mt-1 font-serif italic text-parchment/50">{formatMemoryDate(memory.createdAt)}</p>
        <div className="mt-6 font-hand text-[1.7rem] leading-[1.35] sm:text-3xl" style={{ color: '#fbe7c0', textShadow: `0 0 16px ${mood.glow}` }}>
          {words.map((w, i) => (
            <motion.span key={`${i}-${w}`} className="inline-block whitespace-pre" initial={{ opacity: 0, filter: 'blur(6px)' }} animate={{ opacity: 1, filter: 'blur(0px)' }} transition={{ delay: 0.5 + i * 0.05, duration: 0.8 }}>
              {w}{i < words.length - 1 ? ' ' : ''}
            </motion.span>
          ))}
        </div>
        <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
          <button type="button" onClick={onClose} className="rounded-full border border-gold/40 bg-gold/10 px-5 py-2.5 text-sm text-parchment hover:bg-gold/20">Keep exploring</button>
          <button type="button" onClick={onExit} className="rounded-full px-5 py-2.5 text-sm text-parchment/60 hover:text-parchment">Return to World Map</button>
        </div>
      </motion.div>
    </motion.div>
  );
}

function DriftButton({ side, onClick }) {
  const Icon = side === 'left' ? ChevronLeft : ChevronRight;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={side === 'left' ? 'Drift to previous memory' : 'Drift to next memory'}
      className={`glass-btn absolute bottom-[max(1.25rem,env(safe-area-inset-bottom))] z-20 rounded-full p-2.5 text-parchment/60 hover:text-parchment ${side === 'left' ? 'left-3 sm:left-6' : 'right-3 sm:right-6'}`}
    >
      <Icon size={20} />
    </button>
  );
}
