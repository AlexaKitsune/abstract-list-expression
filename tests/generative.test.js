import test from "node:test";
import assert from "node:assert/strict";
import { parseALE, stringifyALE } from "../ale.js";
import { makeGenerator, optionCases } from "./value-generator.js";

const DEFAULT_SEED = Number(process.env.ALE_SEED ?? 0x4a1e2026) >>> 0;
const ITERATIONS = Math.max(1, Number(process.env.ALE_CASES ?? 10_000));

function failureCategory(value, error) {
	if (error?.name !== "AssertionError") return "parser-or-serializer-throw";
	if (Array.isArray(value)) return "array-shape-or-order";
	if (value && typeof value === "object") return "object-type-or-key";
	if (typeof value === "string") return "string-type-or-escape";
	return "scalar-type-or-value";
}

function firstDifference(actual, expected, path = "$", seen = new WeakSet()) {
	if (Object.is(actual, expected)) return null;
	if (typeof actual !== typeof expected || actual === null || expected === null)
		return `value/type at ${path}`;
	if (typeof actual !== "object") return `scalar value at ${path}`;
	if (seen.has(actual)) return `cycle at ${path}`;
	seen.add(actual);
	if (Array.isArray(actual) !== Array.isArray(expected)) return `container type at ${path}`;
	if (Array.isArray(actual)) {
		if (actual.length !== expected.length) return `array length at ${path}`;
		for (let i = 0; i < actual.length; i++) {
			const diff = firstDifference(actual[i], expected[i], `${path}[${i}]`, seen);
			if (diff) return diff;
		}
		return null;
	}
	const actualKeys = Object.keys(actual).sort();
	const expectedKeys = Object.keys(expected).sort();
	if (actualKeys.join("\0") !== expectedKeys.join("\0")) return `object keys at ${path}`;
	for (const key of expectedKeys) {
		const diff = firstDifference(actual[key], expected[key], `${path}.${JSON.stringify(key)}`, seen);
		if (diff) return diff;
	}
	return null;
}

function failsRoundTrip(value, options) {
	try {
		assert.deepStrictEqual(parseALE(stringifyALE(value, options)), value);
		return false;
	} catch {
		return true;
	}
}

function simplerValues(value) {
	const output = [null, false, 0, "", "x"];
	if (Array.isArray(value)) output.push([]);
	else if (value && typeof value === "object") output.push({});
	return output;
}

function shrinkFailure(value, options) {
	let current = structuredClone(value);
	let changed = true;
	while (changed) {
		changed = false;
		const candidates = [];
		const walk = (node, path = []) => {
			if (Array.isArray(node)) {
				candidates.push(...node.map((_, index) => {
					const copy = structuredClone(current);
					let parent = copy;
					for (const key of path) parent = parent[key];
					parent.splice(index, 1);
					return copy;
				}));
				for (let index = 0; index < node.length; index++) {
					for (const replacement of simplerValues(node[index])) {
						const copy = structuredClone(current);
						let parent = copy;
						for (const key of path) parent = parent[key];
						parent[index] = replacement;
						candidates.push(copy);
					}
					walk(node[index], [...path, index]);
				}
			} else if (node && typeof node === "object") {
				for (const key of Object.keys(node)) {
					const copy = structuredClone(current);
					let parent = copy;
					for (const part of path) parent = parent[part];
					delete parent[key];
					candidates.push(copy);
					for (const replacement of simplerValues(node[key])) {
						const replaced = structuredClone(current);
						let target = replaced;
						for (const part of path) target = target[part];
						Object.defineProperty(target, key, { value: replacement, enumerable: true, configurable: true, writable: true });
						candidates.push(replaced);
					}
					walk(node[key], [...path, key]);
				}
			}
		};
		walk(current);
		candidates.sort((a, b) => JSON.stringify(a).length - JSON.stringify(b).length);
		for (const candidate of candidates) {
			if (JSON.stringify(candidate).length >= JSON.stringify(current).length) continue;
			if (failsRoundTrip(candidate, options)) {
				current = candidate;
				changed = true;
				break;
			}
		}
	}
	return current;
}

