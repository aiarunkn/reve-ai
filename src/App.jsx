import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import WorldMap from './components/WorldMap';
import MemoryRoom from './components/MemoryRoom';
import PlantSeedModal from './components/PlantSeedModal';
import WeavingOverlay from './components/WeavingOverlay';
import { SEED_MEMORIES } from './data/seedMemories';
import { loadMemories, saveMemories } from './services/storage';
import { generateMemoryImage } from './services/memoryGenerator';
import { ambient } from './services/ambientAudio';
import { useHashRoute } from './hooks/useHashRoute';

const WEAVE_MIN_MS = 2000;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

export default function App() {
  const [userMemories, setUserMemories] = useState(loadMemories);
  const memories = useMemo(() => [...SEED_MEMORIES, ...userMemories], [userMemories]);
  const [route, go] = useHashRoute();
  const [planting, setPlanting] = useState(false);
  const [weaving, setWeaving] = useState(null); // { mood, preview }
  const [soundOn, setSoundOn] = useState(false);
  const [toast, setToast] = useState('');
  const mapScroll = useRef(0);

  const roomIndex = route.view === 'room' ? memories.findIndex((m) => m.id === route.id) : -1;
  const room = roomIndex >= 0 ? memories[roomIndex] : null;

  // unknown room id in the URL → back to the map
  useEffect(() => {
    if (route.view === 'room' && !room) go({ view: 'map' }, { replace: true });
  }, [route, room, go]);

  // soundscape follows the room you're in
  useEffect(() => {
    if (room && soundOn) ambient.play(room.mood);
    else ambient.stop();
  }, [room?.id, room?.mood, soundOn]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(''), 5000);
    return () => clearTimeout(t);
  }, [toast]);

  const enterRoom = useCallback(
    (m) => {
      if (route.view === 'map') mapScroll.current = window.scrollY;
      go({ view: 'room', id: m.id });
    },
    [go, route.view]
  );

  const drift = useCallback(
    (dir) => {
      if (roomIndex < 0) return;
      const next = memories[(roomIndex + dir + memories.length) % memories.length];
      go({ view: 'room', id: next.id }, { replace: true });
    },
    [roomIndex, memories, go]
  );
  const prev = useCallback(() => drift(-1), [drift]);
  const next = useCallback(() => drift(1), [drift]);
  const exit = useCallback(() => go({ view: 'map' }), [go]);

  const plant = async ({ file, mood, message, title }) => {
    const preview = URL.createObjectURL(file);
    setPlanting(false);
    setWeaving({ mood, preview });
    try {
      const onFallback = (err) =>
        setToast(`The AI painter couldn’t be reached (${err.message}) — painted by hand instead.`);
      const [image] = await Promise.all([generateMemoryImage(file, mood, { onFallback }), wait(WEAVE_MIN_MS)]);
      const memory = {
        id: `mem-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
        title,
        message,
        mood,
        image,
        createdAt: new Date().toISOString(),
      };
      const nextList = [...userMemories, memory];
      if (!saveMemories(nextList)) {
        setToast('Your browser’s storage is full — this memory will glow for this visit only.');
      }
      setUserMemories(nextList);
      mapScroll.current = 0;
      go({ view: 'room', id: memory.id });
    } catch (err) {
      console.error(err);
      setToast(err?.message || 'Something went wrong while weaving that memory.');
    } finally {
      setWeaving(null);
      URL.revokeObjectURL(preview);
    }
  };

  const release = () => {
    if (!room || room.seed) return;
    if (!window.confirm(`Release “${room.title}” from your sanctuary? This can’t be undone.`)) return;
    const nextList = userMemories.filter((m) => m.id !== room.id);
    saveMemories(nextList);
    setUserMemories(nextList);
    go({ view: 'map' }, { replace: true });
  };

  return (
    <>
      <AnimatePresence mode="wait">
        {room ? (
          <motion.div
            key={room.id}
            initial={{ opacity: 0, filter: 'blur(10px)' }}
            animate={{ opacity: 1, filter: 'blur(0px)' }}
            exit={{ opacity: 0, filter: 'blur(10px)' }}
            transition={{ duration: 0.8, ease: 'easeInOut' }}
            className="fixed inset-0"
          >
            <MemoryRoom
              memory={room}
              index={roomIndex}
              total={memories.length}
              onPrev={prev}
              onNext={next}
              onExit={exit}
              onDelete={room.seed ? null : release}
              soundOn={soundOn}
              onToggleSound={() => setSoundOn((s) => !s)}
            />
          </motion.div>
        ) : (
          <motion.div
            key="map"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, filter: 'blur(8px)' }}
            transition={{ duration: 0.8, ease: 'easeInOut' }}
          >
            <WorldMap
              memories={memories}
              onEnter={enterRoom}
              onPlant={() => setPlanting(true)}
              restoreScroll={mapScroll.current}
            />
          </motion.div>
        )}
      </AnimatePresence>

      <PlantSeedModal open={planting} onClose={() => setPlanting(false)} onSubmit={plant} />
      <WeavingOverlay moodKey={weaving?.mood} preview={weaving?.preview} />

      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="glass fixed bottom-6 left-1/2 z-[70] w-[min(92vw,28rem)] -translate-x-1/2 rounded-2xl px-5 py-3 text-center text-sm text-parchment/85"
            role="status"
          >
            {toast}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
