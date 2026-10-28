# ALE — Especificación técnica del lenguaje

**Estado:** descripción normativa de current/legacy para ALE 0.1.0, contrastada con el parser, serializador y suite. El contrato se estabilizó originalmente en 0.0.2. §21 documenta el dialecto experimental optativo next, no predeterminado. Cuando la implementación no define una regla general, se indica la limitación en lugar de inferir una.

## 1. Introducción y objetivos

ALE (Abstract List Expression) es una notación textual de datos con objetos implícitos, arrays, tablas, flags booleanos y bloques con indentación. Está diseñada para que documentos típicos sean legibles y compactos. El parser es determinista para una entrada dada, pero algunas formas de bloque infieren el tipo del bloque según sus primeras líneas; por tanto, la afirmación del README de que el formato no usa heurísticas no describe literalmente la implementación.

El lenguaje no ejecuta expresiones ni código. El parser acepta texto y produce valores de JavaScript. El serializador produce una forma ALE canónica relativa a sus opciones; no preserva el formato exacto ni los comentarios del documento original.

## 2. Modelo de datos y dominio

El dominio de reversibilidad probado es el árbol de valores JSON formado por:

- null, booleanos, strings y números finitos de JavaScript;
- arrays densos, que conservan el orden de elementos;
- objetos cuyos miembros son propiedades propias, enumerables y con clave string.

Para este dominio, las pruebas verifican parseALE(stringifyALE(value)) mediante igualdad estructural estricta, incluidas las propiedades ausentes, los arrays ordenados y -0.

La especificación no promete round-trip para valores que no son JSON: undefined, funciones, símbolos, BigInt, NaN, Infinity, referencias circulares, arrays dispersos, prototipos personalizados, propiedades symbol/no enumerables o descriptores/accessors. El serializador puede convertir ciertos valores fuera del dominio o producir una excepción; los ciclos terminan fallando por recursión. Las claves de objeto son datos; __proto__, constructor y prototype se conservan como propiedades propias.

## 3. Estructura de documentos

En la gramática actual, un documento no puede estar vacío. Un documento de una sola línea en la raíz puede ser un escalar, un array inline, {}, [] o una línea de objeto/flag. Un documento de varias líneas se interpreta como bloque raíz. También son válidos un array raíz explícito []: con elementos y una tabla anónima raíz {columnas}:.

Las líneas vacías o compuestas solo por whitespace se ignoran. No hay sintaxis de comentarios. Un signo # dentro de un documento no inicia un comentario.

El texto de entrada se convierte primero mediante String(input ?? ""). En consecuencia, null y undefined como argumentos se convierten en documento vacío; la gramática actual lo rechaza y legacy devuelve [].

## 4. Indentación y bloques

La indentación determina el nivel estructural:

1. Se usa el primer prefijo indentado del documento para detectar la unidad de espacios; esa cantidad define un nivel.
2. También se permite indentación por tabs, donde cada tab es un nivel.
3. No se mezclan tabs y espacios. Con espacios, la cantidad de espacios de cada línea debe ser múltiplo de la unidad detectada.
4. Una dedentación cierra el bloque activo. Una indentación inesperada se rechaza en los contextos donde no hay una propiedad, elemento o continuación que la admita.
5. El contenido a la derecha pierde whitespace final; las líneas vacías se eliminan antes del parseo. Para conservar whitespace de un string, se debe usar una forma quoted.

Si no hay ninguna línea indentada, todas las líneas quedan al nivel raíz. La clasificación de un bloque implícito examina sus líneas: propiedades, flags y cabeceras de tabla con clave indican objeto; cabeceras de tabla anónima/expansión, separadores de sibling y líneas de elemento indican array. Esta regla depende del contexto y no equivale a una gramática de indentación puramente local.

## 5. Escalares

La gramática actual interpreta escalares en este orden:

| Forma | Valor |
|---|---|
| - | null |
| true / false | booleano correspondiente |
| signo opcional, dígitos y fracción decimal opcional | Number finito |
| string entre comillas | string decodificado |
| token restante | string bare con escapes procesados |

