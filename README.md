# ALE — Abstract List Expression

**Language:** English · [Español](docs/README.es.md)

ALE is a human-readable text format for structured data. Its JavaScript package provides `parseALE()` and `stringifyALE()` for reading and writing objects, arrays, strings, finite numbers, booleans, and `null`.

ALE combines implicit objects, indented arrays, compact tables, and explicit block forms. The parser is data-only: it does not evaluate expressions or execute input. Read the [language specification](docs/specification.md) for the complete contract, or browse the [validated examples](docs/examples.md).

## Goals and design

- Keep common structured data readable in a text editor.
- Offer compact representations for repeated records through tables.
- Make parsing deterministic for a selected dialect and source document.
- Preserve JSON data types and array order across supported round-trips.
- Keep the syntax data-only, without expressions or executable code.

Some block forms infer whether their contents describe an object or an array. Use the explicit `[]:` form when an array's boundary should be stated directly. ALE aims for compact output, but its size and token count depend on the data, dialect, serializer options, tokenizer, and competing format's implementation.

## Install and requirements

```sh
npm install @alexa.kitsune/ale
```

ALE 0.1.0 is published on npm. The package declares Node.js `>=22.0.0`; Node.js 22.23.4 was verified during release validation. Node 22.0.0 itself was not tested. The supported package interface is ESM; use import statements. CommonJS is not a supported package interface.

## Quick start

```js
import { parseALE, stringifyALE } from "@alexa.kitsune/ale";

const value = parseALE("name: Ada\nactive: true");
// { name: "Ada", active: true }

const source = stringifyALE({ name: "Ada", active: true });
console.log(source);
```

`parseALE(source, options)` returns a JavaScript value. A parse failure is an `Error` whose `name` is `ALEParseError`; the error class itself is not exported. `stringifyALE(value, options)` returns canonical ALE text for the selected dialect and options.

## A first document

An ALE object is usually written as one `key: value` entry per line. Values can be scalars, inline arrays, or indented blocks.

<!-- ale-example {"id":"readme-overview","grammar":"current","expected":{"name":"Alexa","age":28,"characters":[{"id":1,"name":"Eleanor"},{"id":2,"name":"Swifty"}],"mixedArray":[1,[1,2],{"id":1,"name":"Booker"},{"id":0,"name":"Alexa"},[{"name":"Alexa","age":28},{"name":"Booker","age":null}]]}} -->
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

### Equivalent JSON

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

The table `characters{id, name}:` creates an array of objects. `[{name, age}]:` makes the whole anonymous table one nested array element. The last row's empty cell is `null`.

## Objects, arrays, and values

### Objects

Object entries are implicit; braces are not required around an ordinary object:

<!-- ale-example {"id":"readme-user-object","grammar":"current","expected":{"user":{"name":"Ada","active":true}}} -->
~~~ale
user:
    name: Ada
    active: true
~~~

This produces `{ "user": { "name": "Ada", "active": true } }`. An empty object is written `{}`.

### Inline and block arrays

Short scalar arrays can be written inline:

<!-- ale-example {"id":"readme-inline-array","grammar":"current","expected":{"colors":["red","green","blue"]}} -->
~~~ale
colors: [red, green, blue]
~~~

Use `[]:` to declare an array block explicitly. Each child item starts on its own indented line; nested blocks keep their own indentation:

<!-- ale-example {"id":"readme-explicit-array","grammar":"current","expected":{"values":[1,[2,3],[4,5]]}} -->
~~~ale
values: []:
    1
    [2, 3]
    []:
        4
        5
~~~

The value is `[1, [2, 3], [4, 5]]`. An explicit array block must contain a child line. Use `[]` for an empty array, including at the document root.

ALE also accepts indentation-inferred block arrays, for example `items:` followed by indented items. Since the block kind is inferred from its contents and context, prefer `[]:` when the array boundary needs to be explicit.

### Tables

Tables are a compact form for arrays of objects with a shared set of columns:

<!-- ale-example {"id":"readme-table","grammar":"current","expected":{"users":[{"id":1,"name":"Ada","active":true},{"id":2,"name":"Lin","active":false}]}} -->
~~~ale
users{id, name, active}:
    1, Ada, ¡
    2, Lin, !
