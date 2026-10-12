const fs = require('fs');
const path = require('path');

const desktopPath = 'C:\\Users\\cloos\\Desktop';

const files = [
  'sba2026 29er.blw',
  'sba2026 ilca7.blw',
  'sba2026 ilca4.blw',
  'sba2026 ilca6.blw',
  'sba2026 420.blw',
  'SBA26_TIMO.blw',
  'SBA26_PRINCI.blw'
];

function inspectWorst(f, targetRaces = 8) {
  const raw = fs.readFileSync(path.join(desktopPath, f), 'latin1');
  const lines = raw.split(/\r?\n/);
  const comps = {}, races = {}, scores = {};
  for (const l of lines) {
    const m = l.match(/^"([^"]*)","([^"]*)","([^"]*)","?([^"]*)"?$/);
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

  const discards = {};
  for (const l of lines) {
    const m = l.match(/^"([^"]*)","([^"]*)","([^"]*)","?([^"]*)"?$/);
    if (!m) continue;
    const [_, k, v, c, r] = m;
    if (k === 'rpts' && c && r && races[r]?.sailed) {
      if (!scores[c]) scores[c] = {};
      if (!scores[c][r]) scores[c][r] = {};
      scores[c][r].pts = parseFloat(v);
    } else if (k === 'rdisc' && c && r && races[r]?.sailed) {
      if (!discards[c]) discards[c] = {};
      discards[c][r] = (v === '1');
    }
  }

  const sailed = Object.values(races).filter(x => x.sailed).sort((a,b) => a.rank - b.rank);
  const list = [];
  for (const [cId, comp] of Object.entries(comps)) {
    const allRaces = [];
    for (const r of sailed) {
      if (scores[cId] && scores[cId][r.rId] !== undefined && !isNaN(scores[cId][r.rId].pts)) {
        allRaces.push({
          rank: r.rank,
          pts: scores[cId][r.rId].pts,
          isDiscardedInSailwave: !!(discards[cId] && discards[cId][r.rId])
        });
      }
    }
    // Sort descending by pts (worst races first)
    const sortedWorst = [...allRaces].sort((a, b) => b.pts - a.pts);
    const worst8 = sortedWorst.slice(0, targetRaces);
    const sumWorst = worst8.reduce((a, b) => a + b.pts, 0);

    // Also best 8 for comparison
    const sortedBest = [...allRaces].sort((a, b) => a.pts - b.pts);
    const best8 = sortedBest.slice(0, targetRaces);
    const sumBest = best8.reduce((a, b) => a + b.pts, 0);

    list.push({
      helm: comp.comphelmname || '',
      crew: comp.compcrewname || '',
      sail: comp.compsailno || '',
      club: comp.compclub || '',
      allRaces,
      worst8,
      sumWorst,
      avgWorst: sumWorst / targetRaces,
      best8,
      sumBest,
      avgBest: sumBest / targetRaces,
      fleetSize: Object.keys(comps).length,
      relAvgWorst: (sumWorst / targetRaces / Object.keys(comps).length) * 100,
      totalSailed: allRaces.length
    });
  }

  // Rank by lowest sum of worst 8 (who had the best worst-scenario)
  list.sort((a, b) => a.sumWorst - b.sumWorst);
  return {
    file: f,
    fleetSize: Object.keys(comps).length,
    sailed: sailed.length,
    list
  };
}

console.log('\n========================================================================================');
console.log('ANÁLISIS TOMANDO LAS 8 PEORES REGATAS DE CADA COMPETIDOR');
console.log('========================================================================================\n');

const results = files.map(f => inspectWorst(f, 8));

const classLeaders = [];

for (const res of results) {
  const top1 = res.list[0];
  classLeaders.push({
    file: res.file,
    fleetSize: res.fleetSize,
    sailed: res.sailed,
    leader: top1
  });

  console.log(`CLASE: ${res.file} (${res.fleetSize} barcos, ${res.sailed} regatas corridas)`);
  for (let i = 0; i < Math.min(3, res.list.length); i++) {
    const c = res.list[i];
    const sailwaveDiscards = c.allRaces.filter(x => x.isDiscardedInSailwave);
    console.log(`  ${i+1}°. ${c.helm}${c.crew ? ' / ' + c.crew : ''} (${c.club})`);
    console.log(`      Todas las regatas (${c.allRaces.length}): ${c.allRaces.map(x => `R${x.rank}:${x.pts}${x.isDiscardedInSailwave ? '[DESC_SW]' : ''}`).join(', ')}`);
    console.log(`      Descartes oficiales Sailwave (${sailwaveDiscards.length}): ${sailwaveDiscards.map(x => `R${x.rank}:${x.pts}`).join(', ')}`);
    console.log(`      Suma 8 PEORES: ${c.sumWorst} pts | Promedio: ${c.avgWorst.toFixed(3)} pts/reg | % Flota: ${c.relAvgWorst.toFixed(2)}%`);
    console.log(`      Detalle 8 peores elegidas: ${c.worst8.map(x => `R${x.rank}:${x.pts}${x.isDiscardedInSailwave ? '[ERA_DESC]' : ''}`).join(', ')}`);
    console.log(`      (Ref: suma 8 mejores = ${c.sumBest} pts)`);
  }
  console.log('');
}

console.log('========================================================================================');
console.log('TABLA COMPARATIVA DE LÍDERES POR CLASE (Considerando sus 8 PEORES regatas):');
console.log('========================================================================================');
console.log(
  'Clase'.padEnd(18) +
  'Líder'.padEnd(28) +
  'Club'.padEnd(12) +
  'Flota'.padStart(6) +
  'Regatas'.padStart(8) +
  'Pts (8 PEORES)'.padStart(16) +
  'Promedio'.padStart(10) +
  '% Flota'.padStart(10)
);
console.log('----------------------------------------------------------------------------------------');

// Sort class leaders by lowest sum of worst 8
classLeaders.sort((a, b) => a.leader.sumWorst - b.leader.sumWorst);

for (const cl of classLeaders) {
  const l = cl.leader;
  const name = `${l.helm}${l.crew ? ' / ' + l.crew : ''}`.slice(0, 26);
  const club = (l.club || '').slice(0, 10);
  const cName = cl.file.replace('sba2026 ', '').replace('.blw', '').slice(0, 16);
  console.log(
    cName.padEnd(18) +
    name.padEnd(28) +
    club.padEnd(12) +
    String(cl.fleetSize).padStart(6) +
    String(cl.sailed).padStart(8) +
    l.sumWorst.toFixed(1).padStart(16) +
    l.avgWorst.toFixed(3).padStart(10) +
    (l.relAvgWorst.toFixed(2) + '%').padStart(10)
  );
}
console.log('----------------------------------------------------------------------------------------\n');

const overallLowest = classLeaders[0];
console.log(`1. GANADOR POR MENOR PUNTAJE (Tomando las 8 PEORES regatas):`);
console.log(`   -> ${overallLowest.leader.helm}${overallLowest.leader.crew ? ' / ' + overallLowest.leader.crew : ''} (${overallLowest.file})`);
console.log(`      Puntos: ${overallLowest.leader.sumWorst} puntos en sus 8 peores regatas`);
console.log(`      Promedio: ${overallLowest.leader.avgWorst.toFixed(3)} pts/regata`);
console.log(`      Detalle 8 peores: ${overallLowest.leader.worst8.map(x => `R${x.rank}:${x.pts}`).join(', ')}`);
console.log('');

// Overall by best relative average
classLeaders.sort((a, b) => a.leader.relAvgWorst - b.leader.relAvgWorst);
const overallRel = classLeaders[0];
console.log(`2. GANADOR POR MEJOR PROMEDIO RELATIVO (% Flota) (Tomando las 8 PEORES regatas):`);
console.log(`   -> ${overallRel.leader.helm}${overallRel.leader.crew ? ' / ' + overallRel.leader.crew : ''} (${overallRel.file})`);
console.log(`      Eficacia relativa: ${overallRel.leader.relAvgWorst.toFixed(2)}% de la flota (${overallRel.fleetSize} barcos)`);
console.log(`      Puntos: ${overallRel.leader.sumWorst} pts (Promedio: ${overallRel.leader.avgWorst.toFixed(3)} pts/reg)`);
console.log('');
