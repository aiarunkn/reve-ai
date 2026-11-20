import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import WorldMap from './components/WorldMap';
import PlantSeedModal from './components/PlantSeedModal';
import CreateWorldModal from './components/CreateWorldModal';
import CreateStoryModal from './components/CreateStoryModal';
import WeavingOverlay from './components/WeavingOverlay';
import { SEED_MEMORIES } from './data/seedMemories';
import { loadMemories, saveMemories } from './services/storage';
import { generateMemoryImage } from './services/memoryGenerator';
import { ambient } from './services/ambientAudio';
import { estimateDepth, drawFit, loadImage } from './services/depthEstimator';
import { loadWorlds, saveWorlds, newMemory, saveScene, deleteWorldAssets } from './services/worldStore';
import { dreamWorld, sleepingBible, NotConfiguredError } from './services/reveClient';
import { loadStoryIndex, saveStory, deleteStory, savePlaceImage, storyFromBible } from './services/storyStore';
import { beginStory } from './services/storyClient';
import { paintPanorama, startAIPanorama, waitForAIPanorama } from './services/panoramaService';
import { putAsset, deleteAssets, emitAsset } from './services/assetStore';
import { useHashRoute } from './hooks/useHashRoute';

// the 3D room (three.js) only downloads when you first step inside a memory
const MemoryRoom = lazy(() => import('./components/MemoryRoom'));
const WorldView = lazy(() => import('./components/WorldView'));
const StoryView = lazy(() => import('./components/StoryView'));

const WEAVE_MIN_MS = 2000;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const newId = (prefix) => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

/** A photo as a modest JPEG data URL, small enough to send to the world-builder. */
async function photoForAI(file) {
  return drawFit(await loadImage(file), 1024).toDataURL('image/jpeg', 0.85);
}

// AI panoramas take a minute or two, so they're painted in the background and
// resumed after a reload (the job id is saved on the memory).
const runningJobs = new Set();
function trackPanorama(memoryId, jobId, updateMemory, notify) {
  if (runningJobs.has(memoryId)) return;
  runningJobs.add(memoryId);
  waitForAIPanorama(jobId)
    .then(async (blob) => {
      await putAsset(memoryId, 'pano', blob);
      emitAsset(memoryId, 'pano');
      updateMemory(memoryId, { panoJob: null });
      notify('✦ The AI finished painting the world around one of your memories.');
    })
    .catch((err) => {
      console.warn('[panorama]', err);
      updateMemory(memoryId, { panoJob: null });
      notify(`The AI couldn’t paint the 360° world (${err.message}). The hand-painted one stays.`);
    })
    .finally(() => runningJobs.delete(memoryId));
}

