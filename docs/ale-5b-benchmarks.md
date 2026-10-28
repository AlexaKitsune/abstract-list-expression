# ALE-5B — Benchmark reproducible frente a JSON, YAML y TOON

Fecha de ejecución: 2026-10-27. Los resultados completos por documento y formato están en [`benchmarks/ale-5b/results.json`](../benchmarks/ale-5b/results.json); el corpus y los scripts están en el mismo directorio.

## Resumen

- Corpus: 13 valores representativos en 13 categorías; todos los documentos fueron parseados y comparados estructuralmente antes de agregarse.
- Equivalencia: 91 de 91 serializaciones en JSON compacto, JSON indentado, YAML/Psych y cuatro configuraciones ALE conservaron el valor. No se detectaron pérdidas en esta muestra.
- Tamaño total: ALE predeterminado ocupó 2,144 bytes frente a 1,567 de JSON compacto (+36.8%). YAML/Psych ocupó 1,529 bytes (-2.4%). Los porcentajes usan la suma del corpus, no una extrapolación.
- La representación ALE predeterminada fue menor que JSON compacto en 8 de 13 casos y mayor en los otros 5. El caso numérico extremo hace crecer ALE notablemente porque el serializador expande exponentes a decimales largos.
- Estabilidad canónica: 52 de 52 pares valor/opción fueron estables.
- Tokens reales y TOON: no medidos. No había un tokenizador ni una implementación TOON instalada; no se sustituyen por estimaciones de caracteres.

Este corpus es una muestra deliberadamente mixta, no un benchmark representativo de todas las aplicaciones. Sus tamaños absolutos y relativos no demuestran que un formato sea universalmente más compacto.

## Método y entorno

Se generaron los documentos a partir de un único corpus JSON versionado. Para cada documento se midió tamaño y se parseó el resultado; una medición se considera semánticamente equivalente solo si coincide estructuralmente con el valor fuente (`isDeepStrictEqual`, orden de arrays preservado). Los 91 casos de las tablas de tamaño pasan este control. Si un caso fallara, se registraría en `results.json` y no se presentaría como una comparación equivalente.

Formatos medidos:

- JSON compacto: `JSON.stringify` y `JSON.parse` nativos de Node.js.
- JSON legible: `JSON.stringify(value, null, 2)`; tamaño solamente.
- YAML: Ruby Psych 3.1.0, integrado en Ruby 2.6.10; `YAML.dump` y `YAML.safe_load` sin clases permitidas ni aliases.
- ALE: implementación local sin cambios, con valores predeterminados y las opciones `useTables: false`, `useSpread: false` y `booleanShortcuts: false`.

Entorno: macOS 26.5.1, arquitectura arm64, Node.js v24.21.0, npm 11.19.0, Ruby 2.6.10p210 y Psych 3.1.0. El sistema no permitió leer el identificador exacto del modelo de hardware. No se instalaron paquetes.

Para rendimiento se hicieron 3 pasadas de calentamiento y 9 muestras; cada muestra procesa los 13 casos 40 veces. Se mide serialización, parseo y round-trip por separado. Se informa mediana y percentil 95 de las muestras (rango pequeño: P95 es el máximo de 9 observaciones). El cronómetro comienza después de crear el corpus y los documentos de entrada para parseo. Psych mide internamente en Ruby, excluyendo el arranque del proceso trabajador; Node mide en V8. Los tiempos absolutos se publican, pero la diferencia de runtimes e implementaciones impide atribuir la brecha únicamente al formato y hace que la comparación de velocidad sea orientativa, no una comparación controlada del mismo runtime.

## Auditoría de herramientas y versiones

En el entorno local, el proyecto no tiene dependencias instaladas para YAML, TOON ni tokenización. JSON se mide con las funciones nativas de Node.js y ALE con `ale.js`. Ruby/Psych permitió ejecutar YAML sin cambiar el paquete. No está instalado PyYAML.

La auditoría de versiones disponibles públicamente (no utilizadas en estas mediciones) encontró:

