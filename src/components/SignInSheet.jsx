import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X, Mail, ArrowRight } from 'lucide-react';
import { sendMagicLink } from '../services/authClient';

/**
 * "Keep dreaming — sign in with your email." Magic link, no password. Opened either from the
 * account menu, or automatically when a guest hits a daily limit (see api/_limits.js → signIn: true).
 */
export default function SignInSheet({ open, reason, onClose }) {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);

  useEffect(() => {
    if (!open) return;
    setEmail('');
    setError('');
    setSent(false);
    setBusy(false);
  }, [open]);

  const submit = async (e) => {
    e.preventDefault();
    const value = email.trim();
    if (!value || busy) return;
    setBusy(true);
    setError('');
    try {
      await sendMagicLink(value);
      setSent(true);
    } catch (err) {
      setError(err.message || 'Couldn’t send the link. Try again?');
    } finally {
      setBusy(false);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-md" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} role="dialog" aria-modal="true" aria-label="Sign in">
          <motion.div initial={{ y: 24, scale: 0.97 }} animate={{ y: 0, scale: 1 }} className="glass relative w-full max-w-md rounded-[2rem] px-6 pb-7 pt-9 text-center sm:px-8">
            <button type="button" onClick={onClose} className="absolute right-4 top-4 rounded-full p-2 text-parchment/50 hover:text-parchment" aria-label="Close"><X size={18} /></button>
            <h2 className="font-serif text-3xl italic text-parchment text-glow">Keep dreaming</h2>
            {reason && <p className="mx-auto mt-3 max-w-xs text-sm leading-relaxed text-parchment/65">{reason}</p>}
            <p className="mt-3 text-sm text-parchment/55">Sign in with your email — no password, just a link.</p>

            {sent ? (
              <p className="mt-7 font-serif text-lg leading-relaxed text-parchment/85">
                A link is on its way to <span className="text-gold">{email.trim()}</span>. Open it on this device to come back in.
              </p>
            ) : (
              <form onSubmit={submit} className="mt-6">
                <div className="flex items-center gap-2 rounded-2xl border border-white/15 bg-midnight/60 px-4 py-3 focus-within:border-gold/60">
                  <Mail size={16} className="shrink-0 text-parchment/40" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoFocus
                    autoComplete="email"
                    placeholder="you@example.com"
                    aria-label="Your email"
                    className="min-w-0 flex-1 bg-transparent font-serif text-lg text-parchment placeholder:text-parchment/35 focus:outline-none"
                  />
                </div>
                <button type="submit" disabled={!email.trim() || busy} className="btn-lantern mt-6 inline-flex items-center gap-2 rounded-full px-7 py-3 text-[15px] font-medium disabled:opacity-40 disabled:[animation:none]">
                  {busy ? 'Sending…' : <>Send magic link <ArrowRight size={16} /></>}
                </button>
                {error && <p className="mt-4 text-sm text-rose-300/90">{error}</p>}
              </form>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
