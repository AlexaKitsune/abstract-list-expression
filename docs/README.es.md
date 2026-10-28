# ALE — Abstract List Expression

**Idioma:** Español · [English](../README.md)

ALE es un formato de texto legible para representar datos estructurados. El paquete de JavaScript proporciona parseALE() y stringifyALE() para leer y escribir objetos, arrays, strings, números finitos, booleanos y null.

ALE combina objetos implícitos, arrays indentados, tablas compactas y formas explícitas de bloque. El parser solo procesa datos: no evalúa expresiones ni ejecuta la entrada. Consulta la [especificación del lenguaje](specification.md) para el contrato completo y la [colección de ejemplos validados](examples.md).

## Objetivos y diseño

- Mantener legibles los datos estructurados habituales en un editor de texto.
- Ofrecer representaciones compactas para registros repetidos mediante tablas.
- Hacer determinista el parseo para un dialecto y documento determinados.
- Preservar los tipos de datos JSON y el orden de arrays en los round-trips soportados.
- Mantener una sintaxis de datos, sin expresiones ni código ejecutable.

Algunas formas de bloque infieren si el contenido representa un objeto o un array. Usa la forma explícita []: cuando quieras declarar directamente los límites de un array. ALE busca una salida compacta, pero el tamaño y el conteo de tokens dependen de los datos, el dialecto, las opciones del serializador, el tokenizador y la implementación del formato comparado.

## Instalación y requisitos

~~~sh
npm install @alexa.kitsune/ale
~~~

ALE 0.1.0 está publicado en npm. El paquete declara Node.js >=22.0.0; Node.js 22.23.4 se verificó durante la validación del release. Node 22.0.0 no se probó directamente. La interfaz soportada es ESM. Usa sentencias import; CommonJS no es una interfaz soportada.

## Inicio rápido

~~~js
import { parseALE, stringifyALE } from "@alexa.kitsune/ale";

const value = parseALE("name: Ada\nactive: true");
// { name: "Ada", active: true }

const source = stringifyALE({ name: "Ada", active: true });
console.log(source);
~~~

parseALE(source, options) devuelve un valor JavaScript. Si el documento no es válido, lanza un Error cuyo name es ALEParseError; la clase de error no se exporta. stringifyALE(value, options) devuelve texto ALE canónico para el dialecto y las opciones seleccionadas.

## Primer documento

Un objeto ALE suele escribirse como una entrada key: value por línea. Los valores pueden ser escalares, arrays inline o bloques indentados.

<!-- ale-example {"id":"readme-overview","grammar":"current","expected":{"name":"Alexa","age":28,"characters":[{"id":1,"name":"Eleanor"},{"id":2,"name":"Swifty"}],"mixedArray":[1,[1,2],{"id":1,"name":"Booker"},{"id":0,"name":"Alexa"},[{"name":"Alexa","age":28},{"name":"Booker","age":null}]]}} -->
### ALE

~~~ale
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

### JSON equivalente

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

La tabla characters{id, name}: crea un array de objetos. [{name, age}]: hace que la tabla anónima completa sea un elemento del array anidado. La celda vacía de la última fila significa null.

## Objetos, arrays y valores

### Objetos

Las entradas de objeto son implícitas; no se necesitan llaves para un objeto ordinario:

<!-- ale-example {"id":"readme-user-object","grammar":"current","expected":{"user":{"name":"Ada","active":true}}} -->
~~~ale
user:
    name: Ada
    active: true
~~~

El resultado es { "user": { "name": "Ada", "active": true } }. Un objeto vacío se escribe {}.

### Arrays inline y por bloque

Los arrays cortos de escalares pueden escribirse inline:

<!-- ale-example {"id":"readme-inline-array","grammar":"current","expected":{"colors":["red","green","blue"]}} -->
~~~ale
colors: [red, green, blue]
~~~

Usa []: para declarar explícitamente un bloque de array. Cada elemento hijo comienza en su propia línea indentada; los bloques anidados conservan su indentación:

<!-- ale-example {"id":"readme-explicit-array","grammar":"current","expected":{"values":[1,[2,3],[4,5]]}} -->
~~~ale
values: []:
    1
    [2, 3]
    []:
        4
        5
~~~

El valor es [1, [2, 3], [4, 5]]. Un bloque []: explícito debe contener una línea hija. Usa [] para un array vacío, incluso en la raíz del documento.

ALE también acepta arrays inferidos heredados: por ejemplo, items: seguido de elementos indentados. Como el tipo de bloque se infiere a partir del contenido y el contexto, prefiere []: cuando el límite del array deba quedar explícito.

### Tablas

Las tablas son una forma compacta de escribir arrays de objetos con un conjunto común de columnas:

<!-- ale-example {"id":"readme-table","grammar":"current","expected":{"users":[{"id":1,"name":"Ada","active":true},{"id":2,"name":"Lin","active":false}]}} -->
~~~ale
users{id, name, active}:
    1, Ada, ¡
    2, Lin, !
