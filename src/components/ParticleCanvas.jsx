import { useEffect, useRef } from 'react';

/**
 * A single canvas that layers several "weather" systems:
 * fireflies, embers, goldenRain, rain, neonRain, snow, stars, clouds, mist, sunbeams, motes.
 */

const rand = (a, b) => a + Math.random() * (b - a);
const TAU = Math.PI * 2;

const spriteCache = new Map();
function glowSprite([r, g, b], size = 48) {
  const key = `${r},${g},${b},${size}`;
  if (spriteCache.has(key)) return spriteCache.get(key);
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const x = c.getContext('2d');
  const grd = x.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.12, `rgba(${r},${g},${b},0.95)`);
  grd.addColorStop(0.4, `rgba(${r},${g},${b},0.25)`);
  grd.addColorStop(1, `rgba(${r},${g},${b},0)`);
  x.fillStyle = grd;
  x.fillRect(0, 0, size, size);
  spriteCache.set(key, c);
  return c;
}

const count = (base, w, h, d) => Math.max(6, Math.round(base * Math.min(1.8, Math.max(0.35, (w * h) / (1280 * 800))) * d));

/* ---------------- systems: (w, h, density) => { step(ctx, dt, t) } ---------------- */

function fireflies(w, h, d) {
  const sprite = glowSprite([255, 206, 120]);
  const ps = Array.from({ length: count(38, w, h, d) }, () => ({
    x: rand(0, w), y: rand(h * 0.15, h), vx: rand(-10, 10), vy: rand(-10, 10),
    s: rand(10, 26), ph: rand(0, TAU), sp: rand(0.6, 1.8),
  }));
  return {
    step(ctx, dt, t) {
      ctx.globalCompositeOperation = 'lighter';
      for (const p of ps) {
        p.vx += rand(-1, 1) * 30 * dt;
        p.vy += rand(-1, 1) * 30 * dt;
        const sp = Math.hypot(p.vx, p.vy);
        if (sp > 22) { p.vx *= 22 / sp; p.vy *= 22 / sp; }
        p.x += p.vx * dt; p.y += p.vy * dt;
        if (p.x < -20) p.x = w + 20; if (p.x > w + 20) p.x = -20;
        if (p.y < -20) p.y = h + 20; if (p.y > h + 20) p.y = -20;
        const a = 0.15 + 0.85 * Math.pow(0.5 + 0.5 * Math.sin(t * p.sp + p.ph), 3);
        ctx.globalAlpha = a;
        ctx.drawImage(sprite, p.x - p.s / 2, p.y - p.s / 2, p.s, p.s);
      }
    },
  };
}

function embers(w, h, d) {
  const sprite = glowSprite([255, 150, 70]);
  const spawn = (p, initial) => {
    p.x = rand(0, w); p.y = initial ? rand(0, h) : h + 10;
    p.vy = rand(14, 40); p.s = rand(6, 16); p.ph = rand(0, TAU); p.life = rand(0.5, 1);
    return p;
  };
  const ps = Array.from({ length: count(40, w, h, d) }, () => spawn({}, true));
  return {
    step(ctx, dt, t) {
      ctx.globalCompositeOperation = 'lighter';
      for (const p of ps) {
        p.y -= p.vy * dt;
        p.x += Math.sin(t * 0.8 + p.ph) * 18 * dt;
        if (p.y < -20) spawn(p);
        const fade = Math.min(1, p.y / (h * 0.6));
        ctx.globalAlpha = Math.max(0, fade * p.life * (0.6 + 0.4 * Math.sin(t * 6 + p.ph)));
        ctx.drawImage(sprite, p.x - p.s / 2, p.y - p.s / 2, p.s, p.s);
      }
    },
  };
}

function streakRain(color, { n = 140, speed = [380, 620], len = [12, 26], angle = 0.12, alpha = [0.12, 0.38], width = 1 } = {}) {
  return (w, h, d) => {
    const colors = Array.isArray(color[0]) ? color : [color];
    const ps = Array.from({ length: count(n, w, h, d) }, () => ({
      x: rand(-100, w), y: rand(-h, h), v: rand(...speed), l: rand(...len), a: rand(...alpha),
      c: colors[(Math.random() * colors.length) | 0],
    }));
    const dx = Math.sin(angle), dy = Math.cos(angle);
    return {
      ripples: [],
      step(ctx, dt) {
        ctx.globalCompositeOperation = 'lighter';
        ctx.lineWidth = width;
        ctx.lineCap = 'round';
        for (const p of ps) {
          p.x += dx * p.v * dt; p.y += dy * p.v * dt;
          if (p.y > h + 30) {
            if (this.splash && Math.random() < 0.35) this.ripples.push({ x: p.x, y: rand(h * 0.82, h), r: 1, a: 0.5, c: p.c });
            p.y = rand(-60, -10); p.x = rand(-100, w);
          }
          ctx.strokeStyle = `rgba(${p.c[0]},${p.c[1]},${p.c[2]},${p.a})`;
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(p.x - dx * p.l, p.y - dy * p.l);
          ctx.stroke();
        }
        if (this.splash) {
          for (let i = this.ripples.length - 1; i >= 0; i--) {
            const r = this.ripples[i];
            r.r += 40 * dt; r.a -= 0.7 * dt;
            if (r.a <= 0) { this.ripples.splice(i, 1); continue; }
            ctx.strokeStyle = `rgba(${r.c[0]},${r.c[1]},${r.c[2]},${r.a})`;
            ctx.beginPath();
            ctx.ellipse(r.x, r.y, r.r, r.r * 0.25, 0, 0, TAU);
            ctx.stroke();
          }
        }
      },
    };
  };
}