~~~

This is equivalent to `[{"id":1,"name":"Ada","active":true},{"id":2,"name":"Lin","active":false}]`. Cells map to columns by position. Empty or `-` cells mean `null`; omitted trailing cells are also `null`. Current and next reject rows with too many cells and headers with duplicate decoded column names. The serializer uses tables only when it can preserve the value reversibly; otherwise it writes ordinary blocks.

### Booleans, null, and strings

Use `true` and `false` for explicit booleans, or `¡flag` and `!flag` for compact object flags (`true` and `false`, respectively). In table cells, bare `¡` and `!` are the boolean values. The null token is `-`; a key with no child block, such as `middle:`, is also null. The word `null` by itself is a string.

Bare strings are convenient for simple words. Quote strings when they could be read as typed values or structural syntax, or when they contain significant leading/trailing whitespace. The serializer quotes ambiguous strings for the selected dialect.

<!-- ale-example {"id":"readme-quoted-strings","grammar":"current","expected":{"truth":"true","amount":"123","dash":"-","message":"Hello, \"Ada\"!\nWelcome."}} -->
~~~ale
truth: "true"
amount: "123"
dash: "-"
message: "Hello, \"Ada\"!\nWelcome."
~~~

Current and next support `\"`, `\\`, `\n`, `\r`, `\t`, `\,`, and `\uXXXX` escapes. Unknown or incomplete escapes are errors in these dialects. Legacy retains more permissive historical escape handling.

## Nested arrays, object siblings, and tables

Consecutive properties at the same array-item indentation form one object. A `>` introduces the next object sibling, so a new object can stay compact:

<!-- ale-example {"id":"readme-object-siblings","grammar":"current","expected":{"people":[{"id":1,"name":"Booker"},{"id":2,"name":"Alexa"}]}} -->
~~~ale
people: []:
    id: 1
    name: Booker
    >id: 2
    name: Alexa
~~~

The value is `[{"id":1,"name":"Booker"},{"id":2,"name":"Alexa"}]`. The explicit `>:` form can introduce an object element with its own indented body.

An anonymous table `{columns}:` produces an array of row objects. Wrap it in `[{columns}]:` when that complete array should be one element of its containing array. Use `...{columns}:` to expand its rows directly into the containing array:

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

This yields `[[{"id":1},{"id":2}],{"id":3},{"id":4}]`. The wrapper preserves a nested array; the spread adds each table row as a sibling.

## Slots, placeholders, and continuations

The table cell `[:]` is a slot placeholder whose value is an array. A cell such as `{kind}` is a table placeholder. Indented continuation lines fill the active placeholder. `<name` selects a placeholder by its declared column name; `<` advances to the next placeholder. A compact continuation such as `<declination, 80` advances one placeholder and processes the comma-separated text as a row beginning with `declination`; it does not select a placeholder named `declination`. A single value like `<alpha` is a selector, not a compact row.

<!-- ale-example {"id":"readme-slots","grammar":"current","expected":{"languages":[{"name":"german","notes":[{"word":"fuchs"}],"easy":[{"aspect":"declination","score":80},{"aspect":"pronunciation","score":90}]}]}} -->
~~~ale
languages{name, notes, easy}:
    german, [:], {aspect, score}
        word: fuchs
        <easy
        declination, 80
        pronunciation, 90
~~~

In this example, `notes` is a slot containing an object, while `easy` is an array of `{aspect, score}` records. Slot contents follow ALE's normal scalar and object interpretation; an unquoted `true`, `-`, or decimal number is typed accordingly. Continuation grammar is context-sensitive; see [the specification](docs/specification.md#13-slots-placeholders-selectores-y-continuaciones) for its exact limits and rules.

## Dialects

Choose the same `grammar` when parsing text and serializing values.

| Dialect | Status | Exponent-like bare value `1e3` |
| --- | --- | --- |
| `current` | Default and recommended | String |
| `legacy` | Historical compatibility mode | String, with older root, escape, table, and validation behavior |
| `next` | Experimental and opt-in | Number `1000` |

For example, `value: 1e3` means a string in current/legacy and a number in next. In next, the string must be quoted as `"1e3"`. Current and legacy must remain selected when reading documents written for those dialects; the source alone cannot always reveal which meaning was intended.

