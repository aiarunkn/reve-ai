import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X, ArrowRight } from 'lucide-react';
import { PLAYER_COLORS, CODE_LENGTH, normalizeCode, isCode } from '../shared/worldState';
import { peekWorld, joinShared, SharedNotConfigured } from '../services/sharedClient';
import { RateLimited } from '../services/authClient';
import { getMood } from '../data/moods';

const NAME_KEY = 'reve-ai:my-name';
const lastName = () => { try { return localStorage.getItem(NAME_KEY) || ''; } catch { return ''; } };

/** Six letter boxes, like a room code on a TV screen. */
export function CodeBoxes({ value, onChange, autoFocus, size = 'lg' }) {
  const [focused, setFocused] = useState(false);
  const box = size === 'lg' ? 'h-14 w-11 text-3xl sm:h-16 sm:w-12' : 'h-12 w-10 text-2xl';
  return (
    <label className="relative flex cursor-text justify-center gap-2" aria-label="World code">
      {Array.from({ length: CODE_LENGTH }, (_, i) => {
        const active = focused && (i === value.length || (i === CODE_LENGTH - 1 && value.length === CODE_LENGTH));
        return (
          <span key={i} className={`${box} flex items-center justify-center rounded-xl border bg-midnight/60 text-parchment transition-colors ${active ? 'border-gold shadow-[0_0_18px_-4px_rgba(245,184,90,0.7)]' : 'border-white/15'}`}>
            {value[i] || ''}
          </span>
        );
      })}
      {onChange && (
        <input
          value={value}
          onChange={(e) => onChange(normalizeCode(e.target.value))}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          autoFocus={autoFocus}
          autoCapitalize="characters"
          autoComplete="off"
          spellCheck={false}
          inputMode="text"
          className="absolute inset-0 h-full w-full cursor-text opacity-0"
        />
      )}
    </label>
  );
}

export function ColorPicker({ value, onChange, taken = [] }) {
  return (
    <div className="flex flex-wrap justify-center gap-2.5" role="radiogroup" aria-label="Your color">
      {PLAYER_COLORS.map((c) => {
        const used = taken.includes(c);
        return (
          <button
            key={c}
            type="button"
            role="radio"
            aria-checked={value === c}
            aria-label={used ? `${c} (taken)` : c}
            disabled={used}
            onClick={() => onChange(c)}
            className={`h-9 w-9 rounded-full transition-transform disabled:cursor-not-allowed disabled:opacity-20 ${value === c ? 'scale-110 ring-2 ring-parchment ring-offset-2 ring-offset-midnight' : 'hover:scale-105'}`}
            style={{ background: c, boxShadow: value === c ? `0 0 18px ${c}` : 'none' }}
          />
        );
      })}
    </div>
  );
}

/**
 * Join a friend's world: code → name and color → you wake up inside.
 * As quick as joining a room in Among Us; the narrator writes your arrival.
 */
