/**
 * Generative ambient soundscapes, synthesized live with the Web Audio API.
 * Zero audio files: warm detuned pads, filtered-noise rain and wind,
 * vinyl/fire crackle, and slow random chimes — each tuned per feeling.
 *
 *   ambient.play('nostalgic')   // crossfades if something else is playing
 *   ambient.stop()
 */

const PRESETS = {
  nostalgic: {
    root: 174.61, // F3
    wave: 'triangle',
    progression: [[0, 7, 11, 16], [-3, 4, 9, 12], [5, 9, 12, 16]],
    cutoff: 950, lfoRate: 0.06, lfoDepth: 320,
    pad: 0.15, rain: 0.035, wind: 0, crackle: 0.55,
    chime: 0.22, chimeEvery: [2.5, 6], scale: [0, 2, 4, 7, 9], chimeWave: 'sine',
    tremolo: 0, reverb: 0.55,
  },
  weightless: {
    root: 293.66, // D4
    wave: 'sine',
    progression: [[0, 7, 14, 19], [5, 12, 16, 21], [-3, 7, 12, 16]],
    cutoff: 2600, lfoRate: 0.04, lfoDepth: 600,
    pad: 0.14, rain: 0, wind: 0.05, crackle: 0,
    chime: 0.5, chimeEvery: [1.4, 4], scale: [0, 2, 4, 7, 9, 12], chimeWave: 'sine',
    tremolo: 0, reverb: 0.85,
  },
  bittersweet: {
    root: 220, // A3
    wave: 'sawtooth',
    progression: [[0, 3, 7, 14], [-4, 3, 8, 12], [-7, 0, 5, 10]],
    cutoff: 650, lfoRate: 0.05, lfoDepth: 220,
    pad: 0.13, rain: 0.13, wind: 0.02, crackle: 0.08,
    chime: 0.22, chimeEvery: [3, 7], scale: [0, 3, 5, 7, 10], chimeWave: 'triangle',
    tremolo: 0, reverb: 0.7,
  },
  electric: {
    root: 130.81, // C3
    wave: 'sawtooth',
    progression: [[0, 7, 10, 15], [-2, 5, 9, 14], [-4, 3, 7, 12]],
    cutoff: 1300, lfoRate: 0.22, lfoDepth: 900,
    pad: 0.11, rain: 0.09, wind: 0, crackle: 0,
    chime: 0.28, chimeEvery: [0.22, 0.45], scale: [0, 3, 7, 10, 12, 15], chimeWave: 'square',
    tremolo: 0.22, tremoloRate: 2, reverb: 0.5,
  },
  quietlyHappy: {
    root: 196, // G3
    wave: 'triangle',
    progression: [[0, 4, 7, 14], [5, 9, 12, 16], [-3, 4, 7, 12]],
    cutoff: 1700, lfoRate: 0.05, lfoDepth: 400,
    pad: 0.13, rain: 0, wind: 0.025, crackle: 0.12,
    chime: 0.45, chimeEvery: [1.8, 4.5], scale: [0, 2, 4, 7, 9, 12, 14], chimeWave: 'sine',
    tremolo: 0, reverb: 0.6,
  },
};

/** Sounds of a place, layered over the feeling's music (see api/story.js → SOUNDS). */
const PLACE_SOUNDS = {
  fireplace: { crackle: 0.9 },
  rain: { rain: 0.12 },
  wind: { wind: 0.07 },
  water: { water: 0.11 },
  crowd: { crowd: 0.05 },
  quiet: { pad: 0.1, chime: 0.12 },
};

const CHORD_SECONDS = 13;
const rand = (a, b) => a + Math.random() * (b - a);
const semi = (root, s) => root * Math.pow(2, s / 12);

function makeNoiseBuffer(ctx, seconds) {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    // gently pinked noise: warmer than white
    let b0 = 0, b1 = 0, b2 = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      b0 = 0.99765 * b0 + w * 0.099046;
      b1 = 0.963 * b1 + w * 0.2965164;
      b2 = 0.57 * b2 + w * 1.0526913;
      d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.2;
    }
  }
  return buf;
}

function makeImpulse(ctx, seconds, decay) {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
  }
  return buf;
}

