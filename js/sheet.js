'use strict';
// Draws the sheet music as SVG.

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