export default function JoinWorld({ open, initialCode = '', onClose, onJoined, onWeave, onRateLimited }) {
  const [code, setCode] = useState('');
  const [world, setWorld] = useState(null); // what the code opens
  const [name, setName] = useState(lastName);
  const [color, setColor] = useState(null);
  const [about, setAbout] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const nameRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    setCode(normalizeCode(initialCode));
    setWorld(null);
    setError('');
    setAbout('');
  }, [open, initialCode]);

  // a full code: look up the world behind it
  useEffect(() => {
    if (!isCode(code)) { setWorld(null); return; }
    let alive = true;
    setError('');
    peekWorld(code)
      .then((w) => {
        if (!alive) return;
        setWorld(w);
        const taken = w.players.map((p) => p.color);
        setColor((c) => (c && !taken.includes(c) ? c : PLAYER_COLORS.find((x) => !taken.includes(x)) || PLAYER_COLORS[0]));
        setTimeout(() => nameRef.current?.focus(), 50);
      })
      .catch((err) => alive && setError(err instanceof SharedNotConfigured ? err.message : err.message || 'Couldn’t find that world.'));
    return () => { alive = false; };
  }, [code]);

  const join = async (e) => {
    e.preventDefault();
    if (!world || !name.trim() || busy) return;
    setBusy(true);
    setError('');
    try { localStorage.setItem(NAME_KEY, name.trim()); } catch { /* ignore */ }
    onWeave?.(world.mood);
    try {
      const view = await joinShared(code, { name: name.trim(), color, about: about.trim() });
      onJoined(view);
    } catch (err) {
      setError(err.message || 'Couldn’t join. Try again?');
      if (err instanceof RateLimited) onRateLimited?.(err);
    } finally {
      onWeave?.(null);
      setBusy(false);
    }
  };

  const mood = world ? getMood(world.mood) : null;
  const here = world?.players || [];

  return (
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-md" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} role="dialog" aria-modal="true" aria-label="Join a world">
          <motion.form
            onSubmit={join}
            initial={{ y: 24, scale: 0.97 }}
            animate={{ y: 0, scale: 1 }}
            className="glass relative w-full max-w-md rounded-[2rem] px-6 pb-7 pt-9 text-center sm:px-8"
            style={mood ? { boxShadow: `0 0 80px -20px ${mood.primary}` } : undefined}
          >
            <button type="button" onClick={onClose} className="absolute right-4 top-4 rounded-full p-2 text-parchment/50 hover:text-parchment" aria-label="Close"><X size={18} /></button>
            <h2 className="font-display text-3xl font-semibold text-parchment">Join a shared story</h2>
            <p className="mt-1.5 text-sm text-parchment/55">Type the code your friend sent you.</p>

            <div className="mt-6"><CodeBoxes value={code} onChange={setCode} autoFocus={!initialCode} /></div>

            <AnimatePresence mode="wait">
              {world ? (
                <motion.div key="world" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="mt-6">
                  <p className="font-display font-semibold text-2xl text-parchment">{world.title}</p>
                  <p className="mt-1 italic text-parchment/60">{world.tagline}</p>
                  {here.length > 0 && (
                    <div className="mt-3 flex items-center justify-center gap-1.5 text-xs text-parchment/55">
                      {here.slice(0, 6).map((p) => <span key={p.name} className="h-2.5 w-2.5 rounded-full" style={{ background: p.color }} title={p.name} />)}
                      <span className="ml-1">{here.map((p) => p.name.split(' ')[0]).slice(0, 3).join(', ')}{here.length > 3 ? ` +${here.length - 3}` : ''} {here.length === 1 ? 'is' : 'are'} already here</span>
                    </div>
                  )}

                  <input
                    ref={nameRef}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    maxLength={40}
                    placeholder="Your name in this world"
                    aria-label="Your name"
                    className="mt-6 w-full rounded-2xl border border-white/15 bg-midnight/60 px-4 py-3 text-center text-xl text-parchment placeholder:text-parchment/35 focus:border-gold/60 focus:outline-none"
                  />
                  <div className="mt-4"><ColorPicker value={color} onChange={setColor} taken={here.map((p) => p.color)} /></div>
                  <input
                    value={about}
                    onChange={(e) => setAbout(e.target.value)}
                    maxLength={300}
                    placeholder="Who are you there? (optional)"
                    aria-label="Who are you in this world (optional)"
                    className="mt-4 w-full rounded-2xl border border-white/10 bg-transparent px-4 py-2.5 text-center text-sm text-parchment placeholder:text-parchment/35 focus:border-gold/40 focus:outline-none"
                  />
                  <button type="submit" disabled={!name.trim() || busy} className="btn-lantern mt-6 inline-flex items-center gap-2 rounded-full px-7 py-3 text-base font-medium disabled:opacity-40 disabled:[animation:none]">
                    {busy ? 'Waking up…' : <>Wake up inside <ArrowRight size={16} /></>}
                  </button>
                </motion.div>
              ) : null}
            </AnimatePresence>

            {error && <p className="mt-4 text-sm text-rose-300/90">{error}</p>}
          </motion.form>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
