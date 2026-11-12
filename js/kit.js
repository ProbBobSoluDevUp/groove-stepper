'use strict';
// Draws the 2D drum kit.

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
  let s = `<g id="kit-BD" class="pc kick"><rect class="nextmark" x="243" y="131" width="154" height="122" rx="11"/><rect class="shell" x="250" y="138" width="140" height="108" rx="7"/><rect class="band" x="250" y="138" width="140" height="8" rx="3"/><rect class="band" x="250" y="238" width="140" height="8" rx="3"/><rect class="pedal" x="306" y="252" width="28" height="40" rx="5"/><text class="t on-shell" x="320" y="216">Kick</text></g>`;
  s += `<g id="kit-HF" class="pc foot"><rect class="nextmark" x="59" y="219" width="50" height="70" rx="10"/><rect class="pedal" x="66" y="226" width="36" height="56" rx="6"/><text class="t" x="84" y="297">Hi-hat pedal</text></g>`;
  for (const p of KIT){
    if (p.kind === 'drum'){
      let lugs = '';
      for (let i = 0; i < p.lugs; i++){
        const a = (i + 0.5) / p.lugs * Math.PI * 2;
        lugs += `<circle class="lug" cx="${f1(p.x + (p.r + 1.5) * Math.cos(a))}" cy="${f1(p.y + (p.r + 1.5) * Math.sin(a))}" r="3.2"/>`;
      }
      s += `<g id="kit-${p.id}" class="pc drum"><circle class="nextmark" cx="${p.x}" cy="${p.y}" r="${p.r + 9}"/>${lugs}<circle class="hoop" cx="${p.x}" cy="${p.y}" r="${p.r}"/><circle class="head" cx="${p.x}" cy="${p.y}" r="${p.r - 4.5}"/><text class="t" x="${p.x}" y="${p.y + 4}">${p.label}</text></g>`;
    } else {
      s += `<g id="kit-${p.id}" class="pc cym"><circle class="nextmark" cx="${p.x}" cy="${p.y}" r="${p.r + 6}"/><circle class="openmark" cx="${p.x}" cy="${p.y}" r="${p.r + 9}"/><circle class="cb" cx="${p.x}" cy="${p.y}" r="${p.r}"/>`
         + [0.82, 0.62, 0.42].map(k => `<circle class="cr" cx="${p.x}" cy="${p.y}" r="${f1(p.r * k)}"/>`).join('')
         + `<circle class="bell" cx="${p.x}" cy="${p.y}" r="${f1(p.r * 0.2)}"/><text class="t" x="${p.x}" y="${f1(p.y + p.r * 0.2 + 14)}">${p.label}</text></g>`;
    }
  }
  kitSvg.innerHTML = s;
}
buildKit();
const kitEls = {};
Object.keys(INST).forEach(k => { kitEls[k] = document.getElementById('kit-' + k); });
