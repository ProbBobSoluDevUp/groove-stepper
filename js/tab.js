'use strict';
// Reads drum tab text and turns it into bars, steps and hits.

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
