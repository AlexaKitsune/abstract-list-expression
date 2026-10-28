# ALE-5C — Auditoría de eficiencia y diseño de optimizaciones

Fecha: 2026-10-27. Este informe es diagnóstico: no cambia `ale.js`, la gramática, el README ni la versión. Los datos y las mediciones de ALE-5B.1 permanecen en [`benchmarks/ale-5b1/results.json`](../benchmarks/ale-5b1/results.json) y [`docs/ale-5b1-results.md`](./ale-5b1-results.md).

## Resumen ejecutivo

1. **Las tablas homogéneas son el punto fuerte de ambos formatos.** En 1,000 filas, TOON usó 17,815 tokens y ALE 19,812 frente a 26,806 de JSON. TOON aventajó a ALE en 1,997 tokens en el documento actual.
2. **ALE puede acercarse o superar TOON en estructuras de respuesta API** cuando sus arrays de escalares dentro de celdas permiten conservar la tabla, mientras TOON elige una lista de objetos y repite claves.
3. **Dos costos del serializador actual tienen alternativas que el parser ya entiende:** separadores sin espacios después de coma y un nivel de indentación de un espacio. En los 22 casos, cambiar solo `indent` a un espacio se parseó con igualdad estricta y redujo 4,518 bytes/1,188 tokens. Quitar espacios de delimitadores fuera de strings quoted redujo otros 4,650 bytes/1,660 tokens; combinado con indentación de un espacio, el candidato medido queda en 44,872 bytes/22,472 tokens frente a 54,040/25,320. Son representaciones alternativas verificadas con el parser, no salida actual del serializador.
4. **Los números extremos cuestan mucho en ALE.** La expansión decimal actual representa el fixture numérico extendido en 1,049 bytes/372 tokens frente a 130/67 de JSON. En propiedades y arrays, el texto bare `1e3` actualmente es un string tanto en gramática actual como legacy; interpretarlo después como número colisionaría con documentos existentes.
5. **El perfil indica trabajo repetido.** Al parsear las tablas del corpus, `setData` y `parseTableRowsBlock` suman 47% de muestras propias; al serializar destacan `writeObject` (21.6%), `sameKeySet` (19.0%) y `numberToALE` (8.0%). Las proporciones pertenecen a este workload, no a toda entrada ALE.
6. No hay fixtures apropiados de producción. Las muestras utilizadas son deterministas y sintéticas; no se incorporaron datos de otros proyectos.

## Datos, corpus y comparabilidad

Se reutilizó el corpus ALE-5B.1 completo: sus 13 documentos originales más nueve casos deterministas añadidos, incluidas tablas de 10, 100 y 1,000 filas. Son 22 valores y 154 combinaciones formato/configuración. Los 22 resultados pasan `isDeepStrictEqual`; las métricas de tokens son conteos reales de `o200k_base` sobre el texto completo. Los perfiles usan Node v24.21.0, en el mismo entorno local que el benchmark previo.

No se encontraron fixtures reales de producción o registros anonimizados adecuados. El ejemplo documentado del README es una muestra didáctica, no una carga real de datos.

## Comparación estructural con TOON

### Casos tabulares: TOON gana frente a ALE actual

| Filas homogéneas | JSON compacto B/T | TOON B/T | ALE actual B/T | TOON vs ALE en tokens |
|---:|---:|---:|---:|---:|
| 10 | 763 / 273 | 380 / 191 | 412 / 209 | -18 (-8.6%) |
| 100 | 7,610 / 2,685 | 3,538 / 1,793 | 3,869 / 1,991 | -198 (-9.9%) |
| 1,000 | 76,940 / 26,806 | 35,969 / 17,815 | 39,299 / 19,812 | -1,997 (-10.1%) |

