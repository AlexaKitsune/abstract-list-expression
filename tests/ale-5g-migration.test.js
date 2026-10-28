import test from "node:test";
import assert from "node:assert/strict";
import { parseALE, stringifyALE } from "../ale.js";

function migrate(source, from, to) {
	const original = parseALE(source, { grammar: from });
	const serialized = stringifyALE(original, { grammar: to });
	const restored = parseALE(serialized, { grammar: to });
	assert.deepStrictEqual(restored, original, from + " -> " + to + ": " + serialized);
	return { original, serialized, restored };
}

test("explicit parse-then-serialize migration preserves exponent ambiguity by source dialect", () => {
	const currentToNext = migrate("value: 1e3", "current", "next");
	assert.equal(currentToNext.original.value, "1e3");
	assert.equal(currentToNext.serialized, 'value: "1e3"');
	assert.equal(parseALE("value: 1e3", { grammar: "next" }).value, 1000);

	const nextToCurrent = migrate("value: 1e3", "next", "current");
	assert.equal(nextToCurrent.original.value, 1000);
	assert.equal(nextToCurrent.serialized, "value: 1000");
});

test("legacy migrations preserve the parsed semantic value in current and next", () => {
	for (const target of ["current", "next"]) {
		const migrated = migrate("value: 1e3", "legacy", target);
		assert.equal(migrated.original.value, "1e3");
		if (target === "next") assert.equal(migrated.serialized, 'value: "1e3"');
	}
	const duplicate = migrate("value: first\nvalue: last", "legacy", "current");
	assert.deepStrictEqual(duplicate.original, { value: "last" });
});
