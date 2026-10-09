# Protocolo Integral de Análisis, Procesamiento y Carga de Regatas con Sailwave
> **Manual Operativo y Base de Conocimiento para Sistemas de IA y Oficiales de Regata**  
> **Evento de Referencia:** XLV Gran Premio Internacional de Vela "Luis Alberto Cerrato" - Yacht Club Olivos.

---

## 1. Visión General y Arquitectura del Sistema

El objetivo de este sistema es automatizar, auditar y asegurar la integridad de la captura, procesamiento, validación e inyección de datos de regatas náuticas en el software **Sailwave**, a partir de fotografías tomadas en el agua de las planillas manuscritas de la Comisión de Regatas (CR).

```
                      [Foto de Planilla de Llegadas]
                                    │
                                    ▼
                 [Visión Computacional / Transcripción Asistida]
                                    │
                                    ▼
                [Validación Cruzada con Padrón Oficial]
            (Docs/<Clase>.csv  ◄──►  <Clase>.blw)
            ├── Resolución de caligrafía ambigua (0/6/8, 1/7, 3/5/8)
            ├── Control de flota/color asignado (Flight check)
            └── Detección de velas no inscriptas / cambios de vela
                                    │
                                    ▼
                [Generación de Resultados & Penalidades]
            ├── Finisher asignado a puesto y compID
            ├── Barcos ausentes en planilla ──► DNC (N + 1)
            └── Penalidades de planilla (OCS, DNF, UFD, BFD, RET)
                                    │
                                    ▼
          [Inyección en Archivo .blw (ANSI Windows-1252)]
            ├── Regla de desplazamiento de puestos (+1)
            └── Creación/actualización de raceID y racerank
                                    │
                                    ▼
               [Auditoría: Reporte Markdown en Docs/reportes/]
                                    │
                                    ▼
               [Scoring en Sailwave (F7) & Exportación]
```

---

## 2. Flujo de Transcripción y Procesamiento de Planillas Manuscritas

Las planillas de llegada completadas en la lancha de comisión son propensas a errores humanos debido a las condiciones del agua (viento, movimiento del barco, premura, tachaduras). 

### 2.1. Desafíos de Caligrafía y Reglas de Desambiguación
1. **Dígitos Críticos de Confusión:**
   * `0` vs `6` vs `8` (ejemplo recurrente: vela `208` vs `268`).
   * `1` vs `7` (ejemplo: `214` vs `274`).
   * `3` vs `5` vs `8` (ejemplo: `3578` vs `3878`).
   * `4` vs `9` (ejemplo: `4093` vs `4193` vs `4893`).
2. **Método de Resolución por Padrón:**
   * **Nunca inventar números ni asumir lecturas sin cruzar con el padrón:** Se consulta la lista de inscriptos en `Docs/<Clase>.csv` y en el archivo `<Clase>.blw`.
   * Si al permutar los dígitos dudosos solo **una** variante existe en la lista oficial de competidores, se adopta dicha variante y se deja constancia en el reporte de carga.
   * Si existen múltiples variantes válidas o ninguna coincide, se marca como **alerta crítica** para revisión del Oficial de Regatas.

### 2.2. Barcos no Encontrados (Velas Fantasma o Cambios de Vela)
* Si un número anotado en la planilla no figura bajo ninguna combinación en la lista de inscriptos:
  1. No se frena la carga del resto de los barcos válidos.
  2. Se verifica si hubo cambios de vela solicitados previamente (ejemplo real: cambio de vela `2972` por `3930` de Simona Blanco).
  3. Si no hay registro previo, se emite una alerta destacada en el reporte para que la Comisión de Regatas o el Jurado verifiquen si se trató de una vela prestada no informada o un error del anotador.

### 2.3. Flotas Divididas (Flights / Colores) y Regla de "Wrong Flight"
En clases masivas con flotas divididas (ej. Optimist Timoneles y Principiantes divididos en Flota Amarilla y Flota Azul):
* **Control de Asignación:** Cada competidor tiene una flota asignada para el día (`compflight` en el archivo `.blw`).
* **Regla de Corredor Fuera de Flota:**
  * Si un competidor asignado a la Flota Amarilla cruza y es anotado en la planilla de llegada de la Flota Azul (o viceversa):
    * **NO se le asigna puesto en la llegada de esa flota ajena.**
    * En su flota oficial, al no haber largado/llegado con su grupo, queda sin arribo (o con código `DNC`).
    * Se documenta la novedad en el reporte indicando: *"Vela XXXX corrió fuera de flota (cruzó en Flota Azul perteneciendo a Amarilla) - Sin puesto otorgado"*.

