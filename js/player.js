'use strict';
// Plays the song: a clock that lights up each step at the song's tempo and plays
// its drum sounds, with an optional count-in and looping of chosen bars.
//
// How the timing works: a scheduler looks a little ahead (LOOKAHEAD ms) and books
// each upcoming step twice: its sounds on the audio clock, and its picture in a
// queue. The animation loop then shows each queued step when its time arrives,
// so what you hear and what you see line up.

/* ---------- player ---------- */
const DEFAULT_BPM = 100;
const LOOKAHEAD = 120;     // ms booked ahead
const START_DELAY = 40;    // ms between pressing Play and the first note
const SPEED_KEY = 'groove-stepper-speed';
const COUNTIN_KEY = 'groove-stepper-countin';
const SOUND_KEY = 'groove-stepper-sound';
const playBtn = document.getElementById('play');
const playLabel = document.getElementById('playLabel');
const playIcon = document.getElementById('playIcon');
const loopBtn = document.getElementById('loop');
const loopBars = document.getElementById('loopBars');
const countBtn = document.getElementById('countIn');
const soundBtn = document.getElementById('sound');
const speedEl = document.getElementById('speed');
const speedOut = document.getElementById('speedOut');
const ICON_PLAY = 'M8 5v14l11-7z';
const ICON_PAUSE = 'M7 5h4v14H7zM13 5h4v14h-4z';

const Player = {
  playing: false,
  pos: -1,          // position (in the play order) of the step on screen
  counting: false,  // the count-in is on screen
  queue: [],        // booked events waiting to be shown: {at, kind, ...}
  sched: null,      // what to book next: {pos, at, countI, countN, beatMs}
  raf: 0, timer: 0, loopSeq: null,
};
const Loop = {on: false, sel: null};   // sel = {anchor, from, to}, bar numbers starting at 0
let speed = 1, countInOn = false, soundOn = true;

// The order bars are played in, with repeat signs (x4) played out.
function buildPlayOrder(sg){
  const seq = [], ms = sg.measures;
  let i = 0;
  while (i < ms.length){
    let j = i;
    while (j + 1 < ms.length && !ms[j + 1].sysStart) j++;
    const passes = ms[j].repeat || 1;
    for (let p = 1; p <= passes; p++)
      for (let mi = i; mi <= j; mi++)
        for (let s = 0; s < ms[mi].steps; s++) seq.push({k: sg.offsets[mi] + s, mi, pass: p, passes});
    i = j + 1;
  }
  sg.seq = seq;
}

// While looping, play the chosen bars once each, round and round (repeat signs ignored).
function activeSeq(){
  if (!(Loop.on && Loop.sel)) return song.seq;
  if (!Player.loopSeq){
    const [a, b] = loopRange();
    Player.loopSeq = [];
    for (let k = a; k < b; k++) Player.loopSeq.push({k, mi: song.flat[k].mi, pass: 1, passes: 1});
  }
  return Player.loopSeq;
}

const colAt = e => song.measures[e.mi].cols[e.k - song.offsets[e.mi]];

// Tempo counts quarter notes per minute. A bar of 4/4 is 4 quarters, 6/8 is 3.
function stepSeconds(mi){
  const t = song.time;
  const quarters = t.num * 4 / t.den;
  const bpm = (song.tempo || DEFAULT_BPM) * speed;
  return quarters * 60 / bpm / song.measures[mi].steps;
}

// The next drums to hit after position pos (wrapping around when looping).
function nextHit(seq, pos){
  const n = seq.length;
  for (let i = 1; i < n; i++){
    const p = pos + i;
    if (p >= n && !Loop.on) break;
    const c = colAt(seq[p % n]);
    if (c.length) return c;
  }
  return null;
}

/* ---------- audio on/off ---------- */
// Browsers only allow sound after a click or key press, so this runs from those.
function ensureAudio(){
  if (!soundOn) return false;
  if (!Sound.ctx && !soundInit()){ setSound(false); return false; }
  if (Sound.ctx.state === 'suspended') Sound.ctx.resume();
  return true;
}

// Stepping by hand plays the step you land on.
function audition(){
  if (!song || !ensureAudio()) return;
  const {mi, s} = song.flat[cur];
  soundHits(song.measures[mi].cols[s], Sound.ctx.currentTime + 0.005);
}

/* ---------- booking ahead ---------- */
function schedule(){
  if (!Player.playing) return;
  const S = Player.sched, now = performance.now();
  if (!S) return;
  if (S.at < now - 200) S.at = now + 20;   // tab was hidden: carry on from here, don't rush
  const audio = soundOn && Sound.ctx;
  while (Player.sched && S.at < now + LOOKAHEAD){
    if (S.countI < S.countN){
      Player.queue.push({at: S.at, kind: 'count', i: S.countI, n: S.countN, pos: S.pos});
      if (audio) soundClick(perfToAudio(S.at), S.countI === 0);
      S.at += S.beatMs; S.countI++;
      continue;
    }
    const seq = activeSeq();
    if (S.pos >= seq.length){
      if (Loop.on) S.pos = 0;
      else { Player.queue.push({at: S.at, kind: 'end'}); Player.sched = null; break; }
    }
    const e = seq[S.pos];
    const ms = stepSeconds(e.mi) * 1000;
    Player.queue.push({at: S.at, kind: 'step', pos: S.pos, ms});
    if (audio) soundHits(colAt(e), perfToAudio(S.at));
    S.at += ms; S.pos++;
  }
}

