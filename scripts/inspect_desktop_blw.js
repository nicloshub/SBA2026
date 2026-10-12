const fs = require('fs');
const path = require('path');

const desktopPath = 'C:\\Users\\cloos\\Desktop';
const files = [
  'sba2026 29er.blw',
  'sba2026 420.blw',
  'sba2026 49erFX.blw',
  'SBA26_PRINCI.blw',
  'SBA26_TIMO.blw'
];

for (const file of files) {
  const fullPath = path.join(desktopPath, file);
  if (!fs.existsSync(fullPath)) {
    console.log(`File not found: ${file}`);
    continue;
  }
  const raw = fs.readFileSync(fullPath, 'latin1');
  const lines = raw.split(/\r?\n/);

  // Competitors
  const comps = {};
  const races = {};
  const results = []; // { compId, raceId, pts, cod }

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
      races[r].raceId = r;
    } else if (k === 'racesailed' && r) {
      if (!races[r]) races[r] = {};
      races[r].sailed = v === '1';
    } else if (k === 'rpts' && c && r) {
      results.push({ compId: c, raceId: r, pts: parseFloat(v), key: 'rpts' });
    } else if (k === 'rcod' && c && r) {
      results.push({ compId: c, raceId: r, cod: v, key: 'rcod' });
    }
  }

  const sailedRaces = Object.values(races).filter(r => r.sailed);
  console.log(`\n========================================`);
  console.log(`FILE: ${file}`);
  console.log(`Total competitors: ${Object.keys(comps).length}`);
  console.log(`Total races defined: ${Object.keys(races).length}`);
  console.log(`Races sailed: ${sailedRaces.length} (Ranks: ${sailedRaces.map(r => r.rank).sort((a,b)=>a-b).join(', ')})`);
}
