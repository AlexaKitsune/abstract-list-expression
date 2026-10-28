import assert from "node:assert/strict";
import { parseALE, stringifyALE } from "../../ale.js";
import { makeDeepChain, makeGenerator, measureDepth, optionCases } from "../../tests/value-generator.js";

const seed = Number(process.env.ALE_NEXT_SEED ?? 0x5f2026) >>> 0;
const cases = Math.max(1, Number(process.env.ALE_NEXT_CASES ?? 10_000));
const depthCases = Math.max(1, Number(process.env.ALE_NEXT_DEPTH_CASES ?? 128));
let roundTrips = 0;
const depthResults = [];

const generator = makeGenerator(seed);
for (let index = 0; index < cases; index++) {
	const value = generator.value();
	for (const options of optionCases) {
		const encoded = stringifyALE(value, { ...options, grammar: "next" });
		assert.deepStrictEqual(parseALE(encoded, { grammar: "next" }), value, `seed=${seed}, case=${index}, options=${JSON.stringify(options)}, ALE=${encoded}`);
		roundTrips++;
	}
}

for (const depth of [4, 8, 16, 32]) {
	const deepGenerator = makeGenerator(seed ^ depth, { maxDepth: depth, maxNodes: 96, maxContainerSize: 3 });
	const values = Array.from({ length: depthCases }, () => deepGenerator.value());
	values.push(makeDeepChain(depth));
	let maxDepth = 0;
	let checks = 0;
	for (const value of values) {
		maxDepth = Math.max(maxDepth, measureDepth(value));
		for (const options of optionCases) {
			const encoded = stringifyALE(value, { ...options, grammar: "next" });
			assert.deepStrictEqual(parseALE(encoded, { grammar: "next" }), value, `depth=${depth}, options=${JSON.stringify(options)}, ALE=${encoded}`);
			checks++;
		}
	}
	depthResults.push({ requestedDepth: depth, observedDepth: maxDepth, values: values.length, optionsPerValue: optionCases.length, roundTrips: checks });
}

console.log(JSON.stringify({ grammar: "next", seed, generatedValues: cases, optionCases: optionCases.length, generatedRoundTrips: roundTrips, depthResults, depthRoundTrips: depthResults.reduce((sum, row) => sum + row.roundTrips, 0), failures: 0 }, null, 2));
