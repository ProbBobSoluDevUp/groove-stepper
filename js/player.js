'use strict';
// Plays the song visually: a clock that moves the highlight at the song's tempo.

/* ---------- player ---------- */
const DEFAULT_BPM = 100;
const SPEED_KEY = 'groove-stepper-speed';
const playBtn = document.getElementById('play');
const playLabel = document.getElementById('playLabel');
const playIcon = document.getElementById('playIcon');
const speedEl = document.getElementById('speed');
const speedOut = document.getElementById('speedOut');
const ICON_PLAY = 'M8 5v14l11-7z';
const ICON_PAUSE = 'M7 5h4v14H7zM13 5h4v14h-4z';

const Player = {playing:false, pos:-1, nextAt:0, raf:0};
let speed = 1;

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

// Tempo counts quarter notes per minute. A bar of 4/4 is 4 quarters, 6/8 is 3.
function stepSeconds(mi){
  const t = song.time;
  const quarters = t.num * 4 / t.den;
  const bpm = (song.tempo || DEFAULT_BPM) * speed;
  return quarters * 60 / bpm / song.measures[mi].steps;
}

function nextHitInSeq(pos){
  for (let p = pos + 1; p < song.seq.length; p++){
    const e = song.seq[p], c = song.measures[e.mi].cols[e.k - song.offsets[e.mi]];
    if (c.length) return c;
  }
  return null;
}

function showPos(pos){
  const e = song.seq[pos];
  const ms = stepSeconds(e.mi) * 1000;
  kitSvg.style.setProperty('--flash', Math.round(Math.max(110, Math.min(380, ms * 0.95))) + 'ms');
  go(e.k, {pass: e.pass, passes: e.passes, nextCol: nextHitInSeq(pos)});
  return ms;
}

function tick(now){
  if (!Player.playing) return;
  if (now >= Player.nextAt){
    if (now - Player.nextAt > 250) Player.nextAt = now;   // tab was hidden: don't race to catch up
    const pos = Player.pos + 1;
    if (pos >= song.seq.length){ pausePlayback(); return; }
    Player.pos = pos;
    Player.nextAt += showPos(pos);
  }
  Player.raf = requestAnimationFrame(tick);
}

function startPlayback(){
  if (!song || !song.seq || !song.seq.length) return;
  let pos = Player.pos;
  const inSync = pos >= 0 && pos < song.seq.length && song.seq[pos].k === cur;
  if (!inSync) pos = song.seq.findIndex(e => e.k === cur);
  if (pos < 0 || pos >= song.seq.length - 1) pos = 0;   // at the very end: start over
  Player.pos = pos;
  Player.playing = true;
  kitSvg.classList.add('playing');
  updatePlayButton();
  Player.nextAt = performance.now() + showPos(pos);
  Player.raf = requestAnimationFrame(tick);
}

function pausePlayback(){
  if (!Player.playing) return;
  Player.playing = false;
  cancelAnimationFrame(Player.raf);
  kitSvg.classList.remove('playing');
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

// Called whenever a new tab is loaded (or cleared).
function playerLoad(sg){
  pausePlayback();
  Player.pos = -1;
  if (sg) buildPlayOrder(sg);
  playBtn.disabled = !sg;
  updateSpeedLabel();
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

(() => {
  let savedSpeed = null;
  try { savedSpeed = localStorage.getItem(SPEED_KEY); } catch (_) {}
  setSpeed(savedSpeed ? +savedSpeed : 100, true);
})();
