import { Heart, Handshake, KeyRound, Gem, MapPin, GitBranch, Megaphone } from 'lucide-react';

const KIND_ICONS = { relationship: Heart, promise: Handshake, secret: KeyRound, item: Gem, place: MapPin, thread: GitBranch, reputation: Megaphone };

/** A lasting consequence of a choice: "Léa will remember you lied about the gallery". */
export default function ConsequenceChip({ c, mood, small = false }) {
  const Icon = KIND_ICONS[c.kind] || GitBranch;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border ${small ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-1 text-xs'}`} style={{ borderColor: `${mood.primary}40`, background: `${mood.primary}12`, color: mood.primary }}>
      <Icon size={small ? 11 : 12} /> <span className="text-parchment/85">{c.text}</span>
    </span>
  );
}

