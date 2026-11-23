import { AnimatePresence, motion } from 'framer-motion';
import ParticleCanvas from './ParticleCanvas';
import { getMood } from '../data/moods';

/** The loading moment while a story or world is being set up. */
const STAGES = {
  dream: 'Dreaming up your world...',
  cast: 'Setting the scene...',
  room: 'Lighting the room...',
  places: 'Building the places...',
  scenes: 'Painting your scenes...',
  arrive: 'Writing your way in...',
};

export default function WeavingOverlay({ moodKey, preview, stage = 'cast' }) {
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
              className="vn-frame absolute inset-[22%] overflow-hidden rounded-3xl"
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

          <AnimatePresence mode="wait">
            <motion.p
              key={stage}
              className="relative mt-10 px-6 text-center font-display text-2xl font-semibold text-parchment sm:text-3xl"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.6, ease: 'easeOut' }}
            >
              {STAGES[stage] || STAGES.cast}
            </motion.p>
          </AnimatePresence>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
