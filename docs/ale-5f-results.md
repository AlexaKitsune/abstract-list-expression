# ALE-5F — resultados del dialecto experimental next

## Resumen

Se añadió el dialecto optativo `next` para exponentes numéricos. `current` sigue siendo el valor predeterminado y `legacy` conserva su semántica. `parseALE()` y `stringifyALE()` aceptan la misma opción `grammar` para que el llamador seleccione explícitamente el dialecto. La versión sigue en 0.0.2.

La suite pasó con 74 pruebas. El benchmark mantuvo equivalencia en los 22 casos para JSON, YAML, TOON, ALE current y ALE next, incluidos next con indentación de un espacio. Se comprobaron 100,000 números finitos mediante `Object.is`, 70,000 round-trips generativos en next y 3,612 round-trips de profundidad hasta 32, sin fallos.

## Archivos

- `ale.js`: acepta `grammar: "next"` en ambas funciones; añade lectura, quoting y escritura numérica next. No cambia las rutas numéricas actuales ni legacy.
- `tests/ale-5f.test.js`: exponentes, quoting, límites, estructuras anidadas y compatibilidad.
- `tests/specification.test.js` y `docs/specification.md`: conformidad ejecutable y sección del dialecto experimental.
- `benchmarks/ale-5b1/run.js` y `benchmarks/ale-5b1/results.json`: incluye salidas y métricas actuales de next y next con indentación opcional.
- `benchmarks/ale-5f/`: campañas reproducibles y sus resultados numéricos, generativos y de profundidad.
- `.gitignore`: permite incluir este informe.

## API y gramática

```js
const ale = stringifyALE(value, { grammar: "next" });
const valueAgain = parseALE(ale, { grammar: "next" });
```

Las dos opciones aceptan `current`, `legacy` y `next`; el valor predeterminado en ambas sigue siendo `current`. Una opción desconocida produce `TypeError`.

`next` extiende el escalar numérico existente: dígitos con signo opcional, fracción decimal opcional, y exponente opcional `e` o `E` con signo opcional y dígitos obligatorios. Se probaron `1e3`, `1E+3`, `-2.5e-8`, `6.02e23` y `5e-324`. Exponentes incompletos producen `ALEParseError`.

El parser convierte mediante `Number()` de JavaScript, con redondeo IEEE-754. Rechaza overflow no finito y valores matemáticamente no nulos que se redondean a cero. Permite ceros explícitos con exponente, subnormales representables y `-0`. Por ejemplo, `0e-999` es cero, `1e309` se rechaza, y `1e-999` se rechaza por underflow.

Para números, next serializa con `String(number)`, salvo `-0`, que conserva la forma `-0`. Así un documento `1E+3` se vuelve canónicamente `1000`. Los strings que coincidan con la forma exponencial se serializan entre comillas en next. `"1e3"` sigue siendo string, mientras `1e3` es número.

## Compatibilidad y regresiones

| Entrada/operación | current | legacy | next |
| --- | --- | --- | --- |
| Parsear `value: 1e3` | string `"1e3"` | string `"1e3"` | número `1000` |
| Parsear `value: "1e3"` | string | string | string |
| Serializar número `1e-7` | decimal expandido | decimal expandido | `1e-7` |
| Serializar string `"1e3"` | bare, como antes | parser legacy lo conserva como string | quoted |

Pruebas explícitas verifican que current y legacy no cambien la interpretación de `1e3`, que next cite strings exponent-like y que current siga siendo el default. La forma `1e3` bare emitida por current permanece ambigua para quien después elija next: el cambio de dialecto es explícito y los documentos deben parsearse con el dialecto con el que fueron escritos.

## Reversibilidad y estabilidad

