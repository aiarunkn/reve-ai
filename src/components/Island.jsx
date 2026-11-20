/** A small floating island (grass cap, layered rock, hanging roots, Monument-Valley steps). */
export default function Island({ glow = '#f5b85a', variant = 0, className = '' }) {
  const id = `isl-${variant}-${glow.replace(/[^a-z0-9]/gi, '')}`;
  return (
    <svg viewBox="0 0 240 150" className={className} aria-hidden="true">
      <defs>
        <linearGradient id={`${id}-rock`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#3b3060" />
          <stop offset="0.6" stopColor="#231c42" />
          <stop offset="1" stopColor="#120f28" />
        </linearGradient>
        <linearGradient id={`${id}-grass`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#4f7a63" />
          <stop offset="1" stopColor="#2c4a45" />
        </linearGradient>
        <radialGradient id={`${id}-glow`}>
          <stop offset="0" stopColor={glow} stopOpacity="0.55" />
          <stop offset="1" stopColor={glow} stopOpacity="0" />
        </radialGradient>
      </defs>

      <ellipse cx="120" cy="22" rx="110" ry="26" fill={`url(#${id}-glow)`} />

      {/* rock body */}
      <path
        d="M14 24 C 40 20, 200 20, 226 24 C 220 50, 190 64, 168 84 C 150 100, 140 128, 120 146 C 104 126, 92 104, 74 88 C 50 68, 22 52, 14 24Z"
        fill={`url(#${id}-rock)`}
      />
      {/* strata lines */}
      <path d="M30 42 C 80 50, 160 50, 212 40" stroke="#4b3f78" strokeWidth="1.5" fill="none" opacity="0.7" />
      <path d="M56 66 C 100 74, 150 72, 186 62" stroke="#4b3f78" strokeWidth="1.2" fill="none" opacity="0.5" />
      <path d="M90 98 C 110 104, 132 102, 150 96" stroke="#4b3f78" strokeWidth="1" fill="none" opacity="0.4" />
      {/* lit rim */}
      <path d="M14 24 C 22 52, 50 68, 74 88" stroke={glow} strokeOpacity="0.35" strokeWidth="1.5" fill="none" />

      {/* hanging roots */}
      {[60, 96, 142, 178].map((x, i) => (
        <path
          key={x}
          d={`M${x} ${40 + i * 6} q ${i % 2 ? 6 : -6} 20 0 ${34 + (i % 3) * 10}`}
          stroke="#5e8a6b"
          strokeOpacity="0.55"
          strokeWidth="1.4"
          fill="none"
        />
      ))}

      {/* grass cap */}
      <path d="M10 24 C 40 12, 200 12, 230 24 C 200 32, 40 32, 10 24Z" fill={`url(#${id}-grass)`} />

      {/* steps (variant-dependent side) */}
      <g transform={variant % 2 ? 'translate(176 10)' : 'translate(36 10)'} fill="#d9cbb0" opacity="0.85">
        <rect x="0" y="6" width="18" height="4" rx="1" />
        <rect x="4" y="2" width="14" height="4" rx="1" fill="#efe3c8" />
      </g>

      {/* tiny lantern post */}
      <g transform={variant % 2 ? 'translate(52 0)' : 'translate(186 0)'}>
        <line x1="0" y1="20" x2="0" y2="4" stroke="#2a2240" strokeWidth="1.6" />
        <circle cx="0" cy="4" r="9" fill={glow} opacity="0.25" />
        <circle cx="0" cy="4" r="2.6" fill="#ffe2a8" />
      </g>
    </svg>
  );
}
