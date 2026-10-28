# ALE examples

These examples target ALE 0.1.1. Each complete ALE document is paired with its expected JSON value and has a stable identifier for verification. Examples marked next require the experimental dialect. Inline syntax fragments in explanations are illustrative, not standalone documents.

## 1. An implicit object

<!-- ale-example {"id":"docs-object","grammar":"current"} -->
~~~ale
name: Ada
active: true
~~~
~~~json
{"name":"Ada","active":true}
~~~

At the root, sibling key-value lines form an object. Nested objects use the same form at a deeper indentation.

## 2. Inline arrays and scalar types

<!-- ale-example {"id":"docs-inline-values","grammar":"current"} -->
~~~ale
values: [1, true, -, "123", null]
~~~
~~~json
{"values":[1,true,null,"123","null"]}
~~~

Inline arrays use commas between values. The dash is null; the quoted numeric-looking token remains a string. Bare null is also a string token in ALE.

## 3. Empty containers and absent values

<!-- ale-example {"id":"docs-empty-values","grammar":"current"} -->
~~~ale
object: {}
array: []
missing:
explicitNull: -
~~~
~~~json
{"object":{},"array":[],"missing":null,"explicitNull":null}
~~~

An empty object and an empty array have distinct markers. A property with no child block is null, just like an explicit dash.

## 4. Tables and null cells

<!-- ale-example {"id":"docs-table","grammar":"current"} -->
~~~ale
users{id, name, active}:
    1, Ada, ¡
    2, Lin, !
    3, Booker,
~~~
~~~json
{"users":[{"id":1,"name":"Ada","active":true},{"id":2,"name":"Lin","active":false},{"id":3,"name":"Booker","active":null}]}
~~~

Column names map to cells by position. The third row's last cell is empty, so its value is null.

## 5. Explicit arrays with nested values

<!-- ale-example {"id":"docs-explicit-array","grammar":"current"} -->
~~~ale
items: []:
    1
    []:
        2
        3
    >:
        label: last
~~~
~~~json
{"items":[1,[2,3],{"label":"last"}]}
~~~

The []: marker declares an array block. A nested []: is one nested array element. >: introduces an object element with its own indented entries.

## 6. Object siblings in an array

<!-- ale-example {"id":"docs-object-siblings","grammar":"current"} -->
~~~ale
people: []:
    id: 1
    name: Booker
    >id: 2
    name: Alexa
~~~
~~~json
{"people":[{"id":1,"name":"Booker"},{"id":2,"name":"Alexa"}]}
~~~

Properties are grouped into an object element. > starts the next sibling object; its text after > may provide the first property.

## 7. Anonymous table as one nested element

<!-- ale-example {"id":"docs-anonymous-table","grammar":"current"} -->
~~~ale
groups: []:
    [{name, score}]:
        Ada, 10
        Lin, 12
~~~
~~~json
{"groups":[[{"name":"Ada","score":10},{"name":"Lin","score":12}]]}
~~~

The [{columns}]: wrapper keeps the complete anonymous table as one array element, so the result has two array levels.

## 8. Spread table rows into the containing array

<!-- ale-example {"id":"docs-spread-table","grammar":"current"} -->
~~~ale
people: []:
    ...{name, age}:
        Ada, 37
        Lin,
~~~
~~~json
{"people":[{"name":"Ada","age":37},{"name":"Lin","age":null}]}
~~~

The ...{columns}: form contributes each row directly to the parent array. It does not add a nested array.

## 9. Slots, table placeholders, and selectors

<!-- ale-example {"id":"docs-slots","grammar":"current"} -->
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

[:] creates a slot array and {kind} declares a table placeholder. <details selects the placeholder by its column name. The following continuation line adds one table row.

## 10. Quoted strings and escapes

<!-- ale-example {"id":"docs-strings","grammar":"current"} -->
~~~ale
message: "Hello, \"Ada\"!\nWelcome."
tab: "left\tright"
~~~
~~~json
{"message":"Hello, \"Ada\"!\nWelcome.","tab":"left\tright"}
~~~

Quoted values preserve delimiters and whitespace. Current and next recognize the documented quote, backslash, newline, carriage return, tab, comma, and \uXXXX escapes.

## 11. Experimental scientific numbers (next)

<!-- ale-example {"id":"docs-next-numbers","grammar":"next","canonical":"number: 1000\nsmall: 1e-7\ntext: \"1e3\""} -->
~~~ale
number: 1E+3
small: 1e-7
text: "1e3"
~~~
~~~json
{"number":1000,"small":1e-7,"text":"1e3"}
~~~

The next dialect reads bare exponent notation as numbers and quotes exponent-like strings when serializing. Current and legacy interpret bare 1e3 as a string.

## 12. Exponent-like string (current)

<!-- ale-example {"id":"docs-current-exponent-string","grammar":"current","canonical":"value: 1e3"} -->
~~~ale
value: 1e3
~~~
~~~json
{"value":"1e3"}
~~~

In current, a bare exponent-like token is a string. This preserves the historical meaning of existing current documents.

## 13. Exponent-like string (legacy)

<!-- ale-example {"id":"docs-legacy-exponent-string","grammar":"legacy","canonical":"value: 1e3"} -->
~~~ale
value: 1e3
~~~
~~~json
{"value":"1e3"}
~~~

Legacy also reads this token as a string, while retaining its other compatibility rules.

## 14. Negative zero (next)

<!-- ale-example {"id":"docs-next-negative-zero","grammar":"next","canonical":"zero: -0"} -->
~~~ale
zero: -0
~~~
~~~json
{"zero":-0}
~~~

JSON text can spell negative zero as -0. The JavaScript verifier also checks the sign bit, because ordinary JSON stringification would print this value as 0.

## 15. Prototype-sensitive keys

<!-- ale-example {"id":"docs-special-keys","grammar":"current"} -->
~~~ale
__proto__: data
constructor: value
prototype: own
~~~
~~~json
{"__proto__":"data","constructor":"value","prototype":"own"}
~~~

These names are preserved as ordinary own data properties. The parser does not use them to change the output object's prototype.

## Running the examples

Run node docs/verify-examples.mjs to check every identified ALE/JSON pair here and in README.md and docs/README.es.md. The verifier checks parsing, expected values, round-trips, dialect selection, canonical forms when declared, and the sign of zero. The normative examples in docs/specification.md are checked by npm test. See conformance/ for runtime-independent fixtures.
