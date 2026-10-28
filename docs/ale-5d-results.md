# ALE-5D — resultados de optimización

## Resumen

Se compactaron las comas estructurales, se corrigió la emisión de Unicode quoted y se redujo trabajo repetido al comprobar arrays tabulares. No cambió el parser, la gramática, la API pública, la versión ni el README.

Las 69 pruebas pasan. Cuatro semillas generaron 40,000 valores JSON en total y completaron 280,000 round-trips entre siete opciones sin fallos; la campaña de profundidad completó 3,612 round-trips. La salida predeterminada pasó de 54,040 bytes / 25,320 tokens al inicio a 49,134 bytes / 23,500 tokens. TOON registra 22,844 tokens en el mismo corpus, por lo que ALE aún queda 656 tokens por encima en total.

## Cambios

- `ale.js`: los separadores estructurales generados ahora se unen sin espacio posterior a la coma. Esto afecta cabeceras, filas, arrays inline, continuaciones y listas equivalentes. No se recortó contenido de strings ni se cambió la elección de tablas.
- `ale.js`: `escapeString()` emite literalmente pares surrogate UTF-16 válidos y conserva los escapes de comillas, barras invertidas y controles. Los surrogates aislados se emiten como `\uXXXX`. Se corrigió `hasUnpairedSurrogate()` para detectar un surrogate alto al final de una cadena; `charCodeAt()` devuelve `NaN` en ese límite.
- `ale.js`: `sameKeySet()` ahora comprueba primero el orden ya coincidente y usa un `Set` si las claves aparecen en distinto orden, en vez de ordenar dos copias. La forma tabular se memoiza en un `WeakMap` local a cada llamada de `stringifyALE()`. Para arrays homogéneos, la unión de columnas reutiliza las columnas del primer objeto, que son las mismas que producía la unión anterior.
- `tests/ale-5d.test.js`: añade cinco pruebas de comas compactas, comas en strings, escapes, arrays/tablas/slots anidados, claves especiales, indentación opcional y Unicode. Se actualizó una aserción textual existente para el nuevo separador compacto; la comprobación estructural estricta sigue activa.
- `tests/ale-4d.test.js`: la expectativa textual de continuación se actualizó de `, ` a `,`, manteniendo la prueba de round-trip.
- `benchmarks/ale-5b1/results.json`: resultados actualizados del benchmark oficial ALE-5B.1 para la implementación final.
- `.gitignore`: permite incluir este informe.

El objeto de caché es interno a cada invocación y no se expone como opción pública. La selección de tablas, el orden de columnas, las claves propias, los valores ausentes y los `null` no cambiaron.

## Pruebas y campañas

| Validación | Resultado |
| --- | ---: |
| `npm test` | 69 aprobadas, 0 fallidas, 0 pendientes |
| ALE-4B, semilla `1243488294` | 10,000 valores × 7 opciones; 70,000 correctos |
| ALE-4B, semilla `1` | 10,000 valores × 7 opciones; 70,000 correctos |
| ALE-4B, semilla `3735928559` | 10,000 valores × 7 opciones; 70,000 correctos |
| ALE-4B, semilla `8675309` | 10,000 valores × 7 opciones; 70,000 correctos |
| ALE-4C, profundidades 4/8/16/32 | 3,612/3,612 round-trips; 0 fallos |
| Fuzzing de robustez | 1,000 entradas; sin excepción interna ni cambio de prototipo |
| Tamaños de recurso | 1 KiB, 10 KiB, 100 KiB y 1 MiB completados |
| Estabilidad canónica ALE-5B.1 | 88/88 comprobaciones; 0 fallos |
| Seguridad de claves | pruebas de claves especiales pasan dentro de la suite |
| Igualdad textual antes/después de optimización interna | 110/110 documentos idénticos |

La campaña de profundidad midió estos tiempos de round-trip generativo por profundidad: 4: 35.35 ms; 8: 22.78 ms; 16: 27.40 ms; 32: 21.87 ms. Son duraciones de una corrida y no estimaciones estadísticas.

## Tamaño y tokens

El benchmark conserva los mismos 22 casos y utiliza `o200k_base`. El conteo incluye el documento serializado completo. El tiempo de tokenización se excluye de las mediciones de rendimiento.

| Formato/opción | Bytes UTF-8 | Tokens |
| --- | ---: | ---: |
| JSON compacto | 94,955 | 32,626 |
| YAML (`js-yaml`) | 106,286 | 42,191 |
| TOON oficial | 49,164 | 22,844 |
| ALE predeterminado final | 49,134 | 23,500 |
| ALE `useTables: false` | 127,304 | 41,404 |
| ALE `useSpread: false` | 49,134 | 23,500 |
| ALE `booleanShortcuts: false` | 49,152 | 23,504 |
| ALE predeterminado con `indent: " "` | 44,616 | 22,312 |

La opción de una indentación de un espacio se midió aparte y no es la salida predeterminada. Fue equivalente en los 22 casos. Frente al inicio de ALE-5D, la salida predeterminada final ahorra 4,906 bytes (9.08%) y 1,820 tokens (7.19%).

### Efecto incremental

| Etapa | Bytes | Tokens | Diferencia frente a etapa anterior |
| --- | ---: | ---: | ---: |
| Línea base previa | 54,040 | 25,320 | — |
| Comas compactas | 49,390 | 23,660 | −4,650 bytes / −1,660 tokens |
| Unicode literal + implementación final | 49,134 | 23,500 | −256 bytes / −160 tokens |

