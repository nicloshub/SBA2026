const fs = require('fs');
const path = require('path');

const desktopPath = 'C:\\Users\\cloos\\Desktop';

function parseBLW(filePath) {
  const content = fs.readFileSync(filePath, 'latin1');
  const lines = content.split(/\r?\n/);
  
  let eventName = '';
  let seriesTitle = '';
  const comps = {};
  const races = {};
  const scores = {}; // cId -> { rId: { pts, cod } }

  for (const line of lines) {
    const m = line.match(/^"([^"]*)","([^"]*)","([^"]*)","?([^"]*)"?$/);
    if (!m) continue;
    const [_, k, v, c, r] = m;
    
    if (k === 'eventtitle') eventName = v;
    if (k === 'seriestitle') seriesTitle = v;

    if (k.startsWith('comp') && c) {
      if (!comps[c]) comps[c] = {};
      comps[c][k] = v;
    } else if (k === 'racerank' && r) {
      if (!races[r]) races[r] = {};
      races[r].rank = parseInt(v, 10);
      races[r].raceId = r;
    } else if (k === 'racesailed' && r) {
      if (!races[r]) races[r] = {};
      races[r].sailed = (v === '1');
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

  const sailedRaces = Object.values(races).filter(r => r.sailed);
  const totalComps = Object.keys(comps).length;

  return {
    filePath,
    fileName: path.basename(filePath),
    eventName,
    seriesTitle: seriesTitle || path.basename(filePath, '.blw'),
    comps,
    totalComps,
    races,
    sailedRaces,
    scores
  };
}

function processClass(classData, targetRaces = 8, topK = 10) {
  const { comps, totalComps, races, sailedRaces, scores, fileName, seriesTitle } = classData;

  // Precompute participants per race
  const raceParticipantsMap = {};
  for (const r of sailedRaces) {
    let count = 0;
    for (const cId of Object.keys(comps)) {
      const res = scores[cId] && scores[cId][r.raceId];
      if (res && res.pts > 0) {
        count++;
      }
    }
    raceParticipantsMap[r.raceId] = count > 0 ? count : totalComps;
  }

  const compList = [];
  for (const [cId, comp] of Object.entries(comps)) {
    const cScores = [];
    const penalties = [];

    for (const r of sailedRaces) {
      const res = scores[cId] && scores[cId][r.raceId];
      if (res && !isNaN(res.pts)) {
        const rf = raceParticipantsMap[r.raceId] || totalComps;
        cScores.push({
          raceRank: r.rank,
          raceId: r.raceId,
          pts: res.pts,
          cod: res.cod || '',
          raceFleet: rf,
          relPts: (res.pts / rf) * 100
        });
        if (res.cod && ['DSQ', 'DNE', 'DGM', 'BFD', 'UFD'].includes(res.cod)) {
          penalties.push({ raceRank: r.rank, cod: res.cod });
        }
      }
    }

    if (cScores.length === 0) continue;

    // Sort ascending by points
    const sorted = [...cScores].sort((a, b) => a.pts - b.pts);
    const bestRaces = sorted.slice(0, targetRaces);
    const sumBest = bestRaces.reduce((acc, x) => acc + x.pts, 0);
    const avgBest = sumBest / bestRaces.length;
    const relAvgTotal = (avgBest / totalComps) * 100;
    
    // Also relative by flight/fleet of each race
    const avgRelByRace = bestRaces.reduce((acc, x) => acc + (x.pts / (x.raceFleet || totalComps)), 0) / bestRaces.length * 100;

    const totalPtsAll = cScores.reduce((acc, x) => acc + x.pts, 0);

    compList.push({
      cId,
      sail: comp.compsailno || '',
      helm: comp.comphelmname || '',
      crew: comp.compcrewname || '',
      club: comp.compclub || '',
      totalRacesCompleted: cScores.length,
      bestRaces,
      sumBest,
      avgBest,
      relAvg: relAvgTotal,
      relAvgFlight: avgRelByRace,
      totalPtsAll,
      penalties,
      fleetSize: totalComps,
      className: seriesTitle,
      fileName
    });
  }

  // Pre-sort by best sum
  compList.sort((a, b) => a.sumBest - b.sumBest || a.avgBest - b.avgBest);

  return {
    ...classData,
    eligible: totalComps >= 10 && sailedRaces.length >= targetRaces,
    topCompetitors: compList.slice(0, topK),
    allProcessedCount: compList.length
  };
}

function runAnalysis(targetRaces = 8) {
  const files = fs.readdirSync(desktopPath)
    .filter(f => f.toLowerCase().endsWith('.blw'))
    .sort();

  console.log(`\n========================================================================`);
  console.log(`ANÁLISIS COPA CHALLENGER "SEMANA DE BUENOS AIRES 2026"`);
  console.log(`Regatas consideradas: ${targetRaces}`);
  console.log(`Archivos .blw encontrados en el Escritorio: ${files.length}`);
  console.log(`========================================================================\n`);

  const results = [];
  const excluded = [];

  for (const file of files) {
    try {
      const fullPath = path.join(desktopPath, file);
      const parsed = parseBLW(fullPath);
      const processed = processClass(parsed, targetRaces);

      if (processed.totalComps < 10) {
        excluded.push({
          file,
          title: processed.seriesTitle,
          reason: `Menos de 10 barcos inscriptos (${processed.totalComps} barcos) [Regla 31.1.b]`
        });
      } else if (processed.sailedRaces.length < targetRaces) {
        excluded.push({
          file,
          title: processed.seriesTitle,
          reason: `Menos de ${targetRaces} regatas completadas (${processed.sailedRaces.length} corridas)`
        });
      } else {
        results.push(processed);
      }
    } catch (e) {
      console.error(`Error procesando ${file}:`, e.message);
    }
  }

  // Print excluded
  if (excluded.length > 0) {
    console.log(`CLASES EXCLUIDAS:`);
    for (const ex of excluded) {
      console.log(` - ${ex.title} (${ex.file}): ${ex.reason}`);
    }
    console.log('');
  }

  // Print leaders table
  console.log(`TABLA DE LÍDERES POR CLASE (Top 1 de cada clase elegible):`);
  console.log(`---------------------------------------------------------------------------------------------------------`);
  console.log(
    `Clase`.padEnd(20) +
    `Líder / Tripulación`.padEnd(32) +
    `Club`.padEnd(14) +
    `Flota`.padStart(6) +
    `Pts (8)`.padStart(10) +
    `Promedio`.padStart(10) +
    `% Flota`.padStart(10)
  );
  console.log(`---------------------------------------------------------------------------------------------------------`);

  const leaders = [];

  for (const res of results) {
    const leader = res.topCompetitors[0];
    if (!leader) continue;
    leaders.push(leader);

    const name = `${leader.helm}${leader.crew ? ' / ' + leader.crew : ''}`.slice(0, 30);
    const club = (leader.club || '').slice(0, 12);
    const cName = (res.seriesTitle || res.fileName).slice(0, 18);

    console.log(
      cName.padEnd(20) +
      name.padEnd(32) +
      club.padEnd(14) +
      String(leader.fleetSize).padStart(6) +
      leader.sumBest.toFixed(1).padStart(10) +
      leader.avgBest.toFixed(3).padStart(10) +
      (leader.relAvg.toFixed(2) + '%').padStart(10)
    );
  }
  console.log(`---------------------------------------------------------------------------------------------------------\n`);

  // Overall winner by lowest score
  leaders.sort((a, b) => a.sumBest - b.sumBest || a.avgBest - b.avgBest);
  const winnerLowestScore = leaders[0];

  // Overall winner by lowest absolute average
  leaders.sort((a, b) => a.avgBest - b.avgBest || a.sumBest - b.sumBest);
  const winnerLowestAvg = leaders[0];

  // Overall winner by lowest relative average (% of fleet)
  leaders.sort((a, b) => a.relAvg - b.relAvg);
  const winnerLowestRelAvg = leaders[0];

  console.log(`========================================================================`);
  console.log(`RESULTADOS FINALES:`);
  console.log(`========================================================================`);
  if (winnerLowestScore) {
    console.log(`1. GANADOR POR MENOR PUNTAJE (Mejores ${targetRaces} regatas):`);
    console.log(`   -> ${winnerLowestScore.helm}${winnerLowestScore.crew ? ' / ' + winnerLowestScore.crew : ''} (${winnerLowestScore.className || winnerLowestScore.fileName})`);
    console.log(`      Puntaje: ${winnerLowestScore.sumBest} puntos`);
    console.log(`      Detalle regatas: ${winnerLowestScore.bestRaces.map(r => `R${r.raceRank}:${r.pts}`).join(', ')}`);
    console.log(`      Club: ${winnerLowestScore.club} | Vela: ${winnerLowestScore.sail}`);
    console.log('');
  }

  if (winnerLowestAvg) {
    console.log(`2. GANADOR POR MEJOR PROMEDIO ABSOLUTO (Puntos / ${targetRaces} regatas):`);
    console.log(`   -> ${winnerLowestAvg.helm}${winnerLowestAvg.crew ? ' / ' + winnerLowestAvg.crew : ''} (${winnerLowestAvg.className || winnerLowestAvg.fileName})`);
    console.log(`      Promedio: ${winnerLowestAvg.avgBest.toFixed(3)} pts/regata`);
    console.log('');
  }

  if (winnerLowestRelAvg) {
    console.log(`3. GANADOR POR MEJOR PROMEDIO RELATIVO (% de la flota):`);
    console.log(`   -> ${winnerLowestRelAvg.helm}${winnerLowestRelAvg.crew ? ' / ' + winnerLowestRelAvg.crew : ''} (${winnerLowestRelAvg.className || winnerLowestRelAvg.fileName})`);
    console.log(`      Eficacia relativa: ${winnerLowestRelAvg.relAvg.toFixed(2)}% de la flota (${winnerLowestRelAvg.fleetSize} barcos)`);
    console.log(`      Puntos: ${winnerLowestRelAvg.sumBest} pts en ${targetRaces} regatas (Promedio: ${winnerLowestRelAvg.avgBest.toFixed(3)} pts/reg)`);
    console.log('');
  }
  console.log(`========================================================================\n`);

  return { results, excluded, leaders, winnerLowestScore, winnerLowestAvg, winnerLowestRelAvg };
}

// CLI handling
const args = process.argv.slice(2);
let targetRaces = 8;
if (args[0] && !isNaN(parseInt(args[0], 10))) {
  targetRaces = parseInt(args[0], 10);
}

runAnalysis(targetRaces);
