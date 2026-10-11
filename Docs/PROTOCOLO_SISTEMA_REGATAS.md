# Protocolo Integral de Análisis, Procesamiento y Carga de Regatas con Sailwave
> **Manual Operativo, Casuística y Base de Conocimiento para Sistemas de IA y Oficiales de Regata**  
> **Eventos de Referencia:** XLV Gran Premio "Luis Alberto Cerrato" (YCO) y Semana de Buenos Aires 2026 (YCA).  
> **Clases de Aplicación:** Optimist Timoneles, Optimist Principiantes, Cadet, Laser/ILCA, 29er, 420 y Clases Monotipo / Fórmula.

---

## 1. Visión General y Arquitectura del Sistema

El objetivo de este sistema es automatizar, auditar y asegurar la integridad técnica de la captura, transcripción, validación e inyección de datos de regatas náuticas en el software **Sailwave**, a partir de fotografías tomadas en el agua de las planillas manuscritas y pizarras de la Comisión de Regatas (CR).

```
                      [Foto de Planilla de Arribos]  +  [Foto de Pizarra de Largada]
                                     │
                                     ▼
                  [Visión Computacional / Transcripción Asistida]
                                     │
                                     ▼
                 [Validación Cruzada con Padrón Oficial]
             (Docs/<Clase>.csv  ◄──►  <Clase>.blw)
             ├── 1. Control de "Wrong Flight" (precedencia obligatoria)
             ├── 2. Resolución de caligrafía ambigua (0/6/8, 1/7, 3/5/8, 4/9)
             ├── 3. Tratamiento de tachaduras, flechas y notas de la CR
             └── 4. Detección de velas no inscriptas / cambios de vela
                                     │
                                     ▼
                 [Generación de Resultados & Penalidades]
             ├── Finishers asignados a puesto correlativo y compID
             ├── Barcos en Pizarra de Pasados ──► UFD / BFD / OCS (N + 1)
             ├── Barcos ausentes en planilla ──► DNC (N + 1)
             └── Avisos de protesta en línea ──► Registro para Jurado (no penalidad)
                                     │
                                     ▼
           [Inyección en Archivo .blw (ANSI Windows-1252)]
             ├── Mapeo dinámico de racerank a raceID interno
             ├── Actualización de racesailed ("1") y serpubincluderaces
             └── Respaldo automático previo en Docs/<Clase>_preR<N>.blw.bak
                                     │
                                     ▼
                [Auditoría: Reporte Markdown en Docs/reportes/]
                                     │
                                     ▼
                [Scoring en Sailwave (F7) & Exportación]
```

---

## 2. Flujo de Transcripción y Procesamiento de Planillas Manuscritas

Las planillas de llegada completadas en la lancha de comisión son propensas a errores humanos debido a las condiciones del agua (viento, movimiento del barco, lluvia, premura, tachaduras). 

### 2.1. Desafíos de Caligrafía y Reglas de Desambiguación
1. **Dígitos Críticos de Confusión Recurrente:**
   * `0` vs `6` vs `8` (ejemplos: `208` vs `268`; `4218` vs `4208`).
   * `1` vs `7` (ejemplos: `214` vs `274`; `4271` vs `4211`).
   * `3` vs `5` vs `8` (ejemplos: `3578` vs `3878`; `4183` vs `4185`).
   * `4` vs `9` (ejemplos: `4093` vs `4193`; `3334` vs `3339`).
   * `3` vs `7` (ejemplo de trazo europeo: `367` vs `767`).
   * **Inversión de Dígitos por Apuro:** (ejemplo real en R5 Flota Amarilla: `3734` anotado en vez de `3743`).

2. **Método de Resolución por Padrón:**
   * **Nunca inventar números ni asumir lecturas sin cruzar con el padrón:** Se consulta la lista de inscriptos en `Docs/<Clase>.csv` y en el archivo `<Clase>.blw`.
   * Si al permutar los dígitos dudosos solo **una** variante existe en la lista oficial de competidores de esa flota, se adopta dicha variante y se deja constancia expresa en el reporte de carga.
   * Si existen múltiples variantes válidas o ninguna coincide, se marca como **alerta crítica** para revisión del Oficial de Regatas.