~~~

Equivale a [{ "id": 1, "name": "Ada", "active": true }, { "id": 2, "name": "Lin", "active": false }]. Las celdas corresponden a columnas por posición. Las celdas vacías o con - significan null; las celdas finales omitidas también significan null. current y next rechazan filas con demasiadas celdas y encabezados con nombres de columna decodificados duplicados. El serializador utiliza tablas solo cuando puede conservar el valor reversiblemente; si no, escribe bloques ordinarios.

### Booleanos, null y strings

Usa true y false para booleanos explícitos, o ¡flag y !flag como atajos compactos de objeto (true y false, respectivamente). En celdas tabulares, ¡ y ! solos son valores booleanos. El token nulo es -; una clave sin bloque hijo, por ejemplo middle:, también es null. La palabra null escrita sola es un string.

Los strings simples pueden escribirse sin comillas. Usa comillas cuando puedan confundirse con valores tipados o sintaxis estructural, o cuando deban conservar espacios iniciales/finales. El serializador entrecomilla los strings ambiguos para el dialecto elegido.

<!-- ale-example {"id":"readme-quoted-strings","grammar":"current","expected":{"truth":"true","amount":"123","dash":"-","message":"Hello, \"Ada\"!\nWelcome."}} -->
~~~ale
truth: "true"
amount: "123"
dash: "-"
message: "Hello, \"Ada\"!\nWelcome."
~~~

current y next reconocen los escapes \", \\, \n, \r, \t, \, y \uXXXX. Los escapes desconocidos o incompletos son errores en esos dialectos. legacy conserva un manejo histórico más permisivo.

## Arrays anidados, objetos hermanos y tablas

Las propiedades consecutivas al mismo nivel de indentación de un elemento de array forman un objeto. > inicia el siguiente objeto hermano:

<!-- ale-example {"id":"readme-object-siblings","grammar":"current","expected":{"people":[{"id":1,"name":"Booker"},{"id":2,"name":"Alexa"}]}} -->
~~~ale
people: []:
    id: 1
    name: Booker
    >id: 2
    name: Alexa
~~~

El valor es [{ "id": 1, "name": "Booker" }, { "id": 2, "name": "Alexa" }]. La forma explícita >: puede iniciar un objeto elemento con un cuerpo indentado.

Una tabla anónima {columns}: produce un array de objetos por fila. Envuélvela en [{columns}]: si quieres que ese array completo sea un elemento del array contenedor. Usa ...{columns}: para expandir sus filas directamente dentro del array contenedor:

<!-- ale-example {"id":"readme-spread-and-anonymous-table","grammar":"current","expected":{"items":[[{"id":1},{"id":2}],{"id":3},{"id":4}]}} -->
~~~ale
items: []:
    [{id}]:
        1
        2
    ...{id}:
        3
        4
~~~

El resultado es [[{ "id": 1 }, { "id": 2 }], { "id": 3 }, { "id": 4 }]. El wrapper conserva un array anidado; spread añade cada fila como hermana.

## Slots, placeholders y continuaciones

La celda [:] es un placeholder de slot cuyo valor es un array. Una celda como {kind} es un placeholder de tabla. Las líneas de continuación indentadas completan el placeholder activo. <name selecciona un placeholder por el nombre de su columna declarada; < avanza al siguiente placeholder. Una continuación compacta como <declination, 80 avanza un placeholder y procesa el texto separado por comas como una fila cuyo primer valor es declination; no selecciona un placeholder llamado declination. Un valor único como <alpha es un selector, no una fila compacta.

<!-- ale-example {"id":"readme-slots","grammar":"current","expected":{"languages":[{"name":"german","notes":[{"word":"fuchs"}],"easy":[{"aspect":"declination","score":80},{"aspect":"pronunciation","score":90}]}]}} -->
~~~ale
languages{name, notes, easy}:
    german, [:], {aspect, score}
        word: fuchs
        <easy
        declination, 80
        pronunciation, 90
~~~

