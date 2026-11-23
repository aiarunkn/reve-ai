import { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import WorldMap from './components/WorldMap';
import CreateWorldModal from './components/CreateWorldModal';
import WeavingOverlay from './components/WeavingOverlay';
import JoinWorld from './components/JoinWorld';
import SignInSheet from './components/SignInSheet';
import AccountMenu from './components/AccountMenu';
import { shareStory, leaveShared, identityFor, sharedCode, ensureIndexed } from './services/sharedClient';
import { RateLimited } from './services/authClient';
import { generateMemoryImage } from './services/memoryGenerator';
import { drawFit, loadImage } from './services/imageUtils';
import { loadWorlds, saveWorlds, newMemory, saveScene, deleteWorldAssets } from './services/worldStore';
import { dreamWorld, sleepingBible, NotConfiguredError } from './services/reveClient';
import { loadStoryIndex, saveStory, deleteStory, savePlaceImage, storyFromBible } from './services/storyStore';
import { beginStory } from './services/storyClient';
import { paintNow, ImagesNotConfigured } from './services/storyArt';
import { useHashRoute } from './hooks/useHashRoute';

const WorldView = lazy(() => import('./components/WorldView'));
const StoryView = lazy(() => import('./components/StoryView'));

const WEAVE_MIN_MS = 2000;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const newId = (prefix) => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

/** A photo as a modest JPEG data URL, small enough to send to the world-builder. */
async function photoForAI(file) {
  return drawFit(await loadImage(file), 1024).toDataURL('image/jpeg', 0.85);
}

export default function App() {
  const [route, go] = useHashRoute();
  const [imagining, setImagining] = useState(false);
  const [worlds, setWorlds] = useState(loadWorlds);
  const [stories, setStories] = useState(loadStoryIndex);
  const [weaving, setWeaving] = useState(null); // { mood, preview, stage }
  const [toast, setToast] = useState('');
  const [joining, setJoining] = useState(null); // null, or the code being joined ('' = typing one)
  const [inviteFor, setInviteFor] = useState(null); // a world that was just opened up: show its code
  const [signIn, setSignIn] = useState(null); // null, or { reason } while the sign-in sheet is open
  const mapScroll = useRef(0);

  const openSignIn = useCallback((reason = '') => setSignIn({ reason }), []);
  /** Shows a friendly toast, and for a guest, opens the sign-in sheet. */
  const handleRateLimit = useCallback((err) => {
    setToast(err.message);
    if (err.signIn) openSignIn(err.message);
  }, [openSignIn]);

  const world = route.view === 'world' ? worlds.find((w) => w.id === route.id) || null : null;
  const storyEntry = route.view === 'story' ? stories.find((s) => s.id === route.id) || null : null;

  // unknown world or story id in the URL → back home
  useEffect(() => {
    if ((route.view === 'world' && !world) || (route.view === 'story' && !storyEntry)) go({ view: 'map' }, { replace: true });
  }, [route, world, storyEntry, go]);

  // an invite link: straight in if this device is already in that world, otherwise join it
  useEffect(() => {
    if (route.view !== 'join') return;
    const code = route.id;
    if (identityFor(code)) {
      ensureIndexed(code);
      setStories(loadStoryIndex());
      go({ view: 'story', id: `w-${code}` }, { replace: true });
    } else {
      setJoining(code);
      go({ view: 'map' }, { replace: true });
    }
  }, [route, go]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(''), 5000);
    return () => clearTimeout(t);
  }, [toast]);

  const updateWorld = useCallback((id, fn) => {
    setWorlds((list) => {
      const next = list.map((w) => (w.id === id ? fn(w) : w));
      saveWorlds(next);
      return next;
    });
  }, []);


  const exit = useCallback(() => go({ view: 'map' }), [go]);

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

  // one line: what you want to live -> the narrator builds the world and who you are in it -> chapter one
  const beginNewStory = async ({ premise, players = [], files = [] }) => {
    const preview = files[0] ? URL.createObjectURL(files[0]) : null;
    const id = newId('story');
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
      const cast = players.length ? players : [{ id: 'p1', ...bible.protagonist, joined: true, local: true }];
      const story = storyFromBible(id, { premise, players: cast, bible });
      // paint the room you open in, and the person waiting there, before you step in (capped, so a slow painter never blocks you)
      setWeaving((w) => ({ ...w, stage: 'room' }));
      const firstPlace = story.scene;
      const art = Promise.allSettled([
        bible.places[firstPlace]?.photo_index >= 0 ? null : paintNow(story, `place${firstPlace}`),
        bible.cast.length ? paintNow(story, 'portrait0') : null,
      ]).then((r) => r.forEach((x) => x.status === 'rejected' && !(x.reason instanceof ImagesNotConfigured) && console.warn('[art]', x.reason)));
      await Promise.race([art, wait(75000)]);
      await saveStory(story);
      setStories(loadStoryIndex());
      mapScroll.current = 0;
      go({ view: 'story', id });
    } catch (err) {
      console.error(err);
      if (err instanceof RateLimited) handleRateLimit(err);
      else setToast(err instanceof NotConfiguredError
        ? 'Stories need a narrator: add ANTHROPIC_API_KEY on the server (Vercel → Settings → Environment Variables), then redeploy.'
        : err?.message || 'Something went wrong while beginning that story.');
    } finally {
      setWeaving(null);
      if (preview) URL.revokeObjectURL(preview);
    }
  };

  // open a solo story up to friends: it gets a code and moves to its shared home
  const openStory = async (story, color) => {
    try {
      const view = await shareStory(story, color);
      setStories(loadStoryIndex());
      setInviteFor(view.id);
      go({ view: 'story', id: view.id }, { replace: true });
    } catch (err) {
      if (err instanceof RateLimited) handleRateLimit(err);
      throw err; // InviteSheet shows err.message and stops spinning
    }
  };

  const removeStory = async () => {
    if (!storyEntry) return;
    const code = sharedCode(storyEntry.id);
    if (code) {
      if (!window.confirm(`Leave “${storyEntry.title}” on this device? The world carries on for your friends. You can come back with the code ${code}, as a new arrival.`)) return;
      await leaveShared(code);
      setStories(loadStoryIndex());
      go({ view: 'map' }, { replace: true });
      return;
    }
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

  return (
    <>
      <AnimatePresence mode="wait">
        {storyEntry ? (
          <motion.div key={storyEntry.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, filter: 'blur(10px)' }} transition={{ duration: 0.8 }} className="fixed inset-0">
            <Suspense fallback={<div className="fixed inset-0 bg-midnight" />}>
              <StoryView storyId={storyEntry.id} onExit={() => { setStories(loadStoryIndex()); setInviteFor(null); exit(); }} onDelete={removeStory} notify={setToast} onShare={openStory} openInvite={inviteFor === storyEntry.id} onRateLimited={handleRateLimit} />
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
        ) : (
          <motion.div
            key="map"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, filter: 'blur(8px)' }}
            transition={{ duration: 0.8, ease: 'easeInOut' }}
          >
            <WorldMap
              account={<AccountMenu onSignIn={() => openSignIn()} />}
              stories={stories}
              onEnterStory={(id) => { mapScroll.current = window.scrollY; go({ view: 'story', id }); }}
              onBegin={(premise) => beginNewStory({ premise })}
              onJoin={() => setJoining('')}
              restoreScroll={mapScroll.current}
            />
          </motion.div>
        )}
      </AnimatePresence>

      <JoinWorld
        open={joining !== null}
        initialCode={joining || ''}
        onClose={() => setJoining(null)}
        onWeave={(mood) => setWeaving(mood ? { mood, stage: 'arrive' } : null)}
        onRateLimited={handleRateLimit}
        onJoined={(view) => {
          setJoining(null);
          setStories(loadStoryIndex());
          mapScroll.current = 0;
          go({ view: 'story', id: view.id });
        }}
      />
      <CreateWorldModal open={imagining} onClose={() => setImagining(false)} onSubmit={imagine} />
      <SignInSheet open={!!signIn} reason={signIn?.reason} onClose={() => setSignIn(null)} />
      <WeavingOverlay moodKey={weaving?.mood} preview={weaving?.preview} stage={weaving?.stage} />

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
