import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X, ImagePlus, ArrowLeft, ArrowRight, Feather, UserPlus } from 'lucide-react';

const STEPS = ['The premise', 'Who you are', 'Places (optional)'];
const PREMISES = [
  '1920s Paris: my best friend and I are rival artists. Give us apartments, friends, and a story that changes with our decisions.',
  'A school of magic of my own, hidden in a rainy northern valley, where I arrive a year late and nobody will say why.',
  'A lighthouse at the edge of the world that receives letters from people who haven’t been born yet.',
  'Seoul, 2049: I run a tiny noodle bar where androids come to remember their dreams.',
];
const MAX_PHOTOS = 5;

const field = 'w-full rounded-xl border border-white/10 bg-midnight/40 px-3.5 py-2.5 text-[15px] text-parchment placeholder:text-parchment/35 focus:border-gold/50 focus:outline-none';

export default function CreateStoryModal({ open, onClose, onSubmit }) {
  const [step, setStep] = useState(0);
  const [premise, setPremise] = useState('');
  const [you, setYou] = useState({ name: '', look: '', want: '', secret: '' });
  const [withFriend, setWithFriend] = useState(false);
  const [friend, setFriend] = useState({ name: '', description: '' });
  const [photos, setPhotos] = useState([]);
  const inputRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    setStep(0); setPremise(''); setYou({ name: '', look: '', want: '', secret: '' });
    setWithFriend(false); setFriend({ name: '', description: '' });
    setPhotos((old) => { old.forEach((p) => URL.revokeObjectURL(p.url)); return []; });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  // if the premise mentions a friend, offer to bring them in
  useEffect(() => {
    if (/\b(friend|sister|brother|partner|we|us|our)\b/i.test(premise)) setWithFriend(true);
  }, [premise]);

  const addPhotos = (list) => {
    const files = [...(list || [])].filter((f) => f.type.startsWith('image/') && f.size < 25 * 1024 * 1024);
    setPhotos((prev) => [...prev, ...files.slice(0, MAX_PHOTOS - prev.length).map((file) => ({ file, url: URL.createObjectURL(file) }))]);
  };

  const ok = [premise.trim().length >= 12, you.name.trim().length > 0 && (!withFriend || friend.name.trim().length > 0), true][step];

  const submit = () => {
    const players = [{ id: 'p1', name: you.name.trim(), look: you.look.trim(), want: you.want.trim(), secret: you.secret.trim(), joined: true, local: true }];
    if (withFriend && friend.name.trim()) players.push({ id: 'p2', name: friend.name.trim(), description: friend.description.trim(), joined: false, local: false });
    onSubmit({ premise: premise.trim(), players, files: photos.map((p) => p.file) });
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} role="dialog" aria-modal="true" aria-label="Begin a story">
          <div className="absolute inset-0 bg-midnight/70 backdrop-blur-sm" onClick={onClose} />
          <motion.div initial={{ y: 60, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 40, opacity: 0 }} transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }} className="glass relative flex max-h-[92dvh] w-full max-w-xl flex-col overflow-hidden rounded-t-3xl shadow-2xl sm:rounded-3xl">
            <div className="flex items-center justify-between px-6 pt-5 sm:px-8 sm:pt-7">
              <div>
                <p className="text-[10px] uppercase tracking-[0.35em] text-gold/70">Step {step + 1} of 3 · {STEPS[step]}</p>
                <h2 className="mt-1 font-serif text-3xl italic text-parchment">Begin a Story</h2>
              </div>
              <button type="button" onClick={onClose} className="glass-btn rounded-full p-2 text-parchment/70 hover:text-parchment" aria-label="Close"><X size={18} /></button>
            </div>
            <div className="mx-6 mt-4 flex gap-2 sm:mx-8">
              {STEPS.map((s, i) => <div key={s} className="h-1 flex-1 rounded-full" style={{ background: i <= step ? '#d9b36c' : 'rgba(255,255,255,0.1)' }} />)}
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6 sm:px-8">
              <AnimatePresence mode="wait">
                {step === 0 && (
                  <motion.div key="s0" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-4">
                    <p className="font-serif text-lg italic text-parchment/70">What experience do you want to live?</p>
                    <textarea value={premise} onChange={(e) => setPremise(e.target.value)} rows={5} maxLength={2000} autoFocus placeholder="A place, a time, who you are there, and what’s at stake…" className={`${field} resize-none font-serif text-xl leading-snug`} />
                    <div className="space-y-2">
                      {PREMISES.map((p) => (
                        <button key={p} type="button" onClick={() => setPremise(p)} className="block w-full rounded-xl border border-white/10 px-3 py-2 text-left text-xs leading-relaxed text-parchment/60 transition-colors hover:border-gold/40 hover:text-parchment">{p}</button>
                      ))}
                    </div>
                  </motion.div>
                )}
                {step === 1 && (
                  <motion.div key="s1" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-3">
                    <p className="font-serif text-lg italic text-parchment/70">Who are you in this story?</p>
                    <input value={you.name} onChange={(e) => setYou({ ...you, name: e.target.value })} maxLength={40} placeholder="Your character’s name" className={field} autoFocus />
                    <input value={you.look} onChange={(e) => setYou({ ...you, look: e.target.value })} maxLength={160} placeholder="How they look (optional)" className={field} />
                    <input value={you.want} onChange={(e) => setYou({ ...you, want: e.target.value })} maxLength={160} placeholder="What they want more than anything (optional)" className={field} />
                    <input value={you.secret} onChange={(e) => setYou({ ...you, secret: e.target.value })} maxLength={200} placeholder="A secret only you and the story know (optional)" className={field} />

                    <div className="mt-5 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                      <label className="flex cursor-pointer items-center gap-2 text-sm text-parchment">
                        <input type="checkbox" checked={withFriend} onChange={(e) => setWithFriend(e.target.checked)} className="accent-[#d9b36c]" />
                        <UserPlus size={15} className="text-gold" /> Someone else plays alongside you
                      </label>
                      {withFriend && (
                        <div className="mt-3 space-y-2">
                          <input value={friend.name} onChange={(e) => setFriend({ ...friend, name: e.target.value })} maxLength={40} placeholder="Their character’s name" className={field} />
                          <textarea value={friend.description} onChange={(e) => setFriend({ ...friend, description: e.target.value })} rows={2} maxLength={400} placeholder="Who they are, so the story can play them until they join" className={`${field} resize-none`} />
                          <p className="text-[11px] leading-relaxed text-parchment/45">Until your friend joins from their own device, the story plays their character true to this description, and never makes big choices for them.</p>
                        </div>
                      )}
                    </div>
                  </motion.div>
                )}
                {step === 2 && (
                  <motion.div key="s2" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
                    <p className="mb-4 font-serif text-lg italic text-parchment/70">Add up to five photos and they’ll become real places in your story. Or skip, and the story invents them.</p>
                    <div onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); addPhotos(e.dataTransfer.files); }} className="grid grid-cols-3 gap-2.5 rounded-2xl border border-dashed border-gold/30 bg-white/[0.02] p-2.5 sm:grid-cols-5">
                      {photos.map((p, i) => (
                        <div key={p.url} className="relative aspect-[3/4] overflow-hidden rounded-xl">
                          <img src={p.url} alt={`Place ${i + 1}`} className="h-full w-full object-cover" />
                          <button type="button" onClick={() => setPhotos((prev) => { URL.revokeObjectURL(prev[i].url); return prev.filter((_, k) => k !== i); })} className="absolute right-1 top-1 rounded-full bg-midnight/70 p-1 text-parchment/80" aria-label={`Remove photo ${i + 1}`}><X size={12} /></button>
                        </div>
                      ))}
                      {photos.length < MAX_PHOTOS && (
                        <button type="button" onClick={() => inputRef.current?.click()} className="flex aspect-[3/4] flex-col items-center justify-center gap-1.5 rounded-xl border border-gold/20 text-parchment/50 hover:border-gold/50 hover:text-lantern">
                          <ImagePlus size={22} strokeWidth={1.4} /><span className="text-[11px]">Add</span>
                        </button>
                      )}
                    </div>
                    <input ref={inputRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => { addPhotos(e.target.files); e.target.value = ''; }} />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <div className="flex items-center justify-between gap-3 border-t border-white/5 px-6 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-4 sm:px-8">
              <button type="button" onClick={() => (step === 0 ? onClose() : setStep(step - 1))} className="inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-sm text-parchment/60 hover:text-parchment">
                {step === 0 ? 'Not now' : (<><ArrowLeft size={15} /> Back</>)}
              </button>
              {step < 2 ? (
                <button type="button" disabled={!ok} onClick={() => setStep(step + 1)} className="inline-flex items-center gap-2 rounded-full border border-gold/40 bg-gold/10 px-5 py-2.5 text-sm text-parchment hover:bg-gold/20 disabled:cursor-not-allowed disabled:opacity-35">
                  Continue <ArrowRight size={15} />
                </button>
              ) : (
                <motion.button type="button" whileTap={{ scale: 0.97 }} onClick={submit} className="btn-lantern inline-flex items-center gap-2 rounded-full px-6 py-3 text-sm font-medium">
                  <Feather size={16} /> Begin the story
                </motion.button>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
