import { useEffect, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Feather, Users, HardDrive, KeyRound, Lock, Sparkles, Trash2, Bot } from 'lucide-react';
import { getAsset } from '../services/assetStore';
import StoryCover from './StoryCover';

/** Each story's cover: its first place behind, its first character in front (whatever has been painted so far). */
function useStoryCovers(stories) {
  const [covers, setCovers] = useState({});
  const key = stories.map((s) => s.id).join(',');
  useEffect(() => {
    let alive = true;
    const made = [];
    const url = (b) => { if (!(b instanceof Blob)) return null; const u = URL.createObjectURL(b); made.push(u); return u; };
    Promise.all(stories.map(async (s) => {
      const [bg, figure] = await Promise.all([getAsset(s.id, 'place0'), getAsset(s.id, 'portrait0')]);
      return [s.id, { bg: url(bg), figure: url(figure) }];
    })).then((pairs) => alive && setCovers(Object.fromEntries(pairs)));
    return () => { alive = false; made.forEach((u) => URL.revokeObjectURL(u)); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return covers;
}

const EXAMPLES = [
  'A night train across the Alps in 1936, and a stranger in my compartment',
  'My first week as a royal guard, and the prince already hates me',
  'A seaside café in Lisbon, the moment my ex walks in',
];

const STEPS = [
  { title: 'Say where you want to be', body: 'One line is enough: a place, a time, someone you want to meet. Reve builds the world, its people and the first scene.' },
  { title: 'Play the scene', body: 'Pick one of three replies or write your own. Characters answer in their own voice and act on their own wants.' },
  { title: 'Come back to it', body: 'Leave for a day or a month. You get a short recap, and the world has moved on a little while you were away.' },
];

const PROMISES = [
  { icon: HardDrive, title: 'Saved on your device', body: 'Solo stories are kept in this browser. Each turn is sent to the narrator to write the next scene, and is not stored on our servers.' },
  { icon: KeyRound, title: 'No password to remember', body: 'Play as a guest. If you want an account, sign in with a one-time link sent to your email.' },
  { icon: Lock, title: 'Shared only by invitation', body: 'A shared world is stored on our server so friends can play it together. Only people with its 6-letter code can join.' },
  { icon: Sparkles, title: 'Original stories', body: 'Every character and place is made for your story. Mature themes are welcome; anything sexual stays off the page.' },
  { icon: Trash2, title: 'Yours to delete', body: 'Remove a story and its pictures from this device whenever you want, from the story’s Characters panel.' },
  { icon: Bot, title: 'Clear about AI', body: 'Scenes are written by Claude, an AI model made by Anthropic. Pictures are painted by an image model.' },
];

const scrollTo = (id) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });

function Nav({ account, onJoin }) {
  return (
    <header className="sticky top-0 z-30 border-b border-white/[0.06] bg-velvet/80 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-5 sm:px-8">
        <button type="button" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} className="font-display text-2xl font-semibold tracking-tight text-champagne" aria-label="Reve, back to top">
          Reve
        </button>
        <nav className="flex items-center gap-1 text-sm text-parchment/70 sm:gap-2" aria-label="Main">
          <button type="button" onClick={() => scrollTo('how')} className="hidden rounded-full px-3 py-2 hover:text-parchment md:inline">How it works</button>
          <button type="button" onClick={() => scrollTo('privacy')} className="hidden rounded-full px-3 py-2 hover:text-parchment md:inline">Privacy</button>
          {onJoin && (
            <button type="button" onClick={onJoin} className="hidden items-center gap-1.5 rounded-full px-3 py-2 hover:text-parchment sm:inline-flex">
              <Users size={15} /> Join with a code
            </button>
          )}
          {account}
        </nav>
      </div>
    </header>
  );
}

/** A painted courtyard at dusk, drawn in SVG so the preview needs no downloads. */
function Courtyard() {
  return (
    <svg viewBox="0 0 300 420" className="absolute inset-0 h-full w-full" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <defs>
        <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#3b1457" />
          <stop offset="0.55" stopColor="#8a2f6b" />
          <stop offset="1" stopColor="#ff9a8b" />
        </linearGradient>
        <radialGradient id="lamp">
          <stop offset="0" stopColor="#fff2c9" />
          <stop offset="0.35" stopColor="#ffc46b" stopOpacity="0.9" />
          <stop offset="1" stopColor="#ff8a5b" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="300" height="420" fill="url(#sky)" />
      {/* rooftops and the clocktower */}
      <path d="M0 250 L30 228 L60 250 L60 236 L95 214 L130 236 L130 250 L170 250 L170 150 L183 126 L196 150 L196 250 L230 250 L262 222 L300 246 L300 420 L0 420 Z" fill="#2a0f3d" />
      <circle cx="183" cy="172" r="8" fill="#ffe2a8" opacity="0.8" />
      {/* lanterns hanging from the arch above */}
      {[[46, 120], [112, 96], [250, 128]].map(([x, y]) => (
        <g key={x}>
          <line x1={x} y1="0" x2={x} y2={y - 10} stroke="#12071f" strokeWidth="1.5" />
          <circle cx={x} cy={y} r="34" fill="url(#lamp)" />
          <path d={`M${x - 7} ${y - 9} h14 l-2 18 h-10 z`} fill="#ffe2a8" />
        </g>
      ))}
      {/* rain */}
      <g stroke="#ffe2a8" strokeOpacity="0.18" strokeWidth="1">
        {Array.from({ length: 18 }, (_, i) => <line key={i} x1={(i * 37) % 300} y1={(i * 53) % 200} x2={(i * 37) % 300 - 4} y2={(i * 53) % 200 + 14} />)}
      </g>
    </svg>
  );
}

