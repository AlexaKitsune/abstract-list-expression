# ALE-5G — Estabilización semántica e interoperabilidad

## Resumen

Se documentó y probó la diferencia entre legacy, current y next; se añadieron fixtures portables, pruebas de migración y regresiones para entradas con comillas o delimitadores sin cerrar. El default sigue siendo current, next sigue siendo experimental, y la API y versión 0.0.2 se conservan.

## Estado inicial

Al iniciar ALE-5G, git status ya mostraba cambios en .gitignore, ale.js y package.json, además de elementos no rastreados en benchmarks/, docs/, package-lock.json y tests/. Eran trabajo previo de ALE-1–5F y no se limpiaron ni confirmaron. ALE-5G añadió documentación, fixtures y pruebas, y ajustó validación estricta en ale.js. La versión/package.json no se modificó.

La suite inicial pasó con 74 pruebas, sin fallos, pendientes ni skips.

## Matriz de compatibilidad

La matriz ejecutable está en [ale-conformance.json](../conformance/ale-conformance.json). El esquema está explicado en [conformance/README.md](../conformance/README.md); tests/conformance-fixtures.test.js valida sus resultados.

| Característica | legacy | current | next | Clasificación |
|---|---|---|---|---|
| Decimales ordinarios, booleanos, null, arrays anidados y tablas ordinarias | valor común | valor común | valor común | Compatible en casos probados |
| 1e3 bare | string | string | número 1000 | Diferencia semántica; migración ambigua sin dialecto fuente |
| "1e3" quoted | string | string | string | Compatible |
| [] en raíz | [[]] | [] | [] | Diferencia semántica |
| []: | forma heredada (p. ej. string como valor inline) | array de bloque, requiere hijo | igual a current | Diferencia sintáctica y semántica |
| Tabla anónima raíz vacía | [[]] | [] | [] | Diferencia semántica |
| Filas tabulares fuera del bloque indentado | asociación histórica por aridad en algunos casos | no se asocian por aridad | igual a current | Ambigüedad de migración |
| Clave repetida | último valor gana | ALEParseError | ALEParseError | Diferencia intencional; legacy pierde ocurrencias previas |
| Columna repetida | último valor homónimo gana | ALEParseError | ALEParseError | Diferencia intencional |
| Celdas excedentes | se ignoran | ALEParseError | ALEParseError | Diferencia intencional; legacy pierde datos |
| Documento vacío | [] | ALEParseError | ALEParseError | Diferencia semántica |
| Escape desconocido, comillas/delimitadores sin cerrar | lecturas históricas permisivas en algunos escalares | error controlado | error controlado | Diferencia sintáctica |
| Spreads, slots, placeholders, selectores válidos | común en muestras probadas | común | común | Compatible en casos probados |
| Exponente incompleto, overflow, underflow no nulo a cero | string/lectura histórica | exponente bare es string | ALEParseError | Diferencia sintáctica/semántica |

La matriz es una muestra verificable, no una afirmación de equivalencia para toda entrada.

## Migración entre dialectos

El procedimiento seguro es parsear con el dialecto de origen conocido, conservar el valor, serializar con el dialecto destino explícito y volver a parsear con el destino. tests/ale-5g-migration.test.js aplica deepStrictEqual.

| Migración | Resultado comprobado |
|---|---|
| current → next | El string 1e3 se emite quoted; texto bare 1e3 en next sería número. |
| next → current | El número 1000 se emite como 1000 y conserva su semántica. |
| legacy → current | Preserva valores parseados representables; duplicados ya sobrescritos no se recuperan. |
| legacy → next | Preserva exponentes que legacy interpretó como strings mediante quoting. |

Si se desconoce el dialecto de origen, el texto 1e3 no se puede migrar con garantía. Tampoco pueden recuperarse claves sobrescritas o celdas excedentes que legacy ya descartó. No se agregó API pública de migración.

## Defectos reproducidos y corrección

Antes del cambio, current y next aceptaban casos como value: "unterminated, value: [1, 2 y value: [1, {x: 2] como strings/valores malformados. tests/ale-5g-parser.test.js contiene regresiones mínimas.

ale.js ahora valida comillas y delimitadores estructurales completos para escalares estrictos, y el escaneo CSV detecta cierres sin apertura y estructuras abiertas. Current y next devuelven ALEParseError. Legacy conserva las interpretaciones históricas de los escalares malformados comprobados. También se comprobó que escapes finales y escapes Unicode incompletos/no hexadecimales producen errores controlados. Los textos de error no son API estable.

No se endureció legacy. No se convierte cualquier excepción interna de JavaScript en ALEParseError; el contrato cubre los errores sintácticos confirmados.

## Fixtures portables

conformance/ale-conformance.json es UTF-8 JSON consumible desde cualquier lenguaje. Los documentos nombran dialecto y fuente, y pueden incluir valor JSON esperado, forma canónica, resultados por dialecto o clase de error. specialValues amplía JSON cuando este no es suficiente: -0 se acompaña de bits IEEE-754 binary64 8000000000000000. El runner JavaScript valida los fixtures, pero su consumo no depende de JavaScript.

