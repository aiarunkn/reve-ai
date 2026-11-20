import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { SendHorizontal, Moon } from 'lucide-react';
import { chatWith, parseScene, NotConfiguredError } from '../services/reveClient';

/** Renders *small actions* in italics inside a message. */
function Rich({ text }) {
  return text.split(/(\*[^*\n]+\*)/g).map((part, i) =>
    /^\*[^*]+\*$/.test(part) ? (
      <em key={i} className="text-parchment/55">{part.slice(1, -1)}</em>
    ) : (
      <span key={i}>{part}</span>
    )
  );
}

export function Avatar({ name, mood, size = 44, asleep = false }) {
  return (
    <div
      className="relative shrink-0 overflow-hidden rounded-full"
      style={{ width: size, height: size, background: `radial-gradient(circle at 50% 30%, ${mood.primary}, ${mood.secondary} 60%, ${mood.bg[0]})`, boxShadow: `0 0 0 1px ${mood.primary}66, 0 0 22px -4px ${mood.glow}` }}
      aria-label={name}
    >
      <svg viewBox="0 0 40 40" className="absolute inset-0 h-full w-full" aria-hidden="true">
        <circle cx="20" cy="16" r="7" fill={mood.bg[0]} opacity={asleep ? 0.45 : 0.85} />
        <path d="M6 40c1-9 7-14 14-14s13 5 14 14z" fill={mood.bg[0]} opacity={asleep ? 0.45 : 0.85} />
      </svg>
    </div>
  );
}

export default function WorldChat({ world, mood, onUpdate, onScene, onAsleep }) {
  const c = world.bible.character;
  const [draft, setDraft] = useState('');
  const [streaming, setStreaming] = useState(null); // the reply as it arrives
  const [error, setError] = useState('');
  const listRef = useRef(null);
  const abortRef = useRef(null);
  const messages = world.messages || [];
  const asleep = !!world.bible.asleep;

  // their first words, the very first time you arrive
  useEffect(() => {
    if (!asleep && !messages.length && c.first_words) {
      onUpdate((w) => (w.messages?.length ? w : { ...w, messages: [{ role: 'assistant', content: c.first_words, at: Date.now() }] }));
    }
  }, [asleep, messages.length, c.first_words, onUpdate]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages.length, streaming]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const send = async (e) => {
    e?.preventDefault();
    const text = draft.trim();
    if (!text || streaming !== null || asleep) return;
    setDraft('');
    setError('');
    const mine = { role: 'user', content: text, at: Date.now() };
    const history = [...messages, mine];
    onUpdate((w) => ({ ...w, messages: [...(w.messages || []), mine], unreflected: (w.unreflected || 0) + 1 }));
    setStreaming('');
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    let sceneSet = false;
    try {
      const raw = await chatWith(world, history, (soFar) => {
        const { scene, text: shown } = parseScene(soFar, world.bible.scenes.length);
        if (scene !== null && !sceneSet) { sceneSet = true; onScene(scene); }
        setStreaming(shown);
      }, ctrl.signal);
      const { scene, text: reply } = parseScene(raw, world.bible.scenes.length);
      if (reply.trim()) {
        onUpdate((w) => ({
          ...w,
          messages: [...(w.messages || []), { role: 'assistant', content: reply.trim(), scene: scene ?? undefined, at: Date.now() }],
          unreflected: (w.unreflected || 0) + 1,
        }));
      }
    } catch (err) {
      if (err.name === 'AbortError') return;
      if (err instanceof NotConfiguredError) onAsleep();
      setError(err.message);
    } finally {
      setStreaming(null);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div ref={listRef} className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-5">
        {asleep && (
          <div className="rounded-2xl border border-gold/20 bg-white/[0.03] p-4 text-sm text-parchment/75">
            <p className="flex items-center gap-2 font-serif text-lg italic text-parchment"><Moon size={16} className="text-gold" /> This world is still asleep.</p>
            <p className="mt-2">Its scenes are painted, but its inhabitant needs a mind to wake up. Add an <code className="rounded bg-white/10 px-1">ANTHROPIC_API_KEY</code> on the server (on Vercel: Settings → Environment Variables, then redeploy), and they’ll be here the next time you visit.</p>
          </div>
        )}
        {messages.map((m, i) => (
          <motion.div key={`${m.at}-${i}`} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className={m.role === 'user' ? 'flex justify-end' : 'flex gap-3'}>
            {m.role === 'assistant' && <Avatar name={c.name} mood={mood} size={30} />}
            <p
              className={`max-w-[85%] whitespace-pre-wrap leading-relaxed ${
                m.role === 'user'
                  ? 'rounded-2xl rounded-br-md bg-white/10 px-4 py-2.5 text-[15px] text-parchment/90'
                  : 'pt-1 font-serif text-[1.15rem] text-parchment'
              }`}
            >
              <Rich text={m.content} />
            </p>
          </motion.div>
        ))}
        <AnimatePresence>
          {streaming !== null && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex gap-3">
              <Avatar name={c.name} mood={mood} size={30} />
              <p className="max-w-[85%] whitespace-pre-wrap pt-1 font-serif text-[1.15rem] leading-relaxed text-parchment">
                {streaming ? <Rich text={streaming} /> : (
                  <span className="inline-flex gap-1 pt-2" aria-label={`${c.name} is thinking`}>
                    {[0, 1, 2].map((d) => (
                      <motion.span key={d} className="h-1.5 w-1.5 rounded-full" style={{ background: mood.primary }} animate={{ opacity: [0.2, 1, 0.2] }} transition={{ duration: 1.2, repeat: Infinity, delay: d * 0.2 }} />
                    ))}
                  </span>
                )}
              </p>
            </motion.div>
          )}
        </AnimatePresence>
        {error && <p className="text-center text-sm text-rose-300/90">{error}</p>}
      </div>

      <form onSubmit={send} className="flex items-end gap-2 border-t border-white/5 p-3">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) send(e); }}
          rows={1}
          maxLength={2000}
          disabled={asleep}
          placeholder={asleep ? `${c.name} is asleep…` : `Say something to ${c.name}…`}
          className="max-h-32 min-h-[44px] flex-1 resize-none rounded-2xl border border-white/10 bg-midnight/50 px-4 py-2.5 text-[15px] text-parchment placeholder:text-parchment/35 focus:border-gold/50 focus:outline-none disabled:opacity-50"
        />
        <button type="submit" disabled={!draft.trim() || streaming !== null || asleep} className="rounded-full p-3 text-midnight transition-opacity disabled:opacity-30" style={{ background: mood.primary }} aria-label="Send">
          <SendHorizontal size={18} />
        </button>
      </form>
    </div>
  );
}