class Scene {
  constructor(engine, moodKey, sounds = []) {
    this.engine = engine;
    this.mood = moodKey;
    this.key = `${moodKey}|${sounds.join(',')}`;
    this.p = Object.assign({}, PRESETS[moodKey] || PRESETS.nostalgic, ...sounds.map((k) => PLACE_SOUNDS[k] || {}));
    this.ctx = engine.ctx;
    this.timers = new Set();
    this.sources = new Set();
    this.alive = true;

    const { ctx, p } = this;
    const now = ctx.currentTime;

    this.out = ctx.createGain();
    this.out.gain.setValueAtTime(0, now);
    this.out.gain.linearRampToValueAtTime(1, now + 3);
    this.out.connect(engine.master);

    this.send = ctx.createGain();
    this.send.gain.value = p.reverb;
    this.send.connect(engine.reverb);

    // --- pad bus: voices -> lowpass (LFO) -> tremolo -> out (+ reverb send)
    this.padFilter = ctx.createBiquadFilter();
    this.padFilter.type = 'lowpass';
    this.padFilter.frequency.value = p.cutoff;
    this.padFilter.Q.value = 0.7;

    const lfo = ctx.createOscillator();
    lfo.frequency.value = p.lfoRate;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = p.lfoDepth;
    lfo.connect(lfoGain).connect(this.padFilter.frequency);
    lfo.start();
    this.sources.add(lfo);

    this.padGain = ctx.createGain();
    this.padGain.gain.value = p.pad;
    if (p.tremolo) {
      const trem = ctx.createOscillator();
      trem.frequency.value = p.tremoloRate || 2;
      const tg = ctx.createGain();
      tg.gain.value = p.pad * p.tremolo;
      trem.connect(tg).connect(this.padGain.gain);
      trem.start();
      this.sources.add(trem);
    }
    this.padFilter.connect(this.padGain);
    this.padGain.connect(this.out);
    this.padGain.connect(this.send);

    // --- textures
    if (p.rain) this.noiseLayer({ type: 'highpass', freq: 900, q: 0.5 }, { type: 'lowpass', freq: 7500 }, p.rain);
    if (p.rain) this.noiseLayer({ type: 'bandpass', freq: 3200, q: 1.2 }, null, p.rain * 0.5, 0.3);
    if (p.wind) this.noiseLayer({ type: 'bandpass', freq: 420, q: 0.8 }, null, p.wind, 0.07, 260);
    // lapping water / a lake overhead: deep, slowly breathing rumble
    if (p.water) this.noiseLayer({ type: 'lowpass', freq: 380, q: 0.9 }, null, p.water, 0.11);
    // a room full of people, far off: a murmur in the voice band
    if (p.crowd) this.noiseLayer({ type: 'bandpass', freq: 650, q: 2.2 }, { type: 'lowpass', freq: 1400 }, p.crowd, 0.35);

    this.chordIndex = 0;
    this.playChord();
    if (p.crackle) this.scheduleCrackle();
    if (p.chime) this.later(() => this.scheduleChime(), 1800);
  }

  later(fn, ms) {
    const id = setTimeout(() => {
      this.timers.delete(id);
      if (this.alive) fn();
    }, ms);
    this.timers.add(id);
  }

  noiseLayer(f1, f2, level, lfoRate = 0, lfoDepth = 0) {
    const { ctx } = this;
    const src = ctx.createBufferSource();
    src.buffer = this.engine.noise;
    src.loop = true;
    src.loopStart = Math.random();
    const a = ctx.createBiquadFilter();
    a.type = f1.type;
    a.frequency.value = f1.freq;
    if (f1.q) a.Q.value = f1.q;
    let node = src.connect(a);
    if (f2) {
      const b = ctx.createBiquadFilter();
      b.type = f2.type;
      b.frequency.value = f2.freq;
      node = node.connect(b);
    }
    const g = ctx.createGain();
    g.gain.value = level;
    node.connect(g).connect(this.out);
    if (lfoRate) {
      const lfo = ctx.createOscillator();
      lfo.frequency.value = lfoRate;
      const lg = ctx.createGain();
      lg.gain.value = lfoDepth || level * 0.6;
      lfo.connect(lg).connect(lfoDepth ? a.frequency : g.gain);
      lfo.start();
      this.sources.add(lfo);
    }
    src.start();
    this.sources.add(src);
  }

  playChord() {
    const { ctx, p } = this;
    const chord = p.progression[this.chordIndex % p.progression.length];
    this.chordIndex++;
    const now = ctx.currentTime;
    const attack = 4;
    const hold = CHORD_SECONDS;
    const release = 5;

    chord.forEach((s, i) => {
      const f = semi(p.root, s);
      const v = ctx.createGain();
      v.gain.setValueAtTime(0, now);
      v.gain.linearRampToValueAtTime(1 / chord.length, now + attack + i * 0.3);
      v.gain.setValueAtTime(1 / chord.length, now + hold);
      v.gain.linearRampToValueAtTime(0, now + hold + release);
      v.connect(this.padFilter);
      [-7, 7].forEach((det) => {
        const o = ctx.createOscillator();
        o.type = p.wave;
        o.frequency.value = f;
        o.detune.value = det + rand(-3, 3);
        o.connect(v);
        o.start(now);
        o.stop(now + hold + release + 0.1);
        this.sources.add(o);
        o.onended = () => this.sources.delete(o);
      });
    });
    this.later(() => this.playChord(), hold * 1000);
  }

