# ALE portable conformance fixtures

`ale-conformance.json` is UTF-8 JSON data intended to be readable without running
the JavaScript implementation. Its top-level `format` identifies this fixture
schema. The `source` field is an ALE document and `dialect` names the required
dialect (`legacy`, `current`, or `next`). `expectedJSON` contains the expected
value wherever standard JSON can express it. A valid document may also include
`canonical`, the expected output of the canonical serializer for that dialect.

`dialectDifferences` and `compatibilityMatrix` record source documents with
separate outcomes by dialect. An outcome is either an expected value or an
object with an `error` name. Error message text is intentionally not specified.
`invalidDocuments` records documents expected to fail and the expected error
class.

Standard JSON cannot reliably carry every ALE semantic value through all host
JSON libraries. `specialValues` therefore augments `expectedJSON` with explicit
representations. For example, `encoding: "binary64"` plus a 16 digit
hexadecimal `bits` string records the IEEE-754 bit pattern at `path`; this
distinguishes negative zero (`8000000000000000`) from positive zero. Other
conformance suites can add similarly tagged representations without changing
the JSON value model.

Fixtures are normative for the named implementation contract only. A consumer
should evaluate every dialect outcome independently; it must not infer a
document's source dialect from its text.