La expresión numérica implementada es un signo opcional, uno o más dígitos y una parte fraccionaria opcional formada por punto y uno o más dígitos. No incluye notación exponencial en texto. Los números de JavaScript que usan notación exponencial se expanden a decimal al serializar. Un token que no coincide con la forma decimal, como 1e3, se interpreta como string; las cadenas numéricas ambiguas se entrecomillan al serializar.

El texto null no es el token nulo: es un string bare. El token nulo explícito es -. Los números que al convertirse a Number no son finitos causan error de parseo en gramática actual.

## 6. Strings y escapes

Los strings pueden ser bare o quoted. El serializador añade comillas cuando son necesarias para conservar el tipo o evitar delimitadores estructurales: tokens tipados, whitespace inicial/final, comas, brackets, llaves, dos puntos, signos < y >, flags iniciales, comillas, barras invertidas, controles o saltos de línea.

En gramática actual, las secuencias reconocidas son:

| Escape | Carácter |
|---|---|
| barra invertida + comilla | comilla |
| dos barras invertidas | barra invertida |
| barra invertida + n | salto de línea |
| barra invertida + r | retorno de carro |
| barra invertida + t | tab |
| barra invertida + coma | coma |
| barra invertida + uXXXX | unidad UTF-16 indicada por cuatro dígitos hexadecimales |

Unicode que no requiere escape puede aparecer directamente. Los pares sustitutos aislados se escapan como unidades UTF-16. No se exige que un escape Unicode forme un par sustituto válido.

Current y next rechazan escapes desconocidos, escapes finales incompletos, escapes Unicode que no tienen cuatro hexadecimales, comillas sin cierre y delimitadores de array/objeto no balanceados en los escalares y contextos CSV. Legacy conserva su interpretación permisiva de escalares malformados fuera de rutas CSV.

Legacy usa escapes históricos más permisivos: acepta y elimina la barra de escapes desconocidos en strings quoted; no implementa \\r, \\t ni \\uXXXX como la gramática actual.

## 7. Objetos implícitos y claves

Cada línea de objeto tiene una clave, dos puntos y un valor opcional:

~~~text
clave: valor
clave:
    bloque-hijo
~~~

Las claves quoted se decodifican con las mismas reglas de escape que los strings. Una clave sin comillas se conserva como texto hasta el separador estructural. En cabeceras tabulares, las comas separan las columnas excepto dentro de comillas o estructuras anidadas.

En gramática actual, key: sin línea hija significa null. Si la línea hija es {}, un array inline o []:, ese valor de contenedor se conserva directamente. En otros casos el tipo del bloque hijo se infiere. Esta distinción hace que key: y key: seguido de un bloque no sean equivalentes.

Las propiedades se crean como propiedades propias, incluso para claves sensibles al prototipo. Las claves duplicadas se comparan después de decodificarse y se rechazan en gramática actual. En legacy gana el último valor.

## 8. Arrays inline y arrays explícitos

Un array inline usa brackets y separadores de coma:

~~~text
[1, "dos", [3, 4]]
~~~

Las comas dentro de strings quoted o arrays/llaves anidados no separan elementos de nivel superior. Los valores inline se interpretan con las reglas escalares.

En gramática actual, [] es el array vacío; {} es el objeto vacío. Ambos se admiten en raíz, como valores de propiedad y como elementos donde la forma estructural lo permite.

El bloque explícito []: declara un array cuyos elementos comienzan a una indentación hija. Acepta escalares por línea, bloques anidados, objetos implícitos, objetos explícitos >:, arrays inline, tablas anónimas, tablas como un único elemento y expansiones. []: requiere al menos una línea hija; una expansión hija puede no producir filas y dejar un array vacío.

Los bloques de array heredados se introducen mediante una propiedad key: cuyo hijo se infiere como array. El tipo se decide por las líneas del bloque según las reglas de inferencia. Para estructuras donde el tipo o el límite no sea claro, []: es la representación explícita disponible en la gramática actual.

## 9. Objetos dentro de arrays y separador >

Las propiedades consecutivas al mismo nivel de elemento forman un objeto. En un array explícito, >: inicia un objeto con bloque indentado y >key: inicia un objeto hermano con una primera propiedad compacta. En arrays heredados, > separa el objeto que se estaba formando del siguiente sibling. Un > sin contenido no agrega un elemento.