---

### 2.2. Regla Fundamental: Barcos Mezclados entre Otra Flota ("Wrong Flight") vs. Desambiguación Caligráfica

> [!CRITICAL]
> **ORDEN DE EVALUACIÓN Y TRANSFERENCIA OBLIGATORIA A SU FLOTA OFICIAL:**
> Cuando un número anotado en la planilla no pertenece a la flota que se está procesando:
> 1. **SIEMPRE verificar primero si coincide exactamente con un barco inscripto en otra flota ("Wrong Flight") ANTES de intentar permutar o desambiguar dígitos.**
> 2. **NO ASIGNAR DNC:** Si un barco tiene un prefijo de color (`AM`, `AZ`, `RO`) frente a su número, **significa que el competidor largó y completó su regata válidamente, pero llegó rezagado y cruzó la línea mezclado entre los arribos de la flota que largó después.**
> 3. **ACCIÓN CORRECTA:** 
>    * En la planilla de la flota ajena (donde fue anotado): **NO se le otorga puesto**; las posiciones subsiguientes avanzan 1 lugar correlativamente.
>    * En su flota oficial (a la que verdaderamente pertenece): **SE REGISTRA COMO ARRIBO VÁLIDO (FINISHER)**, ubicándose al final del listado de llegadas de su propia flota (siguiendo el orden correlativo de arribo). De este modo se evita perjudicarlo injustamente con un `DNC` cuando en realidad completó el recorrido.

#### Casuística y Riesgo Técnico Evitado:
* **En la Regata 5 (Flota Azul, Fila 12):** La CR anotó `AM 3335` (Guillermina Di Cristófano, Flota Amarilla). Cruzó legítimamente mientras la lancha de llegada asentaba a la Flota Azul. En Flota Azul no recibe puesto (las posiciones avanzan), y en Flota Amarilla se registra como finisher en el puesto 70°.
* **En la Regata 6 (Flota Roja, Fila 6):** El anotador registró `AZ 3334` (Amador Victorel, Flota Azul). 
  * *Riesgo evitado:* Si el sistema intentara primero permutar dígitos (`3334` $\rightarrow$ `3339`, que pertenece a Roja), mutaría erróneamente el barco a `3339`. Cuando la verdadera vela `3339` arribó más tarde en la fila 65, se generaba una duplicación de competidor corrupta en Sailwave.
  * *Resolución correcta:* Al verificar primero el padrón general y el prefijo `AZ`, se detecta que `3334` es de Flota Azul. En Flota Roja no recibe puesto, y en su Flota Azul oficial se le asigna su puesto legítimo de finisher (puesto 66° de Azul), evitando un DNC erróneo.

#### Prefijos Típicos de Flota Utilizados por la Comisión de Regata:
* `AZ` o `AZU`: Flota Azul.
* `AM` o `AMA`: Flota Amarilla.
* `RO` o `ROJ`: Flota Roja.
* `BL` o `BLA`: Flota Blanca / Verde / etc.

---

### 2.3. Barcos no Encontrados (Velas Fantasma o Cambios de Vela)
* Si un número anotado en la planilla no figura bajo ninguna combinación en la lista de inscriptos:
  1. No se frena la carga del resto de los barcos válidos.
  2. Se verifica si hubo cambios de vela solicitados previamente (ejemplos reales: cambio de vela `2972` por `3930` de Simona Blanco; en Principiantes R5 Flota Azul anotado `049 / 3140` de Manuel Fernandez con vela/casco prestado).
  3. Si no hay registro previo, se emite una alerta destacada en el reporte para que la Comisión de Regatas o el Jurado verifiquen si se trató de una vela prestada no informada o un error del anotador.

---

### 2.4. Protocolo Estricto para Planillas y Pizarras de Pasados (Penalidades UFD / BFD / OCS)

