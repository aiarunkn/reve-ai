import { AnimatePresence, motion } from 'framer-motion';
import ParticleCanvas from './ParticleCanvas';
import { getMood } from '../data/moods';

/** The brief, magical "weaving" moment while the memory image is painted. */
export default function WeavingOverlay({ moodKey, preview }) {
  const mood = moodKey ? getMood(moodKey) : null;
  return (
    <AnimatePresence>
      {mood && (
        <motion.div
          className="fixed inset-0 z-[60] flex flex-col items-center justify-center overflow-hidden bg-midnight"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, filter: 'blur(8px)' }}
          transition={{ duration: 0.6 }}
          role="status"
          aria-live="polite"
        >
          <div
            className="absolute inset-0"
            style={{ background: `radial-gradient(60% 50% at 50% 50%, ${mood.glow}, transparent 70%), linear-gradient(180deg, ${mood.bg[0]}, ${mood.bg[1]})` }}
          />
          <ParticleCanvas modes={[...mood.particles, 'fireflies']} className="absolute inset-0" />

          <div className="relative h-56 w-56 sm:h-64 sm:w-64">
            {/* threads of light spinning into a loom */}
            {[0, 1, 2].map((i) => (
              <motion.svg
                key={i}
                viewBox="0 0 200 200"
                className="absolute inset-0"
                animate={{ rotate: i % 2 ? -360 : 360 }}
                transition={{ duration: 6 + i * 2, repeat: Infinity, ease: 'linear' }}
              >
                <ellipse
                  cx="100"
                  cy="100"
                  rx={90 - i * 16}
                  ry={40 + i * 14}
                  fill="none"
                  stroke={i === 1 ? mood.secondary : mood.primary}
                  strokeOpacity={0.55 - i * 0.12}
                  strokeWidth="1.2"
                  strokeDasharray="2 7"
                  transform={`rotate(${i * 60} 100 100)`}
                />
              </motion.svg>
            ))}
            <motion.div
              className="absolute inset-[22%] overflow-hidden rounded-t-full border border-gold/60"
              initial={{ scale: 0.6, opacity: 0, filter: 'blur(12px)' }}
              animate={{ scale: 1, opacity: 1, filter: 'blur(0px)' }}
              transition={{ duration: 1.6, ease: [0.22, 1, 0.36, 1] }}
              style={{ boxShadow: `0 0 60px ${mood.glow}` }}
            >
              {preview && <img src={preview} alt="" className="h-full w-full object-cover opacity-90 saturate-50" />}
              <motion.div
                className="absolute inset-0"
                style={{ background: `linear-gradient(180deg, transparent, ${mood.primary}66, transparent)` }}
                animate={{ y: ['-100%', '100%'] }}
                transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }}
              />
            </motion.div>
          </div>

          <motion.p
            className="relative mt-10 px-6 text-center font-serif text-2xl italic text-parchment text-glow sm:text-3xl"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: [0, 1, 0.7, 1], y: 0 }}
            transition={{ duration: 2, ease: 'easeOut' }}
          >
            Weaving your memory into the world...
          </motion.p>
          <p className="relative mt-3 text-xs uppercase tracking-[0.3em]" style={{ color: mood.primary }}>
            {mood.label} · {mood.weather}
          </p>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
