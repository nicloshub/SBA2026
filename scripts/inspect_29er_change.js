const fs = require('fs');

const raw = fs.readFileSync('C:\\Users\\cloos\\Desktop\\sba2026 29er (1).blw', 'latin1');
const lines = raw.split(/\r?\n/);

const comps = {};
const races = {};
const scores = {};

for (const line of lines) {
  const m = line.match(/^"([^"]*)","([^"]*)","([^"]*)","?([^"]*)"?$/);
  if (!m) continue;
  const [_, k, v, c, r] = m;
  if (k.startsWith('comp') && c) {
    if (!comps[c]) comps[c] = {};
    comps[c][k] = v;
  } else if (k === 'racerank' && r) {
    if (!races[r]) races[r] = {};
    races[r].rank = parseInt(v, 10);
    races[r].rId = r;
  } else if (k === 'racesailed' && r) {
    if (!races[r]) races[r] = {};
    races[r].sailed = v === '1';
  }
}

for (const line of lines) {
  const m = line.match(/^"([^"]*)","([^"]*)","([^"]*)","?([^"]*)"?$/);
  if (!m) continue;
  const [_, k, v, c, r] = m;
  if (k === 'rpts' && c && r) {
    if (!scores[c]) scores[c] = {};
    if (!scores[c][r]) scores[c][r] = {};
    scores[c][r].pts = parseFloat(v);
  } else if (k === 'rcod' && c && r) {
    if (!scores[c]) scores[c] = {};
    if (!scores[c][r]) scores[c][r] = {};
    scores[c][r].cod = v;
  }
}

console.log('RACES:');
for (const [rId, r] of Object.entries(races)) {
  console.log(`Race ID ${rId} -> Rank ${r.rank} (sailed: ${r.sailed})`);
}

console.log('\nCOMPETITORS WITH DPI4 or OTHER PENALTIES in race 60:');
for (const [cId, comp] of Object.entries(comps)) {
  const s = scores[cId] && scores[cId]['60'];
  if (s && s.cod) {
    console.log(`Comp ${cId} [${comp.compsailno}] ${comp.comphelmname}: pts=${s.pts}, cod=${s.cod}`);
  }
}

console.log('\nFELIX LLAURO SCORES:');
for (const [cId, comp] of Object.entries(comps)) {
  if (comp.comphelmname && comp.comphelmname.includes('Felix')) {
    console.log(`Comp ID ${cId}: ${comp.comphelmname}`);
    for (const [rId, r] of Object.entries(races)) {
      if (r.sailed) {
        const sc = scores[cId] && scores[cId][rId];
        console.log(` Race ${r.rank} (id ${rId}): pts=${sc?.pts}, cod=${sc?.cod || ''}`);
      }
    }
  }
}
