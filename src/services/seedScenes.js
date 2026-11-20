/**
 * Procedurally painted "photos" for the three seed memories, so the world
 * feels alive with zero bundled image assets. Each painter draws on a canvas
 * which is then passed through the same stylizer as real uploads.
 */
import { stylizeLocally } from './memoryGenerator';

const W = 960;
const H = 720;

// Deterministic randomness so a seed scene looks the same every visit.
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function glow(ctx, x, y, r, color, alpha = 1) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, color.replace('ALPHA', alpha));
  g.addColorStop(1, color.replace('ALPHA', 0));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

/* ---------------------------- First Snow in Astana ---------------------------- */
function astanaSnow(ctx) {
  const R = rng(7);
  const sky = ctx.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, '#0a1034');
  sky.addColorStop(0.5, '#1f2a5e');
  sky.addColorStop(0.78, '#55467a');
  sky.addColorStop(1, '#8a6a86');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, H);

  // city glow on low clouds
  glow(ctx, W / 2, 560, 520, 'rgba(255,170,110,ALPHA)', 0.35);

  // far skyline
  ctx.fillStyle = '#2a2a5a';
  for (let x = -20; x < W; x += 30 + R() * 40) {
    const bh = 60 + R() * 140;
    ctx.fillRect(x, 560 - bh, 26 + R() * 30, bh);
  }

  // Bayterek-style tower: white lattice trunk crowned with a golden sphere
  const tx = W * 0.52;
  ctx.strokeStyle = '#e8ecff';
  ctx.lineWidth = 3;
  for (let i = -3; i <= 3; i++) {
    ctx.beginPath();
    ctx.moveTo(tx + i * 6, 600);
    ctx.bezierCurveTo(tx + i * 2, 420, tx + i * 3, 300, tx + i * 15, 228);
    ctx.stroke();
  }
  glow(ctx, tx, 200, 150, 'rgba(255,200,110,ALPHA)', 0.55);
  const sph = ctx.createRadialGradient(tx - 10, 188, 4, tx, 200, 38);
  sph.addColorStop(0, '#fff3c4');
  sph.addColorStop(0.5, '#f2b54e');
  sph.addColorStop(1, '#9a5a1e');
  ctx.fillStyle = sph;
  ctx.beginPath();
  ctx.arc(tx, 200, 36, 0, Math.PI * 2);
  ctx.fill();

  // mid buildings with lit windows and snowy roofs
  for (let x = -10; x < W; x += 70 + R() * 50) {
    if (Math.abs(x + 40 - tx) < 70) continue;
    const bw = 60 + R() * 50;
    const bh = 120 + R() * 170;
    const top = 600 - bh;
    ctx.fillStyle = '#151a42';
    ctx.fillRect(x, top, bw, bh);
    ctx.fillStyle = '#e6ebff';
    ctx.fillRect(x - 2, top - 5, bw + 4, 7);
    for (let wy = top + 14; wy < 590; wy += 18) {
      for (let wx = x + 8; wx < x + bw - 10; wx += 14) {
        if (R() < 0.38) {
          ctx.fillStyle = R() < 0.8 ? 'rgba(255,196,120,0.9)' : 'rgba(180,200,255,0.8)';
          ctx.fillRect(wx, wy, 6, 8);
        }
      }
    }
  }

  // snowy ground
  const ground = ctx.createLinearGradient(0, 590, 0, H);
  ground.addColorStop(0, '#b9c3ec');
  ground.addColorStop(1, '#6f78ab');
  ctx.fillStyle = ground;
  ctx.beginPath();
  ctx.moveTo(0, 600);
  ctx.quadraticCurveTo(W / 2, 580, W, 604);
  ctx.lineTo(W, H);
  ctx.lineTo(0, H);
  ctx.fill();

  // streetlamps
  [120, 340, 640, 860].forEach((lx) => {
    ctx.fillStyle = 'rgba(255,200,130,0.35)';
    ctx.beginPath();
    ctx.ellipse(lx, 660, 90, 18, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#1a1838';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(lx, 662);
    ctx.lineTo(lx, 520);
    ctx.stroke();
    glow(ctx, lx, 516, 90, 'rgba(255,205,140,ALPHA)', 0.75);
    ctx.fillStyle = '#fff1cf';
    ctx.beginPath();
    ctx.arc(lx, 516, 7, 0, Math.PI * 2);
    ctx.fill();
  });

  // falling snow
  for (let i = 0; i < 520; i++) {
    const r = R() * 2.6 + 0.6;
    ctx.fillStyle = `rgba(255,255,255,${0.35 + R() * 0.6})`;
    ctx.beginPath();
    ctx.arc(R() * W, R() * H, r, 0, Math.PI * 2);
    ctx.fill();
  }
}