### 2.4. Protocolo Estricto para Planillas y Pizarras de Pasados (Penalidades UFD / BFD / OCS)
A diferencia de las planillas de llegada (donde se busca identificar qué barco cruzó la línea para no perjudicar a un competidor legítimo), las planillas y pizarras de **pasados / penalidades** siguen una política de **estricta certeza**:

1. **Prohibición de Desambiguar Números Inexistentes en Pasados:**
   * **Regla:** Si un número anotado en la planilla o pizarra de pasados no existe en el padrón oficial de la flota que largó, **NUNCA se debe intentar desambiguar, permutar dígitos ni forzar coincidencias con barcos inscriptos**.
   * **Acción:** **SE DEBE IGNORAR POR COMPLETO** el registro anotado (no se le asigna UFD, BFD ni ninguna otra penalidad a ningún barco).
   * **Fundamento náutico:** La duda beneficia siempre al competidor. Intentar "adivinar" un número mal tomado por la lancha de largada puede descalificar injustamente a un timonel inocente que largó correctamente. Un número inexistente en la planilla de pasados es casi siempre un error de toma de la Comisión de Regatas o un barco ajeno navegando en la zona.
   *(Caso de referencia: en Timoneles R1 se anotó `4012` en pasados; bajo este protocolo no debe desambiguarse a `4102`).*

2. **Barcos de Otras Flotas en Listados de Pasados:**
   * Si en la planilla de pasados de una flota (ej. Flota Amarilla) figura anotado un barco perteneciente a otra flota (ej. Flota Azul):
     * **NO se lo anota como pasado en la flota donde apareció anotado.**
     * En su propia flota, conserva el resultado legítimo que haya obtenido al correr con su grupo oficial (suele tratarse de una anotación errónea de la CR o de un competidor navegando en la zona de espera/largada ajena).

---

## 3. Mecánica Interna y Estructura del Archivo `.blw` (Sailwave)

Los archivos `.blw` de Sailwave son archivos de texto plano estructurados en formato CSV de tuplas clave-valor.

### 3.1. Requisito Crítico de Codificación
* **Codificación estricta:** `Windows-1252 (ANSI)`.
* **Prohibido:** Guardar como `UTF-8` o `UTF-8 con BOM`. Sailwave no admite UTF-8 nativo para caracteres latinos (`ñ`, tildes, símbolos de grado `°`). Si se guarda en UTF-8, Sailwave corromperá los nombres y caracteres especiales.

### 3.2. Estructura de Entidades en `.blw`

#### Cabecera de Regata (`raceID` único):
```csv
"racerank","<NroRegata>","","<raceID>"
"racesailed","1","","<raceID>"
"racestart","||Place|Start 1|||0||0|0||||1","","<raceID>"
```

#### Registro de Finisher Estándar:
```csv
"rpts","<pos>","<compID>","<raceID>"
"rpos","<pos>","<compID>","<raceID>"
"rdisc","0","<compID>","<raceID>"
"rrecpos","<pos>","<compID>","<raceID>"
"rrestyp","1","<compID>","<raceID>"
"srat","0","<compID>","<raceID>"
"rrset","0","<compID>","<raceID>"
```
* `rrestyp = 1`: Llegada estándar por puesto.
* `rpos` / `rrecpos`: Puesto obtenido en la regata (o en su flota/flight).
* `rpts`: Puntos asignados (en sistema estándar, igual al puesto).

#### Registro de Penalidad o Barco Ausente (ej. DNC):
Todos los competidores inscriptos en el `.blw` que no figuren en la planilla de llegada deben recibir automáticamente el código `DNC` (o el código anotado al margen: `DNF`, `OCS`, `UFD`, `BFD`, `RET`):
```csv
"rcod","DNC","<compID>","<raceID>"
"rpts","<TotalInscriptos + 1>","<compID>","<raceID>"
"rpos","<TotalInscriptos>","<compID>","<raceID>"
"rdisc","0","<compID>","<raceID>"
"rrestyp","3","<compID>","<raceID>"
"srat","0","<compID>","<raceID>"
"rrset","1","<compID>","<raceID>"
```
* `rrestyp = 3`: Código con puntuación calculada según regla de puntuación (`DNC` = $N+1$).
* `rrestyp = 2`: Penalidad porcentual o código con puntaje fijo.

