const fs = require('fs');
const path = require('path');

const desktopPath = 'C:\\Users\\cloos\\Desktop';

function inspectClass(filename) {
  const raw = fs.readFileSync(path.join(desktopPath, filename), 'latin1');
  const lines = raw.split(/\r?\n/);
  const comps = {};
  const races = {};
  const scores = {}; // compId -> [ { raceRank, pts, cod, disc } ]

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
    }
  }

  for (const line of lines) {
    const m = line.match(/^"([^"]*)","([^"]*)","([^"]*)","?([^"]*)"?$/);
    if (!m) continue;
    const [_, k, v, c, r] = m;
    if (k === 'rpts' && c && r && races[r]?.sailed) {
      if (!scores[c]) scores[c] = {};
      if (!scores[c][r]) scores[c][r] = {};
      scores[c][r].pts = parseFloat(v);
    } else if (k === 'rcod' && c && r && races[r]?.sailed) {
      if (!scores[c]) scores[c] = {};
      if (!scores[c][r]) scores[c][r] = {};
      scores[c][r].cod = v;
    }
  }

  console.log(`\n======================================================`);
  console.log(`DETALLE CLASE: ${filename}`);
  console.log(`Inscriptos: ${Object.keys(comps).length}`);
  
  const compList = [];
  for (const [cId, comp] of Object.entries(comps)) {
    const cScores = [];
    let hasDSQ2or69 = false;
    for (const [rId, rInfo] of Object.entries(races)) {
      if (!rInfo.sailed) continue;
      const res = scores[cId] && scores[cId][rId];
      if (res) {
        cScores.push({ rank: rInfo.rank, pts: res.pts, cod: res.cod || '' });
        if (res.cod === 'DSQ' || res.cod === 'DNE') {
          // check if rule 2 or 69
          console.log(`Penalty note in ${comp.comphelmname}: ${res.cod} in race ${rInfo.rank}`);
        }
      }
    }

    // Sort by pts
    const sortedByPts = [...cScores].sort((a, b) => a.pts - b.pts);
    const best8 = sortedByPts.slice(0, 8);
    const sumBest8 = best8.reduce((sum, x) => sum + x.pts, 0);
    const avgBest8 = sumBest8 / 8;

    // All races
    const sumAll = cScores.reduce((sum, x) => sum + x.pts, 0);
    const avgAll = sumAll / cScores.length;

    // Relative to fleet (percentage)
    const fleetSize = Object.keys(comps).length;
    const relAvgBest8 = (avgBest8 / fleetSize) * 100; // as % of fleet

    compList.push({
      id: cId,
      sail: comp.compsailno,
      helm: comp.comphelmname,
      crew: comp.compcrewname,
      club: comp.compclub,
      cScores,
      best8,
      sumBest8,
      avgBest8,
      sumAll,
      avgAll,
      relAvgBest8,
      fleetSize
    });
  }

  compList.sort((a, b) => a.sumBest8 - b.sumBest8);
  for (let i = 0; i < Math.min(5, compList.length); i++) {
    const c = compList[i];
    console.log(`${i+1}. [${c.sail}] ${c.helm} ${c.crew ? '/ ' + c.crew : ''} (${c.club})`);
    console.log(`   Best 8 sum: ${c.sumBest8} | Best 8 avg: ${c.avgBest8.toFixed(3)} | Best 8 rel avg: ${c.relAvgBest8.toFixed(2)}% de flota (${c.fleetSize} barcos)`);
    console.log(`   Best 8 regatas: ${c.best8.map(x => `R${x.rank}:${x.pts}${x.cod ? '('+x.cod+')':''}`).join(', ')}`);
    console.log(`   Todas regatas (${c.cScores.length}): sum=${c.sumAll}, avg=${c.avgAll.toFixed(2)}`);
  }
}

inspectClass('sba2026 29er.blw');
inspectClass('sba2026 420.blw');
inspectClass('sba2026 49erFX.blw');
inspectClass('SBA26_PRINCI.blw');
inspectClass('SBA26_TIMO.blw');
inspectClass('sba2026 ilca4.blw');
inspectClass('sba2026 ilca6.blw');
inspectClass('sba2026 ilca7.blw');
