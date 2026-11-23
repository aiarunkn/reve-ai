import { useState } from 'react';
import { motion } from 'framer-motion';
import { X, Link2, Check, Share2 } from 'lucide-react';
import { CodeBoxes, ColorPicker } from './JoinWorld';
import { inviteLink } from '../services/sharedClient';
import { PLAYER_COLORS } from '../shared/worldState';

/**
 * Bring friends into this dream. A solo story is opened up first (you pick your color);
 * a shared one shows its code, a link, and who's here right now.
 */
export default function InviteSheet({ story, here = [], mood, onClose, onOpen }) {
  const code = story.shared?.code;
  const [color, setColor] = useState(PLAYER_COLORS[0]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const online = new Set(here.map((h) => h.playerId));

  const open = async () => {
    setBusy(true);
    setError('');
    try { await onOpen(color); } catch (err) { setError(err.message || 'Couldn’t open this world.'); setBusy(false); }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(inviteLink(code));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* clipboard blocked: the code is on screen */ }
  };
  const share = () => navigator.share?.({ title: story.bible.title, text: `Come live in “${story.bible.title}” with me on Reve. Code: ${code}`, url: inviteLink(code) }).catch(() => {});

  return (
    <motion.div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-md" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} role="dialog" aria-modal="true" aria-label="Invite friends" onClick={onClose}>
      <motion.div onClick={(e) => e.stopPropagation()} initial={{ y: 24, scale: 0.97 }} animate={{ y: 0, scale: 1 }} className="glass relative w-full max-w-md rounded-[2rem] px-6 pb-7 pt-9 text-center sm:px-8" style={{ boxShadow: `0 0 80px -24px ${mood.primary}` }}>
        <button type="button" onClick={onClose} className="absolute right-4 top-4 rounded-full p-2 text-parchment/50 hover:text-parchment" aria-label="Close"><X size={18} /></button>

        {!code ? (
          <>
            <h2 className="font-display text-3xl font-semibold text-parchment">Dream together</h2>
            <p className="mx-auto mt-3 max-w-xs text-sm leading-relaxed text-parchment/65">
              Friends wake up in this same world and live their own scenes in it. What one of you does, the others will feel.
            </p>
            <p className="mt-6 text-xs font-medium text-parchment/45">Your color</p>
            <div className="mt-3"><ColorPicker value={color} onChange={setColor} /></div>
            <button type="button" onClick={open} disabled={busy} className="btn-lantern mt-7 rounded-full px-7 py-3 text-base font-medium disabled:opacity-50">
              {busy ? 'Opening the door…' : 'Get a code'}
            </button>
            {error && <p className="mt-4 text-sm text-rose-300/90">{error}</p>}
          </>
        ) : (
          <>
            <h2 className="font-display text-3xl font-semibold text-parchment">Your world’s code</h2>
            <p className="mt-1.5 text-sm text-parchment/55">Friends type it in, or open the link.</p>
            <div className="mt-6 select-text"><CodeBoxes value={code} /></div>
            <div className="mt-6 flex justify-center gap-2">
              <button type="button" onClick={copy} className="btn-lantern inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-medium">
                {copied ? <><Check size={15} /> Copied</> : <><Link2 size={15} /> Copy invite link</>}
              </button>
              {typeof navigator !== 'undefined' && navigator.share && (
                <button type="button" onClick={share} className="glass-btn inline-flex items-center gap-2 rounded-full px-4 py-2.5 text-sm text-parchment/85"><Share2 size={15} /> Share</button>
              )}
            </div>

            <ul className="mt-7 space-y-2 text-left">
              {story.players.map((p, i) => (
                <li key={p.id} className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-2.5">
                  <span className="relative h-3 w-3 shrink-0 rounded-full" style={{ background: p.color, boxShadow: online.has(p.id) ? `0 0 10px ${p.color}` : 'none' }} />
                  <span className="min-w-0 flex-1 truncate text-lg text-parchment">{p.name}{i === 0 && <span className="ml-1.5 text-xs text-parchment/45">(you)</span>}</span>
                  <span className="text-xs font-medium text-parchment/40">{online.has(p.id) ? 'here now' : p.tag}</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </motion.div>
    </motion.div>
  );
}