test("generated JSON values round-trip under a reproducible option matrix", { timeout: 120_000 }, () => {
	const generator = makeGenerator(DEFAULT_SEED);
	const failures = [];
	const counts = new Map();
	const detailedCounts = new Map();
	const optionCounts = new Map();
	const failedIterations = new Set();
	const sampledSignatures = new Set();
	for (let iteration = 0; iteration < ITERATIONS; iteration++) {
		const value = generator.value();
		for (const options of optionCases) {
			let encoded;
			let decoded;
			let phase = "stringify";
			try {
				encoded = stringifyALE(value, options);
				phase = "parse";
				decoded = parseALE(encoded);
				phase = "compare";
				assert.deepStrictEqual(decoded, value);
			} catch (error) {
				const category = failureCategory(value, error);
				counts.set(category, (counts.get(category) ?? 0) + 1);
				const detail = error?.name === "AssertionError"
					? firstDifference(decoded, value) ?? "assertion mismatch"
					: `${phase}: ${String(error?.message ?? error).split("\n")[0].replace(/^Line \d+: /, "")}`;
				detailedCounts.set(detail, (detailedCounts.get(detail) ?? 0) + 1);
				const optionName = JSON.stringify(options);
				optionCounts.set(optionName, (optionCounts.get(optionName) ?? 0) + 1);
				failedIterations.add(iteration);
				if (!sampledSignatures.has(detail) && failures.length < 8) {
					sampledSignatures.add(detail);
					const minimal = shrinkFailure(value, options);
					let minimalALE;
					let minimalDecoded;
					let minimalError;
					try {
						minimalALE = stringifyALE(minimal, options);
						minimalDecoded = parseALE(minimalALE);
						assert.deepStrictEqual(minimalDecoded, minimal);
					} catch (e) { minimalError = e?.message ?? String(e); }
					failures.push({
					seed: DEFAULT_SEED,
					iteration,
					options,
					original: minimal,
					ale: minimalALE,
					decoded: minimalDecoded,
					error: minimalError ?? error?.message ?? String(error),
				});
				}
			}
		}
	}
	if (failures.length) {
		const topSignatures = Object.fromEntries([...detailedCounts].sort((a, b) => b[1] - a[1]).slice(0, 20));
		assert.fail(`Generated round-trip campaign: seed=${DEFAULT_SEED}, values=${ITERATIONS}, option-runs=${ITERATIONS * optionCases.length}, unique-values-with-failure=${failedIterations.size}; failure categories=${JSON.stringify(Object.fromEntries(counts))}; technical-signatures-top20=${JSON.stringify(topSignatures)}; failures-by-options=${JSON.stringify(Object.fromEntries(optionCounts))}; reduced examples=${JSON.stringify(failures, null, 2)}`);
	}
});

test("valid ALE source corpus is semantically stable after canonical serialization", () => {
	const sources = [
		"name: Alexa\nactive: true\nitems: [1, 2, null]",
		"items: []:\n    1\n    text: true\n    >text: false\n    []:\n        x\n        2",
		"rows{id, label}:\n    1, alpha\n    2, beta",
		"rows:\n    {name, age}:\n        Alexa, 28\n        Booker,",
		"rows: []:\n    ...{x, y}:\n        1, -\n        2, two",
		"rows{notes, details}:\n    [:], {kind}\n        hello\n        <details\n        one\n        two",
		"root{only}:\n    alpha\n    beta",
		"value: {not a key: just text}",
	];
	for (let index = 0; index < sources.length; index++) {
		const source = sources[index];
		const first = parseALE(source);
		const encoded = stringifyALE(first);
		const second = parseALE(encoded);
		assert.deepStrictEqual(second, first, `source #${index}: ${source}\ncanonical:\n${encoded}`);
	}
	const legacy = "items:\n    {name, age}:\n    Alexa, 28\n    Booker,";
	const legacyValue = parseALE(legacy, { grammar: "legacy" });
	assert.deepStrictEqual(parseALE(stringifyALE(legacyValue)), legacyValue, "legacy source remains stable after canonicalization");
});