A diferencia de las planillas de llegada (donde se busca identificar qué barco cruzó la línea para no perjudicar a un competidor legítimo), las planillas y pizarras de **pasados / penalidades** siguen una política de **estricta certeza**:

1. **Prohibición de Desambiguar Números Inexistentes en Pasados:**
   * **Regla:** Si un número anotado en la planilla o pizarra de pasados no existe en el padrón oficial de la flota que largó, **NUNCA se debe intentar desambiguar, permutar dígitos ni forzar coincidencias con barcos inscriptos**.
   * **Acción:** **SE DEBE IGNORAR POR COMPLETO** el registro anotado (no se le asigna UFD, BFD ni ninguna otra penalidad a ningún barco).
   * **Fundamento náutico:** La duda beneficia siempre al competidor. Intentar "adivinar" un número mal tomado por la lancha de largada puede descalificar injustamente a un timonel inocente que largó correctamente. Un número inexistente en la planilla de pasados es casi siempre un error de toma de la Comisión de Regatas o un barco ajeno navegando en la zona.
   *(Casos de referencia: en Timoneles R1 se anotó `4012` en pasados; en Principiantes R5 Flota Amarilla se anotó `3422`; bajo este protocolo ambos se ignoran por completo).*

2. **Barcos de Otras Flotas en Listados de Pasados:**
   * Si en la planilla de pasados de una flota (ej. Flota Amarilla) figura anotado un barco perteneciente a otra flota (ej. Flota Azul):
     * **NO se lo anota como pasado en la flota donde apareció anotado.**
     * En su propia flota, conserva el resultado legítimo que haya obtenido al correr con su grupo oficial (suele tratarse de una anotación errónea de la CR o de un competidor navegando en la zona de espera/largada ajena).

3. **Competidores en Pizarra de Pasados sin Arribo Físico (Retirados / DNF tras la largada):**
   * Si un barco figura en la pizarra oficial de partida como `UFD`, `BFD` u `OCS`, pero **no figura en la planilla de llegadas** (por ejemplo, abandonó la cancha tras ver su número en la lancha visora):
   * **Acción Obligatoria:** Debe recibir el código de penalidad de partida (`UFD` / `BFD` / `OCS`) con puntaje $N+1$, **NO** código `DNC`. El código de partida describe con precisión la infracción reglamentaria cometida.

4. **Auditoría e Integridad de Archivos de Pizarras:**
   * Al recibir fotos de pizarras (ej. `PASADOS_R<N>_<CLASE>.jpg`):
     1. Verificar el encabezado manuscrito de la pizarra: número de regata (`R 5`, `R 6`), fecha y color de flota.
     2. Comparar hashes de archivo (SHA-256) para descartar subidas duplicadas por error del operador.
     3. Verificar coherencia cruzada: constatar que las velas listadas en la pizarra hayan estado en el agua en esa regata específica.

---

### 2.5. Tratamiento de Avisos de Protesta en la Línea de Llegada (RRV 61.1)

En clases monotipo (especialmente Optimist, Cadet y dinghies juveniles), la Regla 61.1(a) de la World Sailing exige que un competidor que intenta protestar informe a la Comisión de Regatas en la lancha de llegada inmediatamente después de finalizar.

* **Uso del Renglón Extra / Columna Marginal por la CR:** Los oficiales de regata a menudo disponen de un renglón extra o columna marginal (a veces rotulada "PASADOS" o "PROTESTAS").
  * **Si la anotación contiene la palabra "protesta" o nexos de litigio** (ej. `4169 protesta a 4356`, `4175 a 3995`, `4240 c/ 4197`, `4175 vs 3995`): **NO ES UN PASADO**. Es una declaración formal de intención de protesta bajo la Regla 61.1.
  * **Si la anotación contiene exclusivamente números de vela o siglas como UFD/BFD/OCS**: entonces **SÍ corresponde a penalidades de partida**.
