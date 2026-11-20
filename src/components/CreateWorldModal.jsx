import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X, ImagePlus, ArrowLeft, ArrowRight, Sparkles } from 'lucide-react';

const MAX_PHOTOS = 5;
const MAX_BYTES = 25 * 1024 * 1024;
const IDEAS = [
  'A lighthouse keeper who collects the letters the sea brings in',
  'My grandmother’s kitchen, if it were a whole village',
  'The friend I wish I’d had at sixteen',
  'A night market that only opens when it snows',
];

export default function CreateWorldModal({ open, onClose, onSubmit }) {
  const [step, setStep] = useState(0);
  const [photos, setPhotos] = useState([]); // { file, url }
  const [description, setDescription] = useState('');
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef(null);

  useEffect(() => {
    if (open) {
      setStep(0);
      setPhotos((old) => { old.forEach((p) => URL.revokeObjectURL(p.url)); return []; });
      setDescription('');
      setError('');
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const add = (fileList) => {
    const files = [...(fileList || [])].filter((f) => f.type.startsWith('image/'));
    if (!files.length) return setError('Those don’t look like images — try JPG, PNG or WebP.');
    const tooBig = files.find((f) => f.size > MAX_BYTES);
    if (tooBig) return setError(`“${tooBig.name}” is too large (max 25 MB).`);
    setError('');
    setPhotos((prev) => {
      const room = MAX_PHOTOS - prev.length;
      if (files.length > room) setError(`A world holds up to ${MAX_PHOTOS} photos — kept the first ${room}.`);
      return [...prev, ...files.slice(0, room).map((file) => ({ file, url: URL.createObjectURL(file) }))];
    });
  };

  const remove = (i) =>
    setPhotos((prev) => {
      URL.revokeObjectURL(prev[i].url);
      return prev.filter((_, k) => k !== i);
    });

  const canNext = step === 0 ? photos.length > 0 : description.trim().length >= 8;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          role="dialog"
          aria-modal="true"
          aria-label="Imagine a world"
        >
          <div className="absolute inset-0 bg-midnight/70 backdrop-blur-sm" onClick={onClose} />
          <motion.div
            initial={{ y: 60, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 40, opacity: 0 }}
            transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
            className="glass relative flex max-h-[92dvh] w-full max-w-xl flex-col overflow-hidden rounded-t-3xl shadow-2xl sm:rounded-3xl"
          >
            <div className="flex items-center justify-between px-6 pt-5 sm:px-8 sm:pt-7">
              <div>
                <p className="text-[10px] uppercase tracking-[0.35em] text-gold/70">
                  Step {step + 1} of 2 · {step === 0 ? 'Your photos' : 'Your imagining'}
                </p>
                <h2 className="mt-1 font-serif text-3xl italic text-parchment">Imagine a World</h2>
              </div>
              <button type="button" onClick={onClose} className="glass-btn rounded-full p-2 text-parchment/70 hover:text-parchment" aria-label="Close">
                <X size={18} />
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6 sm:px-8">
              <AnimatePresence mode="wait">
                {step === 0 ? (
                  <motion.div key="photos" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
                    <p className="mb-4 font-serif text-lg italic text-parchment/70">
                      Choose up to five of your own photos. Each one becomes a place in your world.
                    </p>
                    <div
                      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                      onDragLeave={() => setDragging(false)}
                      onDrop={(e) => { e.preventDefault(); setDragging(false); add(e.dataTransfer.files); }}
                      className={`grid grid-cols-3 gap-2.5 rounded-2xl border border-dashed p-2.5 transition-colors sm:grid-cols-5 ${dragging ? 'border-lantern bg-lantern/10' : 'border-gold/30 bg-white/[0.02]'}`}
                    >
                      {photos.map((p, i) => (
                        <motion.div key={p.url} layout initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="group relative aspect-[3/4] overflow-hidden rounded-xl">
                          <img src={p.url} alt={`Photo ${i + 1}`} className="h-full w-full object-cover" />
                          <span className="absolute left-1.5 top-1.5 rounded-full bg-midnight/70 px-1.5 text-[10px] text-parchment/80">{i + 1}</span>
                          <button type="button" onClick={() => remove(i)} className="absolute right-1 top-1 rounded-full bg-midnight/70 p-1 text-parchment/80 opacity-100 transition-opacity hover:text-rose-200 sm:opacity-0 sm:group-hover:opacity-100" aria-label={`Remove photo ${i + 1}`}>
                            <X size={12} />
                          </button>
                        </motion.div>
                      ))}
                      {photos.length < MAX_PHOTOS && (
                        <button
                          type="button"
                          onClick={() => inputRef.current?.click()}
                          className="flex aspect-[3/4] flex-col items-center justify-center gap-1.5 rounded-xl border border-gold/20 text-parchment/50 transition-colors hover:border-gold/50 hover:text-lantern"
                        >
                          <ImagePlus size={22} strokeWidth={1.4} />
                          <span className="text-[11px]">{photos.length ? 'Add' : 'Add photos'}</span>
                        </button>
                      )}
                    </div>
                    <input ref={inputRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => { add(e.target.files); e.target.value = ''; }} />
                    <p className="mt-3 text-xs text-parchment/40">{photos.length} / {MAX_PHOTOS} · drag & drop works too</p>
                    {error && <p className="mt-2 text-sm text-rose-300/90">{error}</p>}
                  </motion.div>
                ) : (
                  <motion.div key="describe" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-4">
                    <div className="flex gap-1.5">
                      {photos.map((p) => <img key={p.url} src={p.url} alt="" className="h-12 w-10 rounded-md object-cover opacity-80" />)}
                    </div>
                    <p className="font-serif text-lg italic text-parchment/70">Describe a person or a place you want to imagine.</p>
                    <textarea
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      maxLength={1500}
                      rows={5}
                      autoFocus
                      placeholder="Someone you miss, a place you dream about, a friend who doesn’t exist yet…"
                      className="w-full resize-none rounded-2xl border border-white/10 bg-midnight/40 p-4 font-serif text-xl leading-snug text-parchment placeholder:italic placeholder:text-parchment/35 focus:border-gold/50 focus:outline-none"
                    />
                    <div className="flex flex-wrap gap-2">
                      {IDEAS.map((idea) => (
                        <button key={idea} type="button" onClick={() => setDescription(idea)} className="rounded-full border border-white/10 px-3 py-1.5 text-left text-xs text-parchment/60 transition-colors hover:border-gold/40 hover:text-parchment">
                          {idea}
                        </button>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <div className="flex items-center justify-between gap-3 border-t border-white/5 px-6 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-4 sm:px-8">
              <button type="button" onClick={() => (step === 0 ? onClose() : setStep(0))} className="inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-sm text-parchment/60 hover:text-parchment">
                {step === 0 ? 'Not now' : (<><ArrowLeft size={15} /> Back</>)}
              </button>
              {step === 0 ? (
                <button type="button" disabled={!canNext} onClick={() => setStep(1)} className="inline-flex items-center gap-2 rounded-full border border-gold/40 bg-gold/10 px-5 py-2.5 text-sm text-parchment hover:bg-gold/20 disabled:cursor-not-allowed disabled:opacity-35">
                  Continue <ArrowRight size={15} />
                </button>
              ) : (
                <motion.button
                  type="button"
                  disabled={!canNext}
                  whileTap={canNext ? { scale: 0.97 } : undefined}
                  onClick={() => onSubmit({ files: photos.map((p) => p.file), description: description.trim() })}
                  className="btn-lantern inline-flex items-center gap-2 rounded-full px-6 py-3 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-40 disabled:[animation:none]"
                >
                  <Sparkles size={16} /> Imagine this world
                </motion.button>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
