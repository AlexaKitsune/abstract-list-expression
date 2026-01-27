# ALE — Abstract List Expression

## Specification v0.0.2

ALE is a human-readable, token-efficient data notation inspired by JSON, TOON, and YAML. It is designed to represent structured data deterministically with minimal syntax overhead, making it especially suitable for configs, datasets, and LLM prompts.

---

### 0. Goals
- High human readability
- Low syntactic noise (token-efficient)
- Deterministic parsing (no heuristics)
- Native support for:
- implicit objects
- heterogeneous arrays
- homogeneous tables (arrays of objects)
- complex nested blocks (slots)

ALE is data-only (no execution, no expressions).

---

### 1. Indentation & Structure
- Hierarchy is defined only by indentation.
- Tabs or spaces are allowed but must be consistent.
- Dedentation closes the current block.
- Empty lines are ignored.

---

### 2. Supported Data Types

ALE can represent:
- Object
- Array
- String
- Number (int / float)
- Boolean
- Null

---

### 3. Objects (Implicit)

3.1 Key–Value Pair

```
key: value
```

3.2 Object Continuity Rule

Consecutive key: value lines belong to the same object unless:
- a > appears (new sibling), or
- indentation level decreases.

Example:

```
id: 1
name: Booker
tags: [shark, friend]
```
```json
{ "id": 1, "name": "Booker", "tags": ["shark", "friend"] }
```

---

### 4. Arrays

4.1 Block-Inferred Array

```
items:
    1
    "hello"
    [1,2]
```

If a key ends with : and the indented block does not start with key: value, the key is an array.

4.2 Inline Array

```json
[1, 2, 3, 4.5]
```

4.3 Empty Array

```
tags: []
```

---

### 5. Tables (Homogeneous Arrays of Objects)

5.1 Table Header

```
key{a, b, c}:
    v1, v2, v3
    v1, v2, v3
```

Each row produces an object by column position.

Example:

```
characters{id, name}:
    1, Eleanor
    2, Swifty
```
```json
[
  { "id": 1, "name": "Eleanor" },
  { "id": 2, "name": "Swifty" }
]
```

5.2 Null Values in Tables
- `-` → `null`
- Empty cell (`Booker,`) → `null`

---

### 6. Arrays Inside Arrays

6.1 `[{a,b}]` — Array as a Single Element

```
mixed:
    [{name, age}]:
        Alexa, 28
        Booker, -
```
```json
[
  [
    { "name": "Alexa", "age": 28 },
    { "name": "Booker", "age": null }
  ]
]
```

6.2 ...{a,b} — Spread / Unpack

```
mixed:
    ...{name, age}:
        Alexa, 28
        Booker, -
```
```json
[
  { "name": "Alexa", "age": 28 },
  { "name": "Booker", "age": null }
]
```

---

### 7. Sibling Separator >

Inside arrays, > starts a new sibling element.

```
mixed:
    id: 1
    name: Booker
    >id: 0
    name: Alexa
```
```json
[
  { "id": 1, "name": "Booker" },
  { "id": 0, "name": "Alexa" }
]
```

---

### 8. Boolean Shortcuts

Syntax  | Result
--------|------------
`!flag` | `flag: false`
`¡flag` | `flag: true`

Explicit booleans are also valid:

`active: true`

---

### 9. Null

`value: -`

---

### 10. Strings

10.1 Bare Strings

name: Alexa

10.2 Escaping
- \n → newline
- \, → literal comma
- \" → quote

```
text: Hola\, soy Ale\nEncantada
```

10.3 Quoted Strings

Required when containing commas, structural symbols, or leading spaces:

```
text: "Hola, soy \"Ale\" (Alexa)"
```

---

### 11. Slots ([:]) — Complex Blocks

11.1 Definition

`[:]` defines a slot, not a normal empty array.
- Slots always resolve to arrays
- Empty slot → []
- Slots accept only free elements

Conceptually:

let arr = [];
arr.push(...)

Example:

```
notes: [:]
    "text"
    word: konnichiwa
```

---

### 12. Slot Selection — < and <name

When multiple slots exist:
- < → move to next slot
- <name → move to specific slot

```
german, 0, [:], {aspect, difficulty, attempts}
    word: -
    meaning: -
    >word: fuchs
    ¡favAnimal

    <easy
    declination, 80, 4
    pronunciation, 90, 2
```

---

### 13. Free Text Inside Slots

Indented lines that are not:
- key: value
- flags
- \> or <
- table rows

are treated as string literals and appended to the active slot.

---

### 14. Keys with Spaces

Keys may contain spaces if quoted:

```
"full name": Alexa
"user tags": [fox, artist]
```

---

### 15. Parsing Order (Deterministic)
	1.	Indentation
	2.	> / <
	3.	Flags (!, ¡)
	4.	Table headers {}
	5.	Spread ...{}
	6.	Array-as-element [{ } ]
	7.	Inline arrays []
	8.	Scalars (null → bool → number → string)

---

## Token Efficiency (Measured)