/* ----------------------------- Midnight Train Home ---------------------------- */
function midnightTrain(ctx) {
  const R = rng(21);
  // interior
  ctx.fillStyle = '#120d1c';
  ctx.fillRect(0, 0, W, H);
  glow(ctx, 120, 40, 420, 'rgba(255,170,100,ALPHA)', 0.22);

  const wx = 110, wy = 90, ww = 740, wh = 470, rad = 46;
  const windowPath = new Path2D();
  windowPath.roundRect(wx, wy, ww, wh, rad);

  ctx.save();
  ctx.clip(windowPath);
  const night = ctx.createLinearGradient(0, wy, 0, wy + wh);
  night.addColorStop(0, '#080b22');
  night.addColorStop(0.55, '#1c1742');
  night.addColorStop(1, '#41285a');
  ctx.fillStyle = night;
  ctx.fillRect(wx, wy, ww, wh);

  // moon
  glow(ctx, 720, 170, 120, 'rgba(230,220,255,ALPHA)', 0.35);
  ctx.fillStyle = '#efe6ff';
  ctx.beginPath();
  ctx.arc(720, 170, 22, 0, Math.PI * 2);
  ctx.fill();

  // distant hills + city silhouette
  ctx.fillStyle = '#16123a';
  ctx.beginPath();
  ctx.moveTo(wx, 430);
  for (let x = wx; x <= wx + ww; x += 40) ctx.lineTo(x, 420 - R() * 50);
  ctx.lineTo(wx + ww, wy + wh);
  ctx.lineTo(wx, wy + wh);
  ctx.fill();

  // bokeh city lights
  const colors = ['rgba(255,190,110,ALPHA)', 'rgba(255,120,170,ALPHA)', 'rgba(130,170,255,ALPHA)', 'rgba(255,230,170,ALPHA)'];
  for (let i = 0; i < 90; i++) {
    const r = 6 + R() * 26;
    glow(ctx, wx + R() * ww, 360 + R() * 170, r, colors[(R() * colors.length) | 0], 0.25 + R() * 0.55);
  }

  // motion streaks of passing lights
  for (let i = 0; i < 18; i++) {
    const y = 470 + R() * 70;
    const x = wx + R() * ww;
    const g = ctx.createLinearGradient(x, y, x + 160, y);
    g.addColorStop(0, 'rgba(255,200,140,0)');
    g.addColorStop(0.5, 'rgba(255,200,140,0.45)');
    g.addColorStop(1, 'rgba(255,200,140,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x, y, 160, 2);
  }

  // faint reflection of a warm cabin lamp + a silhouette
  glow(ctx, 260, 210, 160, 'rgba(255,180,120,ALPHA)', 0.18);
  ctx.fillStyle = 'rgba(255,220,200,0.07)';
  ctx.beginPath();
  ctx.ellipse(300, 330, 46, 58, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(300, 470, 110, 90, 0, Math.PI, 0);
  ctx.fill();

  // raindrops on glass
  for (let i = 0; i < 320; i++) {
    const x = wx + R() * ww;
    const y = wy + R() * wh;
    const r = 1 + R() * 3.4;
    ctx.fillStyle = 'rgba(200,210,255,0.22)';
    ctx.beginPath();
    ctx.ellipse(x, y, r * 0.8, r, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.fillRect(x - r * 0.3, y - r * 0.5, 1, 1);
    if (R() < 0.12) {
      ctx.strokeStyle = 'rgba(200,210,255,0.16)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + (R() - 0.5) * 6, y - 30 - R() * 60);
      ctx.stroke();
    }
  }
  ctx.restore();

  // window frame
  ctx.lineWidth = 22;
  ctx.strokeStyle = '#2a2140';
  ctx.stroke(windowPath);
  ctx.lineWidth = 2;
  ctx.strokeStyle = 'rgba(255,200,150,0.35)';
  ctx.stroke(windowPath);

  // sill and a little paper cup of tea
  const sill = ctx.createLinearGradient(0, 590, 0, H);
  sill.addColorStop(0, '#3a2a3e');
  sill.addColorStop(1, '#1a1222');
  ctx.fillStyle = sill;
  ctx.fillRect(0, 590, W, H - 590);
  ctx.fillStyle = 'rgba(255,190,130,0.25)';
  ctx.fillRect(0, 590, W, 3);
  ctx.fillStyle = '#d9c7b0';
  ctx.beginPath();
  ctx.moveTo(640, 600);
  ctx.lineTo(700, 600);
  ctx.lineTo(692, 668);
  ctx.lineTo(648, 668);
  ctx.closePath();
  ctx.fill();
  glow(ctx, 670, 600, 60, 'rgba(255,190,130,ALPHA)', 0.25);
}

/* ----------------------------- Quiet Sunday Coffee ---------------------------- */
function sundayCoffee(ctx) {
  const R = rng(3);
  const wall = ctx.createLinearGradient(0, 0, W, H);
  wall.addColorStop(0, '#f3d7a2');
  wall.addColorStop(1, '#c48c5c');
  ctx.fillStyle = wall;
  ctx.fillRect(0, 0, W, H);

  // window
  const wx = 70, wy = 60, ww = 360, wh = 330;
  const sky = ctx.createLinearGradient(0, wy, 0, wy + wh);
  sky.addColorStop(0, '#cfe3f2');
  sky.addColorStop(1, '#fff1cf');
  ctx.fillStyle = sky;
  ctx.fillRect(wx, wy, ww, wh);
  glow(ctx, wx + 250, wy + 90, 220, 'rgba(255,250,225,ALPHA)', 0.95);
  ctx.fillStyle = '#7a5236';
  ctx.fillRect(wx + ww / 2 - 5, wy, 10, wh);
  ctx.fillRect(wx, wy + wh / 2 - 5, ww, 10);
  ctx.strokeStyle = '#7a5236';
  ctx.lineWidth = 14;
  ctx.strokeRect(wx, wy, ww, wh);

  // sunbeams
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 4; i++) {
    const off = i * 70;
    const g = ctx.createLinearGradient(wx, wy, wx + 700, wy + 600);
    g.addColorStop(0, 'rgba(255,240,200,0.22)');
    g.addColorStop(1, 'rgba(255,240,200,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(wx + 40 + off, wy + 40);
    ctx.lineTo(wx + 110 + off, wy + 20);
    ctx.lineTo(wx + 720 + off, wy + 650);
    ctx.lineTo(wx + 520 + off, wy + 700);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();

  // table
  const table = ctx.createLinearGradient(0, 450, 0, H);
  table.addColorStop(0, '#8e5d3b');
  table.addColorStop(1, '#4e2f1c');
  ctx.fillStyle = table;
  ctx.fillRect(0, 450, W, H - 450);
  ctx.strokeStyle = 'rgba(60,30,15,0.35)';
  ctx.lineWidth = 1.5;
  for (let i = 0; i < 26; i++) {
    const y = 460 + R() * 260;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.bezierCurveTo(W * 0.3, y + R() * 8 - 4, W * 0.6, y + R() * 8 - 4, W, y);
    ctx.stroke();
  }
  // light patch on the table
  ctx.fillStyle = 'rgba(255,230,180,0.28)';
  ctx.beginPath();
  ctx.moveTo(300, 470);
  ctx.lineTo(620, 470);
  ctx.lineTo(820, 640);
  ctx.lineTo(420, 640);
  ctx.closePath();
  ctx.fill();

  // book
  ctx.fillStyle = '#5b6e8a';
  ctx.save();
  ctx.translate(180, 560);
  ctx.rotate(-0.12);
  ctx.fillRect(-90, -30, 190, 60);
  ctx.fillStyle = '#f6ecd8';
  ctx.fillRect(-90, -34, 186, 8);
  ctx.restore();

  // cup + saucer
  const cx = 560, cy = 560;
  ctx.fillStyle = 'rgba(40,20,10,0.35)';
  ctx.beginPath();
  ctx.ellipse(cx + 30, cy + 52, 150, 30, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#f2ebe0';
  ctx.beginPath();
  ctx.ellipse(cx, cy + 40, 140, 32, 0, 0, Math.PI * 2);
  ctx.fill();
  const cup = ctx.createLinearGradient(cx - 80, 0, cx + 80, 0);
  cup.addColorStop(0, '#fffaf2');
  cup.addColorStop(1, '#d9cbb6');
  ctx.fillStyle = cup;
  ctx.beginPath();
  ctx.moveTo(cx - 82, cy - 60);
  ctx.lineTo(cx + 82, cy - 60);
  ctx.bezierCurveTo(cx + 80, cy + 10, cx + 50, cy + 40, cx, cy + 40);
  ctx.bezierCurveTo(cx - 50, cy + 40, cx - 80, cy + 10, cx - 82, cy - 60);
  ctx.fill();
  ctx.strokeStyle = '#e4d8c6';
  ctx.lineWidth = 14;
  ctx.beginPath();
  ctx.ellipse(cx + 92, cy - 18, 26, 30, 0, -Math.PI / 2, Math.PI / 2);
  ctx.stroke();
  ctx.fillStyle = '#efe4d4';
  ctx.beginPath();
  ctx.ellipse(cx, cy - 60, 82, 16, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#4a2b18';
  ctx.beginPath();
  ctx.ellipse(cx, cy - 58, 72, 12, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(214,160,100,0.8)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(cx - 6, cy - 58, 30, 5, 0, 0, Math.PI * 2);
  ctx.stroke();

  // steam
  ctx.lineCap = 'round';
  for (let s = 0; s < 3; s++) {
    for (let pass = 0; pass < 4; pass++) {
      ctx.strokeStyle = `rgba(255,255,255,${0.07 - pass * 0.012})`;
      ctx.lineWidth = 6 + pass * 8;
      ctx.beginPath();
      const sx = cx - 30 + s * 30;
      ctx.moveTo(sx, cy - 80);
      ctx.bezierCurveTo(sx - 40, cy - 140, sx + 40, cy - 190, sx - 10, cy - 270);
      ctx.stroke();
    }
  }

  // plant
  ctx.fillStyle = '#b5643c';
  ctx.beginPath();
  ctx.moveTo(800, 470);
  ctx.lineTo(900, 470);
  ctx.lineTo(885, 560);
  ctx.lineTo(815, 560);
  ctx.closePath();
  ctx.fill();
  for (let i = 0; i < 12; i++) {
    const a = -Math.PI / 2 + (R() - 0.5) * 2.2;
    const len = 70 + R() * 90;
    ctx.fillStyle = R() < 0.5 ? '#4f7a4a' : '#6b9a5a';
    ctx.save();
    ctx.translate(850, 470);
    ctx.rotate(a + Math.PI / 2);
    ctx.beginPath();
    ctx.ellipse(0, -len / 2, 14, len / 2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // dust in the light
  for (let i = 0; i < 90; i++) {
    ctx.fillStyle = `rgba(255,250,230,${0.2 + R() * 0.5})`;
    ctx.beginPath();
    ctx.arc(200 + R() * 600, 80 + R() * 450, R() * 1.8 + 0.4, 0, Math.PI * 2);
    ctx.fill();
  }
}

const PAINTERS = { astanaSnow, midnightTrain, sundayCoffee };
const cache = new Map();

/** Paint (once) and stylize a seed scene. Returns a Promise<dataURL>. */
export function renderSeedImage(sceneKey, moodKey) {
  const k = `${sceneKey}:${moodKey}`;
  if (!cache.has(k)) {
    const p = new Promise((resolve) => setTimeout(resolve, 0)).then(() => {
      const canvas = document.createElement('canvas');
      canvas.width = W;
      canvas.height = H;
      const ctx = canvas.getContext('2d');
      (PAINTERS[sceneKey] || sundayCoffee)(ctx);
      return stylizeLocally(canvas, moodKey);
    });
    cache.set(k, p);
  }
  return cache.get(k);
}
