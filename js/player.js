'use strict';
// Plays the song visually: a clock that moves the highlight at the song's tempo,
// with an optional count-in and looping of chosen bars.

/* ---------- player ---------- */
const DEFAULT_BPM = 100;
const SPEED_KEY = 'groove-stepper-speed';
const COUNTIN_KEY = 'groove-stepper-countin';
const playBtn = document.getElementById('play');
const playLabel = document.getElementById('playLabel');
const playIcon = document.getElementById('playIcon');
const loopBtn = document.getElementById('loop');
const loopBars = document.getElementById('loopBars');
const countBtn = document.getElementById('countIn');
const speedEl = document.getElementById('speed');
const speedOut = document.getElementById('speedOut');
const ICON_PLAY = 'M8 5v14l11-7z';
const ICON_PAUSE = 'M7 5h4v14H7zM13 5h4v14h-4z';

const Player = {playing:false, pos:-1, nextAt:0, raf:0, counting:false, countI:0, countN:0, beatMs:0, loopSeq:null};
const Loop = {on:false, sel:null};   // sel = {anchor, from, to}, bar numbers starting at 0
let speed = 1, countInOn = false;

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
    const a = song.offsets[Loop.sel.from];
    const b = song.offsets[Loop.sel.to] + song.measures[Loop.sel.to].steps;
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

function showPos(pos){
  const seq = activeSeq(), e = seq[pos];
  const ms = stepSeconds(e.mi) * 1000;
  kitSvg.style.setProperty('--flash', Math.round(Math.max(110, Math.min(380, ms * 0.95))) + 'ms');
  go(e.k, {pass: e.pass, passes: e.passes, nextCol: nextHit(seq, pos)});
  return ms;
}

/* ---------- count-in ---------- */
const nowCountEl = document.getElementById('nowCount');

function showCountBeat(){
  nowCountEl.textContent = Player.countI + 1;
  document.getElementById('nowHits').textContent = 'Count-in';
  setBeats(Player.countN, Player.countI, true);
}

function beginCountIn(seq, pos){
  const e = seq[pos], m = song.measures[e.mi];
  Player.countN = m.g.odd ? song.time.num : m.g.G;
  Player.beatMs = stepSeconds(e.mi) * 1000 * m.steps / Player.countN;
  Player.countI = 0;
  Player.counting = true;
  go(e.k);                                    // put the cursor on the first note
  const first = colAt(e).length ? colAt(e) : nextHit(seq, pos);
  setKit([], first);                          // kit dark, ring on the first drum to hit
  nowCountEl.classList.add('countin');
  showCountBeat();
}

function endCountIn(){
  Player.counting = false;
  nowCountEl.classList.remove('countin');
}

/* ---------- the clock ---------- */
function tick(now){
  if (!Player.playing) return;
  if (now >= Player.nextAt){
    if (now - Player.nextAt > 250) Player.nextAt = now;   // tab was hidden: don't race to catch up
    if (Player.counting){
      Player.countI++;
      if (Player.countI < Player.countN){ showCountBeat(); Player.nextAt += Player.beatMs; }
      else { endCountIn(); Player.nextAt += showPos(Player.pos); }
    } else {
      const seq = activeSeq();
      let pos = Player.pos + 1;
      if (pos >= seq.length){
        if (Loop.on) pos = 0;
        else { pausePlayback(); return; }
      }
      Player.pos = pos;
      Player.nextAt += showPos(pos);
    }
  }
  Player.raf = requestAnimationFrame(tick);
}

function startPlayback(){
  if (!song || !song.seq || !song.seq.length) return;
  const seq = activeSeq();
  let pos = Player.pos;
  const inSync = pos >= 0 && pos < seq.length && seq[pos].k === cur;
  if (!inSync) pos = seq.findIndex(e => e.k === cur);
  if (pos < 0) pos = 0;                                       // outside the loop: start at the loop
  else if (!Loop.on && pos >= seq.length - 1) pos = 0;        // at the very end: start over
  Player.pos = pos;
  Player.playing = true;
  kitSvg.classList.add('playing');
  updatePlayButton();
  const now = performance.now();
  if (countInOn){
    beginCountIn(seq, pos);
    Player.nextAt = now + Player.beatMs;
  } else {
    Player.nextAt = now + showPos(pos);
  }
  Player.raf = requestAnimationFrame(tick);
}

function pausePlayback(){
  if (!Player.playing) return;
  Player.playing = false;
  cancelAnimationFrame(Player.raf);
  kitSvg.classList.remove('playing');
  if (Player.counting){ endCountIn(); go(cur); }
  updatePlayButton();
}

function togglePlayback(){ Player.playing ? pausePlayback() : startPlayback(); }

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
  if (Player.playing){
    // keep playing from where we are; if that's outside the loop, the next step jumps to its start
    const i = activeSeq().findIndex(e => e.k === cur);
    Player.pos = Player.counting ? Math.max(0, i) : i;
  }
  paintLoop();
  updateLoopButton();
  if (song && !Player.playing) go(cur);   // refresh the "looping" note under the kit
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

/* ---------- count-in switch ---------- */
function setCountIn(on, quiet){
  countInOn = on;
  countBtn.setAttribute('aria-pressed', String(on));
  if (!quiet) try { localStorage.setItem(COUNTIN_KEY, on ? '1' : '0'); } catch (_) {}
}

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

(() => {
  let savedSpeed = null, savedCount = null;
  try { savedSpeed = localStorage.getItem(SPEED_KEY); savedCount = localStorage.getItem(COUNTIN_KEY); } catch (_) {}
  setSpeed(savedSpeed ? +savedSpeed : 100, true);
  setCountIn(savedCount === '1', true);
})();
