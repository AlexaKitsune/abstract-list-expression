# ALE-5B.1 — Tokens y comparación con TOON

Ejecución: 2026-10-27. Resultados reproducibles completos (incluye texto emitido, métricas por caso y observaciones crudas de rendimiento): [`benchmarks/ale-5b1/results.json`](../benchmarks/ale-5b1/results.json).

## Resumen ejecutivo

- Corpus: los mismos 13 valores de ALE-5B, sin alterarlos, más 9 casos deterministas en un módulo separado. Total: 22 casos.
- Equivalencia: **154/154 serializaciones** (22 por cada uno de los siete formatos/configuraciones) se parsearon y compararon estructuralmente. No hubo incompatibilidades.
- Estabilidad canónica ALE: **88/88** comprobaciones, sin diferencias textuales.
- Sobre los 22 casos, total de JSON compacto: 94,955 bytes / 32,626 tokens `o200k_base`. TOON: 49,164 bytes / 22,844 tokens (-48.2% bytes / -30.0% tokens); ALE predeterminado: 54,040 / 25,320 (-43.1% / -22.4%). js-yaml: 106,286 / 42,191 (+11.9% / +29.3%).
- En los 13 casos originales por separado, ALE predeterminado quedó +36.8% en bytes y +41.1% en tokens frente a JSON. TOON fue -14.0% en bytes, pero +4.3% en tokens.
- Las tres tablas homogéneas muestran la ventaja tabular con escala: a 1,000 filas, TOON usa 17,815 tokens (-33.5%) y ALE 19,812 (-26.1%) frente a 26,806 de JSON.
- Las ventajas no son universales. Objetos heterogéneos, Unicode largo, anidamiento y números extremos muestran más bytes o tokens en ALE/TOON según el caso. ALE expande números extremos a decimales extensos.

No se modificaron el parser/serializador ALE, el README ni la gramática. Las dependencias se agregaron solamente a `devDependencies` con versiones exactas; la versión del paquete sigue en 0.0.2.

## Versiones, dependencias y entorno

| Componente | Versión | Uso |
|---|---:|---|
| Node.js | v24.21.0 | Mismo runtime para JSON, js-yaml, TOON y ALE |
| `@toon-format/toon` | 4.4.0 | Implementación oficial JavaScript de TOON, `encode`/`decode` |
| `js-yaml` | 5.5.0 | `dump`/`load` en Node.js |
| `js-tiktoken` | 1.0.21 | Port JavaScript verificable de tiktoken |
| Encoding | `o200k_base` | Conteo de tokens sobre el documento serializado completo |
| ALE | 0.0.2 | Código local, sin modificación en esta fase |