## Canonicalización numérica de next

Los números finitos no nulos usan la conversión decimal radix 10 de ECMAScript Number::toString(x, 10), sección 6.1.6.1.20. La representación emplea una secuencia decimal mínima que al convertirse correctamente a binary64 recupera el mismo valor; ECMAScript fija el desempate y la elección entre notación fija y exponencial. Una implementación externa debe reproducir esa regla y sus umbrales, no confiar en el método genérico del runtime anfitrión. ALE conserva -0 explícitamente porque Number::toString convierte ambos ceros a 0. Next acepta exponentes decimales completos, rechaza exponentes incompletos, overflow y literales matemáticamente no nulos que redondean a cero. Los valores representables usan redondeo binary64 ECMAScript. [Referencia normativa ECMAScript 2024](https://tc39.es/ecma262/2024/multipage/ecmascript-data-types-and-values.html#sec-numeric-types-number-tostring).

Esto separa semántica (valor Number binary64), gramática de entrada y salida canónica. La forma original no se conserva.

## Especificación y README

docs/specification.md aclara las diferencias de current/legacy y next, errores estrictos, canonicalización y límites conocidos. Los ejemplos marcados conformance se ejecutan en tests/specification.test.js. Se corrigió la numeración duplicada.

README.md ahora describe ALE, instalación, API, tipos, ejemplos, dialectos, opciones, límites, next experimental y cómo contextualizar benchmarks. No proclama superioridad universal sobre otros formatos. El ejemplo principal se valida automáticamente.

## Robustez, recursos y resultados

La campaña se repite con node tests/robustness-campaign.js. Semilla de profundidad 1280057382, 128 valores aleatorios por nivel más una cadena profunda exacta, siete opciones. Profundidades 4, 8, 16 y 32: 903/903 cada una, 3.612 round-trips totales, cero fallos.

Fuzz con semilla 1330993754 y 1.000 documentos en proceso hijo con timeout externo de 20 s: current aceptó 30 y produjo 970 errores controlados; legacy aceptó 55 y produjo 945 errores controlados; next aceptó 28 y produjo 972 errores controlados. Cero excepciones inesperadas, cero mutaciones de Object.prototype, cero prototipos inesperados en valores y cero ejecución de contenido. Hubo 55 diferencias entre current y legacy. Una ejecución bajo carga alcanzó el timeout; la repetición aislada finalizó. Esto indica variabilidad de entorno, no una garantía de rendimiento.

Mediciones exploratorias de una muestra por operación, Node v24.21.0, documentos con propiedades escalares; no son un benchmark estadístico:

| Entrada (bytes) | Parse ms | Stringify ms | Reparse ms | ALE serializado (bytes) |
|---:|---:|---:|---:|---:|
| 1.027 | 0,31 | 0,06 | 0,20 | 1.026 |
| 10.244 | 5,02 | 0,84 | 2,42 | 10.243 |
| 102.401 | 27,82 | 4,59 | 25,26 | 102.400 |
| 1.048.580 | 251,68 | 50,25 | 171,51 | 1.048.579 |

El parser y serializador siguen siendo recursivos y no definen límites públicos para profundidad, bytes o propiedades. Entradas más profundas o grandes pueden consumir recursos o agotar la pila. Las campañas finitas no demuestran resistencia ante atacantes. Las claves __proto__, constructor y prototype se prueban como propiedades propias; no se observaron mutaciones globales.

Validación final:

- npm test: 81 aprobadas, 0 fallidas, 0 pendientes/skips.
- Current: cuatro semillas (1243488294, 1, 3735928559, 8675309), 10.000 valores × siete opciones cada una: 280.000 round-trips, cero fallos.
- Next: semilla 6234150, 10.000 × siete: 70.000 round-trips, cero fallos; 3.612 casos de profundidad.
- Números current: 99.937 patrones finitos binary64, cero fallos.
- Números next: 100.000 valores exactos con Object.is y estabilidad canónica, cero fallos.
- Robustez: 3.612 round-trips de profundidad actual y 1.000 entradas fuzz por dialecto.
- git diff --check y node --check de los archivos JavaScript modificados: pasaron.

## Pendientes y recomendación para ALE-5H

1. La gramática de tablas y continuaciones aún depende de contexto e indentación; EBNF no equivale a una PEG ejecutable. No inferir reglas donde la implementación no decide uniformemente.
2. La migración requiere dialecto fuente explícito; legacy puede perder datos antes de migrar.
3. Versionar por separado fixtures del dialecto next antes de promoverlo.
4. Evaluar límites configurables o parseo iterativo en otra fase; no añadir límites públicos en ALE-5G.
5. Repetir fuzz bajo carga controlada y revisar entradas de máximo tamaño/profundidad en proceso aislado.
6. Antes de publicar, congelar fixtures, comprobarlos con una segunda implementación independiente y decidir el estado futuro de next. ALE-5G no publica ni cambia versión/default.
