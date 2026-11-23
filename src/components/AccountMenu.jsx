import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { LogOut } from 'lucide-react';
import { currentUser, onAuthChange, signOut } from '../services/authClient';

/** Signed-in email + sign out, in the top bar. A guest sees a "Sign in" button instead. */
export default function AccountMenu({ onSignIn }) {
  const [user, setUser] = useState(currentUser);
  const [open, setOpen] = useState(false);

  useEffect(() => onAuthChange(setUser), []);

  return (
    <div className="relative">
      {user ? (
        <div className="relative">
          <button type="button" onClick={() => setOpen((v) => !v)} className="glass-btn flex items-center gap-2 rounded-full px-3 py-2 text-sm text-parchment/85" aria-haspopup="true" aria-expanded={open} aria-label="Account">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-rose/25 text-xs font-semibold text-champagne">{(user.email[0] || '?').toUpperCase()}</span>
            <span className="hidden max-w-[10rem] truncate sm:inline">{user.email}</span>
          </button>
          <AnimatePresence>
            {open && (
              <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="glass absolute right-0 top-11 w-56 overflow-hidden rounded-2xl py-1.5 text-sm">
                <p className="truncate border-b border-white/10 px-4 py-2.5 text-xs text-parchment/50">{user.email}</p>
                <button type="button" onClick={() => { setOpen(false); signOut(); }} className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-parchment/85 hover:bg-white/5">
                  <LogOut size={15} /> Sign out
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      ) : (
        <button type="button" onClick={onSignIn} className="rounded-full border border-white/15 px-4 py-2 text-sm font-medium text-parchment transition-colors hover:border-white/35">
          Sign in
        </button>
      )}
    </div>
  );
}
