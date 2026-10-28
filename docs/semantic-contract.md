# ALE semantic contract proposal

Status: proposed decisions for ALE-3. This document records intended semantics and unresolved grammar choices. It does not change the v0.0.2 README specification or implementation.

## Proposed decisions

### Strings

Strings whose bare representation would be parsed as a typed token must be quoted. This includes at least `true`, `false`, `-`, and every spelling accepted by the number grammar. Quoting is also required when needed to preserve whitespace, line boundaries, or structural punctuation. The parser should treat quoted content as a string and validate escape sequences according to the eventual escape grammar.

### Empty objects and arrays

Use `{}` as the explicit representation of an empty object. Preserve `[]` for an empty array. Both markers must retain their meaning at the document root, in object properties, in arrays, in slots, and wherever the grammar permits a value.

### Null

Keep `-` as the explicit null scalar. Keep a key with no child block (`key:`) as a valid shorthand for null, as requested for this contract. An indented child after `key:` means the child value; therefore the distinction between no child and an empty child block must be explicit in parsing.

### Tables and absent properties

Tables describe rows whose objects share a common property set. A row that lacks a property must not silently gain that property with value `null`. Automatic table serialization should be used only when every row has the same own-property set, or use a separately specified absent-value marker. Empty cells continue to mean null under the current proposal. Duplicate columns and cells beyond the declared column count should be rejected unless a future spec explicitly chooses another rule.

### Arbitrary keys and object safety

All accepted keys, including `__proto__`, `constructor`, and `prototype`, are data keys. Parsing must create own properties without invoking prototype setters or changing the result object's prototype. Duplicate-key behavior remains a grammar decision; the recommendation is to reject duplicates to avoid silent data loss.

### Slots

Retain `[:]` as a slot marker whose value is always an array. Retain `<name` for selecting a named slot/table continuation, and retain the compact form where `<` is followed by the first row for the newly selected placeholder. Proposed interpretation:

1. A table row may declare zero or more continuation placeholders in its cells.
2. Continuation content belongs to the currently active placeholder, initially the first placeholder in that row.
3. `<name` switches to the placeholder whose declared column name is `name`; it adds no content by itself.
4. `<` switches to the next placeholder in declaration order; it adds no content by itself.
5. `<name, cell...` or `,<cell...` style compact continuation syntax must be specified consistently. The current examples conflict on whether selection and first row share one line. The recommendation is to standardize `<name` as a selector line and put any row on the next line, while preserving legacy forms only if compatibility testing justifies them.
6. Continuation ends at the row's indentation level or when a selector changes the active placeholder. Nested blocks follow their own indentation rules.
7. Slot elements follow ordinary array element grouping and retain free text as strings; scalar coercion of free text remains to be decided.

The exact compact continuation grammar remains pending because changing it affects compatibility with the README example and current serializer output.

## Pending syntax decisions

### General nested arrays

**Problem:** The current block form does not always delimit a nested array element from its siblings. Arrays over the inline threshold can flatten or consume following elements.

**Alternatives:**

| Alternative | Advantages | Disadvantages | Compatibility and token cost |
|---|---|---|---|
| Add an explicit array block marker, such as `[]:` followed by indented elements | Clear type and boundary at every nesting depth; easy deterministic parsing | Adds a marker to each block array | New syntax; moderate token overhead |
| Require nested arrays to use an explicit wrapper form such as `[[...]]` | Compact for short arrays; visually signals nesting | Deep or long arrays become punctuation-heavy; multiline grammar needs care | Additive syntax; low overhead for short arrays |
| Keep indentation-only arrays and add an explicit sibling marker for every element | Preserves compact scalar arrays and can delimit nested values | More state and punctuation; must resolve object grouping and `>` interactions | Potentially compatible; overhead grows with element count |

**Recommendation:** Prototype the explicit block marker and wrapper alternatives against representative data before choosing. Do not implement a syntax until its root, property, table-cell, slot, and array-element forms are specified together.

### Quoting, escapes, and scalar grammar

**Problem:** Bare strings overlap with booleans, null, numbers and structural syntax; unknown escapes are currently permissive.

**Alternatives:** Require quotes only for ambiguous tokens (smallest output); quote all strings (simplest parser, higher token cost); or add an explicit string prefix (unambiguous but new syntax and overhead). The recommendation is minimal quoting with a complete scalar grammar, a defined escape set, and errors on unsupported escapes. Compatibility is favorable for existing unambiguous bare strings, but values previously coerced to scalars will change meaning when quoted.

### Tables with optional properties

**Problem:** Empty cells already mean null, so absence cannot also use an empty cell.

**Alternatives:** Restrict automatic tables to identical own-property sets; introduce a distinct absent marker; or encode mixed-property rows as ordinary objects. Restricting auto-table selection is backward compatible for current table syntax and keeps output compact for truly homogeneous rows. A marker preserves table compression but adds grammar and token cost. The recommendation is to use ordinary object rows when own-property sets differ.

### Empty root document

**Problem:** An empty input has no declared value and currently parses as an empty array.

**Alternatives:** Define empty input as null, empty object, or empty array; or reject it and require an explicit marker. The recommendation is to reject empty input in a strict mode or leave it unspecified until a use case requires a root shorthand. This decision affects compatibility with existing callers and has no token cost for non-empty documents.

### Duplicate keys and columns

**Problem:** Current assignment silently overwrites duplicate object keys and repeated table columns.

**Alternatives:** Last value wins (matches current behavior, but loses information); first value wins; or reject duplicates. The recommendation is rejection for deterministic data interchange. This improves error visibility with no output token cost, though it may reject existing documents that relied on overwrite behavior.

## Conformance suite mapping

`tests/conformance.test.js` contains passing structural checks for supported v0.0.2 forms and explicitly marked pending round-trip tests linked to the ALE-1 findings. The README example is read directly from the README and checked structurally. The test suite is a verification aid; this proposal becomes normative only after the main specification is updated in a future authorized phase.
