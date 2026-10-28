# ALE-4A — Resultados de pruebas generativas

## Campaña reproducible

La campaña está implementada en `tests/generative.test.js`. Usa un PRNG determinista sin dependencias, con la semilla predeterminada `0x4a1e2026` (`1243488294`). Se puede cambiar con `ALE_SEED`; `ALE_CASES` establece la cantidad de valores generados. El valor máximo de profundidad es 4 y cada contenedor tiene como máximo 4 elementos/propiedades.

Cada valor se prueba con siete configuraciones del serializador: opciones predeterminadas, `useTables:false`, `useSpread:false`, `booleanShortcuts:false`, `inlineArrayMax:0`, `useTables:false` junto con `useSpread:false`, y una configuración combinada con `inlineArrayMax:2`. Si encuentra un fallo, el test hace una reducción greedy del valor y reporta semilla, iteración, opciones, ALE y resultado obtenido. Los casos correctos no se imprimen.

Ejecución de referencia:

```sh
node --test tests/generative.test.js
```

| Medida | Resultado |
| --- | ---: |
| Valores generados | 10 000 |
| Round-trips ejecutados | 70 000 |
| Round-trips correctos | 68 528 |
| Round-trips fallidos | 1 472 |
| Valores con al menos una configuración fallida | 300 |
| Tiempo del test generativo | aproximadamente 1,02 s |

Fallos por categoría: 494 diferencias de forma/orden de arrays, 660 excepciones de parser o serializador y 318 diferencias de tipo/clave en objetos. Fallos por configuración: `{}` 286; `useTables:false` 214; `useSpread:false` 286; `booleanShortcuts:false` 85; `inlineArrayMax:0` 294; `useTables:false,useSpread:false` 214; configuración combinada 93.

La semilla fija permite repetir exactamente la secuencia. Para obtener los contraejemplos reducidos del informe:

```sh
ALE_CASES=10000 node --test tests/generative.test.js
```

## Contraejemplos reducidos

### Tabla de una columna con celda null

```js
const value = [{ k6: null }];
const ale = stringifyALE(value);
// {k6}:\n␠␠␠␠
parseALE(ale); // Error: Expected an indented block
```

La celda vacía se emite como una línea en blanco; el preprocesamiento del parser descarta las líneas vacías, y queda una cabecera de tabla sin filas. Es un fallo de reversibilidad para un valor JSON válido. El mismo problema aparece con `inlineArrayMax:0`, que fuerza tablas para arrays de objetos.

### Flag en una clave que necesita comillas con `useTables:false`

```js
const value = [{ k6: { "a:b": false } }];
const ale = stringifyALE(value, { useTables: false });
// []:\n    k6:\n        !"a:b"
parseALE(ale);
// [{ k6: ['!"a:b"'] }] — el flag queda como string en un array
```

La forma compacta de flag con clave entrecomillada no se reconoce como propiedad en esta ruta de bloque; se clasifica como elemento escalar. La estructura del objeto anidado cambia.

## Estabilidad semántica

La propiedad `parseALE(stringifyALE(parseALE(source)))` se ejecutó sobre ocho fuentes construidas con objetos implícitos, arrays explícitos y heredados, tablas, expansión, slots, selectores y el caso de filas de tabla sin indentación. Las ocho conservaron su estructura. Esto no implica que las fuentes arbitrarias ni todos los valores JSON sean reversibles; la campaña de serialización encontró los fallos listados arriba.

## Indentación y significado de las filas

La compatibilidad para reconocer filas sin indentación adicional toma la cantidad de celdas como señal. Ejemplo mínimo:

```ale
items:
    {a, b}:
    x, y
```

El parser actual devuelve `items: [[{a: "x", b: "y"}]]`. Sin embargo, si se pretendía que `{a, b}:` fuera una tabla anónima vacía seguida por el string del array contenedor `"x, y"`, la estructura esperada sería `items: [[], "x, y"]`. El conteo de celdas elige la primera interpretación y consume la línea como fila. Esa segunda intención no está señalada explícitamente en el documento; el string debería escribirse entre comillas para evitar la regla de compatibilidad.

