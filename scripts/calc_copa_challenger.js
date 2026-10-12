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

function parseBLW(filePath) {
  const raw = fs.readFileSync(filePath, 'latin1');
  const lines = raw.split(/\r?\n/);

  const comps = {};
  const races = {};
  const results = {}; // compId -> { [raceId]: { pts, cod, disc, restyp } }

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
      if (!results[c]) results[c] = {};
      if (!results[c][r]) results[c][r] = {};
      results[c][r].pts = parseFloat(v);
    } else if (k === 'rcod' && c && r) {
      if (!results[c]) results[c] = {};
      if (!results[c][r]) results[c][r] = {};
      results[c][r].cod = v;
    } else if (k === 'rdisc' && c && r) {
      if (!results[c]) results[c] = {};
      if (!results[c][r]) results[c][r] = {};
      results[c][r].disc = v === '1';
    } else if (k === 'rrestyp' && c && r) {
      if (!results[c]) results[c] = {};
      if (!results[c][r]) results[c][r] = {};
      results[c][r].restyp = parseInt(v, 10);
    }
  }

  return { comps, races, results };
}

for (const file of files) {
  const parsed = parseBLW(path.join(desktopPath, file));
  const sailedRaceIds = Object.values(parsed.races)
    .filter(r => r.sailed)
    .map(r => r.raceId);

  console.log(`\n======================================================`);
  console.log(`CLASE: ${file} (Total inscriptos: ${Object.keys(parsed.comps).length})`);
  console.log(`Regatas corridas (${sailedRaceIds.length}): ${sailedRaceIds.map(id => parsed.races[id].rank).sort((a,b)=>a-b).join(', ')}`);

  // Calculate scores for each competitor
  const competitors = [];
  for (const [cId, comp] of Object.entries(parsed.comps)) {
    const scores = [];
    let hasRule2or69 = false;

    for (const rId of sailedRaceIds) {
      const res = (parsed.results[cId] && parsed.results[cId][rId]) ? parsed.results[cId][rId] : null;
      if (res) {
        if (res.cod === 'DSQ') {
          // Check if notes or anything mentions rule 2 or 69
          // In Sailwave, rule 2 or 69 is often DNE or notes
        }
        if (res.cod === 'DNE') {
          hasRule2or69 = true;
        }
        scores.push(res.pts);
      } else {
        // If no score recorded, max penalty
        scores.push(Object.keys(parsed.comps).length + 1);
      }
    }

    scores.sort((a, b) => a - b);
    const best8 = scores.slice(0, 8);
    const sumBest8 = best8.reduce((a, b) => a + b, 0);
    const avgBest8 = sumBest8 / 8;
    const sumAll = scores.reduce((a, b) => a + b, 0);
    const avgAll = sumAll / scores.length;

    competitors.push({
      id: cId,
      sail: comp.compsailno,
      name: comp.comphelmname,
      club: comp.compclub,
      scores,
      best8,
      sumBest8,
      avgBest8,
      sumAll,
      avgAll,
      sailedCount: scores.length
    });
  }

  competitors.sort((a, b) => a.sumBest8 - b.sumBest8);

  console.log(`TOP 5 MEJORES 8 REGATAS:`);
  competitors.slice(0, 5).forEach((c, idx) => {
    console.log(`  ${idx + 1}. [${c.sail}] ${c.name} (${c.club}) - Sum8: ${c.sumBest8} | Avg8: ${c.avgBest8.toFixed(2)} | Scores: [${c.best8.join(', ')}]`);
  });
}