~~~js
const n = parseALE("value: 1E+3", { grammar: "next" });
const canonical = stringifyALE(n, { grammar: "next" }); // value: 1000

const source = stringifyALE({ label: "1e3", amount: 1e-7 }, { grammar: "next" });
const restored = parseALE(source, { grammar: "next" });
~~~

The `next` dialect uses ECMAScript's shortest round-tripping decimal form for finite numbers and preserves `-0`. It rejects overflow and nonzero literals that underflow to zero. Current and legacy keep their existing decimal grammar and do not interpret exponent notation as numbers.

## Serializer options

`stringifyALE(value, options)` accepts:

| Option | Default | Purpose |
| --- | --- | --- |
| `grammar` | `"current"` | Selects `current`, `legacy`, or `next` |
| `indent` | four spaces | Indentation string used for nested blocks |
| `useTables` | `true` | Allows reversible automatic table output |
| `useSpread` | `true` | Allows spread output for eligible object runs |
| `booleanShortcuts` | `true` | Emits compact boolean flags |
| `inlineArrayMax` | `6` | Maximum scalar-array length for inline output |

These options select textual representation; they are tested not to change values in the supported current/next round-trip domain. `legacy` has compatibility exceptions. Unknown grammar names throw `TypeError`. Other option values are not exhaustively validated and may cause ordinary JavaScript errors.

## Canonical output and round-trips

`stringifyALE()` produces canonical text relative to its dialect and options. It does not preserve comments, original quoting, whitespace, or source layout. For supported JSON values, the intended property is:

```js
parseALE(stringifyALE(value)) // structurally equal to value
```

Array order, own enumerable string-keyed properties, nulls, finite numbers, and negative zero are included. The property is extensively tested with conformant, generated, and deep values, but those finite campaigns are not a proof over all possible documents or recursion depths. Canonical output can differ when options or dialects differ. Legacy is not guaranteed to round-trip every modern JSON structure.

Objects whose array rows have different own-property sets are not automatically converted into a table that would invent absent properties as null. Current/next reject duplicate object keys, duplicate decoded table columns, and excess table cells. Legacy retains last-value-wins and excess-cell behavior for compatibility.

## Errors

Current and next throw an error named `ALEParseError` for invalid documents, including empty input, malformed quoted strings and escapes, invalid indentation, duplicate keys/columns, excess table cells, missing required table blocks, and unknown selectors. `ALEParseError` is not exported as a class; test `error.name` or catch the error without depending on message text. Invalid `grammar` options throw `TypeError`. Legacy intentionally accepts some malformed scalar forms that strict dialects reject.

## Supported data and limitations

Round-trip support targets JSON-shaped JavaScript values:

- `null`, booleans, strings, and finite IEEE-754 numbers, including `-0`;
- dense arrays, preserving element order;
- ordinary objects with own enumerable string-keyed properties, including keys such as `__proto__`, `constructor`, and `prototype`.

`undefined`, functions, symbols, `BigInt`, `NaN`, infinities, cyclic references, sparse arrays, custom prototypes, symbol/non-enumerable properties, accessors, and property descriptors are outside the supported round-trip domain. No public maximum depth or document size is specified. The parser is recursive, so applications processing untrusted or very large documents should apply their own resource limits.

## Benchmarks

The repository contains reproducible comparisons against JSON, YAML, and TOON using a fixed 22-document corpus and the `o200k_base` tokenizer. Results depend on corpus composition, serializer settings, library/runtime versions, and tokenizer. They do not establish general superiority for ALE. See [ALE-5B.1 results](docs/ale-5b1-results.md) and [ALE-5F results](docs/ale-5f-results.md) for methodology, equivalence checks, byte/token counts, and limitations.

## Conformance, development, and license

The portable fixture set is in [`conformance/`](conformance/README.md). The fixtures describe semantic values and dialect-specific cases without requiring a JavaScript implementation. The repository's executable suite also checks normative examples:

```sh
npm test
```

Contributors should read [`CONTRIBUTING.md`](CONTRIBUTING.md), the [full specification](docs/specification.md), and the [example collection](docs/examples.md). ALE is distributed under the [MIT License](LICENSE).
