import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowLeft, MessageCircle, BookOpen, Map as MapIcon, Heart, Trash2 } from 'lucide-react';
import ParticleCanvas from './ParticleCanvas';
import WorldChat, { Avatar } from './WorldChat';
import { StoriesTab, WorldTab, MemoryTab } from './WorldPanels';
import { getMood } from '../data/moods';
import { loadScenes, applyReflection, STAGES } from '../services/worldStore';
import { reflectOn } from '../services/reveClient';

const TABS = [
  { key: 'talk', label: 'Talk', icon: MessageCircle },
  { key: 'stories', label: 'Stories', icon: BookOpen },
  { key: 'world', label: 'World', icon: MapIcon },
  { key: 'memory', label: 'Memory', icon: Heart },
];
const REFLECT_EVERY = 8; // messages between memory updates

export default function WorldView({ world, onUpdate, onExit, onDelete, notify }) {
  const mood = getMood(world.bible.mood);
  const c = world.bible.character;
  const [scenes, setScenes] = useState([]);
  const [scene, setScene] = useState(world.lastScene ?? 0);
  const [tab, setTab] = useState('talk');
  const [reflecting, setReflecting] = useState(false);
  const worldRef = useRef(world);
  worldRef.current = world;

  const update = useCallback((fn) => onUpdate(world.id, fn), [onUpdate, world.id]);

  // painted scenes from IndexedDB
  useEffect(() => {
    let urls = [];
    loadScenes(world.id, world.bible.scenes.length).then((u) => { urls = u; setScenes(u); });
    return () => urls.forEach((u) => u && URL.revokeObjectURL(u));
  }, [world.id, world.bible.scenes.length]);

  const goScene = useCallback((i) => {
    setScene(i);
    update((w) => ({ ...w, lastScene: i }));
  }, [update]);

  const markAsleep = useCallback(() => update((w) => ({ ...w, bible: { ...w.bible, asleep: true } })), [update]);

  // the character reflects on the conversation and updates what they remember
  const reflect = useCallback(async () => {
    const w = worldRef.current;
    if (w.bible.asleep || (w.unreflected || 0) < 2) return;
    setReflecting(true);
    try {
      const recent = (w.messages || []).slice(-Math.max(12, (w.unreflected || 0) + 4));
      const result = await reflectOn(w, recent);
      const before = w.memory.relationship;
      update((x) => ({ ...x, memory: applyReflection(x.memory, result), unreflected: 0 }));
      const BECOME = { acquaintance: 'acquaintances', friend: 'friends', confidant: 'confidants', kindred: 'kindred spirits' };
      if (result.relationship && result.relationship !== before && BECOME[result.relationship]) {
        notify?.(`✦ You and ${c.name} are now ${BECOME[result.relationship]}.`);
      }
    } catch (err) {
      console.warn('[world] reflection failed', err);
    } finally {
      setReflecting(false);
    }
  }, [update, notify, c.name]);

  useEffect(() => {
    if ((world.unreflected || 0) >= REFLECT_EVERY && !reflecting) reflect();
  }, [world.unreflected, reflecting, reflect]);

  // reflect when you leave, too
  useEffect(() => () => { reflect(); }, [reflect]);

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && !document.querySelector('[role="dialog"]') && onExit();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onExit]);

  const current = scenes[scene];

  return (
    <div className="fixed inset-0 overflow-clip" style={{ background: mood.bg[0] }}>
      {/* the scene you're in, slowly breathing */}
      <AnimatePresence mode="sync">
        {current && (
          <motion.img
            key={current}
            src={current}
            alt={world.bible.scenes[scene]?.name}
            className="absolute inset-0 h-full w-full object-cover"
            initial={{ opacity: 0, scale: 1.12 }}
            animate={{ opacity: 1, scale: 1.02 }}
            exit={{ opacity: 0 }}
            transition={{ opacity: { duration: 1.6 }, scale: { duration: 24, ease: 'linear' } }}
          />
        )}
      </AnimatePresence>
      <div className="pointer-events-none absolute inset-0 opacity-80"><ParticleCanvas modes={mood.particles} density={0.6} /></div>
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/50 via-transparent to-black/70 lg:bg-gradient-to-r lg:from-black/10 lg:via-black/20 lg:to-black/70" />
      <div className="grain pointer-events-none absolute inset-0" />

      {/* top bar */}
      <div className="absolute inset-x-0 top-0 z-20 flex items-start justify-between gap-3 px-4 pt-[max(0.75rem,env(safe-area-inset-top))] sm:px-6 sm:pt-5">
        <button type="button" onClick={onExit} className="glass-btn inline-flex items-center gap-2 rounded-full px-3.5 py-2 text-sm text-parchment/85 hover:text-parchment">
          <ArrowLeft size={16} /> <span className="hidden sm:inline">World Map</span>
        </button>
        <h1 className="min-w-0 truncate text-center font-display font-semibold text-2xl text-parchment text-glow sm:text-4xl lg:hidden">{world.bible.world_name}</h1>
        <button type="button" onClick={onDelete} className="glass-btn rounded-full p-2.5 text-parchment/50 hover:text-rose-200" aria-label="Delete this world" title="Delete this world">
          <Trash2 size={16} />
        </button>
      </div>

      {/* scene picker */}
      <div className="absolute left-4 right-4 top-[4.2rem] z-10 flex gap-2 overflow-x-auto pb-1 sm:left-6 lg:bottom-6 lg:right-auto lg:top-auto lg:max-w-[calc(100%-520px)]">
        {world.bible.scenes.map((s, i) => (
          <button
            key={i}
            type="button"
            onClick={() => goScene(i)}
            className="group relative shrink-0 overflow-hidden rounded-xl border transition-all"
            style={{ borderColor: i === scene ? mood.primary : 'rgba(255,255,255,0.15)', boxShadow: i === scene ? `0 0 18px -4px ${mood.glow}` : 'none' }}
            aria-label={`Go to ${s.name}`}
            aria-pressed={i === scene}
          >
            {scenes[i] ? <img src={scenes[i]} alt="" className="h-12 w-16 object-cover lg:h-16 lg:w-24" /> : <div className="h-12 w-16 bg-white/5 lg:h-16 lg:w-24" />}
            <span className="absolute inset-x-0 bottom-0 hidden truncate bg-gradient-to-t from-black/80 to-transparent px-1.5 pb-1 pt-3 text-left text-xs text-parchment/90 lg:block">{s.name}</span>
          </button>
        ))}
      </div>

      {/* title, tagline and where you are (wide screens) */}
      <div className="pointer-events-none absolute left-6 top-20 z-10 hidden max-w-md lg:block">
        <h1 className="font-display font-semibold text-4xl leading-tight text-parchment text-glow">{world.bible.world_name}</h1>
        <p className="mt-2 text-lg text-parchment/70">{world.bible.tagline}</p>
        <AnimatePresence mode="wait">
          <motion.p
            key={scene}
            className="mt-8 text-base text-parchment/80"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.8 }}
          >
            <span className="mb-1 block text-sm font-semibold" style={{ color: mood.primary }}>{world.bible.scenes[scene]?.name}</span>
            {world.bible.scenes[scene]?.description}
          </motion.p>
        </AnimatePresence>
      </div>

      {/* the panel: talk, stories, world, memory */}
      <motion.aside
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, delay: 0.3 }}
        className="glass absolute inset-x-0 bottom-0 z-20 flex h-[62dvh] flex-col overflow-hidden rounded-t-3xl lg:inset-y-5 lg:left-auto lg:right-5 lg:h-auto lg:w-[460px] lg:rounded-3xl"
      >
        <div className="flex items-center gap-3 px-5 pt-4">
          <Avatar name={c.name} mood={mood} size={42} asleep={world.bible.asleep} />
          <div className="min-w-0 flex-1">
            <p className="truncate font-display font-semibold text-xl text-parchment">{c.name}</p>
            <p className="flex min-w-0 items-center gap-2 text-xs text-parchment/55">
              {world.bible.asleep ? <span>Asleep</span> : (
                <>
                  <span className="truncate">{c.role}</span>
                  <span className="shrink-0 rounded-full bg-white/10 px-2 py-0.5 font-medium text-parchment/80">{STAGES[world.memory.relationship]?.label}</span>
                </>
              )}
              {reflecting && <span className="shrink-0 text-champagne/80">Remembering…</span>}
            </p>
          </div>
        </div>
        <nav className="mt-3 flex gap-1 border-b border-white/5 px-3" role="tablist">
          {TABS.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={tab === key}
              onClick={() => setTab(key)}
              className="relative flex flex-1 items-center justify-center gap-1.5 px-2 py-2.5 text-xs text-parchment/55 transition-colors hover:text-parchment"
              style={tab === key ? { color: mood.primary } : undefined}
            >
              <Icon size={14} /> {label}
              {tab === key && <motion.span layoutId="tab-underline" className="absolute inset-x-2 -bottom-px h-0.5 rounded-full" style={{ background: mood.primary }} />}
            </button>
          ))}
        </nav>
        <div className="min-h-0 flex-1">
          {tab === 'talk' && <WorldChat world={world} mood={mood} onUpdate={update} onScene={goScene} onAsleep={markAsleep} />}
          {tab === 'stories' && <StoriesTab world={world} mood={mood} scenes={scenes} onUpdate={update} onAsleep={markAsleep} onScene={goScene} />}
          {tab === 'world' && <WorldTab world={world} mood={mood} scenes={scenes} onScene={goScene} />}
          {tab === 'memory' && <MemoryTab world={world} mood={mood} onUpdate={update} reflecting={reflecting} />}
        </div>
      </motion.aside>
    </div>
  );
}