* **Criterio Operativo para Protestas:**
  * Un aviso de protesta **NO constituye una penalidad de partida ni de llegada**.
  * **NO se altera el puesto obtenido en el agua** ni se asigna código de penalidad (ambos competidores mantienen sus puestos de arribo legítimos).
  * Se transcribe textualmente en el Reporte de Auditoría (`Docs/reportes/`) para conocimiento del Oficial de Día, entrenadores y el Jurado / Tribunal de Protestas.
  * Solo si posteriormente se realiza una audiencia de protesta y se emite un fallo oficial, se modificará el resultado (DSQ, DNE, RDG, etc.) mediante reapertura reglamentaria.

---

### 2.6. Tratamiento de Tachaduras, Anotaciones Prematuras y Flechas de Salto

En el movimiento de la lancha de llegada ocurren anotaciones apresuradas que la CR corrige visualmente:
1. **Flechas de desplazamiento correlativo:** (Ejemplo R5 Amarilla Fila 49 $\rightarrow$ Fila 74):
   * La vela tachada en la fila original no recibe puesto en esa posición.
   * La vela asume la posición de arribo físico donde apunta la flecha de la CR.
   * Los arribos intermedios avanzan correlativamente.
2. **Anotaciones prematuras tachadas con asterisco (`*`):**
   * Si un número fue anotado y tachado con un asterisco o trazo grueso (ejemplo: `4169` en Fila 51), se desestima ese renglón si la vela arriba legalmente más adelante (Fila 59).
3. **Notas de la CR sobre barcos omitidos:** (Ejemplo R4 Roja: *"Blanco entre 28 y 29 -> 4134"*):
   * Se inserta el competidor en el puesto indicado y todos los barcos posteriores se desplazan obligatoriamente en $+1$.

---

## 3. Mecánica Interna y Estructura del Archivo `.blw` (Sailwave)

Los archivos `.blw` de Sailwave son archivos de texto plano estructurados en tuplas clave-valor separadas por comas.

### 3.1. Requisito Crítico de Codificación
* **Codificación estricta:** `Windows-1252 (ANSI)`.
* **Prohibido terminantemente:** Guardar como `UTF-8` o `UTF-8 con BOM`. Sailwave es un software Win32 legado que no interpreta UTF-8 de forma nativa para caracteres latinos (`ñ`, tildes, símbolos `°`, `º`). Guardar en UTF-8 destruye los nombres de timoneles y clubes en la interfaz.

---

### 3.2. Mapeo Dinámico de Identificadores: `racerank` vs `raceID`

> [!WARNING]
> En Sailwave, el número ordinal de una regata no siempre coincide con su identificador interno de base de datos (`raceID`).
> * En series simples: la Regata 1 suele ser ID `"1"`, la Regata 2 ID `"2"`, etc.
> * En campeonatos con regatas agregadas posteriormente, flotas divididas o plantillas:
>   * Regata 4 $\rightarrow$ ID `"461"`
>   * Regata 5 $\rightarrow$ ID `"462"`
>   * Regata 6 $\rightarrow$ ID `"463"`
>   * Regata 7 $\rightarrow$ ID `"464"`

**Regla de Código:**  
Nunca hardcodear el `raceID` con el número de regata. Se debe parsear dinámicamente la tupla:
```csv
"racerank","<NroRegata>","","<raceID>"
```
El `<raceID>` extraído es el que debe utilizarse en todas las claves `rpts`, `rpos`, `rrecpos`, `rcod`, `rrestyp` y `rflt`.

---

### 3.3. Estructura de Entidades en `.blw`

#### Cabecera de Regata (`raceID` único):
```csv
"racerank","<NroRegata>","","<raceID>"
"racesailed","1","","<raceID>"
"racestart","||Place|Start 1|||0||0|0||||1","","<raceID>"
```

#### Actualización de Visibilidad Pública (`serpubincluderaces`):
Sailwave controla cuántas regatas se publican y muestran en la tabla general mediante:
```csv
"serpubincluderaces","<NroMaxRegatas>","",""
"serpubincluderaces2","<NroMaxRegatas>","",""
```
Al inyectar una nueva regata (ej. R6), este valor debe incrementarse para que Sailwave la incluya automáticamente al abrir el archivo.