En este ejemplo, notes es un slot que contiene un objeto, mientras easy es un array de registros {aspect, score}. El contenido de los slots sigue la interpretación escalar y de objetos de ALE: true, - o un decimal sin comillas se convierten a sus tipos. La gramática de continuaciones depende del contexto; consulta la [especificación](specification.md#13-slots-placeholders-selectores-y-continuaciones) para las reglas y límites exactos.

## Dialectos

Selecciona el mismo valor de grammar al parsear y serializar.

| Dialecto | Estado | Valor bare 1e3 |
| --- | --- | --- |
| current | Predeterminado y recomendado | String |
| legacy | Modo de compatibilidad histórica | String, con diferencias antiguas en raíces, escapes, tablas y validación |
| next | Experimental y optativo | Número 1000 |

Por ejemplo, value: 1e3 es un string en current/legacy y el número 1000 en next. En next, el string debe escribirse "1e3". current y legacy deben seguir seleccionados para leer documentos escritos en esos dialectos; el documento por sí solo no siempre permite saber qué significado se pretendía.

~~~js
const n = parseALE("value: 1E+3", { grammar: "next" });
const canonical = stringifyALE(n, { grammar: "next" }); // value: 1000

const source = stringifyALE({ label: "1e3", amount: 1e-7 }, { grammar: "next" });
const restored = parseALE(source, { grammar: "next" });
~~~

El dialecto next utiliza la forma decimal más corta de ECMAScript que permite recuperar el mismo número finito y preserva -0. Rechaza el desbordamiento y los literales no nulos que se redondean a cero por subdesbordamiento. current y legacy conservan su gramática decimal y no interpretan exponentes como números.

## Opciones del serializador

stringifyALE(value, options) admite:

| Opción | Predeterminado | Propósito |
| --- | --- | --- |
| grammar | "current" | Selecciona current, legacy o next |
| indent | cuatro espacios | Indentación utilizada en los bloques anidados |
| useTables | true | Permite generar tablas automáticas reversibles |
| useSpread | true | Permite expansiones para secuencias elegibles de objetos |
| booleanShortcuts | true | Emite atajos compactos de booleanos |
| inlineArrayMax | 6 | Longitud máxima para arrays escalares inline |

Estas opciones eligen la representación textual; las pruebas verifican que no cambien los valores dentro del dominio round-trip soportado de current/next. legacy tiene excepciones de compatibilidad. Un nombre de grammar desconocido lanza TypeError. No se validan exhaustivamente los demás tipos y rangos de opciones; pueden causar errores ordinarios de JavaScript.

## Salida canónica y round-trip

stringifyALE() produce texto canónico relativo al dialecto y a las opciones. No conserva comentarios, quoting original, espacios ni disposición del documento fuente. Para los valores JSON soportados, se busca esta propiedad:

~~~js
parseALE(stringifyALE(value)) // estructuralmente igual a value
~~~

Se incluyen el orden de arrays, las propiedades propias enumerables con claves string, null, números finitos y cero negativo. La propiedad se prueba extensamente con valores conformes, generados y profundos, pero esas campañas finitas no constituyen una demostración para todo documento o profundidad. Las opciones o el dialecto pueden cambiar el texto canónico. legacy no garantiza round-trip para toda estructura JSON moderna.

Los objetos de array con conjuntos diferentes de propiedades propias no se convierten automáticamente en una tabla que inventaría propiedades ausentes con valor null. current/next rechazan claves duplicadas, columnas tabulares duplicadas tras decodificarlas y celdas excedentes. legacy conserva el comportamiento de último valor y de ignorar celdas excedentes.

## Errores

current y next lanzan un error llamado ALEParseError ante documentos inválidos, incluyendo documentos vacíos, strings quoted o escapes mal formados, indentación inválida, claves/columnas duplicadas, celdas excedentes, tablas con nombre sin bloque requerido y selectores inexistentes. ALEParseError no se exporta como clase; comprueba error.name o captura el error sin depender del mensaje. Un valor grammar inválido lanza TypeError. legacy acepta intencionalmente algunas formas de escalares mal formadas que los dialectos estrictos rechazan.

## Datos soportados y limitaciones

El soporte de round-trip busca valores JavaScript con forma JSON:

- null, booleanos, strings y números IEEE-754 finitos, incluido -0;
- arrays densos, conservando su orden;
- objetos ordinarios con propiedades propias, enumerables y con claves string, incluidas __proto__, constructor y prototype.

undefined, funciones, símbolos, BigInt, NaN, infinitos, referencias circulares, arrays dispersos, prototipos personalizados, propiedades symbol/no enumerables, accessors y descriptores de propiedades quedan fuera del dominio soportado. No se especifica un máximo público de profundidad o tamaño. El parser es recursivo, por lo que una aplicación que procese documentos no confiables o muy grandes debería aplicar sus propios límites de recursos.

## Benchmarks

El repositorio contiene comparaciones reproducibles contra JSON, YAML y TOON usando un corpus fijo de 22 documentos y el tokenizador o200k_base. Los resultados dependen de la composición del corpus, las opciones del serializador, las versiones de bibliotecas/runtime y el tokenizador. No demuestran una superioridad general de ALE. Consulta los [resultados ALE-5B.1](ale-5b1-results.md) y [ALE-5F](ale-5f-results.md) para metodología, equivalencia, bytes/tokens y limitaciones.

## Conformidad, desarrollo y licencia

Los fixtures portables están en [conformance/](../conformance/README.md). Describen valores semánticos y diferencias entre dialectos sin requerir una implementación JavaScript. La suite ejecutable del repositorio también comprueba los ejemplos normativos:

~~~sh
npm test
~~~

Para contribuir, lee CONTRIBUTING.md, la [especificación completa](specification.md) y la [colección de ejemplos](examples.md). ALE se distribuye bajo la [licencia MIT](../LICENSE).
