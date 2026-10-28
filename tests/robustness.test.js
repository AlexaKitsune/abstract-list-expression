import test from "node:test";
import assert from "node:assert/strict";
import { parseALE, stringifyALE } from "../ale.js";
import { evaluateFuzzCorpus, makeFuzzCorpus } from "./fuzz-utils.js";
import { makeDeepChain, makeGenerator, optionCases } from "./value-generator.js";

test("depth-limited generated values and exact deep chains round-trip with all serializer options", { timeout: 30_000 }, () => {
	const seed = Number(process.env.ALE_DEPTH_SEED ?? 0x4c4c2026) >>> 0;
	for (const depth of [4, 8, 16, 32]) {
		const generator = makeGenerator(seed ^ depth, { maxDepth: depth, maxNodes: 96, maxContainerSize: 3 });
		const values = Array.from({ length: 32 }, () => generator.value());
		values.push(makeDeepChain(depth));
		for (const [index, value] of values.entries()) {
			for (const options of optionCases) {
				const encoded = stringifyALE(value, options);
				assert.deepStrictEqual(parseALE(encoded), value, `depth=${depth}, case=${index}, options=${JSON.stringify(options)}`);
			}
		}
	}
});

test("deterministic malformed-input fuzz terminates and has no internal exceptions or prototype effects", { timeout: 30_000 }, () => {
	const seed = Number(process.env.ALE_FUZZ_SEED ?? 0x4f555a5a) >>> 0;
	const cases = makeFuzzCorpus(seed, Number(process.env.ALE_FUZZ_CASES ?? 400));
	const result = evaluateFuzzCorpus(cases, { timeoutMs: 20_000 });
	assert.equal(result.timeout, undefined, `fuzz worker timed out: ${JSON.stringify(result)}`);
	assert.equal(result.spawnError, undefined, JSON.stringify(result));
	assert.equal(result.exitCode, undefined, JSON.stringify(result));
	assert.equal(result.unexpected?.length, 0, JSON.stringify(result.unexpected, null, 2));
	assert.equal(result.prototypeMutation, false, JSON.stringify(result));
	assert.equal(result.prototypeResult, false, JSON.stringify(result));
	assert.equal(result.contentExecuted, false, JSON.stringify(result));
});

test("resource smoke cases parse and serialize 1 KB and 10 KB documents", () => {
	for (const targetBytes of [1024, 10 * 1024]) {
		const prefix = "payload: \"";
		const suffix = "\"";
		const source = `${prefix}${"x".repeat(targetBytes - prefix.length - suffix.length)}${suffix}`;
		const parsed = parseALE(source);
		assert.equal(Buffer.byteLength(source), targetBytes);
		assert.deepStrictEqual(parseALE(stringifyALE(parsed)), parsed);
	}
});