Los elementos objeto de un array pueden contener arrays u objetos como propiedades, con bloques indentados. Un bloque indentado después de un elemento escalar no tiene una interpretación general y se rechaza.

## 10. Tablas

Una tabla declara nombres de columna y después filas delimitadas por comas:

~~~text
items{id, name}:
    1, Ada
    2, Lin
~~~

Cada fila produce un objeto con una propiedad por columna. En la gramática actual:

- los nombres de columna se decodifican antes de comprobar duplicados;
- no se permiten nombres duplicados;
- cada fila puede tener menos celdas que columnas; las celdas faltantes son null;
- una celda vacía y el token - significan null;
- se rechazan filas con más celdas que columnas;
- los valores de celda aceptan escalares, arrays inline, flags true/false y placeholders [:] o {columnas} con continuación.

Una tabla con nombre, como items{a, b}:, necesita un bloque de filas indentado. Sin bloque es inválida. El serializador automático solo selecciona tabla cuando puede representar de manera reversible el conjunto de propiedades y los valores de las celdas; las formas compuestas no compatibles usan objetos/arrays por bloques. No convierte objetos o arrays en strings JSON para llenar una celda.

## 11. Tablas anónimas, anidadas y expansiones

{columnas}: es una tabla anónima. En raíz actual, sin filas produce []. Dentro de un array o slot, puede producir un array vacío como elemento. [{columnas}]: significa que el array de filas completo es un solo elemento del array contenedor. Un encabezado anónimo sin filas que aparece como elemento anidado conserva, por tanto, un nivel de array adicional según su forma.

...{columnas}: expande las filas directamente dentro del array contenedor: no agrega un array anidado. Sin filas, no añade elementos. En los contextos que requieren un hijo para continuar el parseo, la expansión vacía es válida si la propia línea de expansión existe como hija.

Las filas deben pertenecer al bloque indentado de la tabla en la gramática actual. Legacy conserva la lectura histórica de filas no indentadas cuando su número de celdas coincide con la aridad declarada; esta compatibilidad puede consumir una línea que, en gramática actual, es un sibling.

## 12. Flags booleanos

En una línea de objeto, !clave asigna false y ¡clave asigna true. Se aceptan claves quoted. En una celda tabular, ! y ¡ representan booleanos. Los escalares true y false también se interpretan como booleanos.

stringifyALE emite flags si booleanShortcuts es true (valor predeterminado); con booleanShortcuts:false, utiliza true/false como valor explícito.

## 13. Slots, placeholders, selectores y continuaciones

[:] es un placeholder de tipo slot y el valor resultante es un array. Como propiedad sin continuación, representa []. Como celda de tabla, declara un placeholder que se rellena con las líneas de continuación.

Una celda {a, b} en una fila declara un placeholder de tabla con esas columnas. El parser conserva el índice del placeholder activo, que comienza en el primero de la fila.

En una continuación de tabla actual:

- < avanza al siguiente placeholder sin añadir valor.
- <nombre selecciona el placeholder cuya columna se llama nombre; el nombre quoted se decodifica.
- <valor1, valor2 avanza al siguiente placeholder de tabla y procesa esa misma línea como una fila compacta. Debe haber una coma de nivel superior para que sea fila; <alpha se clasifica como selector, no como fila compacta.
- Después de una selección, las líneas siguientes se leen para el placeholder activo hasta que termina el bloque de continuación o cambia el selector.
- Si no hay placeholder con el nombre seleccionado, se produce error.

En una fila compacta de tabla de una columna, usar < para seleccionar/avanzar y escribir la fila en la siguiente línea. Una forma <alpha no es fila compacta. La forma compacta documentada es útil cuando existe una coma de nivel superior y el placeholder activo es una tabla.

Los slots también aceptan strings libres, objetos implícitos, arrays, tablas y expansiones según las rutas implementadas. El texto libre no siempre es string: sigue la interpretación escalar ordinaria; por ejemplo true, - y números decimales se convierten a sus tipos correspondientes. Esto contradice la afirmación del README de que todo texto libre del slot se agrega como string.