  scheduleCrackle() {
    const { ctx, p } = this;
    const now = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.engine.noise;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 1800 + Math.random() * 2500;
    const g = ctx.createGain();
    const peak = p.crackle * rand(0.05, 0.35) * (Math.random() < 0.08 ? 2.5 : 1);
    const dur = rand(0.004, 0.02);
    g.gain.setValueAtTime(peak, now);
    g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    src.connect(hp).connect(g).connect(this.out);
    src.start(now, Math.random() * 3, dur + 0.01);
    this.later(() => this.scheduleCrackle(), rand(25, 260));
  }

  scheduleChime() {
    const { ctx, p } = this;
    const now = ctx.currentTime;
    const octave = p.chimeWave === 'square' ? 2 : 4;
    const f = semi(p.root * octave, p.scale[(Math.random() * p.scale.length) | 0]);
    const o = ctx.createOscillator();
    o.type = p.chimeWave;
    o.frequency.value = f;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = p.chimeWave === 'square' ? 1800 : 6000;
    const g = ctx.createGain();
    const level = p.chime * (p.chimeWave === 'square' ? 0.035 : 0.07) * rand(0.6, 1);
    const tail = p.chimeWave === 'square' ? 0.45 : rand(2, 3.5);
    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(level, now + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, now + tail);
    o.connect(lp).connect(g);
    g.connect(this.out);
    g.connect(this.send);
    o.start(now);
    o.stop(now + tail + 0.05);
    this.sources.add(o);
    o.onended = () => this.sources.delete(o);
    this.later(() => this.scheduleChime(), rand(...p.chimeEvery) * 1000);
  }

  stop(fade = 1.6) {
    if (!this.alive) return;
    this.alive = false;
    this.timers.forEach(clearTimeout);
    this.timers.clear();
    const now = this.ctx.currentTime;
    this.out.gain.cancelScheduledValues(now);
    this.out.gain.setValueAtTime(this.out.gain.value, now);
    this.out.gain.linearRampToValueAtTime(0, now + fade);
    this.send.gain.setTargetAtTime(0, now, fade / 3);
    setTimeout(() => {
      this.sources.forEach((s) => {
        try { s.stop(); } catch { /* already stopped */ }
      });
      this.out.disconnect();
      this.send.disconnect();
    }, fade * 1000 + 200);
  }
}

class AmbientEngine {
  ctx = null;
  scene = null;

  ensure() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.85;
      const comp = this.ctx.createDynamicsCompressor();
      comp.threshold.value = -18;
      comp.ratio.value = 3;
      this.master.connect(comp).connect(this.ctx.destination);

      this.reverb = this.ctx.createConvolver();
      this.reverb.buffer = makeImpulse(this.ctx, 4.5, 2.6);
      const wet = this.ctx.createGain();
      wet.gain.value = 0.55;
      this.reverb.connect(wet).connect(this.master);

      this.noise = makeNoiseBuffer(this.ctx, 4);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    return true;
  }

  /** Must first be called from a user gesture (browser autoplay rules). `sounds` are the place's layers. */
  play(moodKey, sounds = []) {
    if (!this.ensure()) return;
    if (this.scene?.alive && this.scene.key === `${moodKey}|${sounds.join(',')}`) return;
    this.scene?.stop();
    this.scene = new Scene(this, moodKey, sounds);
  }

  stop() {
    this.scene?.stop();
    this.scene = null;
  }

  /** A bell for catching a memory fragment; `complete` plays a rising chord instead. */
  chime(moodKey, complete = false) {
    if (!this.ensure()) return;
    const p = PRESETS[moodKey] || PRESETS.nostalgic;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const notes = complete ? [0, 4, 7, 12, 16].map((s, i) => [p.scale[i % p.scale.length] + 12 * Math.floor(i / 3), i * 0.12]) : [[p.scale[(Math.random() * p.scale.length) | 0] + 12, 0], [p.scale[0] + 24, 0.09]];
    notes.forEach(([s, delay]) => {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = semi(p.root * 2, s);
      const g = ctx.createGain();
      const t = now + delay;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(complete ? 0.09 : 0.12, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + (complete ? 3.5 : 2.2));
      o.connect(g);
      g.connect(this.master);
      g.connect(this.reverb);
      o.start(t);
      o.stop(t + 3.6);
    });
  }

  /** Quieten the soundscape while voices are reading, then bring it back. */
  duck(on) {
    if (!this.ctx || !this.master) return;
    const now = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setTargetAtTime(on ? 0.3 : 0.85, now, 0.4);
  }

  get playing() {
    return !!this.scene?.alive;
  }
}

export const ambient = new AmbientEngine();