La optimización interna no cambia el texto: se compararon 110 documentos —22 valores en cinco configuraciones— antes y después y todos coincidieron exactamente. Sus cambios de tamaño y tokens son cero.

### Diferencias por categoría

Los mayores resultados favorables a ALE aparecen en las respuestas API: 660 tokens frente a TOON 1,266. En tablas grandes ALE ocupa menos bytes, pero más tokens: 10 filas 194 frente a 191; 100 filas 1,856 frente a 1,793; 1,000 filas 18,477 frente a 17,815. En números ordinarios/extremos ALE usa 363 tokens frente a TOON 71, asociado a la representación decimal expandida actual. El anidamiento profundo también cuesta más bytes en ALE en el corpus: 209 frente a 89 (33 frente a 32 tokens). Conversaciones, objetos heterogéneos y strings Unicode tienen conteos próximos, con ligeras variaciones por caso.

Las cifras agregadas por categoría están en `benchmarks/ale-5b1/results.json`, junto a cada serialización, bytes, tokens, equivalencia y diferencias frente a JSON.

## Rendimiento

Node.js, mismo corpus y benchmark `benchmarks/ale-5b1/run.js`: 3 warm-ups, 21 muestras, 8 iteraciones por muestra. Se informa mediana; la tabla incluye las tres métricas. Los tiempos son milisegundos para recorrer los 22 casos en una muestra.

| Formato/opción final | Serializar mediana / p95 | Parsear mediana / p95 | Round-trip mediana / p95 |
| --- | ---: | ---: | ---: |
| JSON compacto | 4.18 / 4.40 | 5.97 / 6.52 | 10.58 / 11.06 |
| YAML (`js-yaml`) | 122.69 / 461.62 | 63.74 / 68.80 | 183.62 / 224.69 |
| TOON oficial | 46.24 / 324.28 | 154.61 / 218.71 | 175.05 / 235.31 |
| ALE predeterminado | 20.58 / 45.00 | 48.07 / 60.44 | 61.25 / 67.73 |
| ALE `useTables: false` | 19.93 / 22.02 | 72.90 / 79.65 | 94.31 / 117.05 |
| ALE `useSpread: false` | 15.45 / 17.90 | 43.81 / 48.51 | 61.41 / 70.28 |
| ALE `booleanShortcuts: false` | 15.63 / 17.35 | 43.70 / 48.14 | 58.79 / 64.66 |

Los tiempos de ALE tienen dispersión apreciable: por ejemplo, el p95 de serialización predeterminada supera su mediana. Una corrida anterior a la caché interna dio 26.96/44.25/65.57 ms de medianas para serialización/parseo/round-trip, mientras la corrida final dio 20.58/48.07/61.25 ms. Esa variación no demuestra una ganancia estable de CPU; la optimización interna queda respaldada por la reducción de trabajo y la igualdad textual, no por una afirmación estadística de velocidad. La compactación tampoco se presenta como mejora de velocidad.

## Compatibilidad y límites

- Las pruebas de formato compacto pasan en gramática actual y legacy, incluida la salida con `indent: " "`. La indentación predeterminada sigue siendo cuatro espacios.
- No se cambió `parseALE`, el reconocimiento de exponentes ni `numberToALE()`.
- Strings con Unicode válido y controles preservan su valor en la gramática actual. ALE legacy no decodifica necesariamente los escapes `\uXXXX` de surrogates aislados como la gramática actual; el serializador ya producía esos escapes antes de esta fase, por lo que no se atribuye esa limitación al cambio. Los escapes comunes y Unicode literal pasan en ambos modos.
- `benchmarks/ale-5b1/results.json` registra Node y versiones exactas de las bibliotecas y el tokenizador, así como equivalencia y estabilidad.
- El benchmark de formato debe repetirse varias veces antes de usar diferencias de tiempo pequeñas como evidencia de rendimiento.

## Reproducción

```bash
npm test
ALE_SEED=1243488294 ALE_CASES=10000 node --test tests/generative.test.js
ALE_SEED=1 ALE_CASES=10000 node --test tests/generative.test.js
ALE_SEED=3735928559 ALE_CASES=10000 node --test tests/generative.test.js
ALE_SEED=8675309 ALE_CASES=10000 node --test tests/generative.test.js
node tests/robustness-campaign.js
node benchmarks/ale-5b1/run.js
node benchmarks/ale-5c/representation-options.mjs
```

## Recomendaciones para ALE-5E

1. Conservar la compactación de comas y la emisión literal de pares Unicode; ambos cambios pasan round-trip y reducen tamaño/tokens.
2. Mantener la indentación de cuatro espacios por defecto hasta que una nueva decisión de producto apruebe un modo compacto.
3. Repetir perfilado de serialización con un benchmark dedicado y varias ejecuciones antes de priorizar nuevas optimizaciones internas.
4. Evaluar por separado el costo de números extremos y tablas grandes. No cambiar la representación numérica ni la gramática sin una fase de diseño aprobada.
5. Mantener la selección tabular actual hasta contar con corpus más amplio: las tablas grandes favorecen bytes, pero TOON conserva ventaja en tokens en estas tres categorías.
