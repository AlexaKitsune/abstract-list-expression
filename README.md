# ALE — Abstract List Expression

ALE es un formato de texto para representar valores estructurados. La implementación JavaScript expone parseALE() y stringifyALE(). El dialecto predeterminado es current; next es experimental y legacy permite leer documentos históricos.

ALE admite objetos, arrays, strings, números finitos JavaScript, booleanos y null. No ejecuta código. La especificación técnica completa está en docs/specification.md.

## Instalación

~~~sh
npm install @alexa.kitsune/ale
~~~

El runtime mínimo declarado es Node.js 22.0.0. La versión concreta verificada para este candidato es Node.js 22.23.4; no se probó Node 22.0.0. La interfaz soportada es ESM.

## Uso

~~~js
import { parseALE, stringifyALE } from "@alexa.kitsune/ale";

const value = parseALE("name: Ada\nactive: true");
const source = stringifyALE(value);
~~~

La interfaz publicada es ESM. El paquete exporta parseALE y stringifyALE. parseALE(source, options) devuelve el valor JavaScript o lanza un Error cuyo name es ALEParseError si la entrada viola el dialecto elegido; no se exporta una clase ALEParseError para comprobaciones instanceof. stringifyALE(value, options) produce una representación canónica relativa al dialecto y las opciones. CommonJS no es una interfaz declarada, aunque ciertos Node recientes puedan cargar módulos ESM síncronos mediante require().

El paquete se distribuye bajo la licencia MIT; consulta LICENSE.

## Ejemplo ALE

### ALE
~~~
name: Alexa
age: 28
characters{id, name}:
    1, Eleanor
    2, Swifty
mixedArray:
    1
    [1, 2]
    id: 1
    name: Booker
    >id: 0
    name: Alexa
    [{name, age}]:
        Alexa, 28
        Booker,
~~~

Equivale a este valor:

~~~json
{
  "name": "Alexa",
  "age": 28,
  "characters": [
    { "id": 1, "name": "Eleanor" },
    { "id": 2, "name": "Swifty" }
  ],
  "mixedArray": [
    1,
    [1, 2],
    { "id": 1, "name": "Booker" },
    { "id": 0, "name": "Alexa" },
    [
      { "name": "Alexa", "age": 28 },
      { "name": "Booker", "age": null }
    ]
  ]
}
~~~

## Sintaxis básica

~~~text
name: Ada
enabled: true
missing: -
tags: [fox, red]
items: []:
    1
    2
rows{id, name}:
    1, Ada
    2, Lin
~~~

Las propiedades son objetos implícitos. Los arrays pueden escribirse inline o mediante bloque explícito []. Las tablas representan filas de objetos y usan las columnas del encabezado; una celda vacía significa null. Los atajos !key y ¡key representan false y true. > separa objetos hermanos dentro de arrays. Las expansiones ...{columns}: insertan filas de tabla directamente en el array contenedor.

Los slots [:] representan arrays que se completan mediante continuación indentada. <name selecciona un placeholder por nombre; < avanza al siguiente. Las formas compactas de continuación y las reglas tabulares completas se describen en docs/specification.md.

## Dialectos

La opción grammar selecciona el dialecto del parser. También se acepta en stringifyALE para que serialización y parseo usen la misma semántica.

| Dialecto | Estado | Números exponentes bare |
| --- | --- | --- |
| current | Predeterminado | Se leen como strings; los números se escriben en decimal expandido |
| legacy | Compatibilidad histórica | Se leen como strings; conserva diferencias heredadas de raíces, escapes, tablas y validación |
| next | Experimental y optativo | Se leen como números; strings exponent-like se entrecomillan |

Por ejemplo, value: 1e3 es string en current y legacy, pero número 1000 en next. En next, el string "1e3" debe ir quoted.

~~~js
const value = parseALE("value: 1E+3", { grammar: "next" });
const canonical = stringifyALE(value, { grammar: "next" }); // value: 1000
const text = stringifyALE({ label: "1e3", amount: 1e-7 }, { grammar: "next" });
const restored = parseALE(text, { grammar: "next" });
~~~

Usa el mismo dialecto para leer el documento con que se escribió. El modo legacy conserva formas anteriores; no es un validador estricto. Su serializador también mantiene esas reglas heredadas y no garantiza round-trip para todas las estructuras JSON modernas, en particular algunas formas de arrays y objetos vacíos. Usa current (o next si necesitas exponentes) para round-trip de los valores JSON documentados.

## Opciones del serializador

| Opción | Valor predeterminado | Efecto |
| --- | --- | --- |
| grammar | current | Selecciona current, legacy o next |
| indent | cuatro espacios | Indentación por nivel |
| useTables | true | Permite seleccionar tablas |
| useSpread | true | Permite expansión de filas |
| booleanShortcuts | true | Emite flags booleanos compactos |
| inlineArrayMax | 6 | Máximo de escalares en arrays inline |

Las opciones de representación cambian el texto, no el valor para el dominio compatible de current y next. legacy puede tener excepciones de reversibilidad por compatibilidad histórica. Una opción grammar desconocida produce TypeError.

## Strings, números y valores

Los strings ambiguos o con delimitadores se entrecomillan. Se admiten escapes para comilla, barra invertida, salto de línea, retorno de carro, tabulación, coma y unidades Unicode de cuatro hexadecimales; la gramática actual rechaza escapes desconocidos. next entrecomilla tokens que podrían confundirse con exponentes numéricos.

El modelo numérico es number IEEE-754 finito. next usa la forma corta de ECMAScript y preserva -0. Rechaza overflow y underflow no nulo que se convierta en cero. NaN e infinitos no son valores ALE numéricos.

Claves como __proto__, constructor y prototype se conservan como propiedades propias. En current y next, claves/columnas duplicadas y celdas excedentes son errores; legacy mantiene su comportamiento histórico.

## Límites y compatibilidad

- El dominio de round-trip previsto es JSON con números finitos, incluido -0, arrays densos y objetos de propiedades propias string.
- undefined, funciones, símbolos, BigInt, referencias circulares, prototipos personalizados y propiedades no enumerables están fuera del dominio.
- El documento vacío se rechaza en current y next; legacy conserva su resultado histórico.
- Los documentos current con exponentes bare como strings deben seguir leyéndose con current. Al migrar a next, se deben entrecomillar strings exponent-like.
- No se garantizan límites públicos de profundidad, tamaño ni cantidad de propiedades.
- La especificación describe diferencias restantes entre dialectos y las reglas de tablas, slots, escapes y errores.

## Benchmarks

Las mediciones del repositorio usan un corpus determinista de 22 documentos y el tokenizador o200k_base. Los resultados dependen del corpus y las versiones de las bibliotecas; no implican superioridad general frente a JSON, YAML o TOON. Consulta docs/ale-5b1-results.md y docs/ale-5f-results.md para metodología, equivalencia y límites de las mediciones.

## Desarrollo

~~~sh
npm test
~~~

Los ejemplos normativos ejecutables y los fixtures de interoperabilidad están en docs/specification.md y conformance/.