Plataforma: macOS 26.5.1, arm64. Las versiones se fijaron exactamente en `package.json` y `package-lock.json`, como dependencias de desarrollo. No forman parte de los requisitos de ejecución publicados para ALE. `js-tiktoken` declara ser un port JavaScript puro de tiktoken y publica el rank `o200k_base`; es verificable, aunque no es el paquete Python oficial de OpenAI. [Paquete TOON](https://www.npmjs.com/package/%40toon-format/toon), [paquete js-yaml](https://www.npmjs.com/package/js-yaml), [paquete js-tiktoken](https://www.npmjs.com/package/js-tiktoken), [tiktoken original de OpenAI](https://github.com/openai/tiktoken).

## Método

Para cada caso y cada formato se serializa el mismo valor, se parsea el documento y se compara con `node:util.isDeepStrictEqual`. Solo una serialización equivalente es comparable contra JSON en la fila. Los deltas son:

- `deltaBytes = bytes formato - bytes JSON compacto`.
- `% delta = delta / JSON compacto × 100`.
- Lo mismo para tokens.

Bytes se cuentan como UTF-8 (`Buffer.byteLength`); se guardan también puntos Unicode y unidades UTF-16. `o200k_base` codifica el texto completo del documento serializado, incluyendo sintaxis, indentación y saltos de línea. No se estima tokens a partir de bytes/caracteres. El tiempo de tokenización queda fuera de serialización, parseo y round-trip.

Rendimiento: tres pasadas de warm-up, 21 muestras y 8 iteraciones por muestra. Cada iteración recorre los mismos 22 casos. Se reportan mediana y P95 (nearest-rank) de las muestras; las observaciones sin resumir están en JSON. Todos los formatos se miden dentro de Node 24 en la misma máquina. El cronómetro envuelve solo las funciones de serializar, parsear o ambas; construcción del corpus, equivalencia y tokenización quedan fuera. La muestra mide este corpus concreto, no ofrece una afirmación de velocidad universal.

JSON compacto usa `JSON.stringify`/`JSON.parse` nativos; YAML usa `js-yaml`; TOON usa el paquete oficial; ALE usa `stringifyALE`/`parseALE`. Las opciones ALE incluyen predeterminado, `useTables:false`, `useSpread:false` y `booleanShortcuts:false`.

## Corpus

El corpus base es `benchmarks/ale-5b/corpus.json`; se reutilizó byte por byte y sus valores no se modificaron. Los casos nuevos se crean determinísticamente en `benchmarks/ale-5b1/extended-corpus.js`. El campo de origen y el tamaño JSON UTF-8 de cada valor aparecen en `results.json`.

| Caso adicional | Procedencia | JSON fuente, bytes |
|---|---|---:|
| 10 filas homogéneas | Generación secuencial determinista, 8 grupos, flags y puntuaciones modulares | 763 |
| 100 filas homogéneas | Mismo generador con 100 filas | 7,610 |
| 1,000 filas homogéneas | Mismo generador con 1,000 filas | 76,940 |
| Objetos heterogéneos | Fixture fijo de propiedades dispares, nested object, array y escalar | 175 |
| Anidamiento extendido | Cadena de 12 niveles, generada determinísticamente | 149 |
| Conversación extendida | 40 turnos alternados, con texto Unicode periódico | 3,043 |
| Respuesta API extendida | 50 elementos con paginación, cabeceras y metadatos | 2,687 |
| Unicode extendido | 32 strings que rotan latín, CJK, cirílico, árabe y emoji | 1,891 |
| Números ordinarios/extremos | Fixture fijo con enteros, fracciones, exponentes y extremos finitos IEEE-754 | 130 |

## Equivalencia y estabilidad

Las 154 combinaciones tuvieron `equivalent: true`; no hubo errores de parseo ni pérdidas. Esto incluye los tres tamaños tabulares, arrays de objetos con campos no uniformes, strings especiales, Unicode y extremos numéricos.

La estabilidad `stringifyALE(parseALE(stringifyALE(value, options)), options) === stringifyALE(value, options)` se comprobó para los 22 casos en cuatro configuraciones ALE (88 ejecuciones), sin contraejemplos.

El corpus numérico benchmark no contiene `-0`: el corpus está definido como valores JSON y `JSON.stringify(-0)` lo normaliza a `0`. La preservación ALE de `-0` ya se prueba en la suite existente; no se usa como una comparación interformato falsa.

## Tamaño y tokens agregados

Suma de los 22 documentos, todos equivalentes:

| Formato | Bytes UTF-8 | Δ bytes vs JSON | Tokens `o200k_base` | Δ tokens vs JSON |
|---|---:|---:|---:|---:|
| JSON compacto | 94,955 | referencia | 32,626 | referencia |
| JSON con indentación de 2 espacios | No incluido en nueva matriz | — | — | — |
| js-yaml 5.5.0 | 106,286 | +11.9% | 42,191 | +29.3% |
| TOON 4.4.0 | 49,164 | -48.2% | 22,844 | -30.0% |
| ALE predeterminado | 54,040 | -43.1% | 25,320 | -22.4% |
| ALE `useTables:false` | 127,592 | +34.4% | 41,589 | +27.5% |
| ALE `useSpread:false` | 54,040 | -43.1% | 25,320 | -22.4% |
| ALE `booleanShortcuts:false` | 54,058 | -43.1% | 25,324 | -22.4% |

El total está dominado por las tablas de 100 y 1,000 filas. Para evitar que el corpus ampliado oculte el perfil de ALE-5B, la tabla siguiente separa los 13 originales y los 9 añadidos:

| Subcorpus | Formato | Bytes | Tokens | Δ bytes | Δ tokens |
|---|---|---:|---:|---:|---:|
| 13 originales | JSON compacto | 1,567 | 516 | ref. | ref. |
| 13 originales | js-yaml | 1,587 | 611 | +1.3% | +18.4% |
| 13 originales | TOON | 1,348 | 538 | -14.0% | +4.3% |
| 13 originales | ALE predeterminado | 2,144 | 728 | +36.8% | +41.1% |
| 9 añadidos | JSON compacto | 93,388 | 32,110 | ref. | ref. |
| 9 añadidos | js-yaml | 104,699 | 41,580 | +12.1% | +29.5% |
| 9 añadidos | TOON | 47,816 | 22,306 | -48.8% | -30.5% |
| 9 añadidos | ALE predeterminado | 51,896 | 24,592 | -44.4% | -23.4% |

## Resultados por categoría

Cada celda indica el delta porcentual de **bytes / tokens** frente al JSON compacto del mismo caso. El valor base JSON está en bytes / tokens. Todas las filas fueron semánticamente equivalentes.

| Caso | JSON B/T | js-yaml Δ B/T | TOON Δ B/T | ALE predeterminado Δ B/T |
|---|---:|---:|---:|---:|
| Objeto pequeño | 35 / 13 | -17.1% / +0.0% | -20.0% / -7.7% | -31.4% / -15.4% |
| Array escalar | 35 / 11 | +14.3% / +72.7% | -8.6% / +9.1% | -11.4% / +27.3% |
| Registros homogéneos | 124 / 41 | +4.0% / +29.3% | -46.0% / -19.5% | -37.1% / -24.4% |
| Registros heterogéneos | 91 / 32 | +16.5% / +40.6% | +13.2% / +43.8% | +46.2% / +34.4% |
| Filas con null | 148 / 44 | +6.1% / +22.7% | -42.6% / -36.4% | -45.9% / -31.8% |
| Anidamiento (base) | 84 / 29 | +38.1% / +3.4% | +6.0% / +10.3% | +148.8% / +13.8% |
| Configuración | 127 / 36 | -2.4% / +25.0% | -7.1% / +16.7% | -3.9% / +11.1% |
| Eventos | 143 / 52 | -7.0% / +17.3% | +8.4% / +26.9% | +9.1% / +23.1% |
| Conversación base | 141 / 41 | -1.4% / +9.8% | -36.2% / -19.5% | -31.2% / -22.0% |
| Respuesta API base | 172 / 56 | +1.7% / +17.9% | -11.0% / +7.1% | -8.1% / -1.8% |
| Unicode base | 117 / 35 | -4.3% / +22.9% | -16.2% / +2.9% | -14.5% / +0.0% |
| Strings especiales | 226 / 72 | -8.0% / +6.9% | -4.9% / +9.7% | -5.8% / +8.3% |
| Extremos numéricos base | 124 / 54 | -4.0% / +11.1% | -7.3% / +9.3% | +499.2% / +385.2% |
| Tabla homogénea, 10 | 763 / 273 | +11.3% / +28.2% | -50.2% / -30.0% | -46.0% / -23.4% |
| Tabla homogénea, 100 | 7,610 / 2,685 | +11.8% / +29.7% | -53.5% / -33.2% | -49.2% / -25.8% |
| Tabla homogénea, 1,000 | 76,940 / 26,806 | +11.7% / +29.8% | -53.3% / -33.5% | -48.9% / -26.1% |
| Heterogéneos extendidos | 175 / 52 | +18.3% / +30.8% | +9.7% / +28.8% | +37.1% / +21.2% |
| Anidamiento extendido | 149 / 47 | +77.9% / +10.6% | +77.2% / +8.5% | +181.9% / +8.5% |
| Conversación, 40 turnos | 3,043 / 719 | +2.5% / +17.1% | -24.5% / -21.7% | -20.7% / -16.4% |
| Respuesta API, 50 elementos | 2,687 / 913 | +35.2% / +36.0% | +17.6% / +32.1% | -33.5% / -21.1% |
| Unicode, 32 strings | 1,891 / 548 | +6.6% / +17.2% | -0.1% / +0.2% | +27.2% / +41.1% |
| Números extendidos | 130 / 67 | +30.8% / +47.8% | -1.5% / +6.0% | +706.9% / +455.2% |

El desglose completo, incluyendo los deltas absolutos y las cuatro opciones ALE, está en `results.json`.

## Rendimiento en Node.js

Milisegundos por muestra, procesando 22 casos × 8 iteraciones. Se informa mediana / P95; en 21 muestras P95 es la segunda observación más alta con nearest-rank.

| Formato | Serializar | Parsear | Round-trip |
|---|---:|---:|---:|
| JSON compacto | 2.69 / 2.87 | 4.08 / 4.17 | 6.80 / 6.88 |
| js-yaml 5.5.0 | 73.99 / 77.83 | 40.50 / 47.20 | 114.23 / 114.90 |
| TOON 4.4.0 | 18.52 / 19.23 | 85.08 / 87.98 | 104.12 / 107.07 |
| ALE predeterminado | 16.13 / 22.04 | 28.54 / 34.20 | 43.51 / 45.12 |
| ALE `useTables:false` | 12.56 / 13.21 | 47.07 / 143.30 | 62.61 / 95.07 |
| ALE `useSpread:false` | 14.61 / 16.43 | 32.96 / 47.82 | 53.61 / 197.93 |
| ALE `booleanShortcuts:false` | 14.62 / 14.93 | 28.26 / 28.76 | 42.85 / 44.81 |

JSON nativo fue el más rápido en este runtime/muestra. TOON serializó con más rapidez que js-yaml pero parseó mucho más despacio; ALE predeterminado quedó entre ambos. P95 alto en algunas opciones ALE muestra variabilidad de colas y debe repetirse antes de decisiones de rendimiento. No se incluye el tokenizador en estos tiempos.

## Ventajas, costos y simulación numérica

- **Tablas homogéneas:** TOON y ALE amortizan nombres de columnas; ambas opciones reducen bytes y tokens frente a JSON desde 10 filas, con más ventaja en 100 y 1,000. TOON fue más compacto que ALE para estos fixtures.
- **Objetos heterogéneos y anidamiento:** las cabeceras y la indentación no se amortizan igual; en los casos extendidos ambos formatos tabulares suben frente a JSON. ALE muestra más bytes por su sintaxis explícita de bloques, mientras tokens suben menos que bytes en anidamiento.
- **Strings Unicode:** TOON conserva tokens cercanos a JSON en el fixture largo (549 vs 548). ALE escapa/representa más estructura y sube a 773 tokens. Los escapes de strings especiales producen sobrecarga moderada de tokens en ambos.
- **Números extremos:** ALE actual expande `Number.MAX_VALUE` y `Number.MIN_VALUE` en cadenas decimales largas: en el caso extendido, 1,049 bytes/372 tokens frente a 130/67 de JSON. TOON usa 128/71.

Simulación aislada: una secuencia hipotética compacta con los mismos números y sus formas cortas `Number.toString()` ocupa 135 bytes/77 tokens; el objeto JSON del fixture ocupa 130/67 y ALE actual 1,049/372. El texto hipotético **no es salida de `stringifyALE`, no se clasifica como documento ALE válido ni entra a la equivalencia/rendimiento oficial**. Es solo una cota indicativa de cuánto puede contribuir la expansión decimal; no propone cambiar la gramática.

## Referencia histórica de Psych

ALE-5B midió Ruby/Psych 3.1.0 (Ruby 2.6.10) sobre los 13 documentos originales: 1,529 bytes agregados. Sus tiempos medidos dentro de Ruby fueron 54.64/55.03 ms serializar, 44.30/54.87 ms parsear y 103.25/104.55 ms round-trip por muestra. Se conservan en [`docs/ale-5b-benchmarks.md`](./ale-5b-benchmarks.md), pero **no se combinan** con los nuevos resultados de `js-yaml`, que corren en Node con las mismas condiciones que ALE, TOON y JSON.

## Reproducción

```sh
npm test
node benchmarks/ale-5b1/run.js
git diff --check
```

El benchmark usa 8 iteraciones por muestra, 21 muestras y 3 warm-ups. Para ajustar tiempos sin alterar los casos:

```sh
ALE_BENCH_ITERATIONS=12 ALE_BENCH_SAMPLES=25 ALE_BENCH_WARMUPS=3 node benchmarks/ale-5b1/run.js
```

La ejecución regenera `benchmarks/ale-5b1/results.json`, con fecha, versiones, origen y tamaño del corpus, texto de cada serialización, equivalencia, bytes, tokens, deltas, estabilidad canónica y muestras crudas de rendimiento.

## Limitaciones y siguientes optimizaciones

El corpus es determinista pero sintético; no sustituye datos de producción anonimizados. Los conteos corresponden específicamente a `o200k_base`, no a todos los tokenizadores/modelos. Los tiempos son de una máquina y una versión concreta de Node. La simulación numérica no prueba una implementación.

Para ALE-5C: probar corpora de producción anonimizados; medir varios tamaños y formas de strings; perfilar el parser ALE para tablas grandes; y evaluar, en una fase autorizada, una representación numérica exponencial canónica que reduzca los 372 tokens del fixture numérico sin degradar reversibilidad. Mantener separados los resultados de tokens y bytes, pues no siempre se mueven en la misma dirección.
