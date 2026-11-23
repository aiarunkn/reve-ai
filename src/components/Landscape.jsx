import { motion, useScroll, useTransform } from 'framer-motion';

/** The illustrated dreamscape behind the world map: sky, moon, layered peaks, a sea of clouds. */
export default function Landscape() {
  const { scrollY } = useScroll();
  const moonY = useTransform(scrollY, [0, 1200], [0, 120]);
  const farY = useTransform(scrollY, [0, 1200], [0, 70]);
  const nearY = useTransform(scrollY, [0, 1200], [0, 30]);

  return (
    <div className="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden="true">
      <svg className="absolute inset-0 h-full w-full" viewBox="0 0 1440 900" preserveAspectRatio="xMidYMid slice">
        <defs>
          <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#050818" />
            <stop offset="0.38" stopColor="#0f1538" />
            <stop offset="0.66" stopColor="#261c4a" />
            <stop offset="0.86" stopColor="#4e2f52" />
            <stop offset="1" stopColor="#8a5145" />
          </linearGradient>
          <radialGradient id="moonGlow">
            <stop offset="0" stopColor="#ffe9c2" stopOpacity="0.55" />
            <stop offset="0.35" stopColor="#f5b85a" stopOpacity="0.14" />
            <stop offset="1" stopColor="#f5b85a" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="moon" cx="0.4" cy="0.38">
            <stop offset="0" stopColor="#fff6dd" />
            <stop offset="0.7" stopColor="#f6dfae" />
            <stop offset="1" stopColor="#e2b97a" />
          </radialGradient>
          <linearGradient id="peakFar" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#3a2d66" />
            <stop offset="1" stopColor="#1b1640" />
          </linearGradient>
          <linearGradient id="peakNear" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#221a46" />
            <stop offset="1" stopColor="#0e0c26" />
          </linearGradient>
          <linearGradient id="cloudSea" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#6d4a78" stopOpacity="0" />
            <stop offset="0.4" stopColor="#4a3466" stopOpacity="0.75" />
            <stop offset="1" stopColor="#1a1436" />
          </linearGradient>
          <filter id="soft" x="-20%" y="-50%" width="140%" height="200%">
            <feGaussianBlur stdDeviation="14" />
          </filter>
          <filter id="softer" x="-20%" y="-50%" width="140%" height="200%">
            <feGaussianBlur stdDeviation="30" />
          </filter>
        </defs>

        <rect width="1440" height="900" fill="url(#sky)" />

        {/* aurora-like ribbon */}
        <path
          d="M-50 260 C 300 160, 520 330, 820 220 S 1300 140, 1500 240"
          stroke="#7b6fd6"
          strokeOpacity="0.16"
          strokeWidth="90"
          fill="none"
          filter="url(#softer)"
        />

        <motion.g style={{ y: moonY }}>
          <circle cx="1110" cy="190" r="260" fill="url(#moonGlow)" />
          <circle cx="1110" cy="190" r="56" fill="url(#moon)" />
          <circle cx="1094" cy="178" r="9" fill="#e6c891" opacity="0.45" />
          <circle cx="1126" cy="206" r="6" fill="#e6c891" opacity="0.4" />
        </motion.g>

        {/* distant floating islets */}
        <motion.g style={{ y: farY }} opacity="0.55">
          <path d="M210 330 q40 -14 80 0 q-14 34 -40 52 q-26 -18 -40 -52z" fill="#2b2257" />
          <path d="M1250 420 q30 -10 60 0 q-10 26 -30 38 q-20 -12 -30 -38z" fill="#2b2257" />
          <circle cx="250" cy="326" r="3" fill="#f5b85a" opacity="0.8" />
        </motion.g>

        <motion.g style={{ y: farY }}>
          <path
            d="M0 640 L120 520 L210 590 L330 450 L450 600 L560 520 L690 610 L820 470 L960 600 L1080 500 L1210 610 L1330 520 L1440 590 L1440 900 L0 900Z"
            fill="url(#peakFar)"
            opacity="0.9"
          />
          {/* moonlit ridge highlights */}
          <path d="M330 450 L370 500 M820 470 L862 520 M1080 500 L1112 540" stroke="#9f8fe0" strokeOpacity="0.25" strokeWidth="3" />
        </motion.g>

        <motion.g style={{ y: nearY }}>
          <path
            d="M0 720 C 160 640, 300 700, 420 660 S 700 600, 860 680 S 1180 620, 1440 690 L1440 900 L0 900Z"
            fill="url(#peakNear)"
          />
          {/* tiny village lanterns */}
          {[180, 236, 610, 655, 1010, 1270, 1300].map((x, i) => (
            <circle key={x} cx={x} cy={690 - (i % 3) * 12} r="2.4" fill="#ffc777" opacity="0.85" />
          ))}
        </motion.g>

        {/* sea of clouds */}
        <ellipse cx="300" cy="860" rx="520" ry="90" fill="#3d2c5c" opacity="0.7" filter="url(#soft)" />
        <ellipse cx="1100" cy="880" rx="600" ry="100" fill="#3d2c5c" opacity="0.7" filter="url(#soft)" />
        <rect y="700" width="1440" height="200" fill="url(#cloudSea)" />
      </svg>
      {/* warm vignette */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_40%,rgba(5,6,20,0.65)_100%)]" />
    </div>
  );
}
