import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { parseALE, stringifyALE } from "../ale.js";

const corpus = JSON.parse(await readFile(new URL("../benchmarks/ale-5b/corpus.json", import.meta.url), "utf8"));
const options = [
	["default", {}],
	["useTables-false", { useTables: false }],
	["useSpread-false", { useSpread: false }],
	["booleanShortcuts-false", { booleanShortcuts: false }],
];

for (const [name, option] of options) {
	test(`ALE-5B canonical stability: ${name}`, () => {
		for (const { id, value } of corpus) {
			const first = stringifyALE(value, option);
			const second = stringifyALE(parseALE(first), option);
			assert.equal(second, first, `case=${id} options=${name}`);
		}
	});
}
