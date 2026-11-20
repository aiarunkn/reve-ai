import { useState } from 'react';
import { motion } from 'framer-motion';
import { X, Users, GitBranch, Footprints, MapPin, UserCircle, Trash2, UserPlus } from 'lucide-react';
import { relKey, relationshipLabel } from '../services/storyStore';
import ConsequenceChip from './ConsequenceChip';

const TABS = [
  { key: 'cast', label: 'Cast', icon: Users },
  { key: 'threads', label: 'Threads', icon: GitBranch },
  { key: 'choices', label: 'Choices', icon: Footprints },
  { key: 'places', label: 'Places', icon: MapPin },
  { key: 'players', label: 'Players', icon: UserCircle },
];

export default function StoryJournal({ story, mood, places, portraits = [], onClose, onDelete }) {
  const [tab, setTab] = useState('cast');
  const me = story.players[0];
  const L = story.ledger;

  return (
    <motion.div className="fixed inset-0 z-40 flex justify-end" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} role="dialog" aria-modal="true" aria-label="Story journal">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <motion.aside
        initial={{ x: 40 }}
        animate={{ x: 0 }}
        exit={{ x: 40 }}
        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
        className="glass relative flex h-full w-full max-w-md flex-col"
      >
        <div className="flex items-center justify-between px-5 pt-5">
          <div>
            <p className="text-[10px] uppercase tracking-[0.3em]" style={{ color: mood.primary }}>journal</p>
            <h2 className="font-serif text-2xl italic text-parchment">{story.bible.title}</h2>
          </div>
          <button type="button" onClick={onClose} className="glass-btn rounded-full p-2 text-parchment/70" aria-label="Close journal"><X size={16} /></button>
        </div>
        <nav className="mt-3 flex gap-1 overflow-x-auto border-b border-white/5 px-3" role="tablist">
          {TABS.map(({ key, label, icon: Icon }) => (
            <button key={key} type="button" role="tab" aria-selected={tab === key} onClick={() => setTab(key)} className="relative flex shrink-0 items-center gap-1.5 px-2.5 py-2.5 text-xs text-parchment/55 hover:text-parchment" style={tab === key ? { color: mood.primary } : undefined}>
              <Icon size={13} /> {label}
              {tab === key && <motion.span layoutId="journal-underline" className="absolute inset-x-1 -bottom-px h-0.5 rounded-full" style={{ background: mood.primary }} />}
            </button>
          ))}
        </nav>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
          {tab === 'cast' && (
            <ul className="space-y-4">
              {story.bible.cast.map((c, k) => {
                const r = L.relationships[relKey(c.name, me.name)] || { score: 0, notes: [] };
                return (
                  <li key={c.name} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                    {portraits[k] && <img src={portraits[k]} alt={`Portrait of ${c.name}`} className="mb-3 aspect-[4/5] w-full rounded-xl object-cover" />}
                    <div className="flex items-baseline justify-between gap-2">
                      <p className="font-serif text-xl text-parchment">{c.name}</p>
                      <span className="text-[11px] uppercase tracking-wider" style={{ color: r.score >= 2 ? mood.primary : r.score <= -2 ? '#f0a0a8' : 'rgba(243,233,215,0.5)' }}>{relationshipLabel(r.score)}</span>
                    </div>
                    <p className="text-xs text-parchment/55">{c.role}</p>
                    <div className="relative mt-3 h-1.5 rounded-full bg-white/10">
                      <div className="absolute top-0 h-full w-px bg-white/30" style={{ left: '50%' }} />
                      <div className="absolute top-0 h-full rounded-full" style={{ left: r.score >= 0 ? '50%' : `${50 + r.score * 5}%`, width: `${Math.abs(r.score) * 5}%`, background: r.score >= 0 ? mood.primary : '#f0a0a8' }} />
                    </div>
                    <p className="mt-3 text-sm leading-relaxed text-parchment/70">{c.look} {c.personality}</p>
                    {r.notes.length > 0 && <p className="mt-2 text-xs italic text-parchment/50">Lately: {r.notes.slice(-2).join(' · ')}</p>}
                  </li>
                );
              })}
            </ul>
          )}

          {tab === 'threads' && (
            <ul className="space-y-2">
              {[...L.threads].sort((a, b) => (a.status === b.status ? 0 : a.status === 'open' ? -1 : 1)).map((t, i) => (
                <li key={i} className={`flex gap-2 font-serif text-lg leading-snug ${t.status === 'open' ? 'text-parchment/85' : 'text-parchment/35 line-through'}`}>
                  <GitBranch size={14} className="mt-1.5 shrink-0" style={{ color: t.status === 'open' ? mood.primary : 'rgba(243,233,215,0.3)' }} />
                  {t.text}
                </li>
              ))}
            </ul>
          )}

          {tab === 'choices' && (
            <ol className="space-y-4">
              {story.turns.filter((t) => t.kind === 'turn').map((t, i) => (
                <li key={i} className="border-l border-white/10 pl-4">
                  <p className="text-sm italic text-parchment/85">“{t.actions.map((a) => a.text).join(' / ')}”</p>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {(t.consequences || []).length ? t.consequences.map((c, k) => <ConsequenceChip key={k} c={c} mood={mood} small />) : <span className="text-xs text-parchment/35">no lasting consequence… yet</span>}
                  </div>
                </li>
              ))}
              {!story.turns.some((t) => t.kind === 'turn') && <p className="font-serif italic text-parchment/45">Your choices will be written here.</p>}
            </ol>
          )}

          {tab === 'places' && (
            <ul className="space-y-3">
              {story.bible.places.map((p, i) => (
                <li key={i} className="flex gap-3">
                  {places[i] ? <img src={places[i]} alt="" className="h-16 w-16 shrink-0 rounded-xl object-cover" /> : <div className="h-16 w-16 shrink-0 rounded-xl" style={{ background: `linear-gradient(135deg, ${mood.secondary}66, ${mood.bg[1]})` }} />}
                  <div>
                    <p className="font-serif text-lg text-parchment">{p.name}{story.scene === i && <span className="ml-2 text-[10px] uppercase tracking-wider" style={{ color: mood.primary }}>you are here</span>}</p>
                    <p className="text-sm leading-snug text-parchment/60">{p.description}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}

          {tab === 'players' && (
            <div className="space-y-3">
              {story.players.map((p, i) => (
                <div key={p.id} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                  <p className="font-serif text-xl text-parchment">{p.name} {i === 0 && <span className="text-xs text-parchment/45">(you)</span>}</p>
                  {p.look && <p className="mt-1 text-sm text-parchment/65">{p.look}</p>}
                  {p.want && <p className="mt-1 text-sm text-parchment/65">Wants: {p.want}</p>}
                  {p.description && <p className="mt-1 text-sm text-parchment/65">{p.description}</p>}
                  {i === 0 && p.secret && <p className="mt-2 text-xs italic text-parchment/45">Your secret: {p.secret}</p>}
                  {!p.joined && (
                    <>
                      <p className="mt-3 text-xs text-parchment/50">Played by the story until they join.</p>
                      <button type="button" disabled className="mt-2 inline-flex cursor-not-allowed items-center gap-1.5 rounded-full border border-white/15 px-3 py-1.5 text-xs text-parchment/50" title="Invites arrive with the shared database (next step)">
                        <UserPlus size={13} /> Invite {p.name.split(' ')[0]} — coming soon
                      </button>
                    </>
                  )}
                </div>
              ))}
              <button type="button" onClick={onDelete} className="mt-6 inline-flex items-center gap-1.5 text-xs text-parchment/40 hover:text-rose-200"><Trash2 size={13} /> Delete this story</button>
            </div>
          )}
        </div>
      </motion.aside>
    </motion.div>
  );
}