Las rutas de continuación de un placeholder de tabla anidado tienen límites: placeholders compuestos dentro de continuaciones de tabla no admiten todas las combinaciones de continuaciones arbitrariamente profundas. El serializador evita automáticamente las tablas que no puede escribir reversiblemente.

## 14. Contenedores vacíos y nulos

| Forma | Resultado actual |
|---|---|
| {} | objeto vacío |
| [] | array vacío |
| - | null |
| clave: sin bloque hijo | null |
| clave: {} | objeto vacío |
| clave: [] | array vacío |
| clave: []: con bloque hijo | array de bloque |
| clave: [:] sin continuación | array vacío |

El documento vacío se rechaza en gramática actual. En legacy, el documento vacío produce []. La ausencia de propiedad en un objeto no equivale a una propiedad presente con null; las tablas crean sus propiedades para cada columna, completando celdas faltantes con null.

El serializador emite arrays vacíos como [] y objetos vacíos como {}. No emite una tabla de cero filas como representación automática de un array vacío.

## 15. Gramática formal

La gramática siguiente describe los tokens y las formas principales. No basta por sí sola para implementar el parser: la clasificación de bloques, el cierre por indentación y las continuaciones se expresan en las restricciones semánticas posteriores.

### 15.1 Léxico

~~~ebnf
document          = current-document | legacy-document ;
current-document  = root ;
legacy-document   = root ;
line              = indentation, content ;
indentation       = { indent-unit } ;
indent-unit       = " " { " " } | tab ;
tab               = ? U+0009 ? ;

quoted-string     = quote, { quoted-char | escape }, quote ;
escape            = backslash, ( quote | backslash | "n" | "r" | "t" | ","
                  | "u", hex, hex, hex, hex ) ;
quote             = ? U+0022, comilla doble ? ;
backslash         = ? U+005C ? ;
quoted-char       = ? cualquier carácter salvo quote, backslash y salto de línea ? ;
hex               = digit | "a"…"f" | "A"…"F" ;
digit             = "0"…"9" ;
number            = [ sign ], digit, { digit }, [ ".", digit, { digit } ] ;
sign              = "+" | "-" ;
boolean           = "true" | "false" ;
null-token        = "-" ;

key               = quoted-string | bare-key ;
scalar            = null-token | boolean | number | quoted-string | bare-scalar ;
csv-list          = [ csv-item ], { ",", [ csv-item ] } ;
bare-key          = ? texto de clave recortado antes del delimitador superior ? ;
bare-scalar       = ? token residual recortado tras la clasificación estructural ? ;
csv-item          = scalar | table-placeholder ;
~~~

Las producciones con ? ... ? son clases léxicas descriptivas, no expresiones regulares completas. Las reglas root/inferred-block no son disjuntas: el parser resuelve la forma con el contexto, las primeras líneas e indentación descritos en §4 y §15.3. En filas y arrays inline, la coma de nivel superior separa campos; las comas escapadas, quoted o anidadas no lo hacen. Las palabras entre comillas se decodifican antes de compararlas como claves.

### 15.2 Formas estructurales

~~~ebnf
object-entry      = flag | key, ":", [ inline-value | child-block ] ;
flag              = "!", key | "¡", key ;
inline-value      = scalar | inline-array | empty-object | slot-marker ;
inline-array      = "[", [ csv-list ], "]" ;
empty-object      = "{}" ;
slot-marker       = "[:]" ;

keyed-table       = key, "{", column-list, "}:", indented-rows ;
anonymous-table   = "{", column-list, "}:", [ indented-rows ] ;
array-table-item  = "[{", column-list, "}]:", [ indented-rows ] ;
spread-table      = "...{", column-list, "}:", [ indented-rows ] ;
table-placeholder = "{", column-list, "}" ;
column-list       = key, { ",", key } ;
table-row         = table-cell, { ",", table-cell } ;
table-cell        = [ csv-item ] | "!" | "¡" ;