const goldenRain = streakRain([255, 196, 120], { n: 110, speed: [260, 420], alpha: [0.08, 0.3] });
const rain = streakRain([190, 205, 255], { n: 150, speed: [520, 760], len: [16, 30], angle: 0.18, alpha: [0.1, 0.3] });
const neonRainBase = streakRain([[95, 242, 255], [255, 79, 200], [190, 140, 255]], { n: 150, speed: [520, 780], len: [14, 34], angle: 0.05, alpha: [0.15, 0.45] });
function neonRain(w, h, d) {
  const s = neonRainBase(w, h, d);
  s.splash = true;
  const base = s.step.bind(s);
  s.step = (ctx, dt, t) => {
    // neon reflections shimmering on the "wet ground"
    ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createLinearGradient(0, h * 0.78, 0, h);
    g.addColorStop(0, 'rgba(255,79,200,0)');
    g.addColorStop(1, `rgba(255,79,200,${0.08 + 0.04 * Math.sin(t * 1.3)})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, h * 0.78, w, h * 0.22);
    for (let i = 0; i < 5; i++) {
      const x = (w / 5) * i + Math.sin(t * 0.7 + i) * 30 + w / 10;
      ctx.fillStyle = `rgba(${i % 2 ? '95,242,255' : '255,79,200'},${0.05 + 0.04 * Math.sin(t * 2 + i * 1.7)})`;
      ctx.fillRect(x - 2, h * 0.84, 4 + (i % 3) * 3, h * 0.16);
    }
    base(ctx, dt, t);
  };
  return s;
}

function snow(w, h, d) {
  const ps = Array.from({ length: count(150, w, h, d) }, () => {
    const r = rand(0.8, 3.4);
    return { x: rand(0, w), y: rand(-h, h), r, v: 18 + r * 16, ph: rand(0, TAU), a: rand(0.4, 0.95) };
  });
  return {
    step(ctx, dt, t) {
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = '#fff';
      for (const p of ps) {
        p.y += p.v * dt;
        p.x += Math.sin(t * 0.6 + p.ph) * 14 * dt + 4 * dt;
        if (p.y > h + 5) { p.y = -5; p.x = rand(0, w); }
        if (p.x > w + 5) p.x = -5;
        ctx.globalAlpha = p.a;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, TAU);
        ctx.fill();
      }
    },
  };
}

function stars(w, h, d) {
  const ps = Array.from({ length: count(150, w, h, d) }, () => ({
    x: rand(0, w), y: rand(0, h * 0.8), r: Math.random() < 0.08 ? rand(1.2, 1.9) : rand(0.3, 1.1),
    ph: rand(0, TAU), sp: rand(0.4, 2.2),
  }));
  const sprite = glowSprite([200, 215, 255], 24);
  let shooting = null;
  let next = rand(3, 8);
  return {
    step(ctx, dt, t) {
      ctx.globalCompositeOperation = 'lighter';
      for (const p of ps) {
        const a = 0.25 + 0.75 * (0.5 + 0.5 * Math.sin(t * p.sp + p.ph));
        ctx.globalAlpha = a;
        if (p.r > 1.15) ctx.drawImage(sprite, p.x - 6, p.y - 6, 12, 12);
        ctx.fillStyle = '#eef2ff';
        ctx.fillRect(p.x - p.r / 2, p.y - p.r / 2, p.r, p.r);
      }
      next -= dt;
      if (!shooting && next <= 0) {
        shooting = { x: rand(w * 0.1, w * 0.9), y: rand(0, h * 0.35), life: 1 };
        next = rand(5, 12);
      }
      if (shooting) {
        const s = shooting;
        s.x += 520 * dt; s.y += 220 * dt; s.life -= dt * 1.4;
        const g = ctx.createLinearGradient(s.x, s.y, s.x - 120, s.y - 50);
        g.addColorStop(0, `rgba(255,255,255,${Math.max(0, s.life)})`);
        g.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.globalAlpha = 1;
        ctx.strokeStyle = g;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(s.x, s.y);
        ctx.lineTo(s.x - 120, s.y - 50);
        ctx.stroke();
        if (s.life <= 0) shooting = null;
      }
    },
  };
}

function softBlobs(colors, { n = 6, size = [0.25, 0.45], alpha = [0.05, 0.12], speed = [6, 16], yRange = [0, 1] } = {}) {
  return (w, h) => {
    const ps = Array.from({ length: n }, () => ({
      x: rand(-0.2, 1.2) * w, y: rand(...yRange) * h, r: rand(...size) * Math.max(w, h),
      a: rand(...alpha), v: rand(...speed) * (Math.random() < 0.5 ? -1 : 1), ph: rand(0, TAU),
      c: colors[(Math.random() * colors.length) | 0],
    }));
    return {
      step(ctx, dt, t) {
        ctx.globalCompositeOperation = 'screen';
        for (const p of ps) {
          p.x += p.v * dt;
          if (p.x - p.r > w) p.x = -p.r;
          if (p.x + p.r < 0) p.x = w + p.r;
          const yy = p.y + Math.sin(t * 0.15 + p.ph) * 20;
          const g = ctx.createRadialGradient(p.x, yy, 0, p.x, yy, p.r);
          const a = p.a * (0.75 + 0.25 * Math.sin(t * 0.3 + p.ph));
          g.addColorStop(0, `rgba(${p.c},${a})`);
          g.addColorStop(1, `rgba(${p.c},0)`);
          ctx.globalAlpha = 1;
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.arc(p.x, yy, p.r, 0, TAU);
          ctx.fill();
        }
      },
    };
  };
}

const clouds = softBlobs(['170,185,255', '210,200,255'], { n: 7, size: [0.12, 0.24], alpha: [0.06, 0.14], speed: [6, 14], yRange: [0.1, 0.9] });
const mist = softBlobs(['190,140,220', '240,170,205', '140,120,210'], { n: 8, size: [0.22, 0.42], alpha: [0.06, 0.13], speed: [4, 10], yRange: [0.3, 1.05] });

function sunbeams(w, h) {
  const beams = Array.from({ length: 5 }, (_, i) => ({ off: i * 0.16 + rand(-0.03, 0.03), wd: rand(0.05, 0.11), ph: rand(0, TAU) }));
  return {
    step(ctx, dt, t) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 1;
      for (const b of beams) {
        const a = 0.045 + 0.035 * Math.sin(t * 0.25 + b.ph);
        const x0 = (b.off - 0.15) * w;
        const g = ctx.createLinearGradient(x0, 0, x0 + w * 0.5, h);
        g.addColorStop(0, `rgba(255,232,180,${a * 1.6})`);
        g.addColorStop(1, 'rgba(255,232,180,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.moveTo(x0, -10);
        ctx.lineTo(x0 + b.wd * w, -10);
        ctx.lineTo(x0 + b.wd * w * 3 + w * 0.55, h + 10);
        ctx.lineTo(x0 + w * 0.45, h + 10);
        ctx.closePath();
        ctx.fill();
      }
    },
  };
}

function motes(w, h, d) {
  const sprite = glowSprite([255, 236, 200], 20);
  const ps = Array.from({ length: count(70, w, h, d) }, () => ({
    x: rand(0, w), y: rand(0, h), s: rand(2, 7), vx: rand(2, 9), vy: rand(-6, 3), ph: rand(0, TAU),
  }));
  return {
    step(ctx, dt, t) {
      ctx.globalCompositeOperation = 'lighter';
      for (const p of ps) {
        p.x += (p.vx + Math.sin(t * 0.5 + p.ph) * 4) * dt;
        p.y += (p.vy + Math.cos(t * 0.4 + p.ph) * 4) * dt;
        if (p.x > w + 10) p.x = -10;
        if (p.y < -10) p.y = h + 10;
        if (p.y > h + 10) p.y = -10;
        ctx.globalAlpha = 0.35 + 0.5 * (0.5 + 0.5 * Math.sin(t * 1.2 + p.ph));
        ctx.drawImage(sprite, p.x - p.s / 2, p.y - p.s / 2, p.s, p.s);
      }
    },
  };
}

const SYSTEMS = { fireflies, embers, goldenRain, rain, neonRain, snow, stars, clouds, mist, sunbeams, motes };

export default function ParticleCanvas({ modes = ['fireflies'], density = 1, className = '' }) {
  const ref = useRef(null);
  const key = modes.join(',');

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas.getContext('2d');
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    let w = 0, h = 0, systems = [], raf = 0, last = performance.now();

    const build = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const r = canvas.getBoundingClientRect();
      if (!r.width || !r.height) return;
      if (Math.abs(r.width - w) < 2 && Math.abs(r.height - h) < 2 && systems.length) return;
      w = r.width; h = r.height;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const dens = density * (reduce ? 0.35 : 1);
      systems = key.split(',').map((m) => SYSTEMS[m]?.(w, h, dens)).filter(Boolean);
    };
    build();
    const ro = new ResizeObserver(build);
    ro.observe(canvas);

    const frame = (now) => {
      const dt = Math.min((now - last) / 1000, 0.05) * (reduce ? 0.4 : 1);
      last = now;
      ctx.clearRect(0, 0, w, h);
      const t = now / 1000;
      for (const s of systems) {
        ctx.save();
        s.step(ctx, dt, t);
        ctx.restore();
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    const onVis = () => { last = performance.now(); };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [key, density]);

  return <canvas ref={ref} aria-hidden="true" className={`pointer-events-none block h-full w-full ${className}`} />;
}