| Campaña | Resultado |
| --- | ---: |
| Suite `npm test` | 74 aprobadas, 0 fallidas, 0 pendientes |
| Patrones IEEE-754 finitos en next | 100,000/100,000 exactos con `Object.is` |
| Canonicalización numérica next | 100,000/100,000 estables |
| Valores JSON generados en next | 10,000 valores × 7 opciones = 70,000 correctos |
| Profundidad next 4/8/16/32 | 3,612/3,612 round-trips correctos |
| Corpus ALE-5B.1 equivalencia | 22/22 para cada formato medido |
| Estabilidad canónica next | 22/22; 0 diferencias |

Las muestras IEEE-754 usan semilla `0x5f5f5e2026`, generan patrones raw de 64 bits y continúan hasta 100,000 valores finitos; se incluyeron explícitamente +0, -0, el menor subnormal, el mayor subnormal, el menor normal y ambos extremos finitos. Detalles en `benchmarks/ale-5f/next-numeric-results.json`. Los resultados generativos y de profundidad están en `benchmarks/ale-5f/next-campaign-results.json`.

## Benchmark

Corpus de 22 documentos: los 13 casos originales ALE-5B y 9 fixtures deterministas extendidos de ALE-5B.1/ALE-5C. Entorno: Node `v24.21.0`, `@toon-format/toon` 4.4.0, `js-yaml` 5.5.0, `js-tiktoken` 1.0.21 y `o200k_base`. Rendimiento: 3 warm-ups, 21 muestras, 8 iteraciones por muestra; se informa mediana/p95 en milisegundos por los 22 casos. El tiempo de tokenización queda fuera de tiempos de serialización y parseo.

| Formato | Bytes UTF-8 | Tokens | Serializar mediana/p95 ms | Parsear mediana/p95 ms | Round-trip mediana/p95 ms |
| --- | ---: | ---: | ---: | ---: | ---: |
| JSON compacto | 94,955 | 32,626 | 4.19 / 4.31 | 6.56 / 20.84 | 10.25 / 11.15 |
| YAML `js-yaml` | 106,286 | 42,191 | 113.09 / 116.19 | 60.55 / 62.53 | 175.26 / 195.44 |
| TOON oficial | 49,164 | 22,844 | 28.19 / 29.62 | 130.04 / 136.58 | 157.60 / 163.21 |
| ALE current predeterminado | 49,134 | 23,500 | 15.77 / 18.53 | 42.16 / 44.10 | 60.37 / 64.62 |
| ALE next | 47,592 | 23,002 | 15.26 / 16.41 | 43.97 / 55.07 | 57.78 / 60.78 |
| ALE next, indentación de un espacio | 43,074 | 21,814 | 14.98 / 15.54 | 43.24 / 44.78 | 57.99 / 60.39 |

Los valores de indentación de un espacio son opcionales y no representan la salida predeterminada. Comparado con current, next ahorra 1,542 bytes y 498 tokens en el corpus. Aun así, next usa 158 tokens más que TOON en total; la mejora del caso numérico no garantiza que ALE gane todos los casos ni el agregado de tokens.

Las mediciones de tiempo son una corrida y tienen variación; next mostró parseo y serialización ligeramente más lentos que current en este benchmark. No se afirma una mejora de rendimiento. Se observan cambios en tamaño y tokens que sí son resultados directos del corpus medido.

El detalle de resultados comparables, equivalencia, estabilidad, versiones y métricas por documento está en `benchmarks/ale-5b1/results.json`. El modo next con indentación de un espacio también fue equivalente en 22/22 casos.

## Reproducción

- `npm test`
- `node benchmarks/ale-5f/next-numeric-campaign.mjs`
- `node benchmarks/ale-5f/next-campaign.mjs`
- `node benchmarks/ale-5b1/run.js`
- `git diff --check`

## Recomendación

Mantener next como dialecto optativo experimental. Promoverlo solo después de revisar adopción, mantener fixtures de migración y decidir si la versión futura fija el algoritmo de `String(number)` como contrato de canonicalización. No cambiar el default actual: los exponentes bare de documentos existentes tienen semántica string en current y legacy.
