import { readFile, writeFile } from "node:fs/promises";
import { getEncoding } from "js-tiktoken";
import { stringifyALE } from "../../ale.js";
import { extendedCorpus } from "../ale-5b1/extended-corpus.js";

const base = JSON.parse(await readFile(new URL("../ale-5b/corpus.json", import.meta.url), "utf8"));
const corpus = [
	...base.map(({ id, category, value }) => ({ id, category, value })),
	...extendedCorpus,
];
const benchmark = JSON.parse(await readFile(new URL("../ale-5b1/results.json", import.meta.url), "utf8"));
const resultById = new Map();
for (const row of benchmark.rows) {
	const current = resultById.get(row.id) ?? {};
	current[row.format] = row;
	resultById.set(row.id, current);
}
const tokenizer = getEncoding("o200k_base");
const bytes = (text) => Buffer.byteLength(text, "utf8");
const tokens = (text) => tokenizer.encode(text).length;

function expandDecimal(value) {
	if (Object.is(value, -0)) return "-0";
	const source = String(value);
	if (!/[eE]/.test(source)) return source;
	const [mantissa, exponentText] = source.toLowerCase().split("e");
	const exponent = Number(exponentText);
	const negative = mantissa.startsWith("-");
	const unsigned = negative ? mantissa.slice(1) : mantissa;
	const point = unsigned.indexOf(".");
	const integerLength = point === -1 ? unsigned.length : point;
	const digits = unsigned.replace(".", "");
	const targetPoint = integerLength + exponent;
	let expanded;
	if (targetPoint <= 0) expanded = `0.${"0".repeat(-targetPoint)}${digits}`;
	else if (targetPoint >= digits.length) expanded = `${digits}${"0".repeat(targetPoint - digits.length)}`;
	else expanded = `${digits.slice(0, targetPoint)}.${digits.slice(targetPoint)}`;
	return negative ? `-${expanded}` : expanded;
}

function scientific(value) {
	if (Object.is(value, -0)) return "-0";
	if (value === 0) return "0";
	const source = String(value).toLowerCase();
	const negative = source.startsWith("-");
	const unsigned = negative ? source.slice(1) : source;
	const [mantissa, expText] = unsigned.split("e");
	const exponentPart = expText === undefined ? 0 : Number(expText);
	const point = mantissa.indexOf(".");
	const originalPoint = point < 0 ? mantissa.length : point;
	const digits = mantissa.replace(".", "");
	const firstNonZero = digits.search(/[1-9]/);
	const scientificExponent = originalPoint - firstNonZero - 1 + exponentPart;
	const significant = digits.slice(firstNonZero).replace(/0+$/, "") || "0";
	const coefficient = significant.length === 1 ? significant : `${significant[0]}.${significant.slice(1)}`;
	return `${negative ? "-" : ""}${coefficient}e${scientificExponent}`;
}

// Find bare numeric scalar cells while leaving quoted strings and key/header
// names untouched. This only edits candidate output text; it is not an ALE parser.
function numericSpans(text) {
	const spans = [];
	let quoted = false;
	for (let i = 0; i < text.length;) {
		const ch = text[i];
		if (quoted) {
			if (ch === "\\") i += 2;
			else {
				if (ch === '"') quoted = false;
				i++;
			}
			continue;
		}
		if (ch === '"') { quoted = true; i++; continue; }
		const match = text.slice(i).match(/^-?(?:0|[1-9]\d*)(?:\.\d+)?/);
		if (!match) { i++; continue; }
		const start = i;
		const raw = match[0];
		const end = start + raw.length;
		const prev = text[start - 1] ?? "";
		const next = text[end] ?? "";
		const lineStart = text.lastIndexOf("\n", start - 1) + 1;
		const lineEndIndex = text.indexOf("\n", start);
		const lineEnd = lineEndIndex < 0 ? text.length : lineEndIndex;
		const line = text.slice(lineStart, lineEnd);
		const headerOpen = line.lastIndexOf("{", start - lineStart);
		const headerClose = line.indexOf("}", start - lineStart);
		const inTableHeader = headerOpen >= 0 && headerClose > start - lineStart && /^}:/.test(line.slice(headerClose).trimStart());
		const looksLikeKey = next === ":" || (inTableHeader && (next === "," || next === "}"));
		const validBoundary = !/[\w.]/u.test(prev) && !/[\w.]/u.test(next);
		if (validBoundary && !looksLikeKey && Number.isFinite(Number(raw))) {
			spans.push({ start, end, raw, value: Number(raw) });
			i = end;
		} else i++;
	}
	return spans;
}

function applyChoices(text, spans, choices) {
	let output = text;
	for (let i = spans.length - 1; i >= 0; i--) {
		const { start, end } = spans[i];
		output = output.slice(0, start) + choices[i] + output.slice(end);
	}
	return output;
}

function chooseLocally(text, spans, metric) {
	const choices = spans.map(({ raw, value, start, end }) => {
		const prefix = text.slice(Math.max(0, start - 16), start);
		const suffix = text.slice(end, end + 16);
		const candidates = [...new Set([raw, Object.is(value, -0) ? "-0" : String(value), scientific(value)])];
		return candidates.reduce((best, candidate) =>
			metric(`${prefix}${candidate}${suffix}`) < metric(`${prefix}${best}${suffix}`) ? candidate : best, raw);
	});
	return { text: applyChoices(text, spans, choices), choices };
}