explicit-array    = "[]:", indented-elements ;
explicit-object   = ">:", indented-object ;
sibling-object    = ">", object-entry ;
selector-next     = "<" ;
selector-name     = "<", key ;
selector-row      = "<", csv-list ;
indented-rows     = row-line, { row-line } ;
row-line          = indentation, table-row ;
indented-elements = element-line, { element-line } ;
element-line      = indentation, array-element ;
array-element     = scalar | inline-array | empty-object | slot-marker | object-entry
                  | explicit-array | anonymous-table | array-table-item
                  | spread-table ;
indented-object   = object-entry, { object-entry } ;
root              = scalar | inline-array | empty-object | slot-marker | explicit-array
                  | anonymous-table | object-entry | flag | inferred-block ;
inferred-block    = indented-object | indented-elements ;
~~~

### 15.3 Restricciones dependientes de indentación

1. Una línea hija pertenece al bloque activo cuando su nivel es mayor que el del encabezado. La dedentación termina ese bloque.
2. Las filas tabulares actuales deben estar al nivel de fila indentado declarado por la cabecera; no se incorporan por coincidencia de aridad a la misma indentación.
3. En bloques inferidos, las primeras líneas del bloque determinan si se construye objeto o array según las reglas de §4. []: elimina esa inferencia para declarar un array.
4. Propiedades de un objeto implícito de array se agrupan hasta un separador >, un elemento no-property o el cierre del bloque.
5. La continuación se asocia al placeholder activo de la fila de tabla. Los selectores alteran ese estado; la indentación y una coma de nivel superior distinguen selector de fila compacta.

### 15.4 Restricciones semánticas

- En current, claves propias repetidas y columnas repetidas se rechazan después de decodificarse. Legacy conserva último valor gana.
- En current, filas con celdas excedentes se rechazan. Legacy ignora las celdas excedentes.
- Celdas faltantes y celdas vacías son null.
- Un keyed-table sin bloque de filas es inválido; una tabla anónima puede estar vacía.
- Un explicit-array debe tener al menos una línea hija; la expansión hija puede producir cero elementos.
- Los marcadores de tabla y slot son placeholders de fila, no valores objeto inline.
- El número debe ser finito al convertirse a Number. En current y legacy la notación exponencial no forma parte de la gramática numérica textual; véase el dialecto experimental next en §21.

### 15.5 Construcciones legacy

Legacy no es una gramática paralela completa; es un modo de compatibilidad que cambia reglas concretas. En particular, altera raíces escalares/vacías, escapes, interpretación de []:, filas tabulares no indentadas, duplicados y celdas excedentes. Véase §18.

## 16. Errores sintácticos y validación

Los errores detectados por el parser se lanzan como objetos Error cuyo name es ALEParseError. El constructor no se exporta y los mensajes contienen números de línea en varias rutas; ni el texto del mensaje ni su formato se consideran API estable.

En current y next se produce ALEParseError, entre otros casos, por documento vacío, indentación mezclada o no múltiplo de unidad, bloque explícito []: sin hijo, tabla con clave sin bloque, clave/columna duplicada, celdas excedentes, selector inexistente, escape desconocido/incompleto, Unicode inválido, comillas sin cerrar, delimitadores no balanceados y contenido estructural incompatible con el contexto. En next también se rechazan exponentes incompletos, overflow y underflow no nulo a cero. Legacy conserva algunas aceptaciones malformadas y diferencias de validación históricas.

Los errores se verifican por el tipo ALEParseError, no por coincidencia exacta del mensaje.

Una opción grammar desconocida produce TypeError, no ALEParseError. parseALE y stringifyALE aceptan current, legacy y next; current sigue siendo el valor predeterminado. Otros errores internos de JavaScript no se prometen como errores sintácticos controlados.

## 17. Serialización reversible y opciones

stringifyALE(value, options) acepta estas opciones:

| Opción | Predeterminado | Efecto |
|---|---:|---|
| indent | cuatro espacios | texto usado por cada nivel |
| useTables | true | permite tablas automáticas |
| useSpread | true | permite expansión de grupos de objetos |
| booleanShortcuts | true | emite flags booleanos |
| inlineArrayMax | 6 | máximo de escalares para array inline |
| grammar | current | dialecto de escalares: current, legacy o next; next es experimental |

Las opciones cambian la representación, no deben cambiar el valor obtenido para el dominio probado. No hay validación exhaustiva de tipos/rangos para options; opciones mal tipadas pueden provocar errores de JavaScript.

