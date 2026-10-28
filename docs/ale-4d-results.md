# ALE-4D — Resultados de reversibilidad profunda y validación

## Cambios

ale.js conserva la sintaxis y la API públicas. No se modificó la versión, no se instalaron dependencias y no se alteró el README.

- Las tablas automáticas ahora se limitan a valores que pueden escribirse reversiblemente. Si una columna conduce a continuaciones tabulares compuestas que el formato actual no puede representar, stringifyALE usa bloques normales de arrays/objetos. El serializador ya no convierte celdas objeto a texto JSON.
- Al leer el valor de una propiedad en un bloque, la gramática actual reconoce como valor directo {}, un array inline como []/[1, 2], y el bloque explícito []:. Se aplicó a objetos regulares, objetos implícitos de arrays y slots. Legacy conserva su inferencia histórica.
- En gramática actual, el selector de continuación solo trata un campo entrecomillado como nombre cuando el resto completo es un único campo CSV. Así <"", "" continúa como fila con dos strings vacíos. Legacy conserva la clasificación histórica.
- La gramática actual rechaza claves de objeto repetidas (comparadas después de decodificar), nombres de columna repetidos y filas con más celdas que columnas. Legacy conserva último valor gana, permite cabeceras repetidas y descarta celdas excedentes como antes.
- Filas cortas siguen completándose con null; las celdas vacías continúan siendo null. Las tablas anónimas vacías siguen siendo [] en gramática actual; las tablas con clave sin bloque continúan dando error. Los arrays vacíos se emiten como [].

## Reducción de fallos

El diagnóstico de ALE-4C llamaba “null → {}” a una diferencia de estructura, pero la muestra publicada no contenía ese cambio exacto: la propiedad cuyo valor era null seguía siendo null; la propiedad "null" cuyo valor era {} se decodificaba como [{}]. El defecto mínimo reducido es:

    [{ a: [{ x: {} }] }]

Antes, la forma de slot contenía x: seguido de {}. La inferencia de bloque interpretaba ese {} como array con un objeto vacío. La corrección consume los contenedores inline directamente cuando aparecen como valor hijo de una propiedad. Se añadieron pruebas separadas para {} y para valores null dentro de slots.

Al continuar la reducción apareció otra variante del mismo fallo de inferencia, pero para arrays: un valor propiedad escrito como key: seguido de []: o [0] se trataba como bloque-array y se envolvía otra vez. Los objetos implícitos dentro de arrays y slots no reconocían consistentemente el encabezado explícito []:. Las rutas ahora conservan el array directamente. Este defecto era distinto del valor compuesto convertido en string.

Un caso generado adicional mostró que <"", "" se clasificaba como selector porque el texto empezaba y terminaba con comillas. La condición ahora exige que el resto sea un solo campo; la fila compacta permanece intacta.

## Validación

### Semillas ALE-4B

Cada ejecución cubrió 10.000 valores por siete opciones del serializador (70.000 round-trips).

| Semilla | Round-trips | Correctos | Fallidos |
|---:|---:|---:|---:|
| 1243488294 | 70.000 | 70.000 | 0 |
| 1 | 70.000 | 70.000 | 0 |
| 3735928559 | 70.000 | 70.000 | 0 |
| 8675309 | 70.000 | 70.000 | 0 |
| Total | 280.000 | 280.000 | 0 |

### Profundidad ALE-4C

Semilla 1280057382, 128 valores generados más una cadena explícita por profundidad y siete opciones: 903 round-trips por nivel.

| Profundidad | Correctos | Fallidos |
|---:|---:|---:|
| 4 | 903 | 0 |
| 8 | 903 | 0 |
| 16 | 903 | 0 |
| 32 | 903 | 0 |
| Total | 3.612 | 0 |

### Fuzz, tamaños y suite

La campaña volvió a procesar 1.000 documentos con semilla 1330993754, en gramática actual y legacy, bajo timeout. Actual aceptó 40 documentos y produjo 960 errores controlados ALEParseError; legacy aceptó 55 y produjo 945 errores controlados. Hubo cero excepciones internas inesperadas, cero efectos de prototipo y cero ejecución del sentinel. Se registraron 41 diferencias entre dialectos, consistentes con validaciones actuales y compatibilidad legacy.

Los smoke/benchmark puntuales de 1 KiB, 10 KiB, 100 KiB y 1 MiB finalizaron. En la ejecución final de 1 MiB, parseo tomó aproximadamente 195 ms, stringify 51 ms y parseo de vuelta 126 ms. Son medidas de una ejecución, no benchmarks estadísticos.

npm test ejecuta también las nuevas regresiones ALE-4D. En la ejecución de cierre: 58 pruebas aprobadas, 0 fallidas, 0 pendientes y 0 omitidas. git diff --check y node --check pasaron para los JavaScript modificados.

## Compatibilidad y límites

La gramática actual gana validación estricta para duplicados y exceso de celdas. Legacy conserva las políticas anteriores de último valor gana y truncamiento de celdas adicionales. No se cambió la interpretación histórica de tablas anónimas vacías: en raíz actual produce [], legacy conserva [[]]; en algunos contextos un encabezado anónimo vacío sigue representando un array elemento anidado. Las tablas con clave sin filas siguen inválidas.

La escritura tabular todavía admite placeholders y continuaciones aprobados; los objetos directos y las estructuras tabulares compuestas que no tienen una codificación reversible salen por la forma normal de bloques. No se añadió una sintaxis de celdas nueva. Los límites de profundidad/tamaño siguen dependiendo de recursos de Node.js; definir límites explícitos queda fuera de esta fase.
