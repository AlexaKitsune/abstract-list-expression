# ALE-4C — Auditoría de robustez

## Alcance y ejecución

Esta fase añade pruebas y herramientas de auditoría. `ale.js` no se modificó. No se instalaron dependencias ni se cambió la gramática.

Comandos usados:

```sh
npm test
node tests/robustness-campaign.js
```

La campaña de profundidad usa la semilla `1280057382` (`0x4c4c2026`), 128 valores generados y un valor de cadena profunda por nivel, con siete opciones del serializador. El fuzz usa la semilla `1330993754` (`0x4f555a5a`), 1.000 documentos y un proceso hijo con límite de 8 segundos.

## Auditoría estática

- `parseBlock` y sus rutas para objetos, arrays, slots y arrays explícitos procesan bloques recursivamente. `parseScalarOrInline` vuelve a llamarse para arrays inline anidados.
- `writeValue`, `writeObject`, `writeArray` y la escritura de slots también son recursivas. No se encontró un límite explícito de profundidad, tamaño de documento o cantidad de propiedades; el límite práctico es la pila/memoria de Node.js.
- El recorrido de líneas usa índices y normalmente avanza; se observaron guardas de progreso en rutas de placeholders. El fuzz no encontró bucles sin avance en el corpus ejecutado.
- Los escáneres de cadenas CSV/colon recorren segmentos. Anidar repetidamente listas inline puede volver a recorrer el texto desde cada nivel; esto es un riesgo de coste cuadrático para entradas diseñadas con gran profundidad, no una complejidad medida en esta campaña.
- La inferencia de tipo de bloque puede buscar líneas descendientes repetidamente en bloques anidados. No se encontró una medición que pruebe un problema de rendimiento en el tamaño evaluado.
- No se encontró `eval` ni `new Function` en el código revisado.

## Profundidad y reversibilidad

Cada nivel ejecutó 129 valores × 7 configuraciones = 903 round-trips. El límite del generador fue 96 nodos y hasta 3 elementos por contenedor; se añadió una cadena exacta por nivel.

| Profundidad objetivo | Round-trips correctos | Fallidos | Tiempo de la campaña |
|---:|---:|---:|---:|
| 4 | 903 | 0 | 23 ms |
| 8 | 898 | 5 | 14 ms |
| 16 | 898 | 5 | 17 ms |
| 32 | 888 | 15 | 15 ms |

La campaña completa, incluidos tamaños y fuzz, tardó aproximadamente 0,52 s en esta ejecución.

La muestra representativa más pequeña de la primera causa es:

```js
{ a: [{ b: [{ c: [{ d: 1 }] }] }] }
```

Con opciones predeterminadas, el serializador produce una tabla anidada cuya celda contiene el array interno como texto JSON:

```ale
a{b}:
    {c}
        "[{\"d\":1}]"
```

El parseo devuelve un string en `c`, no el array original. La ruta afectada es la escritura de filas/continuaciones tabulares para valores de celda que no son escalares. La configuración `useTables:false` evita este defecto en los casos generados; no se aplicó una corrección en esta fase.

Una segunda forma observada a profundidad 32 combina un array dentro de una celda tabular con una tabla/slot anidado que contiene `null`. El ALE generado empieza así:

```ale
{prototype}:
    [:]
        null:
            {}
```

El resultado reconstruye el `null` como un objeto vacío dentro del array. Este caso se debe reducir antes de atribuirlo a una causa independiente: comparte rutas de arrays/slots/tablas con el defecto anterior, pero la discrepancia específica sugiere una colisión entre el marcador de slot y el tratamiento de bloques vacíos.

Los fallos se limitaron a opciones con tablas habilitadas; las dos configuraciones con `useTables:false` pasaron todos los casos de profundidad. Las cadenas exactas por sí solas pasaron; los fallos corresponden a estructuras generadas que alcanzan una composición tabular anidada. Por tanto, la campaña no encontró un límite de pila hasta profundidad 32, pero sí defectos de reversibilidad.

## Fuzz de documentos posiblemente inválidos

El corpus mezcló fragmentos dirigidos (indentación, comillas/escapes, aridad y columnas duplicadas, selectores, continuaciones, `[]:`, `>` y claves repetidas) con composiciones pseudoaleatorias. No se presupuso que todo documento fuese inválido.

| Gramática | Aceptados | Errores `ALEParseError` | Excepciones inesperadas |
|---|---:|---:|---:|
| Actual | 49 | 951 | 0 |
| Legacy | 55 | 945 | 0 |

Se observaron 31 resultados distintos entre gramáticas. Entre ellos están escapes desconocidos/incompletos (rechazados por la actual, aceptados o reinterpretados por legacy), `[]:` sin bloque (error actual, string en legacy), y formas raíz como `{}` que tienen interpretaciones diferentes. Las diferencias se concentran en compatibilidad intencional entre dialectos; hay que conservarlas como casos de regresión, no homogeneizarlas sin decisión semántica.

En las 1.000 entradas y ambas gramáticas:

- no hubo excepciones inesperadas;
- no se observó cambio de `Object.prototype` ni del prototipo global;
- los objetos parseados conservaron el prototipo esperado;
- no se ejecutó el sentinel incluido como contenido de entrada;
- el proceso finalizó dentro del timeout de 8 segundos.

Esto es evidencia limitada al corpus, no una prueba formal de ausencia de vulnerabilidades.

Ejemplos mínimos de diferencias actual/legacy:

```ale
value: "\q"
```

La gramática actual rechaza el escape desconocido; legacy lo acepta y elimina la barra. Para:

```ale
items: []:
```