/** What playing looks like: a scene from the first story, with its real dialogue and choices. */
function ScenePreview() {
  return (
    <div className="vn-frame relative mx-auto aspect-[3/4.2] w-full max-w-[340px] overflow-hidden rounded-[2rem] shadow-[0_40px_80px_-30px_rgba(255,95,162,0.55)]" role="img" aria-label="A scene in Reve: Callum asks if you were in the library, with three replies to choose from">
      <Courtyard />
      <div className="absolute inset-x-0 top-0 p-4 text-center">
        <p className="font-display text-base text-white">Courtyard of Lamps</p>
        <p className="text-xs text-white/60">Autumn, late afternoon</p>
      </div>
      <div className="absolute inset-x-0 bottom-0 space-y-1.5 p-3">
        {['I was studying. Secretly.', 'Avoiding someone. Successfully.', 'Maybe a bit of both.'].map((c) => (
          <div key={c} className="vn-choice rounded-full px-4 py-2 text-center text-xs font-medium">{c}</div>
        ))}
        <div className="vn-frame vn-panel relative mt-4 rounded-2xl px-4 pb-3 pt-5">
          <span className="vn-plate absolute -top-3 left-3 z-10 py-1 pl-4 pr-6 text-xs font-semibold">Callum Thorne</span>
          <p className="text-sm leading-snug text-white">You're late. Again. Were you in the library, or just avoiding someone?</p>
        </div>
      </div>
    </div>
  );
}

function Hero({ onBegin, onJoin }) {
  const [premise, setPremise] = useState('');
  const input = useRef(null);
  const still = useReducedMotion();
  const enter = (d) => (still ? {} : { initial: { opacity: 0, y: 14 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.8, delay: d, ease: [0.22, 1, 0.36, 1] } });
  const ready = premise.trim().length >= 3;

  return (
    <section className="mx-auto grid max-w-6xl items-center gap-14 px-5 pb-20 pt-14 sm:px-8 lg:grid-cols-[1.15fr_0.85fr] lg:pb-28 lg:pt-20">
      <div>
        <motion.h1 {...enter(0)} className="max-w-[15ch] font-display text-4xl font-semibold leading-tight tracking-tight text-parchment sm:text-6xl">
          Play a story that remembers every choice.
        </motion.h1>
        <motion.p {...enter(0.1)} className="mt-6 max-w-[34rem] text-lg leading-relaxed text-parchment/70">
          Describe a place and a moment. Reve writes the scene around you, illustrated like a visual novel, and keeps what you said and did for every chapter after.
        </motion.p>

        <motion.form
          {...enter(0.2)}
          onSubmit={(e) => { e.preventDefault(); if (ready) onBegin(premise.trim()); }}
          className="mt-9 max-w-xl"
        >
          <label htmlFor="premise" className="text-sm font-medium text-parchment/85">Where does your story begin?</label>
          <div className="mt-2 flex items-center gap-2 rounded-2xl border border-white/12 bg-white/[0.05] p-1.5 pl-4 transition-colors focus-within:border-champagne/60">
            <Feather size={18} className="shrink-0 text-champagne" aria-hidden="true" />
            <input
              id="premise"
              ref={input}
              value={premise}
              onChange={(e) => setPremise(e.target.value)}
              maxLength={600}
              placeholder="A candlelit common room under a lake, past midnight"
              className="min-w-0 flex-1 bg-transparent py-3 text-base text-parchment placeholder:text-parchment/35 focus:outline-none"
            />
            <button type="submit" disabled={!ready} className="btn-lantern shrink-0 rounded-xl px-5 py-3 text-base disabled:cursor-not-allowed disabled:opacity-40">
              Start story
            </button>
          </div>
          <div className="mt-4 flex flex-wrap gap-2" aria-label="Examples">
            {EXAMPLES.map((ex) => (
              <button key={ex} type="button" onClick={() => { setPremise(ex); input.current?.focus(); }} className="rounded-full border border-white/10 bg-white/[0.03] px-3.5 py-1.5 text-left text-sm text-parchment/65 transition-colors hover:border-white/25 hover:text-parchment">
                {ex}
              </button>
            ))}
          </div>
        </motion.form>

        <motion.p {...enter(0.3)} className="mt-8 text-sm text-parchment/50">
          Free to try, no account needed.{onJoin && <> Got an invite? <button type="button" onClick={onJoin} className="text-champagne underline decoration-champagne/40 underline-offset-4 hover:decoration-champagne">Join with a code</button>.</>}
        </motion.p>
      </div>

      <motion.div {...enter(0.15)}>
        <ScenePreview />
      </motion.div>
    </section>
  );
}

