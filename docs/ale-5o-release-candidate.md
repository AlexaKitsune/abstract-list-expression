# ALE-5O — Documentation release candidate 0.1.1

## Executive summary

The local 0.1.1 candidate contains documentation, documentation-validation, and package-metadata changes. The runtime implementation and supported entrypoints remain byte-for-byte identical to the published 0.1.0 baseline. On Node.js 22.23.4, all 81 automated tests passed, including verification of 15 documented ALE/JSON examples and English/Spanish semantic consistency. A tarball was installed into an isolated temporary consumer and passed ESM smoke checks.

**Verdict: CONDITIONAL.** The local artifact is validated for review. It is not published, committed, or tagged, and therefore is not yet tied to an immutable release revision. Review and approval remain necessary before any publication action.

## Files modified or added

- `.gitignore` — allowlist exceptions for the new documentation files.
- `CHANGELOG.md` — added an explicitly unpublished, documentation-only 0.1.1 candidate entry.
- `README.md` — English primary guide with progressive syntax, API, dialect, limitations, benchmark, and contribution material.
- `docs/README.es.md` — Spanish guide linked to the English README.
- `docs/examples.md` — executable examples with explicit IDs, dialects, expected values, and canonical output cases.
- `docs/verify-examples.mjs` — ID-based verifier for examples, expected values, translations, round-trips, and canonical forms.
- `docs/specification.md` — corrected stale release-status wording; no normative grammar or semantic changes.
- `docs/ale-5n-documentation-audit.md` — preserved prior phase audit.
- `package.json`, `package-lock.json` — version set consistently to 0.1.1; integrated documentation checks into `npm test`; expanded packaged documentation/data allowlist.
- `docs/ale-5o-release-candidate.md` — this release-candidate report.

`ale.js` was not modified. No dependencies were installed or added for runtime use.

## Documentation corrections and validation improvements

The English README is the primary overview and links to the Spanish translation. Both guides cover the same supported features, dialects, API and serializer options, limitations, and compatibility claims. They link to one another. The specification remains the normative source; examples explain its behavior without defining new syntax.

Executable snippets use explicit `ale-example` identifiers rather than positional matching. The verifier requires every complete ALE fence in the guides/examples collection to be identified, rejects duplicate IDs, parses each example using its declared dialect, compares its value against the associated JSON or explicit expected metadata, and checks round-trip behavior. It also checks negative zero with `Object.is`, English/Spanish semantic agreement, and canonical forms when declared. Incomplete syntax fragments are not treated as complete documents.

The documentation verifier reports **15 example pairs**: 9 in the English guide and 9 in the Spanish guide (the guides share their overview IDs; the remaining examples are in `docs/examples.md`). All parse, semantic comparison, round-trip, and applicable canonical checks passed.

`npm test` now runs `npm run test:docs` before the existing Node test suite. This adds documentation validation without weakening or replacing the existing tests.

## English/Spanish consistency and links

- English/Spanish overview examples: matching IDs, dialects, and structural values.
- Shared syntax examples in the guides: verified for semantic equivalence.
- Repository Markdown links: 23 local links checked; all targets and linked headings exist.
- Packaged Markdown links: all links in the 10 Markdown files included in the tarball checked; no broken relative targets or headings found.
- Benchmark result links were checked against the packed package. The referenced benchmark reports and JSON result data are included.

No claim of an independently implemented, cross-language parser is made. Portable conformance fixtures are distributed, but this phase does not test another implementation.

## Test and tooling results

Environment: Node.js **v22.23.4**, npm **10.9.9**.

- `npm run test:docs`: passed; 15 examples, bilingual checks, round-trips, and canonical cases.
- `npm test`: **81 passed, 0 failed, 0 skipped, 0 todo**. This includes the documentation check and existing conformance, generative, numeric, depth, robustness, and runtime tests.
- `node --check docs/verify-examples.mjs`: passed.
- Markdown link validation in the repository: 23/23 valid.
- Markdown link validation in the extracted package: 10 Markdown files, 0 link errors.
- `git diff --check`: passed.

