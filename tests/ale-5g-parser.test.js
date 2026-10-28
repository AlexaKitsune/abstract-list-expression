import test from "node:test";
import assert from "node:assert/strict";
import { parseALE } from "../ale.js";

test("strict dialects reject unmatched quotes and structural delimiters", () => {
	const invalid = [
		'value: "unterminated',
		"value: [1, 2",
		"value: ]1[",
		"value: [1, {x: 2]",
		"rows{a}:\n    [1, 2",
	];
	for (const grammar of ["current", "next"]) for (const source of invalid)
		assert.throws(() => parseALE(source, { grammar }), (error) => error?.name === "ALEParseError", `${grammar}: ${source}`);
});

test("legacy keeps its permissive interpretation of the same malformed-looking scalars", () => {
	assert.equal(parseALE('value: "unterminated', { grammar: "legacy" }).value, '"unterminated');
	assert.equal(parseALE("value: [1, 2", { grammar: "legacy" }).value, "[1, 2");
	assert.equal(parseALE("value: ]1[", { grammar: "legacy" }).value, "]1[");
});