En el ejemplo de 10 filas, la cabecera TOON es `records[10]{id,name,group,active,score}:`; ALE produce `records{id, name, group, active, score}:`. Ambos declaran campos una vez. TOON elimina los espacios después de comas y usa 2 espacios de indentación en vez de 4. ALE guarda bools como `!`/`¡`, frente a `false`/`true` en TOON: ALE ahorra bytes en valores booleanos, pero sus tokens `o200k_base` por booleano son los mismos en el fixture. La mayor parte de la diferencia total viene de los separadores y la indentación repetidos.

Descomposición de bytes exacta en la tabla de 1,000 filas. Las partes suman el documento; `cellPayload` contiene los valores de celda, sin separadores:

| Componente | ALE | TOON |
|---|---:|---:|
| Cabecera | 40 B | 42 B |
| Sangría de filas | 4,000 B | 2,000 B |
| Cuatro separadores por fila | 8,000 B | 4,000 B |
| Valores de celdas | 26,259 B | 28,927 B |
| Saltos de línea | 1,000 B | 1,000 B |
| **Documento** | **39,299 B / 19,812 tokens** | **35,969 B / 17,815 tokens** |

Los valores son los mismos en ambas salidas: números 6,593 B, nombres/grupos 18,000 B y booleanos 1,666 B en ALE frente a 4,334 B en TOON. No hay nulls en estas tres tablas; el costo de celdas nulas no se puede inferir de ellas. La tabla de 1,000 filas tiene 334 valores false y 666 true. El token count completo es exacto. Los conteos de tokens de fragmentos aislados del script de descomposición no son aditivos: BPE segmenta con contexto; no se deben sumar para reconstruir el total.

### Casos donde ALE gana frente a TOON

- **Respuesta API base:** ALE 158 B/55 tokens, TOON 153 B/60 tokens. TOON es 5 bytes menor, pero ALE usa 5 tokens menos. En la salida ALE aparecen `¡ok` y `next:`; TOON emite `ok: true` y `next: null`. Los marcadores compactos de ALE explican parte de la diferencia tokenizada.
- **Respuesta API de 50 elementos:** ALE 1,788 B/720 tokens; TOON 3,159 B/1,206 tokens. Las filas de ALE comparten `id, score, labels`; arrays de escalares como `[active, new]` caben como celdas inline y el encabezado se paga una sola vez. TOON eligió lista de objetos porque `labels` cambia de longitud, repitiendo claves en los elementos.
- **Conversación de 40 turnos:** ALE 2,413 B/601 tokens frente a TOON 2,296 B/563. Aquí TOON también gana; no toda respuesta conversacional favorece ALE. En la conversación base de tres mensajes, ALE fue 97 B/32 tokens frente a TOON 90 B/33 tokens: ALE gana un token, aunque pierde siete bytes.

### Casos donde ambos pierden frente a JSON

- **Objetos heterogéneos base:** JSON 91 B/32 tokens, TOON 103 B/46 y ALE 133 B/43. TOON usa una lista `items[4]` y un `-` por elemento; ALE introduce `items: []:` más los campos y separadores de objeto. La lista no amortiza una cabecera común de columnas.
- **Anidamiento base:** JSON 84 B/29 tokens; TOON 89/32; ALE 209/33. TOON codifica la longitud con `level2[1]` y usa grupos tabulares anidados. ALE explicita bloques `[]:` y conserva más líneas y sangría. La brecha de bytes es grande, pero el conteo real de tokens es menor que esa diferencia de caracteres sugeriría.
- **Extremos numéricos:** TOON y JSON conservan exponente; ALE escribe decimales expandidos. El costo es muy superior tanto en bytes como en tokens.

### Strings, escapes y Unicode

En el fixture `special-strings`, ALE mide 213 B/78 tokens, TOON 215/79 y JSON 226/72: ambos ganan bytes, pero ambos pierden tokens frente a JSON. La tokenización depende del texto exacto y no es proporcional a caracteres.

