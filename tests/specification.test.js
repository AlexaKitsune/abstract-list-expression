import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { parseALE, stringifyALE } from "../ale.js";

test("normative examples in docs/specification.md parse to their JSON values", async () => {
	const specification = await readFile(new URL("../docs/specification.md", import.meta.url), "utf8");
	const pattern = /<!-- conformance: ([a-z0-9-]+)(?: grammar=(legacy|next))? -->\s*~~~ale\n([\s\S]*?)\n~~~\s*~~~json\n([\s\S]*?)\n~~~/g;
	const examples = [...specification.matchAll(pattern)];
	assert.ok(examples.length >= 10, "specification must keep its executable example pairs");

	for (const [, id, grammar, source, expectedJSON] of examples) {
		const expected = JSON.parse(expectedJSON);
		const actual = parseALE(source, grammar ? { grammar } : undefined);
		assert.deepStrictEqual(actual, expected, "normative example " + id);
		assert.deepStrictEqual(parseALE(stringifyALE(actual)), expected, "canonical round-trip for " + id);
	}
});

test("documented current-grammar validation examples have controlled errors", async () => {
	const specification = await readFile(new URL("../docs/specification.md", import.meta.url), "utf8");
	const pattern = /<!-- invalid: ([a-z-]+) -->\s*~~~ale\n([\s\S]*?)\n~~~/g;
	const examples = [...specification.matchAll(pattern)];
	assert.ok(examples.length >= 7, "specification must keep its invalid examples");
	for (const [, id, source] of examples)
		assert.throws(() => parseALE(source), (error) => error?.name === "ALEParseError", "invalid example " + id);
});
