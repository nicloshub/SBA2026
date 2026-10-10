/**
 * SBA 2026 - Motor Unificado de Procesamiento y Carga de Regatas
 * Cumple estrictamente con Docs/PROTOCOLO_SISTEMA_REGATAS.md
 */

const fs = require('fs');
const path = require('path');

// Permutaciones de dígitos críticos comunes en caligrafía náutica
const DIGIT_CONFUSIONS = [
  ['0', '6'], ['0', '8'], ['6', '8'],
  ['1', '7'], ['1', '8'],
  ['3', '5'], ['3', '8'], ['5', '8'],
  ['4', '9']
];

function generateVariants(sail) {
  const variants = new Set([sail]);
  const chars = sail.split('');

  for (let i = 0; i < chars.length; i++) {
    for (const [d1, d2] of DIGIT_CONFUSIONS) {
      if (chars[i] === d1) {
        const copy = [...chars];
        copy[i] = d2;
        variants.add(copy.join(''));
      } else if (chars[i] === d2) {
        const copy = [...chars];
        copy[i] = d1;
        variants.add(copy.join(''));
      }
    }
  }
  return Array.from(variants);
}

function procesarRegata(config) {
  const {
    clase,            // 'TIMO' | 'PRINCI'
    regata,           // número (ej. 3, 4)
    fecha,            // '10/10/2026'
    imagenes,         // array de rutas
    pasados,          // { [flota]: { code: 'UFD'|'BFD', sails: ['4052', ...] } }
    llegadas,         // { [flota]: [ { sail: '4133', rawPos: 1, note: '' }, ... ] }
    novedadesManuales,// array de strings
    protestasNotes    // { [sail]: 'DNF' | 'RET' | ... }
  } = config;

  console.log(`\n======================================================`);
  console.log(`INICIANDO PROCESAMIENTO: ${clase} - REGATA ${regata}`);
  console.log(`======================================================`);

  const blwFilename = clase === 'TIMO' ? 'SBA26_TIMO.blw' : 'SBA26_PRINCI.blw';
  const blwPath = path.resolve(blwFilename);

  if (!fs.existsSync(blwPath)) {
    throw new Error(`Archivo ${blwFilename} no encontrado.`);
  }

  // 1. Cargar archivo BLW en Windows-1252 (latin1)
  const blwRaw = fs.readFileSync(blwPath, 'latin1');
  const lines = blwRaw.split(/\r?\n/);

  // 2. Extraer padrón de competidores
  const compMap = {};
  lines.forEach(line => {
    const match = line.match(/^"([^"]*)","([^"]*)","([^"]*)","?([^"]*)"?$/);
    if (match) {
      const [_, k, v, c, r] = match;
      if (k.startsWith('comp') && c) {
        if (!compMap[c]) compMap[c] = {};
        compMap[c][k] = v;
      }
    }
  });

  const totalComps = Object.keys(compMap).length;
  console.log(`Padron cargado: ${totalComps} competidores en ${blwFilename}`);

  // Indexar por flota y vela
  const byFlight = {};
  const allSails = {};
  for (const [id, c] of Object.entries(compMap)) {
    const flt = c.compflight || 'Unica';
    const s = c.compsailno ? c.compsailno.trim() : '';
    if (!byFlight[flt]) byFlight[flt] = {};
    byFlight[flt][s] = { id, ...c };
    allSails[s] = { id, ...c };
  }

  // Determinar tamaño de flota para penalidades (N + 1)
  let maxFleetSize = 0;
  for (const [flt, comps] of Object.entries(byFlight)) {
    const size = Object.keys(comps).length;
    if (size > maxFleetSize) maxFleetSize = size;
  }
  const penaltyPoints = maxFleetSize + 1;
  console.log(`Puntos de penalidad calculados (N+1): ${penaltyPoints}`);

  // 3. Procesar llegadas y pasados por cada flota
  const resultadosPorFlota = {};
  const desambiguaciones = [];
  const alertasPasados = [];
  const processedComps = {}; // compID -> resultado

  for (const [flotaNombre, flotaPadron] of Object.entries(byFlight)) {
    const llegadasFlota = (llegadas && llegadas[flotaNombre]) ? llegadas[flotaNombre] : null;

    if (!llegadasFlota) {
      console.log(`Flota ${flotaNombre}: Sin planillas recibidas (permanece pendiente).`);
      for (const [s, c] of Object.entries(flotaPadron)) {
        processedComps[c.id] = {
          compID: c.id, sail: s, name: c.comphelmname, club: c.compclub, nat: c.compnat,
          flight: flotaNombre, rawPos: null, pts: null, type: 'Pendiente', restyp: 0
        };
      }
      resultadosPorFlota[flotaNombre] = { estado: 'Pendiente', total: Object.keys(flotaPadron).length, processed: [] };
      continue;
    }

    // Regla estricta de Pasados (UFD / BFD / OCS)
    const pasadosFlotaInfo = pasados && pasados[flotaNombre] ? pasados[flotaNombre] : { code: 'UFD', sails: [] };
    const pasadosValidos = new Set();
    const pasadosCode = pasadosFlotaInfo.code || 'UFD';

    for (const sailRaw of pasadosFlotaInfo.sails) {
      const s = sailRaw.trim();
      if (flotaPadron[s]) {
        pasadosValidos.add(s);
      } else {
        // Regla estricta del protocolo:
        // Si no existe en la flota, NUNCA intentar desambiguar. Se ignora por completo.
        alertasPasados.push(`Vela ${s} en pasados de ${flotaNombre}: NO EXISTE en flota ${flotaNombre} -> IGNORADA por protocolo.`);
      }
    }

    const processedList = [];
    const enteredSails = new Set();
    let rankInFleet = 1;

    for (let idx = 0; idx < llegadasFlota.length; idx++) {
      const arr = llegadasFlota[idx];
      let s = typeof arr === 'string' ? arr.trim() : arr.sail.trim();
      const rawPos = typeof arr === 'object' && arr.rawPos ? arr.rawPos : idx + 1;
      const note = typeof arr === 'object' && arr.note ? arr.note : '';

      // Verificar si existe en la flota
      let comp = flotaPadron[s];

      if (!comp) {
        // Intentar desambiguar con variantes de dígitos críticos
        const variants = generateVariants(s).filter(v => flotaPadron[v] && !enteredSails.has(v));
        if (variants.length === 1) {
          const resolved = variants[0];
          desambiguaciones.push(`Renglón ${rawPos} Flota ${flotaNombre}: anotado '${s}' desambiguado unívocamente por padrón a '${resolved}' (${flotaPadron[resolved].comphelmname}).`);
          s = resolved;
          comp = flotaPadron[s];
        } else if (allSails[s]) {
          alertasPasados.push(`Renglón ${rawPos} Flota ${flotaNombre}: Vela ${s} pertenece a Flota ${allSails[s].compflight} ('Wrong Flight').`);
          continue; // No se otorga puesto en flota ajena según protocolo
        } else {
          throw new Error(`CRÍTICO: Renglón ${rawPos} Flota ${flotaNombre}: Vela '${s}' no existe en el padrón ni tiene variante unívoca.`);
        }
      }

      enteredSails.add(s);

      // Verificar si tiene penalidad de partida
      if (pasadosValidos.has(s)) {
        processedList.push({
          compID: comp.id, sail: s, name: comp.comphelmname, club: comp.compclub, nat: comp.compnat,
          flight: flotaNombre, rawPos, penalty: pasadosCode, pts: penaltyPoints, type: pasadosCode, restyp: 3
        });
      } else {
        processedList.push({
          compID: comp.id, sail: s, name: comp.comphelmname, club: comp.compclub, nat: comp.compnat,
          flight: flotaNombre, rawPos, pts: rankInFleet, type: 'Finisher', restyp: 1
        });
        rankInFleet++;
      }
    }

    // Identificar ausentes (DNC / DNF si hubo nota, o UFD/BFD si estaba en pasados)
    const missing = Object.entries(flotaPadron).filter(([s, _]) => !enteredSails.has(s));
    for (const [s, comp] of missing) {
      let code = (protestasNotes && protestasNotes[s]) ? protestasNotes[s] : 'DNC';
      if (pasadosValidos.has(s)) {
        code = pasadosCode;
      }
      processedList.push({
        compID: comp.id, sail: s, name: comp.comphelmname, club: comp.compclub, nat: comp.compnat,
        flight: flotaNombre, rawPos: null, penalty: code, pts: penaltyPoints, type: code, restyp: 3
      });
    }

    // Registrar en mapa general
    processedList.forEach(p => { processedComps[p.compID] = p; });

    resultadosPorFlota[flotaNombre] = {
      estado: 'Completada',
      total: Object.keys(flotaPadron).length,
      finishers: rankInFleet - 1,
      penalties: processedList.filter(x => x.restyp === 3 && x.rawPos !== null).length,
      dnc: missing.filter(m => !pasadosValidos.has(m[0])).length,
      processed: processedList
    };

    console.log(`Flota ${flotaNombre}: ${resultadosPorFlota[flotaNombre].total} barcos (${resultadosPorFlota[flotaNombre].finishers} finishers, ${resultadosPorFlota[flotaNombre].penalties} penalidades, ${resultadosPorFlota[flotaNombre].dnc} ausentes).`);
  }

  // 4. Inyección en .blw
  let raceId = String(regata);
  for (const line of lines) {
    const match = line.match(/^"racerank","([^"]*)","","([^"]*)"$/);
    if (match && parseInt(match[1], 10) === regata) {
      raceId = match[2];
      break;
    }
  }
  console.log(`Regata número ${regata} mapeada a ID interno Sailwave: "${raceId}"`);

  const raceStr = raceId;
  const backupFilename = `SBA26_${clase}_preR${regata}.blw.bak`;
  const backupPath = path.join('Docs', backupFilename);
  fs.writeFileSync(backupPath, blwRaw, 'latin1');
  console.log(`Copia de respaldo creada en ${backupPath}`);

  const totalFinishers = Object.values(processedComps).filter(x => x.restyp === 1).length;
  const penaltyRpos = totalFinishers + 1;

  const newLines = [];
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];

    if (line.startsWith('"serpubincluderaces",')) {
      const cur = parseInt(line.split(',')[1].replace(/"/g, ''), 10) || 0;
      if (regata > cur) line = `"serpubincluderaces","${regata}","",""`;
    } else if (line.startsWith('"serpubincluderaces2",')) {
      const cur = parseInt(line.split(',')[1].replace(/"/g, ''), 10) || 0;
      if (regata > cur) line = `"serpubincluderaces2","${regata}","",""`;
    } else if (line === `"racesailed","0","","${raceStr}"`) {
      line = `"racesailed","1","","${raceStr}"`;
    }

    const parts = line.split(',');
    if (parts.length >= 4 && parts[3] === `"${raceStr}"` && parts[2] !== '""') {
      const key = parts[0].replace(/"/g, '');
      const compId = parts[2].replace(/"/g, '');

      if (key === 'rflt') {
        const item = processedComps[compId];
        if (!item) throw new Error(`Comp ${compId} sin datos en R${raceStr}`);

        newLines.push(`"rflt","${item.flight}","${compId}","${raceStr}"`);

        if (item.restyp === 1) {
          const rpos = 1 + 3 * (item.pts - 1);
          newLines.push(`"rpts","${item.pts}","${compId}","${raceStr}"`);
          newLines.push(`"rpos","${rpos}","${compId}","${raceStr}"`);
          newLines.push(`"rdisc","0","${compId}","${raceStr}"`);
          newLines.push(`"rrecpos","${item.rawPos}","${compId}","${raceStr}"`);
          newLines.push(`"rrestyp","1","${compId}","${raceStr}"`);
          newLines.push(`"srat","0","${compId}","${raceStr}"`);
          newLines.push(`"rrset","0","${compId}","${raceStr}"`);
        } else if (item.restyp === 3) {
          newLines.push(`"rcod","${item.type}","${compId}","${raceStr}"`);
          newLines.push(`"rpts","${item.pts}","${compId}","${raceStr}"`);
          newLines.push(`"rpos","${penaltyRpos}","${compId}","${raceStr}"`);
          newLines.push(`"rdisc","0","${compId}","${raceStr}"`);
          if (item.rawPos !== null) {
            newLines.push(`"rrecpos","${item.rawPos}","${compId}","${raceStr}"`);
          }
          newLines.push(`"rrestyp","3","${compId}","${raceStr}"`);
          newLines.push(`"srat","0","${compId}","${raceStr}"`);
          newLines.push(`"rrset","${item.rawPos ? '0' : '1'}","${compId}","${raceStr}"`);
        } else {
          // Pendiente (restyp 0)
          newLines.push(`"rdisc","0","${compId}","${raceStr}"`);
          newLines.push(`"rrestyp","0","${compId}","${raceStr}"`);
          newLines.push(`"srat","0","${compId}","${raceStr}"`);
          newLines.push(`"rrset","0","${compId}","${raceStr}"`);
        }
      }
      continue;
    }

    newLines.push(line);
  }

  fs.writeFileSync(blwPath, newLines.join('\r\n'), 'latin1');
  console.log(`Archivo ${blwFilename} actualizado correctamente (ANSI Windows-1252).`);

  // 5. Generar reporte Markdown
  const reportPath = path.resolve(`Docs/reportes/${clase}_R${regata}_report.md`);
  let md = `# Reporte de Auditoría y Carga de Resultados - Regata ${regata}\n`;
  md += `> **Campeonato:** Semana de Buenos Aires 2026 (SBA 2026)  \n`;
  md += `> **Organizador:** Yacht Club Argentino  \n`;
  md += `> **Clase:** Optimist ${clase === 'TIMO' ? 'Timoneles' : 'Principiantes'}  \n`;
  md += `> **Regata:** ${regata}  \n`;
  md += `> **Fecha de Regata:** ${fecha}  \n`;
  md += `> **Imágenes Fuente:** ${imagenes.join(', ')}  \n`;
  md += `> **Archivo Sailwave:** ${blwFilename}  \n\n---\n\n`;

  md += `## 1. Novedades, Desambiguaciones y Criterios Adoptados\n\n`;
  if (novedadesManuales && novedadesManuales.length > 0) {
    md += `### 1.1. Resoluciones Particulares de Planilla\n`;
    novedadesManuales.forEach(nov => { md += `* ${nov}\n`; });
    md += `\n`;
  }
  if (desambiguaciones.length > 0) {
    md += `### 1.2. Desambiguaciones Caligráficas por Padrón Oficial\n`;
    desambiguaciones.forEach(d => { md += `* ${d}\n`; });
    md += `\n`;
  }
  if (alertasPasados.length > 0) {
    md += `### 1.3. Novedades de Pizarra de Pasados / Flotas Ajenas\n`;
    alertasPasados.forEach(a => { md += `* ${a}\n`; });
    md += `\n`;
  }

  md += `---\n\n## 2. Resumen Estadístico de Flotas - Regata ${regata}\n\n`;
  md += `| Flota | Total Padrón | Finishers (Puestos Válidos) | Penalidades Partida | Ausentes (DNC/DNF) | Puntos Penalidad |\n`;
  md += `|:---|:---:|:---:|:---:|:---:|:---:|\n`;
  for (const [flt, res] of Object.entries(resultadosPorFlota)) {
    md += `| **${flt}** | ${res.total} | ${res.finishers !== undefined ? res.finishers : '-'} | ${res.penalties !== undefined ? res.penalties : '-'} | ${res.dnc !== undefined ? res.dnc : '-'} | ${res.estado === 'Completada' ? penaltyPoints : '-'} |\n`;
  }

  for (const [flt, res] of Object.entries(resultadosPorFlota)) {
    if (res.processed && res.processed.length > 0) {
      md += `\n---\n\n## 3. Detalle de Carga - Flota ${flt} (${res.total} barcos)\n\n`;
      md += `| Puesto | N° Vela | Timonel | Club | País | compID | Tipo/Código | Arribo Físico | Puntos |\n`;
      md += `|:---:|:---:|:---|:---:|:---:|:---:|:---:|:---:|:---:|\n`;

      const sorted = [...res.processed].sort((a, b) => {
        if (a.restyp === 1 && b.restyp === 1) return a.pts - b.pts;
        if (a.restyp === 1) return -1;
        if (b.restyp === 1) return 1;
        if (a.rawPos && b.rawPos) return a.rawPos - b.rawPos;
        if (a.rawPos) return -1;
        if (b.rawPos) return 1;
        return a.sail.localeCompare(b.sail);
      });

      for (const item of sorted) {
        const pto = item.restyp === 1 ? `${item.pts}°` : '-';
        const arr = item.rawPos ? item.rawPos : '-';
        md += `| ${pto} | ${item.sail} | ${item.name} | ${item.club} | ${item.nat} | ${item.compID} | ${item.type} | ${arr} | ${item.pts} |\n`;
      }
    }
  }

  md += `\n---\n\n## 4. Verificación de Integridad Técnica\n`;
  md += `* **Archivo:** ${blwFilename}\n`;
  md += `* **Codificación:** ANSI (Windows-1252), sin BOM UTF-8.\n`;
  md += `* **Copia de Respaldo:** Creada en \`${backupPath}\`.\n`;
  md += `* **Estado de Regata ${regata}:** Marcada como corrida (\`"racesailed","1","","${raceStr}"\`).\n`;
  md += `* **Consistencia:** 100% de competidores con estado definido.\n\n`;

  md += `## 5. Instrucciones para el Operador de Sailwave\n`;
  md += `1. Abrir **Sailwave** y cargar \`${blwFilename}\`.\n`;
  md += `2. Presionar **F7** (*Score Series*) para que el motor de Sailwave calcule y actualice descartes y cómputos generales.\n`;
  md += `3. Exportar resultados oficiales.\n`;

  fs.writeFileSync(reportPath, md, 'utf8');
  console.log(`Reporte generado en ${reportPath}`);
  console.log(`======================================================`);
  console.log(`PROCESAMIENTO FINALIZADO EXITOSAMENTE`);
  console.log(`======================================================\n`);
}

module.exports = { procesarRegata };
