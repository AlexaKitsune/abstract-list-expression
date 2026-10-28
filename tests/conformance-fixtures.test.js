import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { parseALE, stringifyALE } from "../ale.js";

const fixture = JSON.parse(await readFile(new URL("../conformance/ale-conformance.json", import.meta.url), "utf8"));

function valueAtPath(value, path) {
	return path.reduce((current, key) => current[key], value);
}

function binary64Hex(value) {
	const view = new DataView(new ArrayBuffer(8));
	view.setFloat64(0, value, false);
	return view.getBigUint64(0, false).toString(16).padStart(16, "0");
}

test("portable conformance fixtures check semantic values and canonical forms", () => {
	assert.equal(fixture.format, "ALE-Conformance-1");
	for (const entry of fixture.validDocuments) {
		const actual = parseALE(entry.source, { grammar: entry.dialect });
		assert.deepStrictEqual(actual, entry.expectedJSON, entry.id);
		for (const special of entry.specialValues ?? []) {
			assert.equal(special.encoding, "binary64", entry.id);
			assert.equal(binary64Hex(valueAtPath(actual, special.path)), special.bits, entry.id);
		}
		if (entry.canonical !== undefined)
			assert.equal(stringifyALE(actual, { grammar: entry.dialect }), entry.canonical, entry.id);
	}
});

test("portable conformance fixtures enumerate dialect-specific interpretations", () => {
	for (const entry of fixture.dialectDifferences) for (const [dialect, expected] of Object.entries(entry.outcomes))
		assert.deepStrictEqual(parseALE(entry.source, { grammar: dialect }), expected, entry.id + "/" + dialect);
	for (const entry of fixture.compatibilityMatrix) for (const [dialect, expected] of Object.entries(entry.outcomes)) {
		if (expected?.error)
			assert.throws(() => parseALE(entry.source, { grammar: dialect }), (error) => error?.name === expected.error, `${entry.feature}/${dialect}`);
		else assert.deepStrictEqual(parseALE(entry.source, { grammar: dialect }), expected, `${entry.feature}/${dialect}`);
	}
});

test("portable invalid fixtures require controlled parser errors without message coupling", () => {
	for (const entry of fixture.invalidDocuments)
		assert.throws(() => parseALE(entry.source, { grammar: entry.dialect }), (error) => error?.name === entry.expectedError, entry.id);
});