function SectionHead({ title, sub }) {
  return (
    <div className="max-w-2xl">
      <h2 className="font-display text-3xl font-semibold tracking-tight text-parchment sm:text-4xl">{title}</h2>
      {sub && <p className="mt-3 text-base leading-relaxed text-parchment/60">{sub}</p>}
    </div>
  );
}

export default function WorldMap({ stories = [], onEnterStory, onBegin, onJoin, restoreScroll, account }) {
  useEffect(() => {
    if (restoreScroll) window.scrollTo(0, restoreScroll);
  }, [restoreScroll]);
  const storyCovers = useStoryCovers(stories);
  const sorted = [...stories].sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));

  return (
    <div className="relative min-h-dvh overflow-x-clip bg-velvet">
      {/* one soft light behind the hero */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[900px]" style={{ background: 'radial-gradient(50% 45% at 78% 28%, rgba(255,95,162,0.20), transparent 70%), radial-gradient(40% 40% at 10% 0%, rgba(176,92,255,0.16), transparent 70%)' }} />

      <Nav account={account} onJoin={onJoin} />

      <main className="relative">
        <Hero onBegin={onBegin} onJoin={onJoin} />

        {sorted.length > 0 && (
          <section aria-labelledby="your-stories" className="border-t border-white/[0.06] bg-night/40">
            <div className="mx-auto max-w-6xl px-5 py-16 sm:px-8">
              <h2 id="your-stories" className="font-display text-2xl font-semibold text-parchment sm:text-3xl">Continue reading</h2>
              <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3 sm:gap-6 lg:grid-cols-5">
                {sorted.map((s, i) => (
                  <StoryCover key={s.id} story={s} cover={storyCovers[s.id]} index={i} onOpen={() => onEnterStory(s.id)} />
                ))}
              </div>
            </div>
          </section>
        )}

        <section id="how" aria-labelledby="how-title" className="scroll-mt-16 border-t border-white/[0.06]">
          <div className="mx-auto max-w-6xl px-5 py-20 sm:px-8 lg:py-24">
            <SectionHead title={<span id="how-title">How it works</span>} sub="No setup, no character sheets. You can be inside a scene in under a minute." />
            <ol className="mt-12 grid gap-10 md:grid-cols-3 md:gap-8">
              {STEPS.map((s, i) => (
                <li key={s.title} className="border-t border-white/10 pt-6">
                  <span className="font-display text-4xl font-semibold text-rose" aria-hidden="true">{i + 1}</span>
                  <h3 className="mt-3 text-lg font-semibold text-parchment">{s.title}</h3>
                  <p className="mt-2 max-w-[34ch] text-base leading-relaxed text-parchment/60">{s.body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section id="privacy" aria-labelledby="privacy-title" className="scroll-mt-16 border-t border-white/[0.06] bg-night/40">
          <div className="mx-auto max-w-6xl px-5 py-20 sm:px-8 lg:py-24">
            <SectionHead title={<span id="privacy-title">Your stories, handled with care</span>} sub="What happens to what you write, in plain words." />
            <ul className="mt-12 grid gap-x-10 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
              {PROMISES.map(({ icon: Icon, title, body }) => (
                <li key={title} className="flex gap-4">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/[0.06] text-champagne"><Icon size={19} aria-hidden="true" /></span>
                  <div>
                    <h3 className="text-base font-semibold text-parchment">{title}</h3>
                    <p className="mt-1.5 text-sm leading-relaxed text-parchment/60">{body}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </section>
      </main>

      <footer className="border-t border-white/[0.06]">
        <div className="mx-auto flex max-w-6xl flex-col gap-6 px-5 py-10 text-sm text-parchment/50 sm:flex-row sm:items-center sm:justify-between sm:px-8">
          <div>
            <p className="font-display text-xl font-semibold text-champagne">Reve</p>
            <p className="mt-1">Interactive stories, written as you play.</p>
          </div>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
            <button type="button" onClick={() => scrollTo('how')} className="hover:text-parchment">How it works</button>
            <button type="button" onClick={() => scrollTo('privacy')} className="hover:text-parchment">Privacy</button>
            {onJoin && <button type="button" onClick={onJoin} className="hover:text-parchment">Join with a code</button>}
            <span>© 2026 Reve AI</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