Using [OpenAI Tokenizer](https://platform.openai.com/tokenizer) (model: GPT-4o / GPT-4o mini):

Format | Tokens
-------|--------
JSON   | 544
TOON   | 385
ALE    | 278

ALE achieves ~49% token reduction vs JSON and ~28% vs TOON.

Examples used:

### JSON

```json
{

    "name": "Alexa",
    "age": 28,
    "characters": [
        { "id": 1, "name": "Eleanor" },
        { "id": 2, "name": "Swifty" }
    ],
    "mixedArray": [
        1,
        [1, 2, 3, 4.5],
        {
            "id": 1,
            "name": "Booker",
            "tags": ["shark", "friend"]
        },
        {
            "id": 0,
            "name": "Alexa",
            "active": false,
            "isFox": true,
            "languages": [
                {
                    "name": "spanish",
                    "level": 100,
                    "notes": "lingua franca",
                    "easy": true
                },
                {
                    "name": "english",
                    "level": 70,
                    "notes": ["Oskar", "Kilo"],
                    "easy": true
                },
                {
                    "name": "japanese",
                    "level": 20,
                    "notes": [
                        {
                            "word": "konnichiwa",
                            "easy": true
                        },
                        {
                            "katakana": "キツネ",
                            "meaning": "fox"
                        },
                        "same",
                        "neko",
                        "shika"
                    ],
                    "easy": false
                },{
                    "name": "german",
                    "level": 0,
                    "notes": [
                        {
                            "word": null,
                            "meaning": null
                        },
                        {
                            "word": "fuchs",
                            "favAnimal": true
                        }
                    ],
                    "easy": [
                        {
                            "aspect": "declination",
                            "difficulty": 80,
                            "attempts": 4
                        },
                        {
                            "aspect": "pronunciation",
                            "difficulty": 90,
                            "attempts": 2
                        },
                        {
                            "aspect": "vocabulary",
                            "difficulty": 40,
                            "attempts": 5
                        }
                    ]
                }
            ]
        },
        { "name": "Alexa", "age": 28 },
        { "name": "Booker", "age": null },
        { "name": "Eleanor", "age": 30 },
        [
            { "name": "Alexa", "age": 28 },
            { "name": "Booker", "age": null },
            { "name": "Eleanor", "age": 30 }
        ]
    ]
}
```

### TOON

```
name: Alexa
age: 28
characters: items[2]{id,name}:
    1,Eleanor
    2,Swifty
mixedArray: items[8]:
    - 1
    - items[4]:
      - 1
      - 2
      - 3
      - 4.5
    - id: 1
    name: Booker
    tags: items[2]:
        - shark
        - friend
    - id: 0
    name: Alexa
    active: false
    isFox: true
    languages: items[4]:
        - name: spanish
        level: 100
        notes: lingua franca
        easy: true
        - name: english
        level: 70
        notes: items[2]:
            - Oskar
            - Kilo
        easy: true
        - name: japanese
        level: 20
        notes: items[5]:
            - word: konnichiwa
            easy: true
            - katakana: キツネ
            meaning: fox
            - same
            - neko
            - shika
        easy: false
        - name: german
        level: 0
        notes: items[2]:
            - word: 
            meaning: 
            - word: fuchs
            favAnimal: true
        easy: items[3]{aspect,difficulty,attempts}:
            declination,80,4
            pronunciation,90,2
            vocabulary,40,5
    - name: Alexa
    age: 28
    - name: Booker
    age: 
    - name: Eleanor
    age: 30
    - items[3]{name,age}:
      Alexa,28
      Booker,
      Eleanor,30
```

### ALE

```
name: Alexa
age: 28
characters{id, name}:
    1, Eleanor
    2, Swifty
mixedArray:
    1
    [1, 2, 3, 4.5]
    id: 1
    name: Booker
    tags: [shark, friend]
    >id: 0
    name: Alexa
    !active
    ¡isFox
    languages{name, level, notes, easy}:
        spanish, 100, lingua franca, ¡
        english, 70, [Oskar, Kilo], ¡
        japanese, 20, [:], !
            word: konnichiwa
            ¡easy
            >katakana: キツネ
            meaning: fox
            same
            neko
            shika
        german, 0, [:], {aspect, difficulty, attempts}
            word:
            meaning:
            >word: fuchs
            ¡favAnimal
            <declination, 80, 4
            pronunciation, 90, 2
            vocabulary, 40, 5
    ...{name, age}:
        Alexa, 28
        Booker,
        Eleanor, 30
    {name, age}:
    Alexa, 28
    Booker,
    Eleanor, 30
```

---

## Status
- v0.2 — Stable specification
- Deterministic, human-friendly, LLM-efficient
- Suitable for bidirectional ALE ⇄ JSON parsing

## Usage

### Install

```bash
npm i @alexa.kitsune/ale
```

### Parse ALE → JSON
```js
import { parseALE } from "@alexa.kitsune/ale";

const src = `
name: Alexa
age: 28
characters{id, name}:
    1, Eleanor
    2, Swifty
`;

const data = parseALE(src);
console.log(data);
```

### Stringify JSON → ALE
```js
import { stringifyALE } from "@alexa.kitsune/ale";

const obj = {
    name: "Alexa",
    age: 28,
    characters: [
        { id: 1, name: "Eleanor" },
        { id: 2, name: "Swifty" }
    ]
};

console.log(stringifyALE(obj));
```

> NOTE
>
> The package is published as ESM (type: "module"). Use import ... (Node >= 16).

---

End of specification.