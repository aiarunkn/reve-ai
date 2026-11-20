import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X, ImagePlus, ArrowLeft, ArrowRight, Sparkles, RefreshCw } from 'lucide-react';
import ParticleCanvas from './ParticleCanvas';
import { MOOD_LIST, getMood } from '../data/moods';

const STEPS = ['A photo', 'A feeling', 'A message'];
const MAX_BYTES = 25 * 1024 * 1024;

export default function PlantSeedModal({ open, onClose, onSubmit }) {
  const [step, setStep] = useState(0);
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [mood, setMood] = useState(null);
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef(null);

  // reset when reopened
  useEffect(() => {
    if (open) {
      setStep(0); setFile(null); setPreview(null); setMood(null);
      setTitle(''); setMessage(''); setError('');
    }
  }, [open]);

  useEffect(() => () => preview && URL.revokeObjectURL(preview), [preview]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const accept = (f) => {
    if (!f) return;
    if (!f.type.startsWith('image/')) return setError('That doesn’t look like an image — try a JPG, PNG or WebP.');
    if (f.size > MAX_BYTES) return setError('That photo is a little too large (max 25 MB).');
    setError('');
    setFile(f);
    setPreview(URL.createObjectURL(f));
  };

  const canNext = [!!file, !!mood, message.trim().length > 0][step];
  const active = mood ? getMood(mood) : null;

  const submit = () => {
    if (!canNext) return;
    const fallbackTitle = message.trim().split(/[.!?\n—]/)[0].split(' ').slice(0, 5).join(' ');
    onSubmit({ file, mood, message: message.trim(), title: title.trim() || fallbackTitle || 'Untitled moment' });
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.4 }}
          role="dialog"
          aria-modal="true"
          aria-label="Plant a memory seed"
        >
          <div className="absolute inset-0 bg-midnight/70 backdrop-blur-sm" onClick={onClose} />

          <motion.div
            initial={{ y: 60, opacity: 0, scale: 0.98 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 40, opacity: 0, scale: 0.98 }}
            transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
            className="glass relative flex max-h-[92dvh] w-full max-w-xl flex-col overflow-hidden rounded-t-3xl shadow-2xl sm:rounded-3xl"
          >
            {/* mood weather preview behind the content */}
            <AnimatePresence>
              {active && (
                <motion.div
                  key={active.key}
                  className="pointer-events-none absolute inset-0"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.8 }}
                >
                  <div
                    className="absolute inset-0 opacity-60"
                    style={{ background: `radial-gradient(120% 80% at 50% 0%, ${active.glow}, transparent 60%), linear-gradient(180deg, ${active.bg[1]}cc, ${active.bg[0]}ee)` }}
                  />
                  <ParticleCanvas modes={active.particles} density={0.5} className="absolute inset-0" />
                </motion.div>
              )}
            </AnimatePresence>

            <div className="relative flex items-center justify-between px-6 pt-5 sm:px-8 sm:pt-7">
              <div>
                <p className="text-[10px] uppercase tracking-[0.35em] text-gold/70">
                  Step {step + 1} of 3 · {STEPS[step]}
                </p>
                <h2 className="mt-1 font-serif text-3xl italic text-parchment">Plant a Memory Seed</h2>
              </div>
              <button type="button" onClick={onClose} className="glass-btn rounded-full p-2 text-parchment/70 hover:text-parchment" aria-label="Close">
                <X size={18} />
              </button>
            </div>

            {/* progress */}
            <div className="relative mx-6 mt-4 flex gap-2 sm:mx-8">
              {STEPS.map((s, i) => (
                <div key={s} className="h-1 flex-1 overflow-hidden rounded-full bg-white/10">
                  <motion.div
                    className="h-full rounded-full bg-gradient-to-r from-gold to-lantern"
                    initial={false}
                    animate={{ width: i <= step ? '100%' : '0%' }}
                    transition={{ duration: 0.5 }}
                  />
                </div>
              ))}
            </div>

            <div className="relative min-h-0 flex-1 overflow-y-auto px-6 py-6 sm:px-8">
              <AnimatePresence mode="wait">
                {step === 0 && (
                  <motion.div key="s0" {...stepAnim}>
                    <p className="mb-4 font-serif text-lg italic text-parchment/70">Which moment do you want to keep?</p>
                    <div
                      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                      onDragLeave={() => setDragging(false)}
                      onDrop={(e) => { e.preventDefault(); setDragging(false); accept(e.dataTransfer.files?.[0]); }}
                      onClick={() => inputRef.current?.click()}
                      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && inputRef.current?.click()}
                      role="button"
                      tabIndex={0}
                      className={`group relative flex aspect-[4/3] w-full cursor-pointer items-center justify-center overflow-hidden rounded-2xl border border-dashed transition-all duration-300 ${
                        dragging ? 'border-lantern bg-lantern/10' : 'border-gold/35 bg-white/[0.03] hover:border-gold/60 hover:bg-white/[0.05]'
                      }`}
                    >
                      {preview ? (
                        <>
                          <motion.img
                            key={preview}
                            src={preview}
                            alt="Your chosen photo"
                            initial={{ opacity: 0, scale: 1.04 }}
                            animate={{ opacity: 1, scale: 1 }}
                            transition={{ duration: 0.6 }}
                            className="absolute inset-0 h-full w-full object-cover"
                          />
                          <div className="absolute inset-0 bg-gradient-to-t from-midnight/80 via-transparent to-transparent" />
                          <span className="glass-btn absolute bottom-3 right-3 inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs text-parchment/85">
                            <RefreshCw size={12} /> Choose another
                          </span>
                        </>
                      ) : (
                        <div className="flex flex-col items-center gap-3 px-6 text-center">
                          <div className="rounded-full border border-gold/30 p-4 text-gold transition-transform duration-500 group-hover:scale-110">
                            <ImagePlus size={26} strokeWidth={1.4} />
                          </div>
                          <p className="font-serif text-xl text-parchment/85">Drop a photo here</p>
                          <p className="text-xs text-parchment/45">or tap to choose · JPG, PNG, WebP</p>
                        </div>
                      )}
                    </div>
                    <input
                      ref={inputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => { accept(e.target.files?.[0]); e.target.value = ''; }}
                    />
                    {error && <p className="mt-3 text-sm text-rose-300/90">{error}</p>}
                  </motion.div>
                )}

                {step === 1 && (
                  <motion.div key="s1" {...stepAnim}>
                    <p className="mb-5 font-serif text-lg italic text-parchment/70">How does this moment feel when you hold it?</p>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      {MOOD_LIST.map((m) => {
                        const Icon = m.icon;
                        const selected = mood === m.key;
                        return (
                          <motion.button
                            key={m.key}
                            type="button"
                            whileTap={{ scale: 0.97 }}
                            onClick={() => setMood(m.key)}
                            aria-pressed={selected}
                            className={`relative flex items-center gap-3 overflow-hidden rounded-2xl border px-4 py-3.5 text-left transition-all duration-300 ${
                              selected ? 'border-transparent' : 'border-white/10 hover:border-white/25'
                            }`}
                            style={{
                              background: selected
                                ? `linear-gradient(135deg, ${m.secondary}55, ${m.bg[1]}cc)`
                                : 'rgba(255,255,255,0.03)',
                              boxShadow: selected ? `0 0 0 1.5px ${m.primary}, 0 0 28px -4px ${m.glow}` : 'none',
                            }}
                          >
                            <span
                              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
                              style={{ background: `radial-gradient(circle, ${m.primary}40, transparent 70%)`, color: m.primary }}
                            >
                              <Icon size={20} strokeWidth={1.6} />
                            </span>
                            <span>
                              <span className="block font-serif text-xl leading-tight text-parchment">{m.label}</span>
                              <span className="block text-[11px] tracking-wide text-parchment/55">{m.weather}</span>
                            </span>
                          </motion.button>
                        );
                      })}
                    </div>
                  </motion.div>
                )}

                {step === 2 && (
                  <motion.div key="s2" {...stepAnim} className="space-y-4">
                    <div className="flex items-center gap-4">
                      {preview && (
                        <img src={preview} alt="" className="h-16 w-16 shrink-0 rounded-t-full border border-gold/40 object-cover" />
                      )}
                      <input
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        maxLength={60}
                        placeholder="Name this memory (optional)"
                        className="w-full border-b border-gold/25 bg-transparent pb-2 font-serif text-2xl text-parchment placeholder:text-parchment/30 focus:border-lantern/70 focus:outline-none"
                      />
                    </div>
                    <textarea
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      maxLength={600}
                      rows={6}
                      autoFocus
                      placeholder="Write a message to your future self inside this moment..."
                      className="w-full resize-none rounded-2xl border border-white/10 bg-midnight/40 p-4 font-hand text-2xl leading-snug text-parchment placeholder:font-serif placeholder:text-lg placeholder:italic placeholder:text-parchment/35 focus:border-gold/50 focus:outline-none"
                    />
                    <p className="text-right text-[11px] text-parchment/35">{message.length}/600</p>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <div className="relative flex items-center justify-between gap-3 border-t border-white/5 px-6 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-4 sm:px-8">
              <button
                type="button"
                onClick={() => (step === 0 ? onClose() : setStep(step - 1))}
                className="inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-sm text-parchment/60 transition-colors hover:text-parchment"
              >
                {step === 0 ? 'Not now' : (<><ArrowLeft size={15} /> Back</>)}
              </button>
              {step < 2 ? (
                <button
                  type="button"
                  disabled={!canNext}
                  onClick={() => setStep(step + 1)}
                  className="inline-flex items-center gap-2 rounded-full border border-gold/40 bg-gold/10 px-5 py-2.5 text-sm text-parchment transition-all hover:bg-gold/20 disabled:cursor-not-allowed disabled:opacity-35"
                >
                  Continue <ArrowRight size={15} />
                </button>
              ) : (
                <motion.button
                  type="button"
                  disabled={!canNext}
                  onClick={submit}
                  whileHover={canNext ? { scale: 1.03 } : undefined}
                  whileTap={canNext ? { scale: 0.97 } : undefined}
                  className="btn-lantern inline-flex items-center gap-2 rounded-full px-6 py-3 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-40 disabled:[animation:none]"
                >
                  <Sparkles size={16} /> Step Inside
                </motion.button>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

const stepAnim = {
  initial: { opacity: 0, x: 24 },
  animate: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: -24 },
  transition: { duration: 0.35, ease: [0.22, 1, 0.36, 1] },
};
