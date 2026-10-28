import { readFile, writeFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
import { isDeepStrictEqual } from "node:util";
import { encode as toonEncode, decode as toonDecode } from "@toon-format/toon";
import { dump as yamlDump, load as yamlLoad } from "js-yaml";
import { getEncoding } from "js-tiktoken";
import { parseALE, stringifyALE } from "../../ale.js";
import { extendedCorpus } from "./extended-corpus.js";

const root = new URL("../../", import.meta.url);
const baseCorpus = JSON.parse(await readFile(new URL("../ale-5b/corpus.json", import.meta.url), "utf8"))
	.map(({ id, category, value }) => ({ id, category, origin: "Corpus original ALE-5B, reutilizado sin cambios.", value }));
const corpus = [...baseCorpus, ...extendedCorpus];
const iterations = Number(process.env.ALE_BENCH_ITERATIONS ?? 8);
const sampleCount = Number(process.env.ALE_BENCH_SAMPLES ?? 21);
const warmupPasses = Number(process.env.ALE_BENCH_WARMUPS ?? 3);
const tokenizer = getEncoding("o200k_base");

async function packageVersion(name) {
	const path = name.startsWith("@") ? name.split("/") : [name];
	const packageJson = await readFile(new URL(`node_modules/${path.join("/")}/package.json`, root), "utf8");
	return JSON.parse(packageJson).version;
}

function byteLength(text) { return Buffer.byteLength(text, "utf8"); }
function tokenCount(text) { return tokenizer.encode(text).length; }

const serializers = [
	{ id: "json-compact", stringify: JSON.stringify, parse: JSON.parse },
	{ id: "yaml-js-yaml", stringify: yamlDump, parse: yamlLoad },
	{ id: "toon-official", stringify: toonEncode, parse: toonDecode },
	{ id: "ale-default", stringify: (v) => stringifyALE(v), parse: parseALE },
	{ id: "ale-next", stringify: (v) => stringifyALE(v, { grammar: "next" }), parse: (text) => parseALE(text, { grammar: "next" }) },
	{ id: "ale-next-indent-one-space", stringify: (v) => stringifyALE(v, { grammar: "next", indent: " " }), parse: (text) => parseALE(text, { grammar: "next" }) },
	{ id: "ale-useTables-false", stringify: (v) => stringifyALE(v, { useTables: false }), parse: parseALE },
	{ id: "ale-useSpread-false", stringify: (v) => stringifyALE(v, { useSpread: false }), parse: parseALE },
	{ id: "ale-booleanShortcuts-false", stringify: (v) => stringifyALE(v, { booleanShortcuts: false }), parse: parseALE },
];

const rows = [];
for (const entry of corpus) {
	const sourceJson = JSON.stringify(entry.value);
	const perFormat = {};
	for (const format of serializers) {
		let text, decoded, error = null;
		try {
			text = format.stringify(entry.value);
			decoded = format.parse(text);
		} catch (e) { error = `${e.name}: ${e.message}`; }
		const equivalent = error === null && isDeepStrictEqual(decoded, entry.value);
		const metrics = text === undefined ? {} : {
			bytesUtf8: byteLength(text),
			tokensO200kBase: tokenCount(text),
			unicodeCodePoints: [...text].length,
			utf16CodeUnits: text.length,
		};
		perFormat[format.id] = { text, equivalent, error, ...metrics };
		rows.push({
			id: entry.id, category: entry.category, origin: entry.origin,
			sourceJsonBytesUtf8: byteLength(sourceJson), format: format.id,
			equivalent, error, ...metrics,
		});
	}
	const baseline = perFormat["json-compact"];
	for (const row of rows.filter((r) => r.id === entry.id)) {
		const result = perFormat[row.format];
		const comparable = baseline.equivalent && result.equivalent && baseline.text !== undefined && result.text !== undefined;
		row.comparableToJson = comparable;
		row.deltaBytesVsJson = comparable ? result.bytesUtf8 - baseline.bytesUtf8 : null;
		row.deltaBytesPercentVsJson = comparable && baseline.bytesUtf8 !== 0
			? (result.bytesUtf8 - baseline.bytesUtf8) / baseline.bytesUtf8 * 100 : null;
		row.deltaTokensVsJson = comparable ? result.tokensO200kBase - baseline.tokensO200kBase : null;
		row.deltaTokensPercentVsJson = comparable && baseline.tokensO200kBase !== 0
			? (result.tokensO200kBase - baseline.tokensO200kBase) / baseline.tokensO200kBase * 100 : null;
	}
}

const commonCases = new Set(corpus.filter((entry) => serializers.every((format) => {
	const row = rows.find((r) => r.id === entry.id && r.format === format.id);
	return row?.equivalent;
})).map((entry) => entry.id));

function measure(fn, cases) {
	for (let n = 0; n < warmupPasses; n++) for (let repeat = 0; repeat < iterations; repeat++) for (const entry of cases) fn(entry);
	const observations = [];
	for (let sample = 0; sample < sampleCount; sample++) {
		const start = performance.now();
		for (let repeat = 0; repeat < iterations; repeat++) for (const entry of cases) fn(entry);
		observations.push(performance.now() - start);
	}
	observations.sort((a, b) => a - b);
	return {
		medianMs: observations[Math.floor(observations.length / 2)],
		p95Ms: observations[Math.min(Math.ceil(observations.length * 0.95) - 1, observations.length - 1)],
		observationsMs: observations,
	};
}

const performanceResults = {};
const performanceCorpus = corpus.filter(({ id }) => commonCases.has(id));
for (const format of serializers) {
	const documents = new Map(performanceCorpus.map((entry) => [entry.id, format.stringify(entry.value)]));
	performanceResults[format.id] = {
		cases: performanceCorpus.length,
		serialization: measure((entry) => format.stringify(entry.value), performanceCorpus),
		parsing: measure((entry) => format.parse(documents.get(entry.id)), performanceCorpus),
		roundTrip: measure((entry) => format.parse(format.stringify(entry.value)), performanceCorpus),
	};
}

const versions = {
	node: process.version,
	toon: await packageVersion("@toon-format/toon"),
	jsYaml: await packageVersion("js-yaml"),
	jsTiktoken: await packageVersion("js-tiktoken"),
	tokenizer: "o200k_base",
	alePackage: JSON.parse(await readFile(new URL("package.json", root), "utf8")).version,
};
const result = {
	generatedAt: new Date().toISOString(),
	versions,
	method: { iterationsPerSample: iterations, samples: sampleCount, warmupPasses, performanceCommonCaseCount: performanceCorpus.length, tokenizerTimingExcluded: true },
	corpus: corpus.map(({ id, category, origin, value }) => ({ id, category, origin, sourceJsonBytesUtf8: byteLength(JSON.stringify(value)) })),
	rows,
	performance: performanceResults,
	canonicalStability: Object.fromEntries(serializers.filter((x) => x.id.startsWith("ale-")).map((format) => {
		const failures = [];
		for (const entry of corpus) {
			try {
				const first = format.stringify(entry.value);
				const second = format.stringify(format.parse(first));
				if (first !== second) failures.push({ id: entry.id, first, second });
			} catch (e) { failures.push({ id: entry.id, error: `${e.name}: ${e.message}` }); }
		}
		return [format.id, { checked: corpus.length, failures }];
	})),
	numericExponentSimulation: (() => {
		const simulated = "ordinary: [0, 1, -1, 12.5, -0.125, 9007199254740991]\nextremes: [1e-7, 1e+21, 1.7976931348623157e+308, 5e-324, -1.7976931348623157e+308]";
		const actual = rows.filter((r) => r.id === "numbers-extended");
		const get = (format) => actual.find((r) => r.format === format);
		return {
			status: "hypothetical text; not emitted by stringifyALE and excluded from ALE results",
			basis: "Shortest JavaScript Number.toString() forms for the finite source values, shown in compact inline arrays.",
			bytesUtf8: byteLength(simulated),
			tokensO200kBase: tokenCount(simulated),
			comparedActual: {
				jsonCompact: { bytesUtf8: get("json-compact").bytesUtf8, tokensO200kBase: get("json-compact").tokensO200kBase },
				aleCurrent: { bytesUtf8: get("ale-default").bytesUtf8, tokensO200kBase: get("ale-default").tokensO200kBase },
			},
		};
	})(),
};

await writeFile(new URL("./results.json", import.meta.url), JSON.stringify(result, null, 2) + "\n");
console.log(JSON.stringify(result, null, 2));