El fixture `unicode-extended` contiene 32 emojis dentro de strings quoted. ALE actual emite cada emoji como los escapes surrogate `\\ud83e\\udd8a`: 2,406 B/773 tokens. El texto quoted con el carácter Unicode literal parsea al mismo valor con el parser actual y da 2,150 B/613 tokens (-256 B/-160 tokens). Es una medición de una alternativa de serialización existente, no del serializador actual. `escapeString()` contiene una rama que intenta preservar `ch.length === 2`, pero indexar `s[i]` devuelve una unidad UTF-16; para un par válido esa rama no se alcanza y ambas unidades se emiten como `\\uXXXX`.

### Opciones ya existentes

`stringifyALE(value, { indent: " " })` conservó estructuralmente los 22 casos al parsearse y redujo el total de 54,040 B/25,320 tokens a 49,522/24,132. Es una opción existente, no un cambio de gramática. La serialización textual/canónica cambiaría respecto al indent predeterminado de cuatro espacios.

El parser acepta separadores con coma sin espacio (`[1,2]`, cabeceras `{a,b}` y filas `1,2`). Un análisis que quita espacios tras las comas solo fuera de strings quoted conservó los 22 valores: 49,390 B/23,660 tokens. Combinado con `indent: " "`: 44,872 B/22,472 tokens, -17.0% bytes/-11.3% tokens frente a ALE predeterminado. El candidato no elimina los espacios que forman parte de strings. Para implementar esta oportunidad bastaría cambiar separadores generados; el parser actual ya interpreta ambas formas.

`useSpread:false` no cambió la salida en los 22 casos de benchmark: estos fixtures no ejercitan la forma spread de manera que cambie la selección. No hay evidencia de ahorro o costo de esa opción en este corpus.

## Números y posibles representaciones exponenciales

### Semántica actual confirmada

- El parser numérico reconoce `^[+-]?\d+(\.\d+)?$` en [`parseScalarOrInline()`](../ale.js:1271), no una forma exponencial.
- El serializador usa `String(value)` y `numberToALE()` expande `e/E` a decimal fijo en [`numberToALE()`](../ale.js:1933). Para `-0` emite `-0` explícitamente; `Number("-0")` conserva el signo.
- Ejecuté [`numeric-roundtrip.mjs`](../benchmarks/ale-5c/numeric-roundtrip.mjs): 100,000 patrones de bits reproducibles; 99,937 eran finitos. `Object.is(parseALE(stringifyALE(n)), n)` pasó en los 99,937, incluidos subnormales y valores grandes generados por la secuencia.
- En propiedades, `parseALE("value: 1e3")` devuelve `{ value: "1e3" }` tanto en gramática actual como legacy; en arrays indentados `1e3` también es un elemento string. `parseALE("1e3")` en raíz sí difiere por la semántica de raíz legacy, por lo que no es un ejemplo de colisión aislado. `stringifyALE("1e3")` actualmente deja `1e3` sin comillas; es seguro solo porque el parser actual no lo interpreta como número.
- La forma decimal canónica actual se obtiene expandiendo la representación decimal corta de `String(number)`. Varios textos decimales pueden reconstruir el mismo `Number`; el serializador los normaliza a esta forma. La prueba de bits confirma la implementación para la muestra, no una prueba formal para todos los valores posibles.

ALE-5B.1 ya midió una secuencia numérica sintética con formas exponentes cortas en 135 B/77 tokens frente a la salida ALE actual de 1,049/372 y JSON de 130/67. Esta cifra **no es resultado ALE actual** y no se usa para una comparación semántica: bajo la gramática actual `1e-7` es un string, no un número.

### Alternativas futuras y compatibilidad