#### Registro de Finisher Estándar:
```csv
"rpts","<pos>","<compID>","<raceID>"
"rpos","<rpos_calculado>","<compID>","<raceID>"
"rdisc","0","<compID>","<raceID>"
"rrecpos","<arribo_fisico>","<compID>","<raceID>"
"rrestyp","1","<compID>","<raceID>"
"srat","0","<compID>","<raceID>"
"rrset","0","<compID>","<raceID>"
```
* `rrestyp = 1`: Llegada estándar por puesto.
* `rpos`: Puesto ponderado en la serie (en flotas divididas de 3 flotas, suele calcularse como $1 + 3 \times (\text{pts} - 1)$ para ordenamiento preliminar).
* `rrecpos`: Arribo físico real registrado en la planilla manuscrita (mantener en formato numérico para total compatibilidad con el motor Win32/VB6 de Sailwave).
* `rpts`: Puntos otorgados en su flota (1, 2, 3...).

#### Registro de Penalidad o Barco Ausente (ej. UFD / BFD / DNC):
```csv
"rcod","<CODIGO>","<compID>","<raceID>"
"rpts","<N + 1>","<compID>","<raceID>"
"rpos","<penaltyRpos>","<compID>","<raceID>"
"rdisc","0","<compID>","<raceID>"
"rrecpos","<arribo_fisico_o_vacio>","<compID>","<raceID>"
"rrestyp","3","<compID>","<raceID>"
"srat","0","<compID>","<raceID>"
"rrset","<0_si_cruzo_1_si_no_cruzo>","<compID>","<raceID>"
```
* `rrestyp = 3`: Código con puntuación calculada según regla de puntuación ($N+1$).
* `rrset = 0`: Si el barco cruzó la línea pero fue penalizado (conserva `rrecpos` para trazabilidad).
* `rrset = 1`: Si el barco no largó o no cruzó la línea (DNC, o UFD no arribado).

---

### 3.4. Regla de Desplazamiento Obligatorio (+1) en Ajustes Retrospectivos
Cuando se regulariza un barco, se aprueba una reapertura de protesta o se resuelve un cambio de vela que ingresa a un puesto intermedio de una regata previamente computada (ejemplo: incorporar a Simona Blanco en el puesto 14 de una regata ya corrida):
* **Comportamiento de Sailwave:** Sailwave no admite colisiones de puestos duplicados dentro de la misma flota. Si dos barcos comparten el mismo puesto en la misma serie sin ser empate oficial, arroja error de consistencia.
* **Acción Obligatoria:** Se deben desplazar exactamente en $+1$ los valores de `rpos`, `rrecpos` y `rpts` de **TODOS los barcos que hayan arribado por detrás de él** en esa misma regata/flota.

---

## 4. Reasignación de Flotas en Campeonatos de Varios Días (Qualifying Series / Día 2)

En eventos de gran envergadura (como la Semana de Buenos Aires), las flotas divididas no son estáticas:
* **Día 1 (Clasificación preliminar):** Las flotas se sortean o asignan por ranking previo.
* **Día 2 (Reordenamiento de Flotas):** Al finalizar el Día 1 (ej. tras R4), Sailwave o la CR recalcula las posiciones acumuladas y **redistribuye a los timoneles en nuevas flotas** (ej. sistema en "serpiente" o tercios).
* **Impacto Operativo:**
  * El campo `compflight` en el archivo `.blw` cambia para el Día 2.
  * **Requisito Obligatorio:** Antes de procesar regatas del Día 2 (R5, R6...), el sistema debe asegurarse de que el archivo `.blw` maestro tenga aplicadas las flotas reasignadas (o cargar la plantilla oficial del día, ej. `SBA26_TIMO_dia2.blw` / `Flotas/TIMO_1110.pdf`).
  * Nunca procesar el Día 2 con los flights del Día 1.