function scenario(currentText) {
	const spans = numericSpans(currentText);
	const jsShortest = applyChoices(currentText, spans, spans.map(({ value }) => Object.is(value, -0) ? "-0" : String(value)));
	const allScientific = applyChoices(currentText, spans, spans.map(({ value }) => scientific(value)));
	const minBytes = chooseLocally(currentText, spans, bytes);
	const minTokens = chooseLocally(currentText, spans, tokens);
	return {
		count: spans.length,
		current: currentText,
		jsShortest,
		allScientific,
		minBytes: minBytes.text,
		minTokens: minTokens.text,
	};
}

const rows = [];
for (const entry of corpus) {
	const formats = resultById.get(entry.id);
	const ale = formats?.["ale-default"];
	const toon = formats?.["toon-official"];
	if (!ale?.equivalent || !toon?.equivalent) continue;
	const sim = scenario(stringifyALE(entry.value));
	for (const [representation, text] of [
		["current", sim.current], ["js-shortest", sim.jsShortest], ["always-scientific", sim.allScientific],
		["min-bytes-coordinate", sim.minBytes], ["min-tokens-coordinate", sim.minTokens],
	]) rows.push({
		id: entry.id,
		category: entry.category,
		representation,
		numericOccurrences: sim.count,
		bytesUtf8: bytes(text),
		tokensO200kBase: tokens(text),
		deltaBytesVsAle5d: bytes(text) - bytes(sim.current),
		deltaTokensVsAle5d: tokens(text) - tokens(sim.current),
		bytesVsToon: bytes(text) - toon.bytesUtf8,
		tokensVsToon: tokens(text) - toon.tokensO200kBase,
		text,
	});
}

const summaries = {};
for (const representation of ["current", "js-shortest", "always-scientific", "min-bytes-coordinate", "min-tokens-coordinate"]) {
	const subset = rows.filter((row) => row.representation === representation);
	summaries[representation] = {
		cases: subset.length,
		bytesUtf8: subset.reduce((sum, row) => sum + row.bytesUtf8, 0),
		tokensO200kBase: subset.reduce((sum, row) => sum + row.tokensO200kBase, 0),
	};
}

// Deterministic IEEE-754 sample: generate raw 64-bit patterns, skipping non-finite values.
function makeRng(seed) {
	let state = seed >>> 0;
	return () => {
		state ^= state << 13; state ^= state >>> 17; state ^= state << 5;
		return state >>> 0;
	};
}
const rng = makeRng(0x5e2026);
const view = new DataView(new ArrayBuffer(8));
const exactPatterns = [0n, 0x8000000000000000n, 1n, 0x000fffffffffffffn, 0x0010000000000000n, 0x7fefffffffffffffn, 0xffefffffffffffffn];
let checks = 0;
let patternIndex = 0;
while (checks < 100_000) {
	let bits;
	if (patternIndex < exactPatterns.length) bits = exactPatterns[patternIndex++];
	else bits = (BigInt(rng()) << 32n) | BigInt(rng());
	view.setBigUint64(0, bits, false);
	const value = view.getFloat64(0, false);
	if (!Number.isFinite(value)) continue;
	const shortest = Object.is(value, -0) ? "-0" : String(value);
	const expanded = expandDecimal(value);
	const scientificText = scientific(value);
	for (const [label, representation] of [["shortest", shortest], ["expanded", expanded], ["scientific", scientificText]]) {
		const recovered = Number(representation);
		if (!Object.is(recovered, value)) throw new Error(`${label} failed at seed 0x5e2026 bits=0x${bits.toString(16)} value=${value} repr=${representation}`);
	}
	checks++;
}

const report = {
	status: "Simulation only; proposed scientific output is not valid under the current ALE grammar and is not emitted by stringifyALE.",
	versions: { node: process.version, tokenizer: "o200k_base", corpus: "ALE-5B.1 result corpus; 13 original ALE-5B cases plus 9 deterministic extended cases" },
	method: {
		bytes: "UTF-8 byte count",
		tokens: "js-tiktoken o200k_base over complete serialized text",
		jsShortest: "replace numeric value tokens with String(Number(token))",
		alwaysScientific: "normalize each finite non-zero numeric value to one leading digit and a base-10 exponent; zero and -0 remain unchanged",
		coordinatePolicies: "choose per numeric token using UTF-8 length or o200k_base count on the token with 16-character context each side; final whole-document metrics are then counted exactly; contextual local heuristic, not global optimum",
		lexerLimitation: "simulation scanner excludes quoted strings and obvious bare keys/table headers; it is a benchmark text scanner, not a normative ALE lexer",
	},
	corpus: { cases: corpus.length, numericDocuments: rows.filter((row) => row.representation === "current" && row.numericOccurrences > 0).length },
	summaries,
	byCategory: Object.fromEntries([...new Set(rows.map((row) => row.category))].map((category) => [category, Object.fromEntries(rows.filter((row) => row.category === category).map((row) => [row.representation, { bytesUtf8: row.bytesUtf8, tokensO200kBase: row.tokensO200kBase, deltaBytesVsAle5d: row.deltaBytesVsAle5d, deltaTokensVsAle5d: row.deltaTokensVsAle5d }]))])),
	rows,
	ieee754: {
		seed: "0x5e2026",
		finitePatternsChecked: checks,
		representationsCheckedPerPattern: 3,
		allExactByObjectIs: true,
		specialPatterns: ["+0", "-0", "Number.MIN_VALUE", "largest subnormal", "smallest normal", "Number.MAX_VALUE", "-Number.MAX_VALUE"],
		nonFinite: "NaN and ±Infinity excluded from ALE's current numeric domain",
	},
};

const outputUrl = new URL("./simulation-results.json", import.meta.url);
await writeFile(outputUrl, JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify({ summaries, corpus: report.corpus, ieee754: report.ieee754, output: outputUrl.pathname }, null, 2));