| Alternativa | Beneficio potencial | Costo/riesgo | Sintaxis/compatibilidad |
|---|---|---|---|
| Mantener decimales actuales | Ningún riesgo nuevo; reversible en el dominio finito comprobado | Sigue expandiendo extremos y consume tokens | Sin cambio |
| Aceptar números bare con exponente y emitirlos canónicamente | Muy alto para MAX/MIN y valores fuera de `[1e-6, 1e21)`; puede acercar el fixture numérico a decenas de tokens, no cientos | Colisión: el documento actual bare `1e3` significa string; reinterpretarlo como número cambia datos. Strings exponenciales nuevos deben quoted. Canonicalización textual cambia | Requiere decisión de gramática y política de migración; `legacy` podría preservar la interpretación anterior, pero los documentos actuales sin opción también cambiarían |
| Añadir un marcador numérico explícito | Evita colisionar con strings bare ya válidos | Marcador agrega caracteres/tokens y necesita reglas de escape/canonicalización | Nueva sintaxis, requiere aprobación |
| Solo cambiar la salida del serializador a exponentes | No es seguro por sí sola | El parser actual devuelve strings para exponentes, causando pérdida de tipo | No implementar sin parser/gramática y decisión coordinada |

Recomendación: no tocar números en ALE-5D hasta aprobar explícitamente el destino de documentos current que contienen exponentes bare. Si se aprueba la notación bare, definir el rango de salida y las reglas para quoting strings antes de cambiar parser o serializador, y conservar un camino legacy probado.

## Análisis de la selección de tablas y bloques

En [`writeObject()`](../ale.js:1456), arrays cortos de escalares van inline; arrays de objetos con claves compatibles pueden convertirse en tablas; booleanos se emiten como flags; otros valores compuestos usan bloques. En [`writeArray()`](../ale.js:1525), arrays cortos de escalares van inline, arrays homogéneos pasan a tabla y los demás usan `[]:`; dentro de estos puede emitirse `...{}` para runs de objetos escalares con el mismo conjunto de claves. Los valores complejos en celdas usan placeholders y continuaciones.

La detección de tabla se basa en homogeneidad estructural y reversibilidad, no en costo textual. Esto explica dos oportunidades sin gramática nueva:

- La tabla extendida de API comprime arrays internos de escalares en celdas porque ALE admite esa forma; TOON cae a lista al no poder usar la forma tabular con esas celdas.
- `sameKeySet()` compara ordenando ambos arrays de claves en cada comprobación. Puede ser posible clasificar una vez y reutilizar la decisión/cabeceras durante la escritura, sin modificar el criterio semántico.

Una heurística de costo podría elegir entre solo formas ya existentes (tabla, spread, objetos implícitos, inline) por bytes o tokens; no debe alterar absent/null, agrupar objetos separados, ni convertir compuestos a strings. Antes de activarla como default, habría que decidir si el criterio optimiza legibilidad, bytes o `o200k_base`, porque no siempre coinciden.

## Perfilado de parser

Perfiles separados con Node `--cpu-prof`, 100 iteraciones del corpus de 22 documentos; el parseo consume documentos ALE serializados previamente y el modo stringify serializa los mismos valores. Los porcentajes son muestras propias del perfil y pueden variar por plataforma/V8.

| Función | Muestras parseo | % parseo | Observación |
|---|---:|---:|---|
| `setData` (`ale.js:385`) | 143/510 | 28.0% | `Object.defineProperty` por cada propiedad/celda, necesario para preservar claves especiales |
| `parseTableRowsBlock` (`:830`) | 97/510 | 19.0% | Recorrido de filas, celdas y placeholders |
| `parseTableCell` (`:907`) | 39/510 | 7.6% | Clasificación de cada celda |
| `parseObjectBlock` (`:267`) | 31/510 | 6.1% | Bloques de objeto |
| `parseScalarOrInline` (`:1271`) | 28/510 | 5.5% | Resolución de valores |
| `splitCSVLike` (`:1373`) | 24/510 | 4.7% | Escaneo char a char con quotes/nesting |
| GC | 26/510 | 5.1% | Asignación temporal acumulada |

La mayor parte del perfil de parseo procede de tablas grandes. En `parseALE()` se crean `rawLines`, luego objetos line-number con `map/filter`, se busca indentación y se crean de nuevo líneas normalizadas; son pasadas y asignaciones completas sobre el documento. `inferBlockKind()` también explora adelante desde distintos bloques, candidato a recorrido repetido en entradas con muchos bloques anidados. No se observó como hotspot dominante en este perfil.

