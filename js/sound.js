'use strict';
// Drum-machine sounds made live with the browser's Web Audio API. No sound files.

/* ---------- sound ---------- */
const Sound = {ctx:null, out:null, noise:null, voices:[], openHat:null};

function soundInit(){
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return false;
  const ctx = new AC({latencyHint: 'interactive'});
  // a gentle limiter so several drums at once don't distort
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -10; comp.knee.value = 6; comp.ratio.value = 4;
  comp.attack.value = 0.003; comp.release.value = 0.15;
  const master = ctx.createGain();
  master.gain.value = 0.8;
  master.connect(comp); comp.connect(ctx.destination);
  // one second of white noise, reused by snare, cymbals and clicks
  const buf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  Object.assign(Sound, {ctx, out: master, noise: buf});
  return true;
}

/* building blocks */
function voice(t){ const v = {t, srcs: []}; Sound.voices.push(v); return v; }

function env(t, peak, decay, attack = 0.001){
  const g = Sound.ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  g.connect(Sound.out);
  return g;
}

function filt(type, freq, q){
  const f = Sound.ctx.createBiquadFilter();
  f.type = type; f.frequency.value = freq;
  if (q) f.Q.value = q;
  return f;
}

function osc(v, type, freq, t, dur){
  const o = Sound.ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  o.start(t); o.stop(t + dur);
  v.srcs.push(o);
  return o;
}

function noise(v, t, dur){
  const s = Sound.ctx.createBufferSource();
  s.buffer = Sound.noise; s.loop = true;
  s.start(t, Math.random() * 0.5); s.stop(t + dur);
  v.srcs.push(s);
  return s;
}

/* the drums */
function kick(v, t, a){
  const o = osc(v, 'sine', 150, t, 0.45);
  o.frequency.exponentialRampToValueAtTime(44, t + 0.13);
  o.connect(env(t, 1.0 * a, 0.38));
  const n = noise(v, t, 0.03), hp = filt('highpass', 2000);
  n.connect(hp); hp.connect(env(t, 0.3 * a, 0.015));
}

function snare(v, t, a){
  const n = noise(v, t, 0.25), hp = filt('highpass', 1200);
  n.connect(hp); hp.connect(env(t, 0.7 * a, 0.17));
  const o = osc(v, 'triangle', 200, t, 0.15);
  o.frequency.exponentialRampToValueAtTime(160, t + 0.1);
  o.connect(env(t, 0.5 * a, 0.09));
}

function tom(v, t, a, f){
  const o = osc(v, 'sine', f, t, 0.5);
  o.frequency.exponentialRampToValueAtTime(f * 0.62, t + 0.32);
  o.connect(env(t, 0.95 * a, 0.38));
  const n = noise(v, t, 0.04), bp = filt('bandpass', f * 3, 1);
  n.connect(bp); bp.connect(env(t, 0.12 * a, 0.03));
}

// Classic drum-machine cymbal: six square waves at clashing pitches, filtered bright.
const METAL = [2, 3, 4.16, 5.43, 6.79, 8.21];
function metal(v, t, a, peak, decay, bpFreq, hpFreq){
  const bp = filt('bandpass', bpFreq, 0.9), hp = filt('highpass', hpFreq), g = env(t, peak * a, decay);
  bp.connect(hp); hp.connect(g);
  for (const r of METAL) osc(v, 'square', 40 * r, t, decay + 0.05).connect(bp);
  return g;
}

// A new hi-hat or pedal hit cuts off a ringing open hat, like a real one closing.
function chokeHat(t){
  if (!Sound.openHat) return;
  const p = Sound.openHat.gain;
  if (p.cancelAndHoldAtTime) p.cancelAndHoldAtTime(t); else p.cancelScheduledValues(t);
  p.setTargetAtTime(0.0001, t, 0.012);
  Sound.openHat = null;
}

function hat(v, t, a, open){
  chokeHat(t);
  const g = metal(v, t, a, open ? 0.24 : 0.28, open ? 0.42 : 0.05, 10000, 7000);
  if (open) Sound.openHat = g;
}

function pedal(v, t, a){ chokeHat(t); metal(v, t, a, 0.18, 0.035, 9000, 6000); }

function crash(v, t, a){
  metal(v, t, a, 0.3, 1.3, 8000, 4500);
  const n = noise(v, t, 1.4), hp = filt('highpass', 5000);
  n.connect(hp); hp.connect(env(t, 0.32 * a, 1.2));
}

function ride(v, t, a){
  metal(v, t, a, 0.2, 0.9, 7000, 5000);
  osc(v, 'sine', 3200, t, 0.3).connect(env(t, 0.06 * a, 0.25));
}

const DRUM_SOUNDS = {
  BD: kick, SD: snare, CR: crash, RD: ride, HF: pedal,
  T1: (v, t, a) => tom(v, t, a, 210),
  T2: (v, t, a) => tom(v, t, a, 160),
  FT: (v, t, a) => tom(v, t, a, 105),
};

/* what the player calls */

// Play every hit in one step at audio time t. Accents louder, ghost notes softer.
function soundHits(col, t){
  if (!Sound.ctx || !col || !col.length) return;
  const v = voice(t);
  for (const h of col){
    const a = h.accent ? 1.35 : h.ghost ? 0.35 : 1;
    if (h.inst === 'HH') hat(v, t, a, h.open);
    else DRUM_SOUNDS[h.inst](v, t, a);
  }
  if (Sound.voices.length > 96){
    const now = Sound.ctx.currentTime;
    Sound.voices = Sound.voices.filter(x => x.t > now - 2);
  }
}

// Count-in click, higher on beat 1.
function soundClick(t, first){
  if (!Sound.ctx) return;
  const v = voice(t), f = first ? 1800 : 1200;
  const o = osc(v, 'square', f, t, 0.06), bp = filt('bandpass', f, 4);
  o.connect(bp); bp.connect(env(t, first ? 1.0 : 0.75, 0.04));
}

// Silence anything scheduled to start later (used on pause, loop changes, sound off).
function soundCancelFuture(){
  if (!Sound.ctx) return;
  const now = Sound.ctx.currentTime + 0.005;
  Sound.voices = Sound.voices.filter(v => {
    if (v.t <= now) return true;
    v.srcs.forEach(s => { try { s.stop(); } catch (_) {} try { s.disconnect(); } catch (_) {} });
    return false;
  });
}

// Convert a time on the page's clock (performance.now) to the audio clock,
// so a sound comes out of the speakers when its note lights up.
function perfToAudio(p){
  const ctx = Sound.ctx;
  const ts = ctx.getOutputTimestamp ? ctx.getOutputTimestamp() : null;
  const t = ts && ts.performanceTime > 0
    ? ts.contextTime + (p - ts.performanceTime) / 1000
    : ctx.currentTime + (p - performance.now()) / 1000;
  return Math.max(ctx.currentTime, t);
}