/* ---------- showing ---------- */
const nowCountEl = document.getElementById('nowCount');

function showStep(ev){
  if (Player.counting){ Player.counting = false; nowCountEl.classList.remove('countin'); }
  const seq = activeSeq(), e = seq[ev.pos];
  if (!e) return;
  Player.pos = ev.pos;
  kitSvg.style.setProperty('--flash', Math.round(Math.max(110, Math.min(380, ev.ms * 0.95))) + 'ms');
  go(e.k, {pass: e.pass, passes: e.passes, nextCol: nextHit(seq, ev.pos)});
}

function showCount(ev){
  if (!Player.counting){
    Player.counting = true;
    const seq = activeSeq(), e = seq[ev.pos];
    go(e.k);                                    // cursor on the first note
    setKit([], colAt(e).length ? colAt(e) : nextHit(seq, ev.pos));   // kit dark, ring on the first drum
    nowCountEl.classList.add('countin');
  }
  nowCountEl.textContent = ev.i + 1;
  document.getElementById('nowHits').textContent = 'Count-in';
  setBeats(ev.n, ev.i, true);
}

function tick(now){
  if (!Player.playing) return;
  schedule();
  let ev = null;
  while (Player.queue.length && Player.queue[0].at <= now) ev = Player.queue.shift();
  if (ev){
    if (ev.kind === 'end'){ pausePlayback(); return; }
    if (ev.kind === 'count') showCount(ev); else showStep(ev);
  }
  Player.raf = requestAnimationFrame(tick);
}

/* ---------- play / pause ---------- */
function startPlayback(){
  if (!song || !song.seq || !song.seq.length) return;
  const seq = activeSeq();
  let pos = Player.pos;
  const inSync = pos >= 0 && pos < seq.length && seq[pos].k === cur;
  if (!inSync) pos = seq.findIndex(e => e.k === cur);
  if (pos < 0) pos = 0;                                       // outside the loop: start at the loop
  else if (!Loop.on && pos >= seq.length - 1) pos = 0;        // at the very end: start over
  ensureAudio();
  Player.playing = true;
  Player.pos = pos;
  Player.queue = [];
  Player.sched = {pos, at: performance.now() + START_DELAY, countI: 0, countN: 0, beatMs: 0};
  if (countInOn){
    const m = song.measures[seq[pos].mi];
    Player.sched.countN = m.g.odd ? song.time.num : m.g.G;
    Player.sched.beatMs = stepSeconds(seq[pos].mi) * 1000 * m.steps / Player.sched.countN;
  }
  kitSvg.classList.add('playing');
  updatePlayButton();
  schedule();
  Player.timer = setInterval(schedule, 25);   // keeps booking even if the screen stutters
  Player.raf = requestAnimationFrame(tick);
}

function pausePlayback(){
  if (!Player.playing) return;
  Player.playing = false;
  cancelAnimationFrame(Player.raf);
  clearInterval(Player.timer);
  soundCancelFuture();
  Player.queue = [];
  Player.sched = null;
  kitSvg.classList.remove('playing');
  if (Player.counting){ Player.counting = false; nowCountEl.classList.remove('countin'); go(cur); }
  updatePlayButton();
}

function togglePlayback(){ Player.playing ? pausePlayback() : startPlayback(); }

// Something changed mid-play (loop on/off, new bars): drop what was booked
// and book again from the step after the one on screen.
function rebook(){
  if (!Player.playing) return;
  const counting = Player.counting || (Player.sched && Player.sched.countI < Player.sched.countN);
  if (counting){ pausePlayback(); startPlayback(); return; }
  const now = performance.now();
  const at = Player.queue.length ? Player.queue[0].at : Player.sched ? Player.sched.at : now;
  soundCancelFuture();
  Player.queue = [];
  const i = activeSeq().findIndex(e => e.k === cur);
  Player.pos = i;
  Player.sched = {pos: i < 0 ? 0 : i + 1, at: Math.max(at, now), countI: 0, countN: 0, beatMs: 0};
  schedule();
}

function updatePlayButton(){
  const on = Player.playing;
  playLabel.textContent = on ? 'Pause' : 'Play';
  playIcon.querySelector('path').setAttribute('d', on ? ICON_PAUSE : ICON_PLAY);
  playBtn.setAttribute('aria-label', on ? 'Pause' : 'Play');
  playBtn.classList.toggle('on', on);
}

