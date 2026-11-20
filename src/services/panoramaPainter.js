/**
 * The free, in-browser 360° painter.
 *
 * paintPanorama(photo, mood) -> Blob (JPEG, equirectangular 2:1)
 *
 * Each feeling gets its own hand-painted world (dusk village with floating lanterns,
 * a sea of clouds under the Milky Way, misty twilight ridges, a neon city in the rain,
 * sunny meadows). The photo itself is painted into the front of the world, with a
 * soft, enlarged echo around it, so the 3D photo's faded edges melt into matching colour.
 *
 * Layout: u = 0.5 is straight ahead (where the 3D photo sits), v = 0.5 is eye level.
 * Everything that crosses the left/right edge is drawn twice so the seam is invisible.
 */
import { getMood } from '../data/moods';
import { drawFit, loadImage, toBlob } from './depthEstimator';

const W = 3072;
const H = 1536;
const HORIZON = H * 0.5;

// must match ExploreScene: the photo sits 10 units away and covers 56° vertically
const PHOTO_V_DEG = 56;
const PHOTO_DIST = 10;

/* ------------------------------ tiny helpers ------------------------------ */

export function seeded(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashStr(s) {
  let h = 2166136261;
  for (const ch of String(s)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return h >>> 0;
}

const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
const rgba = (c, a = 1) => `rgba(${c.map((v) => Math.round(Math.max(0, Math.min(255, v)))).join(',')},${a})`;
const TAU = Math.PI * 2;

/** Draw at x, and again one world-width away if it would cross the seam. */
function wrap(x, margin, fn) {
  fn(x);
  if (x < margin) fn(x + W);
  if (x > W - margin) fn(x - W);
}

function glow(ctx, x, y, r, c, a, sy = 1) {
  wrap(x, r, (xx) => {
    ctx.save();
    ctx.translate(xx, y);
    ctx.scale(1, sy);
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
    g.addColorStop(0, rgba(c, a));
    g.addColorStop(1, rgba(c, 0));
    ctx.fillStyle = g;
    ctx.fillRect(-r, -r, r * 2, r * 2);
    ctx.restore();
  });
}

function disc(ctx, x, y, r, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fill();
}

/** A seamless ridge line: a sum of sine waves whose frequencies are whole numbers. */
function ridge(rand, octaves = [1, 2, 3, 5, 8, 13]) {
  const ph = octaves.map(() => rand() * TAU);
  const amp = octaves.map((_, i) => 1 / (i + 1.3));
  const norm = amp.reduce((a, b) => a + b, 0);
  return (x) => octaves.reduce((s, k, i) => s + Math.sin((x / W) * TAU * k + ph[i]) * amp[i], 0) / norm;
}

function fillRidge(ctx, f, base, height, color) {
  ctx.beginPath();
  ctx.moveTo(0, H);
  for (let x = 0; x <= W; x += 6) ctx.lineTo(x, base - f(x) * height);
  ctx.lineTo(W, H);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
}

function band(ctx, y0, y1, c, a) {
  const g = ctx.createLinearGradient(0, y0, 0, y1);
  g.addColorStop(0, rgba(c, 0));
  g.addColorStop(0.5, rgba(c, a));
  g.addColorStop(1, rgba(c, 0));
  ctx.fillStyle = g;
  ctx.fillRect(0, y0, W, y1 - y0);
}

function skyGradient(ctx, stops) {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  stops.forEach(([t, c]) => g.addColorStop(t, rgba(c)));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
}

function stars(ctx, rand, count, maxY, bright = 1) {
  for (let i = 0; i < count; i++) {
    const y = Math.pow(rand(), 1.5) * maxY;
    const fade = 1 - y / maxY;
    const big = rand() < 0.04;
    ctx.fillStyle = `rgba(${230 + rand() * 25},${232 + rand() * 23},255,${(0.2 + rand() * 0.75) * fade * bright})`;
    const s = big ? 3 : rand() < 0.3 ? 2 : 1.3;
    ctx.fillRect(rand() * W, y, s, s);
    if (big) glow(ctx, rand() * W, y, 10, [220, 230, 255], 0.35 * fade);
  }
}

function cloud(ctx, rand, x, y, w, c, a) {
  const puffs = 6 + Math.floor(rand() * 6);
  for (let i = 0; i < puffs; i++) {
    const px = x + (rand() - 0.5) * w;
    const py = y + (rand() - 0.6) * w * 0.18;
    glow(ctx, px, py, w * (0.16 + rand() * 0.14), c, a, 0.55);
  }
}

/* ------------------------------ the five worlds ------------------------------ */

function nostalgic(ctx, rand, P) {
  // a lantern-lit dusk over a little hillside village
  skyGradient(ctx, [[0, mix(P.zenith, [40, 18, 52], 0.5)], [0.32, [92, 44, 70]], [0.47, mix([236, 150, 82], P.primary, 0.4)], [0.52, [190, 104, 64]], [1, mix(P.ground, [22, 12, 14], 0.6)]]);
  stars(ctx, rand, 260, H * 0.3, 0.6);
  glow(ctx, W * 0.66, HORIZON - 20, 520, [255, 176, 96], 0.55, 0.6); // the sun just gone
  for (let i = 0; i < 14; i++) cloud(ctx, rand, rand() * W, H * (0.22 + rand() * 0.18), 260 + rand() * 260, [255, 170, 120], 0.08);

  fillRidge(ctx, ridge(rand), HORIZON + 10, 70, rgba([96, 52, 70], 0.85));
  const village = ridge(rand, [2, 3, 7]);
  fillRidge(ctx, village, HORIZON + 46, 40, rgba([46, 24, 36]));
  // cottages with warm windows along the ridge
  for (let x = rand() * 60; x < W; x += 34 + rand() * 70) {
    const top = HORIZON + 46 - village(x) * 40;
    const w = 22 + rand() * 26, h = 16 + rand() * 18;
    wrap(x, 60, (xx) => {
      ctx.fillStyle = rgba([40, 20, 30]);
      ctx.fillRect(xx, top - h, w, h + 8);
      ctx.beginPath();
      ctx.moveTo(xx - 4, top - h);
      ctx.lineTo(xx + w / 2, top - h - 12 - rand() * 8);
      ctx.lineTo(xx + w + 4, top - h);
      ctx.fill();
      if (rand() < 0.8) {
        ctx.fillStyle = `rgba(255,${190 + rand() * 40},110,0.95)`;
        ctx.fillRect(xx + w * 0.3, top - h * 0.6, 5, 6);
        glow(ctx, xx + w * 0.3 + 2, top - h * 0.6 + 3, 16, [255, 190, 110], 0.35);
      }
    });
  }
  // fields below, with a winding string of lantern lights
  const g = ctx.createLinearGradient(0, HORIZON + 60, 0, H);
  g.addColorStop(0, rgba([58, 30, 34]));
  g.addColorStop(1, rgba([16, 8, 12]));
  ctx.fillStyle = g;
  ctx.fillRect(0, HORIZON + 60, W, H);
  const path = ridge(rand, [1, 2, 4]);
  for (let x = 0; x < W; x += 26) {
    const y = HORIZON + 120 + path(x) * 60 + (x % 52 ? 0 : 4);
    disc(ctx, x, y, 2.4, 'rgba(255,214,140,0.9)');
    glow(ctx, x, y, 18, [255, 190, 110], 0.3);
  }
  // floating paper lanterns rising into the sky
  for (let i = 0; i < 90; i++) {
    const y = HORIZON - 30 - Math.pow(rand(), 0.8) * H * 0.4;
    const s = 3 + (y / HORIZON) * 9;
    const x = rand() * W;
    glow(ctx, x, y, s * 4.5, [255, 170, 90], 0.35);
    wrap(x, 20, (xx) => {
      ctx.fillStyle = `rgba(255,${200 + rand() * 40},140,0.95)`;
      ctx.beginPath();
      ctx.ellipse(xx, y, s * 0.7, s, 0, 0, TAU);
      ctx.fill();
    });
  }
}

function weightless(ctx, rand, P) {
  // floating above a sea of clouds under the Milky Way
  skyGradient(ctx, [[0, [4, 6, 22]], [0.35, mix(P.zenith, [12, 18, 58], 0.5)], [0.5, [52, 64, 130]], [0.56, [88, 98, 160]], [1, [16, 20, 52]]]);
  // the Milky Way: a soft wavy band of light and dense stars
  for (let x = 0; x < W; x += 24) {
    const y = H * 0.28 + Math.sin((x / W) * TAU + 1.2) * H * 0.12;
    glow(ctx, x, y, 120 + rand() * 80, mix([150, 140, 220], [230, 200, 255], rand()), 0.05, 0.5);
    for (let k = 0; k < 14; k++) {
      ctx.fillStyle = `rgba(255,255,255,${0.2 + rand() * 0.6})`;
      ctx.fillRect(x + (rand() - 0.5) * 60, y + (rand() - 0.5) * 120, 1.2, 1.2);
    }
  }
  stars(ctx, rand, 1500, H * 0.48, 1);
  glow(ctx, W * 0.8, H * 0.2, 260, [210, 220, 255], 0.3); // moon
  disc(ctx, W * 0.8, H * 0.2, 34, '#f3f1ff');
  disc(ctx, W * 0.8 - 9, H * 0.2 - 6, 7, 'rgba(200,200,230,0.5)');

  // small floating islands drifting far away
  for (let i = 0; i < 7; i++) {
    const x = rand() * W, y = H * (0.3 + rand() * 0.14), s = 14 + rand() * 30;
    wrap(x, s * 2, (xx) => {
      ctx.fillStyle = rgba([26, 28, 66], 0.9);
      ctx.beginPath();
      ctx.moveTo(xx - s, y);
      ctx.quadraticCurveTo(xx, y - s * 0.3, xx + s, y);
      ctx.quadraticCurveTo(xx + s * 0.2, y + s * 0.4, xx, y + s * 1.1);
      ctx.quadraticCurveTo(xx - s * 0.2, y + s * 0.4, xx - s, y);
      ctx.fill();
    });
    disc(ctx, x + s * 0.3, y - 3, 2, 'rgba(255,220,150,0.9)');
  }

  // the sea of clouds, lit from above
  for (let row = 0; row < 7; row++) {
    const y = HORIZON + 10 + row * 34;
    const light = mix([190, 200, 245], [70, 80, 140], row / 7);
    for (let x = -100; x < W + 100; x += 90 + rand() * 60) cloud(ctx, rand, x, y, 220 + rand() * 160, light, 0.16 - row * 0.012);
  }
  band(ctx, HORIZON - 60, HORIZON + 80, [170, 180, 240], 0.25);
}

function bittersweet(ctx, rand, P) {
  // misty ridges at the last light of the day
  skyGradient(ctx, [[0, [20, 16, 52]], [0.3, [62, 40, 98]], [0.45, [176, 112, 160]], [0.5, [236, 160, 168]], [0.56, [128, 86, 130]], [1, [22, 16, 36]]]);
  stars(ctx, rand, 200, H * 0.22, 0.7);
  // crescent moon
  glow(ctx, W * 0.3, H * 0.18, 150, [240, 220, 255], 0.25);
  disc(ctx, W * 0.3, H * 0.18, 26, '#f4eaff');
  disc(ctx, W * 0.3 + 11, H * 0.18 - 6, 24, rgba([34, 24, 70]));
  for (let i = 0; i < 10; i++) cloud(ctx, rand, rand() * W, H * (0.3 + rand() * 0.14), 300 + rand() * 300, [240, 170, 200], 0.06);

  const layers = [
    [HORIZON + 4, 60, [150, 104, 150], 0.7],
    [HORIZON + 34, 80, [112, 76, 124], 0.8],
    [HORIZON + 70, 90, [76, 52, 98], 0.9],
    [HORIZON + 120, 100, [44, 30, 64], 1],
  ];
  layers.forEach(([base, h, c, a], i) => {
    const f = ridge(rand);
    fillRidge(ctx, f, base, h, rgba(c, a));
    band(ctx, base - h * 0.4, base + h * 0.5, [236, 180, 210], 0.12 - i * 0.02); // mist between ridges
    if (i === 3) {
      // a few lone streetlamps along the nearest ridge
      for (let k = 0; k < 9; k++) {
        const x = rand() * W, y = base - f(x) * h;
        ctx.strokeStyle = rgba([24, 16, 34]);
        ctx.lineWidth = 3;
        wrap(x, 30, (xx) => { ctx.beginPath(); ctx.moveTo(xx, y); ctx.lineTo(xx, y - 38); ctx.stroke(); });
        disc(ctx, x, y - 40, 3, 'rgba(255,220,170,0.95)');
        glow(ctx, x, y - 40, 46, [255, 200, 160], 0.4);
      }
    }
  });
  // birds heading home
  ctx.strokeStyle = 'rgba(40,24,50,0.7)';
  ctx.lineWidth = 2;
  for (let i = 0; i < 18; i++) {
    const x = W * 0.35 + rand() * W * 0.3, y = H * (0.3 + rand() * 0.1), s = 4 + rand() * 6;
    ctx.beginPath();
    ctx.moveTo(x - s, y - s * 0.4);
    ctx.quadraticCurveTo(x - s * 0.4, y - s * 0.6, x, y);
    ctx.quadraticCurveTo(x + s * 0.4, y - s * 0.6, x + s, y - s * 0.4);
    ctx.stroke();
  }
  band(ctx, HORIZON + 140, H, [200, 150, 200], 0.18);
}

function electric(ctx, rand, P) {
  // a neon city in the rain, all the way around you
  skyGradient(ctx, [[0, [6, 2, 20]], [0.35, [26, 8, 48]], [0.48, [96, 22, 100]], [0.5, [150, 40, 130]], [0.52, [40, 10, 60]], [1, [8, 4, 20]]]);
  for (let i = 0; i < 8; i++) cloud(ctx, rand, rand() * W, H * (0.2 + rand() * 0.2), 400 + rand() * 300, [140, 40, 140], 0.07);
  const neon = [[95, 242, 255], [255, 79, 200], [180, 120, 255], [255, 190, 90]];
  const skyline = document.createElement('canvas');
  skyline.width = W;
  skyline.height = HORIZON;
  const s = skyline.getContext('2d');
  // two rows of towers: far (taller, dimmer) and near
  [[0.55, [34, 14, 58], 0.5], [0.32, [14, 6, 28], 1]].forEach(([maxH, col, lit]) => {
    for (let x = -40; x < W; x += 26 + rand() * 48) {
      const bw = 34 + rand() * 60;
      const bh = HORIZON * (0.08 + rand() * maxH);
      const top = HORIZON - bh;
      const draw = (xx) => {
        s.fillStyle = rgba(col);
        s.fillRect(xx, top, bw, bh);
        if (rand() < 0.3) { s.fillRect(xx + bw / 2 - 1, top - 30, 2, 30); s.fillStyle = 'rgba(255,60,60,0.9)'; s.fillRect(xx + bw / 2 - 2, top - 32, 4, 4); }
        for (let wy = top + 8; wy < HORIZON - 6; wy += 11) {
          for (let wx = xx + 5; wx < xx + bw - 6; wx += 9) {
            if (rand() < 0.42 * lit) {
              const c = rand() < 0.75 ? [255, 214, 150] : neon[(rand() * 2) | 0];
              s.fillStyle = rgba(c, 0.55 + rand() * 0.4);
              s.fillRect(wx, wy, 4, 5);
            }
          }
        }
        if (rand() < 0.35 * lit) { // neon sign
          const c = neon[(rand() * neon.length) | 0];
          const sy = top + 14 + rand() * Math.min(80, bh * 0.5);
          s.fillStyle = rgba(c, 0.95);
          s.fillRect(xx + 6, sy, bw - 12, 6);
        }
      };
      draw(x);
      if (x > W - bw) draw(x - W);
      if (x < 0) draw(x + W);
    }
  });
  ctx.drawImage(skyline, 0, 0);
  // neon haze over the city
  for (let i = 0; i < 26; i++) glow(ctx, rand() * W, HORIZON - rand() * 120, 90 + rand() * 120, neon[(rand() * neon.length) | 0], 0.1, 0.6);
  // wet street: the city mirrored and smeared below eye level
  ctx.save();
  ctx.globalAlpha = 0.35;
  ctx.translate(0, HORIZON * 2);
  ctx.scale(1, -1);
  ctx.drawImage(skyline, 0, 0);
  ctx.restore();
  for (let i = 0; i < 160; i++) {
    const x = rand() * W, c = neon[(rand() * neon.length) | 0];
    const g = ctx.createLinearGradient(0, HORIZON, 0, HORIZON + 120 + rand() * 260);
    g.addColorStop(0, rgba(c, 0.18));
    g.addColorStop(1, rgba(c, 0));
    ctx.fillStyle = g;
    ctx.fillRect(x, HORIZON, 2 + rand() * 4, 380);
  }
  band(ctx, HORIZON - 40, HORIZON + 50, [255, 80, 200], 0.2);
}

function quietlyHappy(ctx, rand, P) {
  // a soft morning over rolling meadows
  skyGradient(ctx, [[0, [110, 150, 205]], [0.3, [170, 196, 226]], [0.46, [255, 228, 196]], [0.5, [255, 214, 170]], [0.52, [168, 170, 104]], [1, [70, 84, 50]]]);
  const sunX = W * 0.63, sunY = H * 0.3;
  // sunbeams radiating from the sun
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * TAU + rand() * 0.1;
    const g = ctx.createRadialGradient(sunX, sunY, 0, sunX, sunY, 900);
    g.addColorStop(0, 'rgba(255,240,200,0.16)');
    g.addColorStop(1, 'rgba(255,240,200,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(sunX, sunY);
    ctx.arc(sunX, sunY, 900, a, a + 0.08 + rand() * 0.06);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
  glow(ctx, sunX, sunY, 420, [255, 236, 190], 0.6);
  disc(ctx, sunX, sunY, 46, 'rgba(255,250,232,0.95)');
  for (let i = 0; i < 22; i++) cloud(ctx, rand, rand() * W, H * (0.12 + rand() * 0.26), 220 + rand() * 260, [255, 252, 245], 0.2);

  const hills = [
    [HORIZON + 6, 50, [150, 168, 140]],
    [HORIZON + 40, 70, [132, 160, 92]],
    [HORIZON + 90, 80, [104, 140, 70]],
    [HORIZON + 150, 90, [82, 116, 56]],
  ];
  hills.forEach(([base, h, c], i) => {
    const f = ridge(rand);
    fillRidge(ctx, f, base, h, rgba(c));
    band(ctx, base - h, base + 20, [255, 236, 200], 0.1);
    // round trees along the ridge
    for (let k = 0; k < 10 + i * 8; k++) {
      const x = rand() * W, y = base - f(x) * h, r = 5 + i * 4 + rand() * 6;
      const leaf = mix(c, [40, 70, 30], 0.45);
      wrap(x, r * 2, (xx) => {
        ctx.fillStyle = rgba([70, 52, 40]);
        ctx.fillRect(xx - 1.5, y - r * 0.6, 3, r * 0.8);
        disc(ctx, xx, y - r * 1.2, r, rgba(leaf));
        disc(ctx, xx - r * 0.3, y - r * 1.4, r * 0.55, rgba(mix(leaf, [255, 240, 180], 0.25)));
      });
    }
  });
  // wildflowers in the nearest meadow
  for (let i = 0; i < 900; i++) {
    const y = HORIZON + 200 + rand() * (H - HORIZON - 200);
    ctx.fillStyle = rgba([[255, 240, 200], [255, 190, 200], [250, 220, 120], [200, 210, 255]][(rand() * 4) | 0], 0.5 + rand() * 0.4);
    ctx.fillRect(rand() * W, y, 2, 2);
  }
}

const WORLDS = { nostalgic, weightless, bittersweet, electric, quietlyHappy };

/* ------------------------------ the photo, blended in ------------------------------ */

function blendPhoto(ctx, img) {
  const iw = img.naturalWidth || img.width;
  const ih = img.naturalHeight || img.height;
  const aspect = iw / ih;
  const h = 2 * PHOTO_DIST * Math.tan(((PHOTO_V_DEG / 2) * Math.PI) / 180);
  const wDeg = Math.min(124, (2 * Math.atan((h * aspect) / 2 / PHOTO_DIST) * 180) / Math.PI);
  const pw = (wDeg / 360) * W;
  const ph = (PHOTO_V_DEG / 180) * H;
  const cx = W / 2;
  const cy = H / 2;

  const layer = (scale, source, alpha, feather) => {
    const lw = pw * scale, lh = ph * scale;
    const c = document.createElement('canvas');
    c.width = Math.ceil(lw);
    c.height = Math.ceil(lh);
    const x = c.getContext('2d');
    x.imageSmoothingQuality = 'high';
    x.drawImage(source, 0, 0, lw, lh);
    // soft oval mask (a circle squashed to the layer's shape) so nothing has a hard edge
    x.globalCompositeOperation = 'destination-in';
    x.save();
    x.translate(lw / 2, lh / 2);
    x.scale(1, lh / lw);
    x.translate(-lw / 2, -lw / 2);
    const g2 = x.createRadialGradient(lw / 2, lw / 2, lw * (0.5 - feather), lw / 2, lw / 2, lw * 0.5);
    g2.addColorStop(0, 'rgba(0,0,0,1)');
    g2.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = g2;
    x.fillRect(0, 0, lw, lw);
    x.restore();
    ctx.globalAlpha = alpha;
    ctx.drawImage(c, cx - lw / 2, cy - lh / 2);
    ctx.globalAlpha = 1;
  };

  // a big, very soft echo of the photo's colours, so the world leans toward it near the front
  layer(2.2, drawFit(img, 24), 0.28, 0.45);
  layer(1.45, drawFit(img, 96), 0.5, 0.3);
  // the photo itself, right where the 3D photo floats, for a seamless edge
  layer(1.08, img, 1, 0.12);
}

/* ------------------------------ entry point ------------------------------ */

export async function paintPanorama(source, moodKey) {
  const img = await loadImage(source);
  const mood = getMood(moodKey);
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d');

  // palette from the photo + the feeling
  const tiny = drawFit(img, 24);
  const td = tiny.getContext('2d').getImageData(0, 0, tiny.width, tiny.height).data;
  const avg = (y0, y1) => {
    let r = 0, g = 0, b = 0, n = 0;
    for (let y = Math.floor(y0 * tiny.height); y < Math.ceil(y1 * tiny.height); y++) {
      for (let x = 0; x < tiny.width; x++) {
        const i = (y * tiny.width + x) * 4;
        r += td[i]; g += td[i + 1]; b += td[i + 2]; n++;
      }
    }
    return [r / n, g / n, b / n];
  };
  const P = {
    zenith: mix(avg(0, 0.3), hex(mood.bg[0]), 0.6),
    ground: avg(0.7, 1),
    primary: hex(mood.primary),
  };

  const rand = seeded(hashStr(`${moodKey}:${img.width}x${img.height}`));
  (WORLDS[moodKey] || nostalgic)(ctx, rand, P);
  blendPhoto(ctx, img);

  // gentle atmosphere over everything: a breath of the feeling's colour at eye level
  band(ctx, HORIZON - H * 0.12, HORIZON + H * 0.12, mix(hex(mood.primary), [255, 255, 255], 0.3), 0.12);

  return toBlob(c, 'image/jpeg', 0.86);
}