### 3.3. Regla de Desplazamiento Obligatorio (+1) en Ajustes Retrospectivos
Cuando se regulariza un barco, se aprueba una reapertura de protesta o se resuelve un cambio de vela que ingresa a un puesto intermedio de una regata previamente computada (ejemplo: incorporar a Simona Blanco en el puesto 14 de una regata ya corrida):
* **Comportamiento de Sailwave:** Sailwave no resuelve colisiones de puestos duplicados dentro de la misma flota. Si dos barcos comparten el mismo puesto en la misma serie sin ser empate oficial, arroja error de consistencia.
* **Acción Obligatoria:** Se deben desplazar exactamente en $+1$ los valores de `rpos`, `rrecpos` y `rpts` de **TODOS los barcos que hayan arribado por detrás de él** en esa misma regata/flota.

---

## 4. Sistema de Auditoría y Reportes Post-Carga (`Docs/reportes/`)

Cada vez que se procesa una planilla, se genera inmediatamente un archivo Markdown estructurado (`Docs/reportes/<Clase>_R<N>_report.md`). Esto garantiza la trazabilidad ante protestas, dudas de entrenadores o pedidos de la CR.

### Esquema Obligatorio del Reporte:
1. **Encabezado:** Clase, Número de Regata, Fecha/Hora, Imagen fuente y Archivo `.blw` modificado.
2. **Sección de Novedades y Discrepancias:**
   * Lecturas caligráficas dudosas y justificación del criterio adoptado.
   * Barcos no inscriptos detectados en el agua.
   * Barcos que corrieron fuera de flota asignada.
   * Cambios de vela regularizados.
   * Códigos especiales aplicados (`OCS`, `DNF`, `UFD`, etc.).
3. **Tabla de Orden de Llegada Cargada:**
   * Columnas: `Puesto | N° Vela | Timonel / Barco | Flota | compID | Tipo/Código | Puntos`.
4. **Instrucciones para el Operador de Sailwave:**
   * Abrir archivo en Sailwave $\rightarrow$ `Score Series` (`F7`) $\rightarrow$ Exportar resultados.

---

## 5. Guía Rápida de Operación para una IA en Futuros Eventos

Cuando se asigne una nueva regata o evento para procesar:

1. **Recepción:**
   * Solicitar o recibir la imagen de la planilla de llegada, la Clase y el N° de Regata.
2. **Cruce de Datos:**
   * Identificar la clase en `Docs/<Clase>.csv` y abrir/leer `<Clase>.blw`.
   * Verificar asignación de flotas/colores si la clase corre dividida.
3. **Transcripción y Resolución:**
   * Transcribir números de llegada. En caso de dudas caligráficas en llegadas, cruzar contra el universo de inscriptos.
   * **Planillas de Pasados (UFD / BFD / OCS):** Si un número anotado como pasado no existe en el padrón de la flota, **IGNORARLO DIRECTAMENTE** (prohibido desambiguar o forzar coincidencias en penalidades). Si figura un barco de otra flota, desestimarlo.
   * Reportar cualquier número no registrado antes de inventar o alterar datos.
4. **Inyección en `.blw`:**
   * Asignar `raceID` nuevo (o usar el existente si es reapertura).
   * Cargar posiciones a finishers (`rpos`, `rpts`, `rrecpos`, `rrestyp=1`).
   * Asignar `DNC` a todos los inscriptos ausentes (`rrestyp=3`, `rcod="DNC"`, puntos $N+1$).
   * Asignar penalidades marginales (`DNF`, `OCS`, `UFD`, `BFD`, etc.).
   * Si se inserta un barco retrospectivamente, aplicar la regla de desplazamiento $+1$ a todos los posteriores.
   * **Guardar siempre en codificación ANSI Windows-1252.**
5. **Reporte:**
   * Generar `Docs/reportes/<Clase>_R<N>_report.md` con las novedades y el orden cargado.
6. **Cómputo en Sailwave:**
   * Abrir el archivo `.blw` en Sailwave.
   * Presionar `F7` (*Score Series*) para actualizar la serie y exportar resultados en HTML/PDF.
