# ALE-5N — Documentation restoration and expansion audit

## Summary

The English README has been restored as the primary guide, with a matching Spanish translation and a separate set of practical examples. The content follows the ALE 0.1.0 implementation and tests, avoids the original README's unsupported token-efficiency claims, and preserves the distinction between current, legacy, and experimental next.

No parser, serializer, grammar, dialect default, API, or package version was changed. Package metadata was adjusted only so the new documentation is included by a future package build. ALE 0.1.0 is already published according to the project context; this work did not publish, tag, push, or commit anything.

## Documentation inventory

Reviewed:

- The initial English README in Git history (13a99b4:README.md).
- The current README before this change.
- docs/specification.md.
- docs/semantic-contract.md.
- conformance/ale-conformance.json and its usage guide.
- ale.js, conformance tests, generated/depth/robustness tests, and specification example tests.
- ALE-5B.1 and ALE-5F benchmark reports and their recorded corpus/methodology.
- package.json, its npm files allowlist, and .gitignore.

The original README was available in the initial Git commit. It provided a useful progression from objects to arrays, tables, nested values, flags, strings, and slots, but described an earlier language snapshot.

## Changes made

- Rewrote README.md as an English user and developer guide covering installation, Node policy, ESM usage, values, syntax, tables, nested arrays, selectors, dialects, options, round-trip limits, errors, conformance, benchmarks, contributing, and license.
- Created docs/README.es.md with corresponding Spanish explanations and matching syntax examples.
- Created docs/examples.md with 12 ALE/JSON pairs covering objects, scalar coercion, empty containers, tables, explicit arrays, sibling objects, anonymous tables, spreads, slots, escapes, next numbers, and prototype-sensitive keys.
- Created docs/verify-examples.mjs, a repository-local checker for the 12 marked pairs, both overview ALE/JSON pairs, and translated syntax examples.
- Updated docs/specification.md where its status and cross-document audit text still described an unpublished candidate or an obsolete README.
- Updated CHANGELOG.md to reflect the supplied published 0.1.0 status.
- Added the new documentation files and example verifier to package.json files so README links can resolve in a future package artifact. The version and lockfile were not changed.
- Added .gitignore exceptions for the new docs.

## Historical inaccuracies corrected

The initial README claimed parsing had no heuristics. The current parser is deterministic for a given dialect and input, but infers some block kinds from context and the block's lines. The new guide describes that limitation and recommends []: where an explicit array boundary is useful.

The initial README described all free text in slots as strings. In the implementation, slot lines use normal scalar interpretation: bare true, -, and decimal numbers become boolean, null, and number values. The new guide states this.

The original escaping examples omitted current escapes and did not explain the distinction between current/next strict validation and legacy's permissive historical behavior. The new docs enumerate the supported escape forms and dialect difference.

The original README included a fixed percentage token-saving claim without a reproducible corpus or tokenizer context. The new guide makes no general superiority claim and links to reports that identify the 22-document corpus and o200k_base tokenizer.

The original README described a different language snapshot, including nested-table, slot, root, and quoting behavior that has since changed. Those examples were not copied as normative without checking them against the current parser.

## Example and test verification

Validation used Node.js 22.23.4:

- npm test: 81 passed, 0 failed, 0 skipped, 0 todo.
- node docs/verify-examples.mjs: 12 marked ALE/JSON pairs passed; the README English and Spanish overview pairs passed; 8 other tagged syntax examples produced structurally equal values in both guides.
- The README main example is also covered by existing conformance tests. Its full documented JSON value was checked by the documentation verifier.
- Local Markdown links: 23 checked; all target files and referenced specification heading exist. The checker caught a stale anchor using an English translation of a heading that remains in the Spanish specification; the links now use its actual heading slug.
- git diff --check passed.
- npm pack --dry-run --json confirmed a 13-file future package allowlist containing the English README, Spanish README, examples, example verifier, specification, selected benchmark reports, license, conformance fixtures, and runtime entrypoint (47,856 bytes packed; 164,369 unpacked bytes in this dry run). This does not change already published npm contents.

The temporary link-check helper was stored outside the repository. The example verifier is kept in docs so maintainers can repeat the semantic checks with node docs/verify-examples.mjs.

## Specification review and remaining ambiguities

The existing specification is substantially more precise than the original README, but it intentionally is not a standalone parser grammar. Its EBNF is accompanied by context and indentation constraints. The following points remain relevant for interoperable implementations and should not be guessed from examples:

1. **Block inference:** some key: blocks classify as objects or arrays based on child forms and context. The EBNF does not encode the full lookahead/state logic. []: removes this ambiguity for explicitly declared arrays, but inferred forms remain part of current behavior.
2. **Indentation levels:** the specification describes detection of a space unit from indented input and tab handling, while an independent implementation still needs to reproduce the parser's exact line preprocessing and level calculation. Add more portable fixtures for unusual but accepted indentation widths before treating this as completely formal.
3. **Continuation state:** <, <name, and compact <cell, ... are defined relative to active placeholders on a table row. Deeply nested table placeholders do not support every recursive continuation shape. The documented common forms are tested, but no context-free grammar captures every parser state.
4. **Empty anonymous tables:** {columns}: can produce an empty array, while [{columns}]: preserves that array as an element of another array. The result also depends on root/slot/array context and legacy rules; implementations should use the conformance examples instead of generalizing one context.
5. **Legacy:** legacy is a compatibility mode with specific semantic differences, not a separately complete formal grammar. Some malformed scalar inputs remain permissive and should not be treated as current/next syntax.
6. **Unicode escapes:** \uXXXX denotes a UTF-16 code unit. The specification does not require a pair of escapes to form a Unicode scalar value; host languages with scalar-only strings need an explicit interoperability policy for isolated surrogate code units.
7. **Resource limits and options:** the runtime has no public maximum depth/document size and does not validate every option type/range. Existing fuzz/resource tests are finite evidence, not a guarantee for arbitrary hostile inputs.

docs/semantic-contract.md remains a historical ALE-3 proposal document. It includes proposals that were later superseded; the current contract is in docs/specification.md, with executable fixtures and tests.

## Benchmark documentation

The README links to ALE-5B.1 and ALE-5F. Those reports distinguish byte size from o200k_base token counts, record equivalence checks, and caution that outcomes vary by corpus and implementation versions. Benchmark figures are informational, not language guarantees. The older English README's sample comparison and reduction percentages were removed.

## Release and package implications

The already published 0.1.0 package cannot gain these files from a repository-only update. The updated files allowlist ensures a future package contains the Spanish guide, practical examples, and verifier. The README itself remains part of the package and its new relative links will resolve in that future archive.

A documentation-only patch release is reasonable if the maintainer wants npm consumers to receive the restored English guide and its translated/examples docs. Before such a release, review the translation, inspect the new tarball contents, run the example checker and suite, and update the changelog/version through the normal release process. No patch version is proposed or changed here.

## Files changed

- README.md
- docs/README.es.md
- docs/examples.md
- docs/verify-examples.mjs
- docs/specification.md
- docs/ale-5n-documentation-audit.md
- CHANGELOG.md
- package.json
- .gitignore
