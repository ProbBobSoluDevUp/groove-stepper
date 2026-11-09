(() => {
'use strict';

const EXAMPLE = `Title: Example: rock beat with a tom fill
Tempo: 100
Time: 4/4

[Groove]
CR|x---------------|----------------|
HH|--x-x-x-x-x-x-x-|x-x-x-x-x-x-x-o-|
SD|----O-------O---|----O--g----O---|
BD|o-------o-o-----|o-------o-o---o-|

[Fill]
HH|x-x-x-x-x-x-x-x-|x-x-x-x---------|
SD|----O-------O---|----O---oo------|
T1|----------------|----------oo----|
T2|----------------|------------oo--|
FT|----------------|--------------oo|
BD|o-------o-o-----|o-------o-------|

[Ending]
CR|x---------------|
BD|o---------------|`;

/* ---------- instruments ---------- */
// pos = staff position: 0 is the bottom line (E4), each step is half a space
const INST = {
  CR:{name:'Crash', pos:10, cym:true},
  HH:{name:'Hi-hat', pos:9, cym:true},
  RD:{name:'Ride', pos:8, cym:true},
  T1:{name:'Tom 1', pos:7},
  T2:{name:'Tom 2', pos:6},
  SD:{name:'Snare', pos:5},
  FT:{name:'Floor tom', pos:3},
  BD:{name:'Kick', pos:1},
  HF:{name:'Hi-hat pedal', pos:-1, cym:true},
};
const ALIAS = {
  CR:'CR',C:'CR',CC:'CR',CY:'CR',C1:'CR',C2:'CR',CRASH:'CR',CH:'CR',CN:'CR',SP:'CR',SPL:'CR',
  HH:'HH',H:'HH',HAT:'HH',HIHAT:'HH',
  RD:'RD',R:'RD',RC:'RD',RI:'RD',RIDE:'RD',
  T1:'T1',T:'T1',HT:'T1',TT:'T1',TOM1:'T1',
  T2:'T2',MT:'T2',LT:'T2',TOM2:'T2',
  FT:'FT',F:'FT',T3:'FT',T4:'FT',FLOOR:'FT',
  SD:'SD',S:'SD',SN:'SD',SNR:'SD',SNARE:'SD',
  BD:'BD',B:'BD',K:'BD',KD:'BD',KICK:'BD',BASS:'BD',
  HF:'HF',HP:'HF',P:'HF',FH:'HF',PH:'HF',HHF:'HF',HHP:'HF',
};

const esc = s => String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const REPEAT_RE = /^\s*(?:[xX×*]\s*(\d+)|(\d+)\s*[xX×])\s*$/;

function readChar(ch, key){
  if ('-._~=,'.includes(ch)) return null;
  if (key === 'HH' && (ch === 'o' || ch === 'O')) return {open:true, accent: ch === 'O'};
  if (ch === 'g' || ch === 'G') return {ghost:true};
  if (ch === 'X' || ch === 'O' || ch === '@' || ch === 'A') return {accent:true};
  return {};
}

/* ---------- parsing ---------- */
function parseTab(text){
  const song = {title:'', tempo:null, time:{num:4, den:4, showNum:4, showDen:4}, measures:[], warnings:[]};
  const systems = [];
  let sys = null, pendingSection = null;
  const close = () => { if (sys && sys.lines.length) systems.push(sys); sys = null; };

  text.replace(/\r/g, '').split('\n').forEach((raw, idx) => {
    const t = raw.replace(/\t/g, '    ').trim();
    if (!t){ close(); return; }
    if (/^(#|\/\/)/.test(t)) return;
    let mm;
    if ((mm = t.match(/^(?:title|song|name)\s*[:=]\s*(.+)$/i))){ close(); song.title = mm[1].trim(); return; }
    if ((mm = t.match(/^(?:tempo|bpm)\s*[:=]\s*(\d+(?:\.\d+)?)/i))){ close(); song.tempo = Math.round(+mm[1]); return; }
    if ((mm = t.match(/^(?:time signature|time|meter|timesig)\s*[:=]\s*(\d+)\s*\/\s*(\d+)/i))){
      close();
      let n = +mm[1], d = +mm[2];
      const shown = {showNum:n, showDen:d};
      if (d === 2){ n *= 2; d = 4; }
      if ((d === 4 || d === 8) && n > 0 && n <= 16) song.time = {num:n, den:d, ...shown};
      else song.warnings.push(`Line ${idx+1}: ${mm[1]}/${mm[2]} isn't supported yet, so 4/4 was used.`);
      return;
    }
    if ((mm = t.match(/^\[(.+?)\]$/)) || (mm = t.match(/^(?:section|part)\s*[:=]\s*(.+)$/i))){ close(); pendingSection = mm[1].trim(); return; }
    if ((mm = t.match(/^([A-Za-z][A-Za-z0-9]{0,5})\s*:?\s*\|(.*)$/))){
      const label = mm[1].toUpperCase();
      const key = ALIAS[label];
      if (!key){ song.warnings.push(`Line ${idx+1}: "${mm[1]}" isn't a drum name this page knows, so that line was skipped.`); return; }
      if (sys && sys.lines.some(l => l.label === label)) close();
      if (!sys){ sys = {lines:[], section:pendingSection, rep:null}; pendingSection = null; }
      const segs = mm[2].split('|');
      let rep = null;
      const tail = segs[segs.length - 1];
      const rm = tail.match(REPEAT_RE);
      if (rm){ rep = +(rm[1] || rm[2]); segs.pop(); }
      else if (!tail.trim()) segs.pop();
      const clean = segs.map(s => s.replace(/\s+/g, '')).filter(s => s.length);
      sys.lines.push({key, label, segs:clean, rep});
      return;
    }
    // a lone "x4" under a block repeats that block
    const rm = t.match(REPEAT_RE);
    if (rm){
      close();
      if (systems.length) systems[systems.length - 1].rep = +(rm[1] || rm[2]);
      return;
    }
    close();
    if (/:\s*$/.test(t) && t.length <= 40) pendingSection = t.replace(/:\s*$/, '');
  });
  close();

  systems.forEach(sy => {
    const M = Math.max(...sy.lines.map(l => l.segs.length));
    const rep = sy.rep || sy.lines.map(l => l.rep).find(Boolean) || null;
    const first = song.measures.length;
    for (let i = 0; i < M; i++){
      const lens = sy.lines.map(l => (l.segs[i] || '').length);
      const steps = Math.max(...lens);
      if (!steps) continue;
      const used = [...new Set(lens.filter(n => n > 0))];
      if (used.length > 1) song.warnings.push(`Bar ${song.measures.length + 1}: the drum lines have different lengths (${used.join(', ')} steps). Shorter lines were padded with rests at the end.`);
      const cols = Array.from({length:steps}, () => []);
      sy.lines.forEach(l => {
        const seg = l.segs[i] || '';
        for (let s = 0; s < seg.length; s++){
          const h = readChar(seg[s], l.key);
          if (!h) continue;
          const ex = cols[s].find(c => c.inst === l.key);
          if (ex){ ex.accent = ex.accent || h.accent; ex.open = ex.open || h.open; ex.ghost = ex.ghost && h.ghost; }
          else cols[s].push({inst:l.key, accent:!!h.accent, open:!!h.open, ghost:!!h.ghost});
        }
      });
      cols.forEach(c => c.sort((a, b) => INST[b.inst].pos - INST[a.inst].pos));
      const isFirst = song.measures.length === first;
      song.measures.push({steps, cols, section: isFirst ? sy.section : null, sysStart:isFirst, sysRepeat:rep, repeat:null});
    }
    if (song.measures.length > first) song.measures[song.measures.length - 1].repeat = rep;
  });
  return song;
}

/* ---------- rhythm analysis ---------- */
function analyze(m, time, barNo, warnings){
  const {num, den} = time;
  const compound = den === 8 && num % 3 === 0 && num > 3;
  const G = compound ? num / 3 : num;
  let g;
  if (m.steps % G){
    warnings.push(`Bar ${barNo} has ${m.steps} steps, which doesn't split evenly into ${G} beats, so it's shown without beat grouping.`);
    g = {G:1, S:m.steps, odd:true, compound:false};
  } else g = {G, S:m.steps / G, odd:false, compound};
  g.den = den;
  g.beat16 = compound ? 6 : den === 8 ? 2 : 4;   // sixteenth notes per beat
  const S = g.S;
  g.L = g.odd ? (S <= 8 ? 1 : S <= 16 ? 2 : 3)
      : g.compound ? (S <= 3 ? 1 : S <= 6 ? 2 : 3)
      : den === 8 ? (S <= 2 ? 2 : 3)
      : (S <= 3 ? 1 : S <= 7 ? 2 : 3);
  g.tuplet = (!g.odd && !g.compound && (S & (S - 1))) ? S : null;
  return g;
}

function countLabels(g, gi){
  const S = g.S;
  const fill = (head) => Array.from({length:S}, (_, i) => i === 0 ? String(head) : '·');
  if (g.odd) return fill(1);
  if (g.compound){
    const b = gi * 3 + 1;
    if (S === 3) return [b, b + 1, b + 2].map(String);
    if (S === 6) return [b, '&', b + 1, '&', b + 2, '&'].map(String);
    if (S === 12) return [b,'e','&','a', b + 1,'e','&','a', b + 2,'e','&','a'].map(String);
    return fill(b);
  }
  const n = String(gi + 1);
  const table = {1:[n], 2:[n,'&'], 3:[n,'trip','let'], 4:[n,'e','&','a'], 6:[n,'la','li','&','la','li'], 8:[n,'·','e','·','&','·','a','·']};
  return table[S] || fill(n);
}

function prepare(song){
  song.offsets = [];
  song.flat = [];
  song.measures.forEach((m, mi) => {
    m.g = analyze(m, song.time, mi + 1, song.warnings);
    m.counts = [];
    for (let gi = 0; gi < m.g.G; gi++) m.counts.push(...countLabels(m.g, gi));
    song.offsets.push(song.flat.length);
    for (let s = 0; s < m.steps; s++) song.flat.push({mi, s});
  });
}

/* ---------- sheet drawing ---------- */
const BOT = 114, ROW_H = 158, FIRST_LEAD = 58, LEAD = 30, MID = 94, SX = 5;
const yOf = p => BOT - p * 5;
const f1 = n => Math.round(n * 10) / 10;
const unitPx = S => S <= 1 ? 40 : S === 2 ? 32 : S === 3 ? 28 : S === 4 ? 24 : S <= 6 ? 18 : 14;
const padL = m => 12 + (m.sysStart && m.sysRepeat ? 12 : 0);
const padR = m => 8 + (m.repeat ? 12 : 0);
const natW = m => padL(m) + m.steps * unitPx(m.g.S) + padR(m);

function layout(song, avail){
  const rows = []; let cur = [], w = 0;
  song.measures.forEach((m, mi) => {
    const lead = rows.length === 0 ? FIRST_LEAD : LEAD;
    const nw = natW(m);
    if (cur.length && lead + w + nw > avail){ rows.push(cur); cur = []; w = 0; }
    cur.push(mi); w += nw;
  });
  if (cur.length) rows.push(cur);
  return rows;
}

function rest(out, x, level, dot){
  x = f1(x); const m = MID;
  if (level <= 0) out.push(`<path class="rs" d="M${x-2} ${m-12}L${x+4} ${m-5}L${x-1} ${m+1}L${x+4} ${m+7}Q${x-5} ${m+4} ${x-1} ${m+13}"/>`);
  else if (level === 1) out.push(`<circle class="ink" cx="${x-2.5}" cy="${m-5}" r="2.4"/><path class="rs thin" d="M${x-2.5} ${m-4}Q${x+1} ${m-2} ${x+4} ${m-7}L${x-1} ${m+9}"/>`);
  else out.push(`<circle class="ink" cx="${x-1.5}" cy="${m-8}" r="2.3"/><circle class="ink" cx="${x-3.5}" cy="${m}" r="2.3"/><path class="rs thin" d="M${x-1.5} ${m-7}Q${x+2} ${m-5} ${x+5} ${m-10}L${x-2} ${m+12}M${x-3.5} ${m+1}Q${x} ${m+3} ${x+2.4} ${m-2}"/>`);
  if (dot) out.push(`<circle class="ink" cx="${x+9}" cy="89" r="1.8"/>`);
}

// length in sixteenth notes -> beams/flags and dot
function durLevel(v){
  const table = [[0.5,3,false],[1,2,false],[1.5,2,true],[2,1,false],[3,1,true],[4,0,false],[6,0,true]];
  for (const [val, level, dot] of table) if (Math.abs(v - val) < 1e-6) return {level, dot};
  return null;
}

function beam(out, x1, x2, y){
  out.push(`<rect class="ink" x="${f1(x1 - 0.65)}" y="${f1(y)}" width="${f1(x2 - x1 + 1.3)}" height="4.4"/>`);
}

function noteSVG(col, x, k, beamY, flags, dot){
  x = f1(x);
  let s = `<g class="n" data-k="${k}">`;
  let maxY = -Infinity, acc = false, open = false;
  for (const h of col){
    const p = INST[h.inst].pos, y = yOf(p);
    maxY = Math.max(maxY, y);
    for (let q = 10; q <= p; q += 2) s += `<line class="ledger" x1="${x-8}" y1="${yOf(q)}" x2="${x+8}" y2="${yOf(q)}"/>`;
    if (INST[h.inst].cym) s += `<path class="nx" d="M${x-4.5} ${y-4.5}L${x+4.5} ${y+4.5}M${x-4.5} ${y+4.5}L${x+4.5} ${y-4.5}"/>`;
    else s += `<ellipse class="nh" cx="${x}" cy="${y}" rx="5.4" ry="3.9" transform="rotate(-20 ${x} ${y})"/>`;
    if (h.ghost) s += `<path class="par" d="M${x-7.5} ${y-5}Q${x-11} ${y} ${x-7.5} ${y+5}M${x+8.5} ${y-5}Q${x+12} ${y} ${x+8.5} ${y+5}"/>`;
    if (dot){ const dy = (((p % 2) + 2) % 2 === 0) ? -5 : 0; s += `<circle class="nh" cx="${x+11}" cy="${y+dy}" r="1.8"/>`; }
    acc = acc || h.accent; open = open || h.open;
  }
  s += `<line class="stem" x1="${x+SX}" y1="${maxY}" x2="${x+SX}" y2="${beamY}"/>`;
  for (let f = 0; f < flags; f++) s += `<path class="flag" d="M${x+SX} ${beamY + f*7}c1 6 9 8 7 17"/>`;
  const my = beamY - 9;
  if (acc) s += `<path class="mk" d="M${x-4} ${my-3.5}L${x+5} ${my}L${x-4} ${my+3.5}"/>`;
  if (open) s += `<circle class="mk" cx="${x}" cy="${acc ? my - 10 : my}" r="3"/>`;
  return s + '</g>';
}

function drawMeasure(m, cx, K0, out){
  const g = m.g, S = g.S;
  if (!m.cols.some(c => c.length)){
    const mid = (cx(0) + cx(m.steps - 1)) / 2;
    out.push(`<rect class="ink" x="${f1(mid - 8)}" y="84" width="16" height="5.5"/>`);
    return;
  }
  for (let gi = 0; gi < g.G; gi++){
    const start = gi * S;
    const hits = [];
    for (let i = 0; i < S; i++) if (m.cols[start + i].length) hits.push(i);
    if (!hits.length){
      const r = durLevel(g.beat16) || {level:0};
      rest(out, cx(start) + 2, r.level, r.dot);
      continue;
    }
    // Try real note values first (8ths, 16ths, dotted notes). If a gap has no clean
    // note value (triplets, odd lengths), fall back to one slot per step.
    let notes = null;
    if (!g.odd){
      const lev = d => durLevel(d * g.beat16 / S);
      const lead = hits[0] > 0 ? lev(hits[0]) : null;
      const ns = hits.map((i, j) => ({s:start + i, r:lev((j + 1 < hits.length ? hits[j + 1] : S) - i)}));
      if ((hits[0] === 0 || lead) && ns.every(n => n.r)){
        if (lead) rest(out, cx(start), lead.level, lead.dot);
        notes = ns.map(n => ({s:n.s, level:n.r.level, dot:n.r.dot}));
      }
    }
    const grid = !notes;
    if (grid){
      for (let i = 0; i < S; i++) if (!m.cols[start + i].length) rest(out, cx(start + i), g.L, false);
      notes = hits.map(i => ({s:start + i, level:g.L}));
    }
    let minY = Infinity;
    notes.forEach(n => m.cols[n.s].forEach(h => { minY = Math.min(minY, yOf(INST[h.inst].pos)); }));
    const beamY = minY - 30;
    const single = notes.length === 1;
    notes.forEach(n => out.push(noteSVG(m.cols[n.s], cx(n.s), K0 + n.s, beamY, single ? n.level : 0, n.dot)));
    if (!single){
      const sx = n => cx(n.s) + SX;
      beam(out, sx(notes[0]), sx(notes[notes.length - 1]), beamY);
      const maxL = Math.max(...notes.map(n => n.level));
      for (let k = 2; k <= maxL; k++){
        const yk = beamY + (k - 1) * 7;
        for (let j = 0; j < notes.length; j++){
          if (notes[j].level < k) continue;
          const prevIn = j > 0 && notes[j - 1].level >= k;
          const nextIn = j + 1 < notes.length && notes[j + 1].level >= k;
          if (nextIn) beam(out, sx(notes[j]), sx(notes[j + 1]), yk);
          else if (!prevIn){
            if (j === notes.length - 1) beam(out, sx(notes[j]) - 7, sx(notes[j]), yk);
            else beam(out, sx(notes[j]), sx(notes[j]) + 7, yk);
          }
        }
      }
    }
    if (grid && g.tuplet){
      const hasAcc = notes.some(n => m.cols[n.s].some(h => h.accent));
      const hasOpen = notes.some(n => m.cols[n.s].some(h => h.open));
      const ty = beamY - 7 - (hasAcc ? 10 : 0) - (hasOpen ? 10 : 0);
      out.push(`<text class="tup" x="${f1((cx(start) + cx(start + S - 1)) / 2 + SX)}" y="${ty}">${g.tuplet}</text>`);
    }
  }
}

function renderRow(song, row, ri, avail, isLast){
  const lead = ri === 0 ? FIRST_LEAD : LEAD;
  let nat = 0, flex = 0;
  row.forEach(mi => { const m = song.measures[mi]; nat += natW(m); flex += m.steps * unitPx(m.g.S); });
  const spare = avail - lead - nat;
  let stretch = 1;
  if (spare > 0 && !(isLast && (lead + nat) / avail < 0.6)) stretch = Math.min(2.4, 1 + spare / flex);

  const bg = [], fg = [];
  fg.push(`<rect class="ink" x="10" y="84" width="3.5" height="20"/><rect class="ink" x="16.5" y="84" width="3.5" height="20"/>`);
  if (ri === 0) fg.push(`<text class="tsig" x="40" y="92">${song.time.showNum}</text><text class="tsig" x="40" y="112">${song.time.showDen}</text>`);
  else fg.push(`<text class="bnum" x="6" y="68">${row[0] + 1}</text>`);

  let x = lead;
  const lastIndex = song.measures.length - 1;
  for (const mi of row){
    const m = song.measures[mi];
    const sp = unitPx(m.g.S) * stretch;
    const pl = padL(m), pr = padR(m);
    const mx = x, endX = x + pl + m.steps * sp + pr;
    const cx = s => mx + pl + (s + 0.5) * sp;
    const K0 = song.offsets[mi];

    for (let s = 0; s < m.steps; s++){
      bg.push(`<rect class="col" data-k="${K0 + s}" x="${f1(cx(s) - sp / 2 + 1)}" y="20" width="${f1(sp - 2)}" height="${ROW_H - 22}" rx="4"/>`);
      const isBeat = s % m.g.S === 0;
      fg.push(`<text class="cnt${isBeat ? ' beat' : ''}" data-k="${K0 + s}" x="${f1(cx(s))}" y="146">${esc(m.counts[s])}</text>`);
    }
    if (m.section) fg.push(`<text class="sec" x="${f1(mx + 4)}" y="13">${esc(m.section.toUpperCase())}</text>`);
    if (m.sysStart && m.sysRepeat){
      fg.push(`<rect class="ink" x="${f1(mx + 1)}" y="74" width="3.5" height="40"/><line class="bl" x1="${f1(mx + 8)}" y1="74" x2="${f1(mx + 8)}" y2="114"/><circle class="ink" cx="${f1(mx + 12.5)}" cy="89" r="2"/><circle class="ink" cx="${f1(mx + 12.5)}" cy="99" r="2"/>`);
    }
    if (m.repeat){
      fg.push(`<circle class="ink" cx="${f1(endX - 12.5)}" cy="89" r="2"/><circle class="ink" cx="${f1(endX - 12.5)}" cy="99" r="2"/><line class="bl" x1="${f1(endX - 8)}" y1="74" x2="${f1(endX - 8)}" y2="114"/><rect class="ink" x="${f1(endX - 4.5)}" y="74" width="3.5" height="40"/>`);
      fg.push(`<text class="rep" x="${f1(endX - 2)}" y="13">×${m.repeat}</text>`);
    } else if (mi === lastIndex){
      fg.push(`<line class="bl" x1="${f1(endX - 7)}" y1="74" x2="${f1(endX - 7)}" y2="114"/><rect class="ink" x="${f1(endX - 4)}" y="74" width="3.5" height="40"/>`);
    } else {
      fg.push(`<line class="bl" x1="${f1(endX)}" y1="74" x2="${f1(endX)}" y2="114"/>`);
    }
    drawMeasure(m, cx, K0, fg);
    x = endX;
  }
  const W = Math.ceil(x + 2);
  let staff = '';
  for (let i = 0; i < 5; i++){ const y = 74 + i * 10; staff += `<line class="st" x1="4" y1="${y}" x2="${f1(x)}" y2="${y}"/>`; }
  return `<svg class="row" width="${W}" height="${ROW_H}" viewBox="0 0 ${W} ${ROW_H}">${bg.join('')}${staff}${fg.join('')}</svg>`;
}

/* ---------- kit ---------- */
const kitSvg = document.getElementById('kit');
const KIT = [
  {id:'FT', kind:'drum', x:470, y:214, r:54, lugs:8, label:'Floor tom'},
  {id:'SD', kind:'drum', x:176, y:205, r:46, lugs:10, label:'Snare'},
  {id:'T1', kind:'drum', x:268, y:116, r:38, lugs:6, label:'Tom 1'},
  {id:'T2', kind:'drum', x:372, y:116, r:42, lugs:6, label:'Tom 2'},
  {id:'HH', kind:'cym', x:84, y:160, r:48, label:'Hi-hat'},
  {id:'RD', kind:'cym', x:550, y:108, r:64, label:'Ride'},
  {id:'CR', kind:'cym', x:150, y:66, r:56, label:'Crash'},
];
function buildKit(){
  let s = `<g id="kit-BD" class="pc kick"><rect class="shell" x="250" y="138" width="140" height="108" rx="7"/><rect class="band" x="250" y="138" width="140" height="8" rx="3"/><rect class="band" x="250" y="238" width="140" height="8" rx="3"/><rect class="pedal" x="306" y="252" width="28" height="40" rx="5"/><text class="t on-shell" x="320" y="216">Kick</text></g>`;
  s += `<g id="kit-HF" class="pc foot"><rect class="pedal" x="66" y="226" width="36" height="56" rx="6"/><text class="t" x="84" y="297">Hi-hat pedal</text></g>`;
  for (const p of KIT){
    if (p.kind === 'drum'){
      let lugs = '';
      for (let i = 0; i < p.lugs; i++){
        const a = (i + 0.5) / p.lugs * Math.PI * 2;
        lugs += `<circle class="lug" cx="${f1(p.x + (p.r + 1.5) * Math.cos(a))}" cy="${f1(p.y + (p.r + 1.5) * Math.sin(a))}" r="3.2"/>`;
      }
      s += `<g id="kit-${p.id}" class="pc drum">${lugs}<circle class="hoop" cx="${p.x}" cy="${p.y}" r="${p.r}"/><circle class="head" cx="${p.x}" cy="${p.y}" r="${p.r - 4.5}"/><text class="t" x="${p.x}" y="${p.y + 4}">${p.label}</text></g>`;
    } else {
      s += `<g id="kit-${p.id}" class="pc cym"><circle class="openmark" cx="${p.x}" cy="${p.y}" r="${p.r + 9}"/><circle class="cb" cx="${p.x}" cy="${p.y}" r="${p.r}"/>`
         + [0.82, 0.62, 0.42].map(k => `<circle class="cr" cx="${p.x}" cy="${p.y}" r="${f1(p.r * k)}"/>`).join('')
         + `<circle class="bell" cx="${p.x}" cy="${p.y}" r="${f1(p.r * 0.2)}"/><text class="t" x="${p.x}" y="${f1(p.y + p.r * 0.2 + 14)}">${p.label}</text></g>`;
    }
  }
  kitSvg.innerHTML = s;
}
buildKit();
const kitEls = {};
Object.keys(INST).forEach(k => { kitEls[k] = document.getElementById('kit-' + k); });

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
})();
