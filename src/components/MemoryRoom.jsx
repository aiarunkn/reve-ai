import { useEffect, useRef } from 'react';
import { motion, useMotionValue, useSpring, useTransform } from 'framer-motion';
import { ArrowLeft, ChevronLeft, ChevronRight, Volume2, VolumeX, Trash2 } from 'lucide-react';
import ParticleCanvas from './ParticleCanvas';
import { getMood } from '../data/moods';
import { useMemoryImage, formatMemoryDate } from '../hooks/useMemoryImage';

export default function MemoryRoom({ memory, index, total, onPrev, onNext, onExit, onDelete, soundOn, onToggleSound }) {
  const mood = getMood(memory.mood);
  const src = useMemoryImage(memory);
  const Icon = mood.icon;
  const weather = memory.weather || mood.particles;

  // pointer parallax
  const mx = useMotionValue(0);
  const my = useMotionValue(0);
  const sx = useSpring(mx, { stiffness: 50, damping: 18 });
  const sy = useSpring(my, { stiffness: 50, damping: 18 });
  const bgX = useTransform(sx, (v) => v * -30);
  const bgY = useTransform(sy, (v) => v * -20);
  const frameX = useTransform(sx, (v) => v * 14);
  const frameY = useTransform(sy, (v) => v * 10);
  const rotY = useTransform(sx, (v) => v * 6);
  const rotX = useTransform(sy, (v) => v * -5);
  const textX = useTransform(sx, (v) => v * 22);

  const onPointerMove = (e) => {
    if (e.pointerType !== 'mouse') return;
    mx.set(e.clientX / window.innerWidth - 0.5);
    my.set(e.clientY / window.innerHeight - 0.5);
  };

  // keyboard navigation
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'ArrowLeft') onPrev();
      else if (e.key === 'ArrowRight') onNext();
      else if (e.key === 'Escape') onExit();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onPrev, onNext, onExit]);

  // swipe navigation
  const touch = useRef(null);
  const onTouchStart = (e) => { touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }; };
  const onTouchEnd = (e) => {
    if (!touch.current) return;
    const dx = e.changedTouches[0].clientX - touch.current.x;
    const dy = e.changedTouches[0].clientY - touch.current.y;
    touch.current = null;
    if (Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy) * 1.5) (dx > 0 ? onPrev : onNext)();
  };

  const words = memory.message.split(/\s+/);

  return (
    <div
      className="fixed inset-0 overflow-hidden"
      style={{ background: mood.bg[0] }}
      onPointerMove={onPointerMove}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      {/* painterly ambient backdrop: the memory itself, dissolved into light */}
      <motion.div className="absolute -inset-16" style={{ x: bgX, y: bgY }}>
        {src && (
          <motion.img
            src={src}
            alt=""
            initial={{ opacity: 0, scale: 1.15 }}
            animate={{ opacity: 0.55, scale: 1.05 }}
            transition={{ duration: 2.4, ease: 'easeOut' }}
            className="h-full w-full object-cover"
            style={{ filter: 'blur(26px) saturate(1.25)' }}
          />
        )}
      </motion.div>
      <div
        className="absolute inset-0"
        style={{
          background: `linear-gradient(180deg, ${mood.bg[0]}cc 0%, ${mood.bg[1]}88 45%, ${mood.bg[2]}bb 100%)`,
        }}
      />
      <div className="absolute inset-0" style={{ background: `radial-gradient(55% 45% at 50% 48%, ${mood.glow}, transparent 75%)`, opacity: 0.55 }} />

      {/* weather */}
      <div className="absolute inset-0">
        <ParticleCanvas modes={weather} />
      </div>

      {/* vignette + grain */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_35%,rgba(4,4,14,0.78)_100%)]" />
      <div className="grain pointer-events-none absolute inset-0" />

      {/* top bar */}
      <div className="absolute inset-x-0 top-0 z-20 flex items-center justify-between gap-3 px-4 pt-[max(1rem,env(safe-area-inset-top))] sm:px-8 sm:pt-6">
        <button
          type="button"
          onClick={onExit}
          className="glass-btn inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm text-parchment/85 hover:text-parchment"
        >
          <ArrowLeft size={16} />
          <span className="hidden sm:inline">Return to World Map</span>
          <span className="sm:hidden">World Map</span>
        </button>
        <div className="flex items-center gap-2">
          {onDelete && (
            <button
              type="button"
              onClick={onDelete}
              className="glass-btn rounded-full p-2.5 text-parchment/50 hover:text-rose-200"
              aria-label="Release this memory"
              title="Release this memory"
            >
              <Trash2 size={16} />
            </button>
          )}
          <button
            type="button"
            onClick={onToggleSound}
            className="glass-btn inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm text-parchment/85 hover:text-parchment"
            aria-pressed={soundOn}
            style={soundOn ? { borderColor: `${mood.primary}88`, boxShadow: `0 0 24px -6px ${mood.glow}` } : undefined}
          >
            {soundOn ? <Volume2 size={16} style={{ color: mood.primary }} /> : <VolumeX size={16} />}
            <span className="hidden sm:inline">{soundOn ? 'Soundscape on' : 'Soundscape off'}</span>
            {soundOn && <SoundBars color={mood.primary} />}
          </button>
        </div>
      </div>

      {/* the room */}
      <div className="relative z-10 h-full overflow-y-auto">
        <div className="mx-auto flex min-h-full max-w-6xl flex-col items-center justify-center gap-10 px-6 pb-24 pt-24 lg:flex-row lg:gap-16 lg:px-20">
          {/* the photo, framed like a glowing window / artifact */}
          <motion.div
            className="relative shrink-0"
            style={{ x: frameX, y: frameY, rotateX: rotX, rotateY: rotY, transformPerspective: 1000 }}
            initial={{ opacity: 0, scale: 0.92, filter: 'blur(10px)' }}
            animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
            transition={{ duration: 1.6, ease: [0.22, 1, 0.36, 1] }}
          >
            <div
              className="animate-glow-pulse absolute -inset-10 rounded-[48%] blur-3xl"
              style={{ background: `radial-gradient(closest-side, ${mood.glow}, transparent)` }}
            />
            <div
              className="relative rounded-t-[999px] p-2.5"
              style={{
                background: 'linear-gradient(160deg, #e9cf94, #9c7238 45%, #d9b36c 70%, #6b4a20)',
                boxShadow: `0 30px 80px -20px rgba(0,0,0,0.8), 0 0 70px -10px ${mood.glow}`,
              }}
            >
              <div
                className="relative overflow-hidden rounded-t-[999px] bg-night"
                style={{ height: 'clamp(320px, 58vh, 560px)', aspectRatio: '4 / 5', maxWidth: '78vw' }}
              >
                {src ? (
                  <img src={src} alt={memory.title} className="h-full w-full object-cover" draggable="false" />
                ) : (
                  <div className="h-full w-full animate-pulse" style={{ background: `linear-gradient(180deg, ${mood.bg[1]}, ${mood.bg[2]})` }} />
                )}
                <div className="absolute inset-0 bg-gradient-to-br from-white/20 via-transparent to-transparent" />
                <div className="absolute inset-0 shadow-[inset_0_0_60px_rgba(0,0,0,0.65)]" />
                <div className="absolute inset-0 mix-blend-soft-light" style={{ background: `radial-gradient(circle at 50% 100%, ${mood.primary}66, transparent 65%)` }} />
                <div className="absolute inset-y-0 left-1/2 w-[2px] -translate-x-1/2 bg-[#c9a35e]/35" />
                <div className="absolute inset-x-0 top-[55%] h-[2px] bg-[#c9a35e]/35" />
              </div>
            </div>
            {/* little lantern sill */}
            <div className="mx-auto -mt-px h-3 w-[86%] rounded-b-lg bg-gradient-to-b from-[#9c7238] to-[#3a2a14] shadow-lg" />
          </motion.div>

          {/* inscription */}
          <motion.div className="max-w-xl text-center lg:text-left" style={{ x: textX }}>
            <motion.p
              className="mb-4 inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[11px] uppercase tracking-[0.25em]"
              style={{ color: mood.primary, borderColor: `${mood.primary}44`, background: `${mood.primary}12` }}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.6, duration: 0.8 }}
            >
              <Icon size={12} /> {mood.label}
            </motion.p>
            <motion.h1
              className="font-serif text-4xl font-medium italic leading-tight text-parchment text-glow sm:text-5xl"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.8, duration: 1 }}
            >
              {memory.title}
            </motion.h1>
            <motion.p
              className="mt-2 font-serif text-base italic text-parchment/50"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 1, duration: 1 }}
            >
              {formatMemoryDate(memory.createdAt)}
            </motion.p>

            <motion.div
              className="mt-7 font-hand text-[1.75rem] leading-[1.35] sm:text-[2.1rem]"
              style={{ color: '#fbe7c0', textShadow: `0 0 18px ${mood.glow}, 0 0 2px rgba(255,240,210,0.7)` }}
              animate={{ y: [0, -6, 0] }}
              transition={{ duration: 7, repeat: Infinity, ease: 'easeInOut' }}
            >
              {words.map((w, i) => (
                <motion.span
                  key={`${i}-${w}`}
                  className="inline-block whitespace-pre"
                  initial={{ opacity: 0, filter: 'blur(6px)', y: 6 }}
                  animate={{ opacity: 1, filter: 'blur(0px)', y: 0 }}
                  transition={{ delay: 1.2 + i * 0.06, duration: 0.9, ease: 'easeOut' }}
                >
                  {w}{i < words.length - 1 ? ' ' : ''}
                </motion.span>
              ))}
            </motion.div>
            <motion.div
              className="mx-auto mt-6 h-px w-24 lg:mx-0"
              style={{ background: `linear-gradient(90deg, transparent, ${mood.primary}, transparent)` }}
              initial={{ scaleX: 0 }}
              animate={{ scaleX: 1 }}
              transition={{ delay: 1.6 + words.length * 0.06, duration: 1.2 }}
            />
          </motion.div>
        </div>
      </div>

      {/* drift between rooms */}
      {total > 1 && (
        <>
          <DriftArrow side="left" onClick={onPrev} />
          <DriftArrow side="right" onClick={onNext} />
          <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[15] h-20 bg-gradient-to-t from-black/50 to-transparent lg:hidden" />
          <div className="pointer-events-none absolute inset-x-0 bottom-[max(1.25rem,env(safe-area-inset-bottom))] z-20 flex justify-center gap-2">
            {Array.from({ length: total }, (_, i) => (
              <span
                key={i}
                className="h-1.5 rounded-full transition-all duration-500"
                style={{ width: i === index ? 22 : 6, background: i === index ? mood.primary : 'rgba(243,233,215,0.25)' }}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function DriftArrow({ side, onClick }) {
  const Icon = side === 'left' ? ChevronLeft : ChevronRight;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={side === 'left' ? 'Drift to previous memory' : 'Drift to next memory'}
      className={`group absolute top-1/2 z-20 hidden -translate-y-1/2 rounded-full p-3 text-parchment/40 transition-all duration-500 hover:text-parchment sm:block ${
        side === 'left' ? 'left-3 hover:-translate-x-1 lg:left-6' : 'right-3 hover:translate-x-1 lg:right-6'
      }`}
    >
      <span className="absolute inset-0 rounded-full bg-white/0 transition-colors duration-500 group-hover:bg-white/5" />
      <Icon size={34} strokeWidth={1} />
    </button>
  );
}

function SoundBars({ color }) {
  return (
    <span className="flex h-3 items-end gap-[2px]" aria-hidden="true">
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="w-[2px] rounded-full"
          style={{ background: color }}
          animate={{ height: ['30%', '100%', '45%', '80%', '30%'] }}
          transition={{ duration: 1.6 + i * 0.3, repeat: Infinity, ease: 'easeInOut', delay: i * 0.2 }}
        />
      ))}
    </span>
  );
}