Una línea con distinto número de celdas no se consume como fila:

```ale
items:
    {a, b}:
    z
```

En ese caso, el parser produce `items: [[], "z"]`. Por tanto, una coma y el número de columnas alteran si una línea contigua se agrupa en la tabla o queda como hermano del array. La regla es determinista en la implementación, pero la intención del autor no siempre se puede inferir. La fase ALE-4A no cambia la gramática ni fija una regla nueva.

## Actualización ALE-4B

La repetición diagnóstica de la campaña original agrupó los fallos por rutas del código. Antes de corregir, el clasificador técnico registró 390 errores `The > separator must begin an object element`, 140 flags negativos y 110 positivos rechazados como líneas de objeto por claves con `:` dentro de comillas. Los cambios en nombres de columnas, filas nulas y límites de arrays aparecían como diferencias estructurales y errores de bloque. Los grupos se solapan en algunos valores/opciones; por eso estas cifras son conteos de ejecuciones fallidas por firma, no cantidades de defectos únicos.

Se identificaron estas causas independientes:

1. Las celdas null de tablas de una columna se emitían como fila en blanco, descartada por el preprocesamiento.
2. `isFlagLine` rechazaba `:` incluso cuando estaba dentro de una clave entrecomillada.
3. El parser de arrays explícitos no aceptaba `>` seguido de un flag como comienzo de un objeto hermano.
4. Las cabeceras de tabla emitían nombres de columna sin quoting y el parser no decodificaba nombres quoted; afectaba comas, espacios, nombres vacíos y otros caracteres.
5. Los arrays anidados dentro de slots se aplanaban cuando `inlineArrayMax` impedía su forma inline; el parser de slots tampoco consumía `[]:` como un elemento array.
6. El separador `>` seguido por una propiedad que contiene una tabla se analizaba como una clave literal en vez de una cabecera de tabla.
7. La compatibilidad de filas a la misma indentación usaba la aridad como señal y podía absorber un elemento hermano del array.

Las primeras seis causas se corrigieron dentro de las formas ALE existentes. Para la séptima, la gramática actual ahora exige que las filas estén dentro del bloque indentado. La antigua interpretación por aridad permanece disponible en `parseALE(source, { grammar: "legacy" })`. Un `key{columns}:` sin bloque de filas sigue siendo inválido; una cabecera anónima vacía (`{columns}:`) produce `[]` en raíz o como elemento anidado, una cabecera `[{columns}]:` vacía produce un array vacío como elemento, y una expansión vacía no añade elementos.

Resultados tras las correcciones:

| Semilla | Predeterminadas | Sin tablas | Sin expansión | Sin shortcuts booleanos | `inlineArrayMax:0` | Sin tablas ni expansión | Combinada |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1243488294 | 0/10 000 | 0/10 000 | 0/10 000 | 0/10 000 | 0/10 000 | 0/10 000 | 0/10 000 |
| 1 | 0/10 000 | 0/10 000 | 0/10 000 | 0/10 000 | 0/10 000 | 0/10 000 | 0/10 000 |
| 3735928559 | 0/10 000 | 0/10 000 | 0/10 000 | 0/10 000 | 0/10 000 | 0/10 000 | 0/10 000 |
| 8675309 | 0/10 000 | 0/10 000 | 0/10 000 | 0/10 000 | 0/10 000 | 0/10 000 | 0/10 000 |

En total, las cuatro semillas completaron **280 000 round-trips sin fallos**. La suite completa ejecutó 46 pruebas: 46 aprobadas, 0 pendientes y 0 fallidas. `ale.js` se mantuvo sin reescritura extensa; los cambios están en las rutas puntuales de clasificación, construcción de tabla y emisión de bloques.