---

## 5. Sistema de Auditoría y Reportes Post-Carga (`Docs/reportes/`)

Cada vez que se procesa una planilla, se genera inmediatamente un archivo Markdown estructurado (`Docs/reportes/<Clase>_R<N>_report.md`). Esto garantiza la trazabilidad ante protestas, dudas de entrenadores o pedidos de la CR.

### Esquema Obligatorio del Reporte:
1. **Encabezado:** Clase, Número de Regata, Fecha/Hora, Imágenes fuente analizadas y Archivo `.blw` modificado.
2. **Sección de Novedades y Discrepancias:**
   * Resoluciones particulares de planilla (tachaduras, flechas, notas).
   * Desambiguaciones caligráficas justificadas unívocamente por padrón.
   * Detección de corredores fuera de flota (*Wrong Flight*).
   * Pizarras de pasados aplicadas (`UFD`, `BFD`, `OCS`).
   * Avisos formales de protesta en el agua (para el Jurado).
3. **Resumen Estadístico por Flota:**
   * Tabla comparativa: `Flota | Total Padrón | Finishers | Penalidades | Ausentes (DNC) | Puntos Penalidad`.
4. **Tabla de Orden de Llegada Cargada por Flota:**
   * Columnas: `Puesto | N° Vela | Timonel | Club | País | compID | Tipo/Código | Arribo Físico | Puntos`.
5. **Verificación de Integridad Técnica:**
   * Archivo modificado, codificación ANSI, copia de respaldo `.bak` creada y estado de consistencia (100% de inscriptos auditados).
6. **Instrucciones para el Operador de Sailwave:**
   * Apertura en Sailwave $\rightarrow$ `Score Series` (`F7`) $\rightarrow$ Exportación de resultados oficiales.

---

## 6. Guía Rápida y Checklist para Futuros Campeonatos

Cuando se asigne un nuevo campeonato o clase (ej. Principiantes, Cadet, Laser, ILCA, etc.):

```markdown
[ ] 1. RECEPCIÓN & PADRÓN
    - Verificar existencia del archivo de competidores (Docs/<Clase>.csv o padrón en <Clase>.blw).
    - Verificar si corre en flota única o flotas divididas (compflight).
    - Si es un día subsiguiente, confirmar si hubo reasignación de flotas.

[ ] 2. AUDITORÍA DE IMÁGENES
    - Contar que se tengan las fotos de todas las flotas que largaron.
    - Inspeccionar fotos de Pizarras de Pasados:
      * Verificar que el número de regata coincida con la planilla.
      * Verificar hash para descartar fotos duplicadas o erróneas.

[ ] 3. PROCESAMIENTO & VALIDACIÓN
    - Transcribir llegadas.
    - APLICAR REGLA DE PRECEDENCIA:
      * ¿El barco pertenece a otra flota? -> "Wrong Flight" (descartar puesto local, registrar como arribo válido/finisher al final de su propia flota oficial).
      * ¿No pertenece a otra flota? -> Desambiguar caligrafía con padrón local.
    - Pizarras de Pasados:
      * Barco en flota que largó -> aplicar penalidad (UFD/BFD/OCS) aunque no figure en llegadas.
      * Barco no existe en esa flota -> IGNORAR por estricto protocolo.
    - Avisos de protesta en línea (RRV 61.1) -> registrar como nota para Jurado, NO como penalidad.

[ ] 4. RESPALDO E INYECCIÓN EN SAILWAVE (.blw)
    - Crear copia Docs/<Clase>_preR<N>.blw.bak.
    - Mapear dinámicamente "racerank" -> raceID interno.
    - Actualizar "racesailed" a "1" y "serpubincluderaces" al número de regata.
    - Escribir en codificación estricta ANSI Windows-1252.

[ ] 5. REPORTE Y SCORE
    - Generar Docs/reportes/<Clase>_R<N>_report.md con el 100% de timoneles auditados.
    - Abrir en Sailwave y presionar F7 (Score Series).
```