El serializador prefiere arrays inline escalares cortos; de otro modo usa tabla homogénea cuando puede hacerlo reversiblemente, o bloque []: para arrays. La expansión se usa para corridas de al menos dos objetos con el mismo conjunto de claves y valores escalares. Los objetos mantienen las claves propias enumerables que devuelve Object.keys. null se representa con - o celda vacía; una propiedad null aislada puede escribirse como clave: sin bloque.

La evidencia generativa es amplia pero finita: cuatro semillas de 10.000 valores y siete matrices de opciones, además de 3.612 casos de profundidad hasta 32. Esto no constituye demostración formal para toda profundidad, todo documento o valores ajenos al dominio JSON.

## 18. Compatibilidad actual y legacy

| Tema | Actual | Legacy |
|---|---|---|
| Documento vacío | error | [] |
| Escalar único en raíz | valor escalar | normalmente array raíz con el escalar |
| {} y [] en raíz | objeto/array vacíos | {} es string en array; [] es array dentro de array |
| []: | array explícito; requiere hijo | se trata según la gramática antigua, normalmente como string |
| Escapes | conjunto definido; desconocidos rechazados | escapes históricos permisivos |
| Filas de tabla | filas dentro del bloque indentado | puede asociar filas sin indentación adicional por aridad |
| Claves repetidas | error | último valor gana |
| Columnas repetidas | error | último valor de columna homónima gana |
| Celdas excedentes | error | se ignoran |
| Tabla anónima raíz vacía | [] | [[]] |
| Tabla con clave sin filas | error | error |

Ejemplo de migración de tabla por aridad: una fila escrita al mismo nivel que {a,b}: puede ser consumida por legacy si coincide el número de celdas. En actual, debe indentarse bajo la tabla; si se pretendía un sibling string, se debe escribir como string y mantenerlo fuera del bloque. La migración debe comprobar el valor estructural con ambas gramáticas; no se puede inferir la intención original en todos los casos.

## 19. Limitaciones conocidas

1. La gramática no está formalizada como una PEG completa dentro del parser; el EBNF de §15 requiere las restricciones de indentación e inferencia.
2. El parser y serializador son recursivos y no definen límites configurables de profundidad, bytes o propiedades.
3. En current y legacy la notación numérica textual exponencial no está soportada directamente; el serializador predeterminado expande números finitos de JavaScript. next sí acepta exponentes (§21).
4. Continuaciones arbitrariamente anidadas de placeholders de tablas no tienen una representación tabular general; el serializador usa bloques cuando detecta casos no reversibles.
5. Una tabla anónima vacía no tiene la misma forma estructural en todos los contextos: puede representar [] o un array vacío como elemento anidado; legacy también difiere en raíz.
6. Duplicados y celdas excedentes difieren deliberadamente entre current/next y legacy.
7. No se preservan comentarios, estilo de quoting, espacios no citados finales, prototipos, propiedades no enumerables ni representación textual original.

## 20. Auditoría de correspondencia documental

La especificación se basa en ale.js y en tests/conformance.test.js, tests/generative.test.js, tests/robustness.test.js y tests/ale-4d.test.js. Los ejemplos normativos de este documento se ejecutan en tests/specification.test.js.

Correspondencia revisada en ALE-5G:

- README ofrece una guía en inglés con traducción al español, alineada con parseALE/stringifyALE, el default current, los modos legacy/next, las opciones y el dominio soportado. El ejemplo principal se comprueba en current.
- La metadata del paquete declara Node >=22 y conserva la interfaz ESM; para el candidato documental 0.1.1, el README mantiene current como predeterminado y marca next como experimental. La implementación runtime sigue siendo byte idéntica a la versión publicada 0.1.0.
- El README resume slots y tablas y remite a esta especificación para la sintaxis contextual; no pretende enumerar toda la gramática en una sola precedencia léxica.
- docs/semantic-contract.md es un historial de propuestas ALE-3, no un contrato vigente; varias propuestas ya fueron aprobadas o superadas por la especificación.
- La detección de comillas/delimitadores no balanceados se corrigió en current/next durante ALE-5G. Legacy mantiene esas lecturas permisivas en escalares ordinarios.

