import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { LogOut, User } from 'lucide-react';
import { currentUser, onAuthChange, signOut } from '../services/authClient';

/** Signed-in email + sign out, in a corner of the map. A guest sees a small "Sign in" button instead. */
export default function AccountMenu({ onSignIn }) {
  const [user, setUser] = useState(currentUser);
  const [open, setOpen] = useState(false);

  useEffect(() => onAuthChange(setUser), []);

  return (
    <div className="fixed right-4 top-[max(1rem,env(safe-area-inset-top))] z-30">
      {user ? (
        <div className="relative">
          <button type="button" onClick={() => setOpen((v) => !v)} className="glass-btn flex items-center gap-2 rounded-full px-3 py-2 text-sm text-parchment/85" aria-haspopup="true" aria-expanded={open} aria-label="Account">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gold/20 font-serif text-xs font-medium text-gold">{(user.email[0] || '?').toUpperCase()}</span>
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
        <button type="button" onClick={onSignIn} className="glass-btn flex items-center gap-2 rounded-full px-3.5 py-2 text-sm text-parchment/75 hover:text-parchment" aria-label="Sign in">
          <User size={15} /> Sign in
        </button>
      )}
    </div>
  );
}