- `js-yaml` 5.5.0 en el repositorio oficial consultado; es una opción de parser/serializador YAML 1.2 para Node, pero no se instaló.
- `@toon-format/toon` 4.4.0 como versión `latest` mostrada por npm al auditar. La especificación oficial consultada se identifica como TOON 4.4, borrador de trabajo. La implementación oficial TypeScript/JavaScript existe, pero no se instaló y por ello no hay resultados TOON reproducibles en este entorno.
- El repositorio oficial de OpenAI describe `tiktoken` y el mapeo a encodings por modelo; su metadata consultada muestra la versión 0.14.0 y el README ofrece `o200k_base` como encoding. Ni `tiktoken` ni otro tokenizer real estaban disponibles localmente; no se midieron tokens. Una repetición futura debe fijar expresamente paquete, versión y encoding/modelo, y contar los documentos UTF-8 exactos.

Fuentes: [`js-yaml` oficial y su metadata](https://github.com/nodeca/js-yaml/blob/master/package.json), [paquete TOON en npm](https://www.npmjs.com/package/%40toon-format/toon), [especificación oficial TOON](https://github.com/toon-format/spec), [`tiktoken` oficial](https://github.com/openai/tiktoken).

## Corpus

El archivo `benchmarks/ale-5b/corpus.json` contiene 13 valores: objeto pequeño, array escalar, registros homogéneos y heterogéneos, filas con null, anidamiento, configuración, eventos, conversación, respuesta API, Unicode, strings con delimitadores/control y extremos numéricos.

Incluye formas favorables a tablas (registros homogéneos) y desfavorables (objetos de propiedades distintas, valores profundamente anidados, delimitadores, y números como `Number.MAX_VALUE`/`Number.MIN_VALUE`). El campo denominado `negativeZero` contiene `0` positivo porque el corpus se transporta como JSON y este benchmark requiere que el puente JSON/YAML preserve la semántica. `-0` sí está cubierto por pruebas existentes de ALE, pero `JSON.stringify(-0)` produce `0`; se excluyó deliberadamente de la comparación interformato en vez de presentar una falsa equivalencia.

## Tamaño total

Los bytes son UTF-8. “Puntos Unicode” cuenta puntos de código; “UTF-16” cuenta unidades de código JavaScript. Los formatos se midieron sobre los mismos 13 valores equivalentes.

| Formato | Bytes UTF-8 | Puntos Unicode | Unidades UTF-16 | Bytes vs JSON compacto |
|---|---:|---:|---:|---:|
| JSON compacto | 1,567 | 1,536 | 1,538 | referencia |
| JSON con indentación de 2 espacios | 2,549 | 2,518 | 2,520 | +62.7% |
| YAML/Psych | 1,529 | 1,504 | 1,504 | -2.4% |
| ALE predeterminado | 2,144 | 2,111 | 2,113 | +36.8% |
| ALE `useTables: false` | 2,477 | 2,444 | 2,446 | +58.1% |
| ALE `useSpread: false` | 2,144 | 2,111 | 2,113 | +36.8% |
| ALE `booleanShortcuts: false` | 2,158 | 2,127 | 2,129 | +37.7% |

Por categoría, bytes UTF-8 (columnas ALE adicionales son configuraciones pedidas):

| Caso | JSON compacto | YAML/Psych | ALE predeterminado | ALE sin tablas | ALE sin spread | ALE sin flags bool |
|---|---:|---:|---:|---:|---:|---:|
| Objeto pequeño | 35 | 33 | 24 | 24 | 24 | 28 |
| Array de escalares | 35 | 40 | 31 | 31 | 31 | 31 |
| Registros homogéneos | 124 | 115 | 78 | 174 | 78 | 78 |
| Registros heterogéneos | 91 | 88 | 133 | 133 | 133 | 133 |
| Filas con null | 148 | 127 | 80 | 190 | 80 | 80 |
| Anidamiento profundo | 84 | 104 | 209 | 209 | 209 | 209 |
| Configuración | 127 | 124 | 122 | 122 | 122 | 128 |
| Eventos | 143 | 137 | 156 | 156 | 156 | 156 |
| Conversación | 141 | 131 | 97 | 170 | 97 | 97 |
| Respuesta API | 172 | 167 | 158 | 212 | 158 | 162 |
| Unicode | 117 | 124 | 100 | 100 | 100 | 100 |
| Strings especiales | 226 | 212 | 213 | 213 | 213 | 213 |
| Extremos numéricos | 124 | 127 | 743 | 743 | 743 | 743 |

La ventaja de ALE aparece principalmente en objetos pequeños, arrays simples y registros con estructura compartida. En este corpus la representación predeterminada pierde frente a JSON compacto en arrays/objetos heterogéneos, eventos, anidamiento profundo y extremos numéricos. Para extremos, ALE escribe `Number.MAX_VALUE` y `Number.MIN_VALUE` como largas expansiones decimales; los valores se recuperan, pero la notación no es compacta.

## Rendimiento

Tiempos en milisegundos por muestra completa (13 documentos × 40 iteraciones), mediana / P95:

| Formato | Serializar | Parsear | Round-trip |
|---|---:|---:|---:|
| JSON compacto, Node/V8 | 0.312 / 0.570 | 0.587 / 0.654 | 0.918 / 1.088 |
| ALE predeterminado, Node/V8 | 2.054 / 3.946 | 4.731 / 7.576 | 6.690 / 7.690 |
| ALE sin tablas, Node/V8 | 1.444 / 2.079 | 4.530 / 5.429 | 5.849 / 6.387 |
| ALE sin spread, Node/V8 | 1.472 / 2.721 | 3.954 / 4.003 | 6.088 / 7.199 |
| ALE sin boolean shortcuts, Node/V8 | 1.573 / 1.904 | 4.082 / 4.254 | 5.889 / 6.115 |
| YAML/Psych, Ruby | 54.635 / 55.030 | 44.298 / 54.871 | 103.250 / 104.546 |

JSON/ALE comparten Node/V8 y la misma medición. En estas muestras JSON compacto tardó menos que ALE en los tres tramos. Los tiempos Ruby/Psych no son comparables directamente con V8 por cambio de runtime y puente de datos; se incluyen como medición local reproducible, no como clasificación del costo intrínseco de YAML frente a ALE.

## Estabilidad canónica

Se verificó `stringifyALE(parseALE(stringifyALE(value, options)), options) === stringifyALE(value, options)` para los 13 casos y cuatro opciones: 52 comprobaciones, 0 contraejemplos. También pasaron las 13 comparaciones estructurales originales para cada opción ALE. JSON, JSON pretty y YAML/Psych preservaron igualmente los 13 valores.

## TOON y tokens pendientes

No hay números de tamaño, rendimiento ni equivalencia de TOON: faltó la biblioteca local y no se instaló. Tampoco hay conteos de tokens. Estos apartados no se estiman con caracteres, bytes ni reglas aproximadas. TOON está diseñado para codificar el modelo de datos JSON, con una forma tabular para arrays uniformes, pero sus resultados deben medirse con una versión fija de la implementación de referencia y superar el mismo control estructural antes de compararlos.

## Repetición

Desde la raíz del proyecto, usando las mismas versiones de runtime disponibles:

```sh
node benchmarks/ale-5b/run.js
npm test
git diff --check
```

El benchmark usa valores predeterminados de 40 iteraciones por muestra, 9 muestras y 3 pasadas de warm-up. Para variar repeticiones sin tocar los scripts:

```sh
ALE_BENCH_ITERATIONS=100 ALE_BENCH_SAMPLES=15 node benchmarks/ale-5b/run.js
```

El comando genera `benchmarks/ale-5b/results.json` con fecha, entorno, mediciones por caso, errores de equivalencia y contraejemplos de estabilidad. Para comparar futuras ejecuciones, fijar el mismo corpus, versiones de runtime, máquina y número de iteraciones; repetir varias veces y conservar cada `results.json` externo al informe histórico.

## Limitaciones y siguiente paso

Es un corpus pequeño y diseñado manualmente; no incorpora cargas reales de producción ni una medición de tokens, y el benchmark YAML usa un runtime distinto. La medición de 9 muestras sirve como referencia inicial, no como evidencia estadística de rendimiento universal.

Para ALE-5C, se recomienda fijar una matriz de casos basada también en fixtures externos anonimizados, ejecutar TOON 4.4.0 y `js-yaml` o Psych bajo versiones exactas, instalar un tokenizer real fijando modelo/encoding, ampliar muestras y repeticiones, y guardar resultados por corrida. Antes de presentar un reclamo de eficiencia de tokens, comparar los mismos textos equivalentes con un tokenizer de la familia de modelos objetivo.