## 21. Dialecto experimental next

next es una extensión optativa y experimental para números científicos. No es el dialecto predeterminado. parseALE(input, { grammar: "next" }) y stringifyALE(value, { grammar: "next" }) deben usarse juntos para los round-trips de exponentes. current y legacy mantienen la interpretación existente.

next admite como número una mantisa de uno o más dígitos, con parte fraccionaria opcional de punto y dígitos, seguida opcionalmente por e/E, signo opcional y uno o más dígitos de exponente. Por ejemplo, 1e3, 1E+3, -2.5e-8, 6.02e23 y 5e-324. Las formas con exponente incompleto se rechazan como ALEParseError. Los exponentes completos de overflow también se rechazan. Un literal no nulo que redondea a cero por underflow se rechaza; el cero explícito con exponente se permite. Los demás valores se convierten según el redondeo IEEE-754 de Number de JavaScript. NaN e infinitos siguen fuera del dominio.

La forma canónica next de un número finito positivo o negativo distinto de cero sigue la conversión decimal radix 10 de ECMAScript `Number::toString(x, 10)` (§6.1.6.1.20; `ToString` para Number delega en esta operación). En términos operativos, se elige una secuencia decimal de dígitos de longitud mínima cuya conversión decimal correctamente redondeada a binary64 recupera exactamente el mismo valor; ECMAScript determina el desempate y cuándo escribir la magnitud en forma fija o exponencial. Los implementadores de otros lenguajes deben reproducir esa salida especificada por ECMAScript, no asumir que el `toString` propio del runtime tiene los mismos umbrales. ALE conserva `-0` como excepción explícita, porque la conversión ECMAScript de ambos ceros produce `0`. Así 1e3 se vuelve 1000; 1e-7 conserva forma exponencial. La ortografía original no se conserva. [ECMAScript 2024, §6.1.6.1.20](https://tc39.es/ecma262/2024/multipage/ecmascript-data-types-and-values.html#sec-numeric-types-number-tostring).

Los strings que coincidan con la gramática exponencial se entrecomillan en next. Esto distingue un número de la cadena con los mismos caracteres. En current y legacy, los exponentes bare siguen siendo strings y el serializador de esos dialectos conserva sus reglas existentes.

<!-- conformance: next-scientific-number grammar=next -->
~~~ale
value: 1E+3
tiny: 5e-324
text: "1e3"
~~~
~~~json
{"value":1000,"tiny":5e-324,"text":"1e3"}
~~~

<!-- conformance: next-scientific-negative grammar=next -->
~~~ale
items: [1e3,-2.5e-8]
~~~
~~~json
{"items":[1000,-2.5e-8]}
~~~

La conformidad del signo de -0 se prueba con Object.is en tests/ale-5f.test.js. Este dialecto no cambia la semántica current/legacy de §18. README resume next como dialecto experimental. Los casos de overflow y underflow se prueban con errores controlados en la suite experimental.
- docs/ale-4a-results.md y docs/ale-4c-robustness.md son informes históricos anteriores a correcciones posteriores. ALE-4D rectifica que la diferencia descrita como null → {} no era una muestra mínima literal.
- README enlaza informes de benchmark con corpus, versiones y tokenizador documentados. Esos resultados son mediciones de los corpus citados, no propiedades normativas del lenguaje ni afirmaciones de superioridad general.

## 22. Cuestiones abiertas para una revisión futura

- Ampliar la cobertura para comprobar el rechazo de comillas sin cierre en todos los contextos escalares y estructurales; las pruebas actuales cubren los casos representativos de propiedades y delimitadores, mientras legacy conserva entradas permisivas.
- Definir si la forma textual exponencial debe seguir siendo string o convertirse en número mediante una futura versión.
- Considerar una gramática PEG completa que exprese de forma precisa los límites de contexto y continuación, sin cambiar el parser en esta fase.
- Definir límites de recursos y errores controlados para entradas extremadamente profundas/grandes.
- Actualizar el README solo en una fase autorizada y separar la documentación del dialecto actual de la descripción de legacy.

## 23. Ejemplos normativos ejecutables

Los pares marcados con conformance se verifican automáticamente contra parseALE y su JSON esperado en tests/specification.test.js. Los pares con grammar=legacy verifican compatibilidad heredada y no son sintaxis normativa del dialecto actual.

<!-- conformance: null-root -->
~~~ale
-
~~~
~~~json
null
~~~

<!-- conformance: object-scalars-flags -->
~~~ale
id: 7
name: Ada
active: true
!archived
tags: [math, logic]
~~~
~~~json
{
  "id": 7,
  "name": "Ada",
  "active": true,
  "archived": false,
  "tags": ["math", "logic"]
}
~~~

<!-- conformance: quoted-escapes -->
~~~ale
text: "line\nbreak, \"quoted\""
~~~
~~~json
{"text":"line\nbreak, \"quoted\""}
~~~

<!-- conformance: empty-containers-and-null -->
~~~ale
object: {}
array: []
missing:
explicitNull: -
~~~
~~~json
{
  "object": {},
  "array": [],
  "missing": null,
  "explicitNull": null
}
~~~

<!-- conformance: explicit-array -->
~~~ale
items: []:
    1
    []:
        2
        3
    >:
        named: value
~~~
~~~json
{"items":[1,[2,3],{"named":"value"}]}
~~~

<!-- conformance: keyed-table -->
~~~ale
users{id, name}:
    1, Ada
    2, -
~~~
~~~json
{"users":[{"id":1,"name":"Ada"},{"id":2,"name":null}]}
~~~

<!-- conformance: anonymous-root-table -->
~~~ale
{name, age}:
    Ada, 37
~~~
~~~json
[{"name":"Ada","age":37}]
~~~

<!-- conformance: array-table-and-spread -->
~~~ale
items: []:
    [{id}]:
        1
    ...{id}:
        2
        3
~~~
~~~json
{"items":[[{"id":1}],{"id":2},{"id":3}]}
~~~

<!-- conformance: slots-and-selectors -->
~~~ale
rows{notes, details}:
    [:], {kind}
        first
        <details
        one
~~~
~~~json
{"rows":[{"notes":["first"],"details":[{"kind":"one"}]}]}
~~~

<!-- conformance: special-keys -->
~~~ale
__proto__: data
constructor: value
prototype: own
~~~
~~~json
{"__proto__":"data","constructor":"value","prototype":"own"}
~~~

<!-- conformance: table-null-cells -->
~~~ale
items{a, b}:
    1
    , two
~~~
~~~json
{"items":[{"a":1,"b":null},{"a":null,"b":"two"}]}
~~~

<!-- conformance: legacy-root-scalar grammar=legacy -->
~~~ale
123
~~~
~~~json
[123]
~~~

<!-- conformance: legacy-empty-anonymous-table grammar=legacy -->
~~~ale
{a, b}:
~~~
~~~json
[[]]
~~~

<!-- conformance: legacy-duplicate-keys grammar=legacy -->
~~~ale
a: first
a: last
~~~
~~~json
{"a":"last"}
~~~

### Ejemplos inválidos en gramática actual

Estos documentos deben producir ALEParseError. Se verifican desde el propio documento en tests/specification.test.js.

<!-- invalid: empty-document -->
~~~ale

~~~

<!-- invalid: duplicate-decoded-key -->
~~~ale
a: first
"a": last
~~~

<!-- invalid: duplicate-decoded-table-column -->
~~~ale
items{"a", a}:
    first, last
~~~

<!-- invalid: excess-table-cell -->
~~~ale
items{a, b}:
    one, two, extra
~~~

<!-- invalid: named-table-without-rows -->
~~~ale
items{a, b}:
~~~

<!-- invalid: explicit-array-without-child -->
~~~ale
items: []:
~~~

<!-- invalid: unknown-escape -->
~~~ale
value: "\q"
~~~

<!-- invalid: unclosed-quoted-scalar -->
~~~ale
value: "unterminated
~~~

<!-- invalid: unclosed-inline-array -->
~~~ale
value: [1, 2
~~~

<!-- invalid: unknown-placeholder-selector -->
~~~ale
items{notes, stats}:
    [:], {kind}
        <missing
~~~
