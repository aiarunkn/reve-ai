import { useRef, useState } from 'react';
import { motion } from 'framer-motion';
import Island from './Island';
import { getMood } from '../data/moods';
import { useMemoryImage, formatMemoryDate } from '../hooks/useMemoryImage';

/** A glowing arched window floating on its own island. Tilts toward the cursor (parallax). */
export default function MemoryPortal({ memory, index, onEnter }) {
  const mood = getMood(memory.mood);
  const src = useMemoryImage(memory);
  const ref = useRef(null);
  const [tilt, setTilt] = useState({ x: 0, y: 0 });
  const Icon = mood.icon;

  const onMove = (e) => {
    const r = ref.current.getBoundingClientRect();
    setTilt({ x: (e.clientX - r.left) / r.width - 0.5, y: (e.clientY - r.top) / r.height - 0.5 });
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 40 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 1.1, delay: 0.25 + index * 0.14, ease: [0.22, 1, 0.36, 1] }}
      className="flex flex-col items-center"
    >
      <motion.div
        animate={{ y: [0, -12, 0] }}
        transition={{ duration: 6.5 + (index % 3), repeat: Infinity, ease: 'easeInOut', delay: index * 0.8 }}
        className="flex flex-col items-center"
      >
        <button
          ref={ref}
          type="button"
          onClick={() => onEnter(memory)}
          onMouseMove={onMove}
          onMouseLeave={() => setTilt({ x: 0, y: 0 })}
          className="group relative cursor-pointer rounded-t-full outline-none focus-visible:ring-2 focus-visible:ring-lantern/70"
          style={{ perspective: 900 }}
          aria-label={`Enter memory: ${memory.title}`}
        >
          {/* halo */}
          <div
            className="animate-glow-pulse absolute -inset-8 rounded-t-full blur-2xl transition-opacity duration-700 group-hover:opacity-100"
            style={{ background: `radial-gradient(closest-side, ${mood.glow}, transparent)` }}
          />
          <div
            className="relative h-56 w-40 transition-transform duration-300 ease-out sm:h-64 sm:w-48"
            style={{
              transform: `rotateX(${-tilt.y * 12}deg) rotateY(${tilt.x * 14}deg) translateZ(0)`,
              transformStyle: 'preserve-3d',
            }}
          >
            {/* arch frame */}
            <div
              className="absolute inset-0 overflow-hidden rounded-t-full border border-gold/60 bg-night"
              style={{
                boxShadow: `0 0 0 4px rgba(15,20,51,0.9), 0 0 0 5px rgba(217,179,108,0.35), 0 20px 50px -10px ${mood.glow}, inset 0 0 40px rgba(0,0,0,0.6)`,
              }}
            >
              {src ? (
                <img
                  src={src}
                  alt=""
                  draggable="false"
                  className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 ease-out group-hover:brightness-110"
                  style={{ transform: `translate(${-tilt.x * 16}px, ${-tilt.y * 16}px) scale(1.18)` }}
                />
              ) : (
                <div
                  className="absolute inset-0 animate-pulse"
                  style={{ background: `linear-gradient(180deg, ${mood.bg[0]}, ${mood.bg[2]})` }}
                />
              )}
              {/* window mullions */}
              <div className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-gold/25" />
              <div className="absolute inset-x-0 top-[58%] h-px bg-gold/25" />
              {/* glass sheen + inner light */}
              <div className="absolute inset-0 bg-gradient-to-br from-white/15 via-transparent to-transparent opacity-60 transition-opacity group-hover:opacity-90" />
              <div
                className="absolute inset-0 mix-blend-soft-light"
                style={{ background: `radial-gradient(circle at 50% 85%, ${mood.primary}55, transparent 70%)` }}
              />
            </div>
            {/* keystone */}
            <div className="absolute -top-1.5 left-1/2 h-3 w-3 -translate-x-1/2 rotate-45 border border-gold/70 bg-night" />
          </div>
        </button>

        <Island glow={mood.primary} variant={index} className="-mt-3 w-52 sm:w-60" />
      </motion.div>

      <div className="mt-1 max-w-[16rem] text-center">
        <h3 className="font-serif text-2xl leading-tight text-parchment text-glow sm:text-[1.65rem]">{memory.title}</h3>
        <p className="mt-1.5 flex items-center justify-center gap-1.5 text-[11px] uppercase tracking-[0.2em] text-parchment/55">
          <Icon size={12} style={{ color: mood.primary }} />
          <span style={{ color: mood.primary }}>{mood.label}</span>
          <span className="text-parchment/30">·</span>
          <span>{formatMemoryDate(memory.createdAt)}</span>
        </p>
      </div>
    </motion.div>
  );
}