export default function App() {
  const [userMemories, setUserMemories] = useState(loadMemories);
  const memories = useMemo(() => [...SEED_MEMORIES, ...userMemories], [userMemories]);
  const [route, go] = useHashRoute();
  const [planting, setPlanting] = useState(false);
  const [imagining, setImagining] = useState(false);
  const [worlds, setWorlds] = useState(loadWorlds);
  const [stories, setStories] = useState(loadStoryIndex);
  const [beginning, setBeginning] = useState(false);
  const [weaving, setWeaving] = useState(null); // { mood, preview, stage, progress }
  const [soundOn, setSoundOn] = useState(false);
  const [toast, setToast] = useState('');
  const mapScroll = useRef(0);

  const roomIndex = route.view === 'room' ? memories.findIndex((m) => m.id === route.id) : -1;
  const room = roomIndex >= 0 ? memories[roomIndex] : null;
  const world = route.view === 'world' ? worlds.find((w) => w.id === route.id) || null : null;
  const storyEntry = route.view === 'story' ? stories.find((s) => s.id === route.id) || null : null;

  // unknown room or world id in the URL → back to the map
  useEffect(() => {
    if ((route.view === 'room' && !room) || (route.view === 'world' && !world) || (route.view === 'story' && !storyEntry)) go({ view: 'map' }, { replace: true });
  }, [route, room, world, storyEntry, go]);

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

  const updateMemory = useCallback((id, patch) => {
    setUserMemories((list) => {
      const next = list.map((m) => (m.id === id ? { ...m, ...patch } : m));
      saveMemories(next);
      return next;
    });
  }, []);

  const updateWorld = useCallback((id, fn) => {
    setWorlds((list) => {
      const next = list.map((w) => (w.id === id ? fn(w) : w));
      saveWorlds(next);
      return next;
    });
  }, []);

  // resume AI panoramas that were still painting when the page was closed
  useEffect(() => {
    userMemories.forEach((m) => m.panoJob && trackPanorama(m.id, m.panoJob, updateMemory, setToast));
  }, [userMemories, updateMemory]);

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
    const id = `mem-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    setPlanting(false);
    setWeaving({ mood, preview, stage: 'paint' });
    try {
      const onFallback = (err) =>
        setToast(`The AI painter couldn’t be reached (${err.message}) — painted by hand instead.`);
      const [image] = await Promise.all([generateMemoryImage(file, mood, { onFallback }), wait(WEAVE_MIN_MS)]);

      // AI depth: turns the flat photo into a 3D place you can stand in
      setWeaving((w) => ({ ...w, stage: 'depth', progress: 0 }));
      const depth = await estimateDepth(file, (value, stage) =>
        setWeaving((w) => w && { ...w, stage: stage === 'thinking' ? 'depth-think' : 'depth', progress: value })
      );
      await putAsset(id, 'depth', depth);

      // a hand-painted 360° world right away; the AI one (if configured) replaces it later
      setWeaving((w) => ({ ...w, stage: 'world' }));
      await putAsset(id, 'pano-local-v2', await paintPanorama(image, mood));
      const job = await startAIPanorama(file, mood, title);

      const memory = { id, title, message, mood, image, createdAt: new Date().toISOString(), panoJob: job?.jobId ?? null };
      setUserMemories((list) => {
        const next = [...list, memory];
        if (!saveMemories(next)) setToast('Your browser’s storage is full — this memory will glow for this visit only.');
        return next;
      });
      mapScroll.current = 0;
      go({ view: 'room', id });
    } catch (err) {
      console.error(err);
      setToast(err?.message || 'Something went wrong while weaving that memory.');
    } finally {
      setWeaving(null);
      URL.revokeObjectURL(preview);
    }
  };

  // five photos + a description -> a world bible from Claude -> painted scenes -> step inside
  const imagine = async ({ files, description }) => {
    const preview = URL.createObjectURL(files[0]);
    const id = newId('world');
    setImagining(false);
    setWeaving({ mood: 'weightless', preview, stage: 'dream' });
    try {
      let bible;
      try {
        const [dreamt] = await Promise.all([dreamWorld(await Promise.all(files.map(photoForAI)), description), wait(WEAVE_MIN_MS)]);
        bible = dreamt;
      } catch (err) {
        if (!(err instanceof NotConfiguredError)) throw err;
        bible = sleepingBible(description, files.length);
        setToast('Your world is painted, but its inhabitant is asleep until an Anthropic API key is added.');
      }
      // exactly one scene per photo, whatever came back
      bible.scenes = files.map((_, i) => {
        const s = bible.scenes.find((x) => x.photo_index === i) || bible.scenes[i] || {};
        return { photo_index: i, name: s.name || `Place ${i + 1}`, description: s.description || '' };
      });

      setWeaving((w) => ({ ...w, mood: bible.mood, stage: 'scenes' }));
      for (let i = 0; i < files.length; i++) {
        await saveScene(id, i, await generateMemoryImage(files[i], bible.mood));
      }

      const created = { id, createdAt: new Date().toISOString(), description, bible, memory: newMemory(), messages: [], stories: [], unreflected: 0 };
      setWorlds((list) => {
        const next = [...list, created];
        if (!saveWorlds(next)) setToast('Your browser’s storage is full — this world may not be saved.');
        return next;
      });
      mapScroll.current = 0;
      go({ view: 'world', id });
    } catch (err) {
      console.error(err);
      setToast(err?.message || 'Something went wrong while imagining that world.');
    } finally {
      setWeaving(null);
      URL.revokeObjectURL(preview);
    }
  };

  // a premise + who you are (+ a friend) + optional photos -> the narrator's bible -> painted places -> chapter one
  const beginNewStory = async ({ premise, players, files }) => {
    const preview = files[0] ? URL.createObjectURL(files[0]) : null;
    const id = newId('story');
    setBeginning(false);
    setWeaving({ mood: 'nostalgic', preview, stage: 'cast' });
    try {
      const photos = await Promise.all(files.map(photoForAI));
      const [bible] = await Promise.all([beginStory({ premise, players, photos }), wait(WEAVE_MIN_MS)]);
      // every photo becomes exactly one place
      files.forEach((_, i) => {
        if (!bible.places.some((p) => p.photo_index === i)) bible.places.push({ name: `Place ${bible.places.length + 1}`, description: '', photo_index: i });
      });
      setWeaving((w) => ({ ...w, mood: bible.mood, stage: 'places' }));
      for (let i = 0; i < bible.places.length; i++) {
        const pi = bible.places[i].photo_index;
        if (pi >= 0 && files[pi]) await savePlaceImage(id, i, await generateMemoryImage(files[pi], bible.mood));
      }
      await saveStory(storyFromBible(id, { premise, players, bible }));
      setStories(loadStoryIndex());
      mapScroll.current = 0;
      go({ view: 'story', id });
    } catch (err) {
      console.error(err);
      setToast(err instanceof NotConfiguredError
        ? 'Stories need a narrator: add ANTHROPIC_API_KEY on the server (Vercel → Settings → Environment Variables), then redeploy.'
        : err?.message || 'Something went wrong while beginning that story.');
    } finally {
      setWeaving(null);
      if (preview) URL.revokeObjectURL(preview);
    }
  };

  const removeStory = async () => {
    if (!storyEntry) return;
    if (!window.confirm(`Close “${storyEntry.title}” forever? Every chapter, choice and place will be gone.`)) return;
    await deleteStory(storyEntry.id);
    setStories(loadStoryIndex());
    go({ view: 'map' }, { replace: true });
  };

  const deleteWorld = () => {
    if (!world) return;
    if (!window.confirm(`Let “${world.bible.world_name}” fade away? Its scenes, conversations and stories will be gone for good.`)) return;
    setWorlds((list) => {
      const next = list.filter((w) => w.id !== world.id);
      saveWorlds(next);
      return next;
    });
    deleteWorldAssets(world.id);
    go({ view: 'map' }, { replace: true });
  };

  const release = () => {
    if (!room || room.seed) return;
    if (!window.confirm(`Release “${room.title}” from your sanctuary? This can’t be undone.`)) return;
    const nextList = userMemories.filter((m) => m.id !== room.id);
    saveMemories(nextList);
    setUserMemories(nextList);
    deleteAssets(room.id);
    go({ view: 'map' }, { replace: true });
  };

  return (
    <>
      <AnimatePresence mode="wait">
        {storyEntry ? (
          <motion.div key={storyEntry.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, filter: 'blur(10px)' }} transition={{ duration: 0.8 }} className="fixed inset-0">
            <Suspense fallback={<div className="fixed inset-0 bg-midnight" />}>
              <StoryView storyId={storyEntry.id} onExit={() => { setStories(loadStoryIndex()); exit(); }} onDelete={removeStory} notify={setToast} />
            </Suspense>
          </motion.div>
        ) : world ? (
          <motion.div
            key={world.id}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, filter: 'blur(10px)' }}
            transition={{ duration: 0.8, ease: 'easeInOut' }}
            className="fixed inset-0"
          >
            <Suspense fallback={<div className="fixed inset-0 bg-midnight" />}>
              <WorldView world={world} onUpdate={updateWorld} onExit={exit} onDelete={deleteWorld} notify={setToast} />
            </Suspense>
          </motion.div>
        ) : room ? (
          <motion.div
            key={room.id}
            initial={{ opacity: 0, filter: 'blur(10px)' }}
            animate={{ opacity: 1, filter: 'blur(0px)' }}
            exit={{ opacity: 0, filter: 'blur(10px)' }}
            transition={{ duration: 0.8, ease: 'easeInOut' }}
            className="fixed inset-0"
          >
            <Suspense fallback={<div className="fixed inset-0 bg-midnight" />}>
            <MemoryRoom
              memory={room}
              index={roomIndex}
              total={memories.length}
              onPrev={prev}
              onNext={next}
              onExit={exit}
              onDelete={room.seed ? null : release}
              soundOn={soundOn}
              panoPending={!!room.panoJob}
              onToggleSound={() => setSoundOn((s) => !s)}
            />
            </Suspense>
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
              worlds={worlds}
              stories={stories}
              onEnterStory={(id) => { mapScroll.current = window.scrollY; go({ view: 'story', id }); }}
              onBegin={() => setBeginning(true)}
              onEnter={enterRoom}
              onEnterWorld={(id) => { mapScroll.current = window.scrollY; go({ view: 'world', id }); }}
              onPlant={() => setPlanting(true)}
              onImagine={() => setImagining(true)}
              restoreScroll={mapScroll.current}
            />
          </motion.div>
        )}
      </AnimatePresence>

      <PlantSeedModal open={planting} onClose={() => setPlanting(false)} onSubmit={plant} />
      <CreateWorldModal open={imagining} onClose={() => setImagining(false)} onSubmit={imagine} />
      <CreateStoryModal open={beginning} onClose={() => setBeginning(false)} onSubmit={beginNewStory} />
      <WeavingOverlay moodKey={weaving?.mood} preview={weaving?.preview} stage={weaving?.stage} progress={weaving?.progress} />

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