/* ---------- looping ---------- */
const loopRange = () => [song.offsets[Loop.sel.from], song.offsets[Loop.sel.to] + song.measures[Loop.sel.to].steps];

// Shift + click on a note: choose bars from the starting bar to this one.
function chooseBars(mi){
  if (!song) return;
  const anchor = Loop.sel ? Loop.sel.anchor : song.flat[cur].mi;
  Loop.sel = {anchor, from: Math.min(anchor, mi), to: Math.max(anchor, mi)};
  loopChanged();
}

function toggleLoop(){
  if (!song) return;
  if (!Loop.on && !Loop.sel){ const b = song.flat[cur].mi; Loop.sel = {anchor: b, from: b, to: b}; }
  Loop.on = !Loop.on;
  loopChanged();
  if (Loop.on && !Player.playing){
    const [a, b] = loopRange();
    if (cur < a || cur >= b) go(a);
  }
}

function clearLoop(){
  if (!Loop.sel && !Loop.on) return;
  Loop.sel = null; Loop.on = false;
  loopChanged();
}

function loopChanged(){
  Player.loopSeq = null;
  paintLoop();
  updateLoopButton();
  if (Player.playing) rebook();
  else if (song) go(cur);   // refresh the "looping" note under the kit
}

function paintLoop(){
  sheet.querySelectorAll('.barbg').forEach(r => {
    const mi = +r.dataset.mi;
    const inSel = !!Loop.sel && mi >= Loop.sel.from && mi <= Loop.sel.to;
    r.classList.toggle('sel', inSel);
    r.classList.toggle('loop', inSel && Loop.on);
  });
}

function updateLoopButton(){
  const s = Loop.sel;
  loopBtn.disabled = !song;
  loopBtn.setAttribute('aria-pressed', String(Loop.on));
  loopBars.textContent = !s ? '' : s.from === s.to ? `bar ${s.from + 1}` : `bars ${s.from + 1}–${s.to + 1}`;
}

// Called whenever a new tab is loaded (or cleared).
function playerLoad(sg){
  pausePlayback();
  Player.pos = -1;
  Player.loopSeq = null;
  Loop.on = false; Loop.sel = null;
  if (sg) buildPlayOrder(sg);
  playBtn.disabled = !sg;
  updateLoopButton();
  updateSpeedLabel();
}

/* ---------- switches ---------- */
function setCountIn(on, quiet){
  countInOn = on;
  countBtn.setAttribute('aria-pressed', String(on));
  if (!quiet) try { localStorage.setItem(COUNTIN_KEY, on ? '1' : '0'); } catch (_) {}
}

function setSound(on, quiet){
  soundOn = on;
  soundBtn.setAttribute('aria-pressed', String(on));
  soundBtn.setAttribute('aria-label', on ? 'Sound on' : 'Sound off');
  if (!on) soundCancelFuture();
  else if (!quiet) ensureAudio();
  if (!quiet) try { localStorage.setItem(SOUND_KEY, on ? '1' : '0'); } catch (_) {}
}

function toggleSound(){ setSound(!soundOn); }

/* ---------- speed ---------- */
function updateSpeedLabel(){
  const base = (song && song.tempo) || DEFAULT_BPM;
  speedOut.textContent = `${Math.round(speed * 100)}% · ${Math.round(base * speed)} BPM`;
}

// quiet: skip the label, used at startup before app.js has loaded the song
function setSpeed(pct, quiet){
  pct = Math.max(40, Math.min(100, Math.round(pct / 5) * 5));
  speed = pct / 100;
  speedEl.value = pct;
  if (!quiet) updateSpeedLabel();
  try { localStorage.setItem(SPEED_KEY, String(pct)); } catch (_) {}
}

function nudgeSpeed(delta){ setSpeed(Math.round(speed * 100) + delta); }

let speedByPointer = false;
speedEl.addEventListener('pointerdown', () => { speedByPointer = true; });
speedEl.addEventListener('keydown', () => { speedByPointer = false; });
speedEl.addEventListener('input', () => setSpeed(+speedEl.value));
// After dragging with the mouse, hand the arrow keys back to stepping through notes.
speedEl.addEventListener('change', () => { if (speedByPointer) speedEl.blur(); });

playBtn.addEventListener('click', togglePlayback);
loopBtn.addEventListener('click', toggleLoop);
countBtn.addEventListener('click', () => setCountIn(!countInOn));
soundBtn.addEventListener('click', toggleSound);

(() => {
  let sp = null, ci = null, so = null;
  try {
    sp = localStorage.getItem(SPEED_KEY);
    ci = localStorage.getItem(COUNTIN_KEY);
    so = localStorage.getItem(SOUND_KEY);
  } catch (_) {}
  setSpeed(sp ? +sp : 100, true);
  setCountIn(ci === '1', true);
  setSound(so !== '0', true);
})();