## Perfilado de serializador

| Función | Muestras stringify | % stringify | Observación |
|---|---:|---:|---|
| `writeObject` (`ale.js:1456`) | 76/352 | 21.6% | Elección y emisión mezcladas en el recorrido por propiedades |
| `sameKeySet` (`:1833`) | 67/352 | 19.0% | Copia y ordena dos listas de claves por comparación |
| `numberToALE` (`:1933`) | 28/352 | 8.0% | Expansión decimal; alto costo de salida y trabajo visible en valores extremos |
| GC | 27/352 | 7.7% | Arreglos/celdas temporales, strings y estructuras de comparación |
| `stringToALE` (`:1920`) | 18/352 | 5.1% | Varias pruebas regex por string |
| `tableColumnsUnion` (`:1844`) | 15/352 | 4.3% | Recorrido de propiedades para columnas |
| `isHomogeneousObjectArray` (`:1802`) | 14/352 | 4.0% | Clasificación repetida del mismo array |
| `cellToALE` (`:1861`) | 11/352 | 3.1% | Conversión de celdas/placeholders |

En `writeObject`, `writeArray` y `writeSlotLines` existen rutas parecidas para objetos en contenedores; parte de la lógica de inline arrays, flags, tablas y bloques está duplicada. La duplicación eleva riesgo de divergencia, aunque no justifica reescribir el módulo. `indent()` repite el cálculo de sangría por línea, pero no aparece como hotspot medido.

`splitCSVLike()` concatena caracteres a un string mientras mantiene estados de comillas, escapes y profundidad de `[]/{}`. Su cuota de 4.7% no apoya aún una reescritura; probar arrays de fragmentos solo si un perfil de celdas largas demuestra beneficio.

## Matriz de propuestas

Clases: **A**, optimización interna sin cambio textual/semántico; **B**, elección de la sintaxis existente en el serializador; **C**, cambio de gramática que requiere aprobación.

| Clase / propuesta | Evidencia y beneficio esperado | Velocidad | Complejidad | Riesgo de reversibilidad/compatibilidad | Gramática |
|---|---|---|---|---|---|
| **B — Delimitadores sin espacio después de coma** | Verificado en 22 casos: -4,650 B/-1,660 tokens (-8.6%/-6.6%) con semántica igual. En tabla de 1k, -4,004 B/-1,335 tokens | Neutro o marginalmente mejor por menos caracteres; medir | Baja | Bajo si el serializador cambia solo joins de separadores y conserva commas dentro de quotes | No; ya parsea |
| **B — Usar indentación de un espacio** | Opción existente: 22/22 iguales; -4,518 B/-1,188 tokens | Menos texto, no hay perfil aislado | Muy baja | Bajo semántico; cambia todo el texto canónico y legibilidad | No |
| **B — Ambas opciones anteriores** | Candidato verificado: 44,872 B/22,472 tokens (-17.0%/-11.3%) en corpus completo. Tabla 1k: 32,295 B/17,477 tokens, supera TOON de ese caso por 338 tokens | Potencial menor tiempo de lectura/escritura, no medido | Baja | Bajo semántico; revisar canonical output esperado | No |
| **B — Emitir pares surrogate válidos como Unicode literal** | Fixture medido: -256 B/-160 tokens en 32 emojis; parsea igual | Menos escapes y concatenaciones | Baja | Bajo; proteger pares aislados y escapes reales | No; parser acepta Unicode literal |
| **A — Cachear firma/conjunto de claves y clasificación de arrays** | `sameKeySet` + clasificación consumen ~23% de muestras del serializador | Potencial medio/alto en arrays de filas | Media | Bajo si conserva igualdad de conjuntos, orden de cabecera y evaluación de compuestos | No; salida idéntica |
| **A — Reducir recorridos/alocaciones de `parseALE` y tablas** | `setData`+`parseTableRowsBlock` ~47% de muestras del parser; contenedores intermedios visibles por perfil | Potencial medio/alto con tablas grandes | Media | Medio; `__proto__` y claves propias deben seguir seguras | No |
| **A — Optimizar comparación/asignación de propiedades** | `Object.defineProperty` aporta 28% de muestras propias; es ruta importante de seguridad | Potencial medio | Media | Alto si se usa asignación normal sin cuidar `__proto__`, duplicados y legacy | No |
| **C — Parsear y emitir números con exponente** | Máximo potencial en números extremos; salida actual del fixture 1,049 B/372 tokens | También reduciría el trabajo de expansión | Media | Alto: `1e3` bare cambia de string a number y canonicalización altera textos existentes | Sí, o marcador explícito |
| **A — Reescribir `splitCSVLike`** | 4.7% del perfil parser en corpus mediano/grande | Bajo/no demostrado | Media | Medio por escapes/anidamiento | No |

