import { motion } from 'framer-motion';
import { Users } from 'lucide-react';
import { getMood } from '../data/moods';

/**
 * A story as a book cover: the place behind, the first character in front, the title in gold.
 * Visual-novel library style.
 */
export default function StoryCover({ story, cover, index, onOpen }) {
  const mood = getMood(story.mood);
  const others = (story.players || []).length - 1;
  return (
    <motion.button
      type="button"
      onClick={onOpen}
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.7, delay: 0.1 + index * 0.08, ease: [0.22, 1, 0.36, 1] }}
      whileHover={{ y: -6 }}
      className="vn-frame group relative block aspect-[2/3] w-full overflow-hidden rounded-2xl text-left shadow-[0_24px_50px_-18px_rgba(176,92,255,0.65)] outline-none focus-visible:ring-2 focus-visible:ring-champagne"
      aria-label={`Open ${story.title}`}
    >
      {/* the place */}
      {cover?.bg ? (
        <img src={cover.bg} alt="" draggable="false" className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 group-hover:scale-105" />
      ) : (
        <div className="absolute inset-0" style={{ background: `radial-gradient(80% 60% at 50% 30%, ${mood.primary}66, transparent), linear-gradient(180deg, ${mood.bg[1]}, #2a0f3d)` }} />
      )}
      {/* the first character, standing in front */}
      {cover?.figure && (
        <img
          src={cover.figure}
          alt=""
          draggable="false"
          className="absolute bottom-0 left-1/2 h-[88%] w-auto max-w-none -translate-x-1/2 object-contain transition-transform duration-700 group-hover:scale-[1.03]"
          style={{ maskImage: 'linear-gradient(180deg, #000 70%, transparent)', WebkitMaskImage: 'linear-gradient(180deg, #000 70%, transparent)' }}
        />
      )}
      <div className="absolute inset-0 bg-gradient-to-b from-plum/40 via-transparent to-plum" />

      {/* chapter ribbon */}
      <span className="absolute left-0 top-4 rounded-r-full bg-gradient-to-r from-rose to-orchid py-1 pl-3 pr-4 text-xs font-semibold text-white shadow-lg">
        Chapter {story.chapter || 1}
      </span>
      {others > 0 && (
        <span className="absolute right-3 top-4 inline-flex items-center gap-1 rounded-full bg-black/50 px-2 py-1 text-xs text-white/90 backdrop-blur">
          <Users size={12} /> {others + 1}
        </span>
      )}

      <div className="absolute inset-x-0 bottom-0 p-4 text-center">
        <h3 className="vn-title text-xl font-bold leading-tight sm:text-2xl">{story.title}</h3>
        {story.tagline && <p className="mx-auto mt-1.5 line-clamp-2 max-w-[15rem] text-xs leading-snug text-white/75">{story.tagline}</p>}
        <span className="vn-choice mt-3 inline-block rounded-full px-5 py-1.5 text-sm font-semibold">Continue</span>
      </div>
    </motion.button>
  );
}