An initial isolated-install attempt used the host npm cache and failed because that cache contains root-owned files. No project or global cache was changed. Retrying with `npm_config_cache=/private/tmp/ale-5o-npm-cache` succeeded offline; the tarball installed and the smoke test passed.

## Runtime compatibility evidence

The file `ale.js` is byte-identical to the 0.1.0 release commit `1a6bd67022e55be32ca583a6cee096ef823dbdb7` (`cmp` succeeded). SHA-256 for both copies:

```text
70b133c4b790ca444468ad3b0c85912fbbb2f2893322f6d123137c859000eacb
```

The package `type`, `main`, `exports`, and `engines` fields remain unchanged from that baseline. The candidate continues to declare ESM and Node `>=22.0.0`; runtime dependencies remain empty. `current` remains the default, `legacy` remains available, and `next` remains experimental. No parser or serializer semantics were changed.

The external ESM smoke test imported `@alexa.kitsune/ale` by package name and checked ordinary parsing/serialization, current and legacy exponent-like strings, next exponent numbers and quoted strings, negative zero, special own keys, and a controlled `ALEParseError`.

## npm tarball inventory

The final local candidate was generated with `npm pack --dry-run --json` and `npm pack --json` under Node 22. The dry-run and actual pack metadata agree.

- Archive: `alexa.kitsune-ale-0.1.1.tgz`
- Packed size: **68,538 bytes**
- Unpacked size: **354,233 bytes**
- Files: **17**
- SHA-256: `3221aac4c094a7f976ed2dbbac1ce3ec21102463bec6b3babf7a2d430ff23dcb`
- npm shasum (SHA-1): `6def3d8fa134cc6d239eb9c5c176bf17c6ea930b`
- npm integrity: `sha512-eoyhce/PIb3jUej5EjEfMd6ksowcdHXmbvrQriVws8C6aCqwdpExCxuehqtuifyc7QZn56vPnZSc38lMjQQ2+A==`
- Bundled dependencies: none
- Runtime dependencies: none

Included documentation and supporting files:

```text
CHANGELOG.md
CONTRIBUTING.md
LICENSE
README.md
conformance/README.md
conformance/ale-conformance.json
docs/README.es.md
docs/ale-5b-benchmarks.md
docs/ale-5b1-results.md
docs/ale-5f-results.md
docs/examples.md
docs/specification.md
docs/verify-examples.mjs
benchmarks/ale-5b/results.json
benchmarks/ale-5b1/results.json
```

The remaining two packed files are `ale.js` and `package.json`. The tarball contains no `node_modules`, test tree, local paths, or known secret/configuration files. The explicit package allowlist excludes temporary audit artifacts.

The tarball was installed from `/private/tmp/ale-5o-final/alexa.kitsune-ale-0.1.1.tgz` into `/private/tmp/ale-5o-consumer`, outside the repository. `npm ls --all --depth=0` showed only `@alexa.kitsune/ale@0.1.1`; the ESM smoke test passed.

## Known limitations and remaining risks

- 0.1.1 remains an unpublished local candidate. The changelog marks it as such; no publication has occurred.
- This working tree has not been committed, by instruction. The archive is reproducible from the current local state, but a release should be rebuilt and hashed from an approved, identifiable Git revision.
- English/Spanish parity is verified for executable examples and covered topics, but translation remains a maintained document and can drift as prose changes; keep the example verifier in the test workflow.
- Documentation links are checked locally and against the packed artifact. External URLs are not verified for availability.
- The report is not in the package allowlist, as it is a release-candidate audit artifact rather than user documentation.

## Readiness decision

**CONDITIONAL — ready for maintainer review, not for publication from this uncommitted state.** The documentation, automated checks, package inventory, and isolated ESM consumption checks passed. Before publishing, approve the docs and changelog, create the intended release revision through the normal review process, rebuild the tarball from that revision, and confirm its hashes and package contents. No publish, commit, tag, push, or dist-tag action was performed.