la gramática actual informa que falta un bloque indentado; legacy devuelve el string `"[]:"` como valor.

## Tamaño y tiempo

Se generaron objetos de propiedades escalares y se midieron parseo, serialización y parseo de vuelta. Son mediciones puntuales, no benchmarks estadísticos; el entorno/CPU no se fijó.

| Tamaño de entrada | Bytes efectivos | Propiedades | Parse (ms) | Stringify (ms) | Parse de vuelta (ms) |
|---:|---:|---:|---:|---:|---:|
| 1 KiB | 1.027 | 79 | 0,20 | 0,04 | 0,12 |
| 10 KiB | 10.244 | 788 | 3,37 | 0,52 | 1,45 |
| 100 KiB | 102.401 | 7.877 | 15,72 | 3,01 | 14,87 |
| 1 MiB | 1.048.580 | 80.660 | 144,25 | 37,00 | 107,73 |

No se incluyeron entradas diseñadas para agotar memoria ni cadenas de profundidad extrema. La tendencia en estos documentos escala aproximadamente con la cantidad de líneas; no descarta costes cuadráticos en estructuras anidadas.

## Claves, duplicados y tablas vacías

- `__proto__`, `constructor` y `prototype` se conservaron como propiedades propias en los casos probados, en gramática actual y legacy; no se detectó mutación de prototipos.
- Dos claves ordinarias duplicadas (`a: 1` / `a: 2`) resultan en una propiedad `a` con el último valor. Dos columnas duplicadas (`{a, a}`) también colapsan en una propiedad `a` con el último valor de la fila. Esto es comportamiento observado; el contrato aún debe decidir si los duplicados se rechazan.
- En `key{a, b}:` sin bloque, ambas gramáticas lanzan `ALEParseError: Expected an indented block`.
- En raíz, `{a, b}:` produce `[]` en gramática actual y `[[]]` en legacy. Así, la tabla anónima sin filas no tiene una semántica uniforme entre contextos/dialectos.
- `[]` es la representación explícita de array vacío. El valor de un array vacío y el resultado de una tabla anónima vacía pueden coincidir en la gramática actual, pero la representación de origen no comunica necesariamente el mismo constructo. La política de tablas vacías queda pendiente.
- En fila `{a, b}` con tres celdas (`1, 2, 3`), el parser actual conserva solo las dos columnas declaradas y descarta la tercera. Es un error de validación potencial que requiere política explícita para celdas sobrantes.

## Hallazgos clasificados

| Hallazgo | Clasificación | Severidad | Evidencia |
|---|---|---|---|
| Arrays/objetos anidados en celdas tabulares se convierten a texto JSON | Defecto de reversibilidad | Alto | Round-trip de `{a:[{b:[{c:[{d:1}]}]}]}` falla con tablas activas |
| `null` en composición de slot/tablas anidadas puede convertirse en `{}` | Defecto de reversibilidad / ambigüedad | Alto | Muestra de profundidad 32; requiere reducción mínima |
| No hay límite de profundidad/tamaño explícito | Robustez / riesgo de recursos | Medio | Inspección recursiva; profundidad 32 concluye, pero la pila práctica no está acotada |
| Columnas extra se ignoran y duplicados usan último valor | Error de validación / decisión pendiente | Medio | `key{a,b}:` con `1,2,3`; `{a,a}:` con `1,2` |
| Interpretación de tabla vacía anónima depende del dialecto | Ambigüedad / compatibilidad | Medio | `{a,b}:` produce `[]` actual y `[[]]` legacy |
| Gramáticas actual y legacy difieren para escapes y tokens nuevos | Diferencia intencional de compatibilidad | Bajo/Medio | 31 diferencias en corpus, ninguna inesperada por sí sola |
| Ejecución de entrada o mutación de prototipo | Riesgo de seguridad | Sin hallazgo en corpus | Sin sentinel ejecutado ni mutación global en 1.000 documentos |

## Archivos de la auditoría

- `tests/value-generator.js`: generador determinista con profundidad/tamaño configurables.
- `tests/generative.test.js`: reutiliza el generador modular sin reducir el dominio cubierto.
- `tests/fuzz-utils.js` y `tests/fuzz-worker.js`: corpus determinista y aislamiento con timeout.
- `tests/robustness.test.js`: regresión de profundidad, fuzz y smoke de documentos de tamaño acotado.
- `tests/robustness-campaign.js`: campaña reproducible con reporte JSON de profundidad, tamaños y fuzz.

## Validación de la suite

`npm test` ejecutó 49 pruebas: 48 aprobaron y una falló de forma reproducible por la pérdida de reversibilidad tabular descrita arriba. No hubo pruebas pendientes, omitidas ni canceladas. El fallo se conserva como regresión activa; no se marcó como `todo` o `skip`. `node --check` pasó para los seis archivos JavaScript de pruebas/campaña y `git diff --check` no reportó errores.

## Decisiones pendientes y siguiente fase

1. Reducir el caso de `null` convertido a `{}` y decidir si la corrección puede limitarse a serialización no tabular ya existente.
2. Resolver la representación reversible de valores compuestos en celdas sin añadir sintaxis durante esta fase.
3. Definir explícitamente la política para tablas vacías, columnas repetidas y celdas sobrantes; mantener mientras tanto el comportamiento heredado documentado.
4. Considerar límites configurables de profundidad/documento o una salida controlada ante `RangeError`; acordar API y límites antes de implementarlos.
5. Mantener pruebas de compatibilidad separadas para gramática actual y legacy.
6. Ejecutar benchmarks repetidos y fuzz más amplio en un proceso con timeout antes de adoptar cambios de robustez.
