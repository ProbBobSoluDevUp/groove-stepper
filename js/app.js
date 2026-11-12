'use strict';
// Wires the page together: Enter button, arrows, keyboard, saving the tab.

/* ---------- app ---------- */
const $ = id => document.getElementById(id);
const input = $('tab'), sheet = $('sheet'), warnEl = $('warn');
const STORE_KEY = 'groove-stepper-tab';
let song = null, cur = 0, lastWidth = 0;

function setKit(col){
  Object.values(kitEls).forEach(el => el.classList.remove('on', 'accent', 'ghost', 'open'));
  void kitSvg.getBoundingClientRect();
  (col || []).forEach(h => {
    const el = kitEls[h.inst];
    el.classList.add('on');
    if (h.accent) el.classList.add('accent');
    if (h.ghost) el.classList.add('ghost');
    if (h.open) el.classList.add('open');
  });
}

function describe(col){
  if (!col.length) return 'Rest';
  return col.map(h => {
    const tags = [h.open && 'open', h.accent && 'accent', h.ghost && 'ghost'].filter(Boolean);
    return INST[h.inst].name + (tags.length ? ` (${tags.join(', ')})` : '');
  }).join(' + ');
}

function keepVisible(el){
  const r = el.getBoundingClientRect(), c = sheet.getBoundingClientRect();
  if (r.top < c.top + 4) sheet.scrollTop += r.top - c.top - 8;
  else if (r.bottom > c.bottom - 4) sheet.scrollTop += r.bottom - c.bottom + 8;
  if (r.left < c.left + 4) sheet.scrollLeft += r.left - c.left - 40;
  else if (r.right > c.right - 4) sheet.scrollLeft += r.right - c.right + 40;
}

function go(k){
  if (!song || !song.flat.length) return;
  cur = Math.max(0, Math.min(song.flat.length - 1, k));
  sheet.querySelectorAll('.cur').forEach(e => e.classList.remove('cur'));
  sheet.querySelectorAll(`[data-k="${cur}"]`).forEach(e => e.classList.add('cur'));
  const colEl = sheet.querySelector(`.col[data-k="${cur}"]`);
  if (colEl) keepVisible(colEl);

  const {mi, s} = song.flat[cur];
  const m = song.measures[mi];
  const col = m.cols[s];
  setKit(col);
  $('nowCount').textContent = m.counts[s];
  $('nowHits').textContent = describe(col);
  const beat = Math.floor(s / m.g.S) + 1;
  $('nowWhere').textContent = `Bar ${mi + 1} of ${song.measures.length} · beat ${beat}`;
  $('posMain').textContent = `Step ${cur + 1} of ${song.flat.length}`;
  $('prev').disabled = cur === 0;
  $('next').disabled = cur === song.flat.length - 1;
}

function jumpBar(dir){
  if (!song) return;
  const {mi, s} = song.flat[cur];
  let target = mi + dir;
  if (dir < 0 && s > 0) target = mi;
  target = Math.max(0, Math.min(song.measures.length - 1, target));
  go(song.offsets[target]);
}

function drawSheet(){
  const avail = Math.max(300, sheet.clientWidth - 24);
  lastWidth = sheet.clientWidth;
  const rows = layout(song, avail);
  sheet.innerHTML = rows.map((row, ri) => renderRow(song, row, ri, avail, ri === rows.length - 1)).join('');
}

function showMessage(html){
  song = null;
  sheet.innerHTML = `<div class="msg">${html}</div>`;
  setKit([]);
  $('nowCount').textContent = '–';
  $('nowHits').textContent = 'Paste a tab and press Enter';
  $('nowWhere').textContent = '';
  $('posMain').textContent = 'Step 0 of 0';
  $('prev').disabled = $('next').disabled = true;
}

function run(){
  const parsed = parseTab(input.value);
  $('songTitle').textContent = parsed.title || 'Untitled groove';
  if (!parsed.measures.length){
    $('songMeta').textContent = '';
    warnEl.innerHTML = parsed.warnings.map(w => `<li>${esc(w)}</li>`).join('');
    showMessage('<strong>No drum lines found.</strong> Each line starts with a drum name and a bar line, for example <code>HH|x-x-x-x-x-x-x-x-|</code>');
    return;
  }
  prepare(parsed);
  song = parsed;
  const bars = song.measures.length;
  $('songMeta').textContent = [song.tempo ? `${song.tempo} BPM` : null, `${song.time.showNum}/${song.time.showDen}`, `${bars} bar${bars === 1 ? '' : 's'}`].filter(Boolean).join(' · ');
  warnEl.innerHTML = song.warnings.map(w => `<li>${esc(w)}</li>`).join('');
  drawSheet();
  sheet.scrollTop = 0; sheet.scrollLeft = 0;
  go(0);
}

$('enter').addEventListener('click', run);
$('prev').addEventListener('click', e => e.shiftKey ? jumpBar(-1) : go(cur - 1));
$('next').addEventListener('click', e => e.shiftKey ? jumpBar(1) : go(cur + 1));
$('loadExample').addEventListener('click', () => { input.value = EXAMPLE; save(); run(); });
sheet.addEventListener('click', e => {
  const t = e.target.closest('[data-k]');
  if (t && song) go(+t.dataset.k);
});

function save(){ try { localStorage.setItem(STORE_KEY, input.value); } catch (_) {} }
input.addEventListener('input', save);

document.addEventListener('keydown', e => {
  if (e.target === input){
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)){ e.preventDefault(); run(); input.blur(); }
    return;
  }
  const tag = e.target.tagName;
  if (tag === 'INPUT' || tag === 'SELECT' || e.target.isContentEditable) return;
  if (!song) return;
  if (e.key === 'ArrowRight'){ e.preventDefault(); e.shiftKey ? jumpBar(1) : go(cur + 1); }
  else if (e.key === 'ArrowLeft'){ e.preventDefault(); e.shiftKey ? jumpBar(-1) : go(cur - 1); }
  else if (e.key === 'Home'){ e.preventDefault(); go(0); }
  else if (e.key === 'End'){ e.preventDefault(); go(song.flat.length - 1); }
});

let rz = 0;
new ResizeObserver(() => {
  cancelAnimationFrame(rz);
  rz = requestAnimationFrame(() => {
    if (song && Math.abs(sheet.clientWidth - lastWidth) > 4){ drawSheet(); go(cur); }
  });
}).observe(sheet);

let saved = null;
try { saved = localStorage.getItem(STORE_KEY); } catch (_) {}
input.value = saved && saved.trim() ? saved : EXAMPLE;
input.placeholder = 'HH|x-x-x-x-x-x-x-x-|\nSD|----o-------o---|\nBD|o-------o-------|';
run();
