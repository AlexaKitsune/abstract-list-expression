import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import { parseALE, stringifyALE } from "../ale.js";
import { evaluateFuzzCorpus, makeFuzzCorpus } from "./fuzz-utils.js";
import { makeDeepChain, makeGenerator, measureDepth, optionCases } from "./value-generator.js";

const seed = Number(process.env.ALE_DEPTH_SEED ?? 0x4c4c2026) >>> 0;
const casesPerDepth = Math.max(1, Number(process.env.ALE_DEPTH_CASES ?? 128));
const depthResults = [];
const failures = [];
const sampledFailureKinds = new Set();

for (const depth of [4, 8, 16, 32]) {
	const started = performance.now();
	const generator = makeGenerator(seed ^ depth, { maxDepth: depth, maxNodes: 96, maxContainerSize: 3 });
	const values = Array.from({ length: casesPerDepth }, () => generator.value());
	values.push(makeDeepChain(depth));
	let actualMaximumDepth = 0;
	let runs = 0;
	let passing = 0;
	const failuresByOptions = Object.fromEntries(optionCases.map((options) => [JSON.stringify(options), 0]));
	for (let caseIndex = 0; caseIndex < values.length; caseIndex++) {
		const value = values[caseIndex];
		actualMaximumDepth = Math.max(actualMaximumDepth, measureDepth(value));
		for (const options of optionCases) {
			runs++;
			try {
				const ale = stringifyALE(value, options);
				assert.deepStrictEqual(parseALE(ale), value);
				passing++;
			} catch (error) {
				failuresByOptions[JSON.stringify(options)]++;
				const failureKind = `${depth}:${caseIndex < casesPerDepth ? "generated" : "deep-chain"}`;
				if (!sampledFailureKinds.has(failureKind) && failures.length < 8) {
					sampledFailureKinds.add(failureKind);
					let ale;
					let decoded;
					try { ale = stringifyALE(value, options); decoded = parseALE(ale); } catch { /* capture original failure below */ }
					failures.push({ depth, caseIndex, options, value, ale, decoded, error: String(error?.message ?? error).split("\n")[0] });
				}
			}
		}
	}
	depthResults.push({
		requestedDepth: depth,
		actualMaximumDepth: Math.max(actualMaximumDepth, measureDepth(makeDeepChain(depth))),
		generatedValues: values.length,
		optionsPerValue: optionCases.length,
		runs,
		passed: passing,
		failed: runs - passing,
		failuresByOptions,
		elapsedMs: Number((performance.now() - started).toFixed(2)),
	});
}

const resourceResults = [];
for (const targetBytes of [1024, 10 * 1024, 100 * 1024, 1024 * 1024]) {
	const lines = [];
	let actualBytes = 0;
	for (let i = 0; actualBytes < targetBytes; i++) {
		const line = `k${String(i).padStart(8, "0")}: ${i % 10}\n`;
		lines.push(line);
		actualBytes += Buffer.byteLength(line);
	}
	const source = lines.join("");
	let time = performance.now();
	const parsed = parseALE(source);
	const parseMs = performance.now() - time;
	time = performance.now();
	const encoded = stringifyALE(parsed);
	const stringifyMs = performance.now() - time;
	time = performance.now();
	const decoded = parseALE(encoded);
	const reparseMs = performance.now() - time;
	assert.deepStrictEqual(decoded, parsed);
	resourceResults.push({
		targetBytes,
		actualBytes: Buffer.byteLength(source),
		properties: Object.keys(parsed).length,
		parseMs: Number(parseMs.toFixed(2)),
		stringifyMs: Number(stringifyMs.toFixed(2)),
		reparseMs: Number(reparseMs.toFixed(2)),
		encodedBytes: Buffer.byteLength(encoded),
	});
}

const fuzzSeed = Number(process.env.ALE_FUZZ_SEED ?? 0x4f555a5a) >>> 0;
const fuzzCount = Math.max(1, Number(process.env.ALE_FUZZ_CASES ?? 1000));
const fuzzResult = evaluateFuzzCorpus(makeFuzzCorpus(fuzzSeed, fuzzCount), { timeoutMs: 20_000 });

const report = {
	seed,
	casesPerDepth,
	options: optionCases,
	depthResults,
	resourceResults,
	fuzz: { seed: fuzzSeed, inputCount: fuzzCount, ...fuzzResult },
	failures,
};
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
if (failures.length || fuzzResult.timeout || fuzzResult.unexpected?.length || fuzzResult.prototypeMutation || fuzzResult.prototypeResult || fuzzResult.contentExecuted)
	process.exitCode = 1;