El impacto de tokens/bytes de las primeras cuatro propuestas se midió en candidatos analizados y verificados, no se atribuye a la salida actual. Las estimaciones de velocidad internas son hipótesis basadas en muestras CPU; no se midieron ganancias de una implementación optimizada.

## Plan recomendado para ALE-5D

1. **Primero, una fase de cambio de serializador sin gramática:** compactar solo delimitadores emitidos fuera de valores quoted; conservar `indent:"    "` como predeterminado hasta acordar legibilidad. Añadir regresiones con comas internas, escapes, tablas, arrays inline, celdas/slots y ejemplos legacy.
2. **Corregir la emisión de Unicode quoted:** iterar por code points o copiar el par surrogate completo; preservar escapes de control y sustitutos aislados. Validar byte/token y round-trip.
3. **Optimizar la selección de tabla internamente:** crear una clasificación/schema reusable por array y evitar ordenar claves dos veces por cada fila. Comparar salida textual antes/después para asegurar identidad; microbenchmark antes de fusionar.
4. **Perfilar `setData` en microbenchmarks separados:** medir alternativas que mantengan propiedades propias y seguridad de `__proto__`; ejecutar la suite de claves especiales y actual/legacy antes de adoptar una ruta rápida.
5. **Dejar los exponentes para una decisión de gramática separada.** Aprobar primero compatibilidad para exponentes bare, quoting de strings numéricos exponenciales, canonicalización y comportamiento `legacy`; después implementar parser/serializador juntos.
6. Repetir ALE-5B.1 y las pruebas generativas, además de guardar perfiles separados de parse/stringify y confirmar con cargas de producción anonimizadas cuando existan.

## Reproducción

```sh
node benchmarks/ale-5c/numeric-roundtrip.mjs
node benchmarks/ale-5c/representation-options.mjs
node benchmarks/ale-5c/compact-separator-analysis.mjs
node benchmarks/ale-5b1/table-breakdown.js
node benchmarks/ale-5c/unicode-escape-analysis.mjs
ALE_PROFILE_MODE=parse ALE_PROFILE_ITERATIONS=100 node --cpu-prof --cpu-prof-dir=/tmp --cpu-prof-name=ale-parse.cpuprofile --cpu-prof-interval=1000 benchmarks/ale-5c/profile-workload.mjs
ALE_PROFILE_MODE=stringify ALE_PROFILE_ITERATIONS=100 node --cpu-prof --cpu-prof-dir=/tmp --cpu-prof-name=ale-stringify.cpuprofile --cpu-prof-interval=1000 benchmarks/ale-5c/profile-workload.mjs
```

Los candidatos de delimitadores/indentación pasan por `parseALE` y se comparan con `isDeepStrictEqual`; son mediciones exploratorias, no cambios al resultado oficial ALE-5B.1. Los perfiles `cpuprofile` quedan fuera del repositorio.
