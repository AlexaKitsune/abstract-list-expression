import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { parseALE, stringifyALE } from "../ale.js";

const markedBlock = /<!-- ale-example (\{[^\n]+\}) -->\s*(?:### ALE\s*)?(~~~ale|~~~)\n([\s\S]*?)\n~~~(?:\s*~~~json\n([\s\S]*?)\n~~~)?/g;

async function verifyDocument(path) {
	const text = await readFile(path, "utf8");
	const entries = new Map();
	let taggedFences = 0;
	let parsedTaggedFences = 0;

	for (const match of text.matchAll(markedBlock)) {
		const [, metadataJSON, openingFence, source, adjacentJSON] = match;
		const metadata = JSON.parse(metadataJSON);
		const label = path.pathname + " [" + metadata.id + "]";
		if (typeof metadata.id !== "string" || metadata.id.length === 0)
			throw new Error(path.pathname + " has an example without an id");
		if (entries.has(metadata.id))
			throw new Error("Duplicate example id " + label);
		const grammar = metadata.grammar ?? "current";
		if (!["current", "legacy", "next"].includes(grammar))
			throw new Error("Unknown grammar in " + label + ": " + grammar);
		if (openingFence === "~~~ale") parsedTaggedFences++;

		let expected = metadata.expected;
		if (adjacentJSON !== undefined) {
			const pairedValue = JSON.parse(adjacentJSON);
			if (expected !== undefined) assert.deepStrictEqual(pairedValue, expected, label + " metadata/visible JSON differ");
			else expected = pairedValue;
		}
		if (expected === undefined)
			throw new Error("Executable example has no expected value: " + label);

		const actual = parseALE(source, { grammar });
		assertZeroSigns(actual, expected, label);
		assert.deepStrictEqual(actual, expected, label + " parsed value differs from expected");

		const encoded = stringifyALE(actual, { grammar });
		const decoded = parseALE(encoded, { grammar });
		assertZeroSigns(decoded, actual, label + " round-trip");
		assert.deepStrictEqual(decoded, actual, label + " round-trip changed the parsed value");
		assert.equal(stringifyALE(decoded, { grammar }), encoded, label + " serialization is not stable");
		if (metadata.canonical !== undefined) {
			assert.equal(encoded, metadata.canonical, label + " canonical text differs");
			const canonicalValue = parseALE(metadata.canonical, { grammar });
			assertZeroSigns(canonicalValue, actual, label + " canonical parse");
			assert.deepStrictEqual(canonicalValue, actual, label + " canonical parse changed the value");
		}

		entries.set(metadata.id, { actual, expected, grammar, source });
	}

	taggedFences = [...text.matchAll(/^~~~ale$/gm)].length;
	if (taggedFences !== parsedTaggedFences)
		throw new Error(path.pathname + " has an unmarked or unmatched ALE code fence");
	return { text, entries };
}

function assertZeroSigns(actual, expected, label, path = "$") {
	if (typeof actual === "number" && typeof expected === "number" && actual === 0 && expected === 0) {
		assert.equal(Object.is(actual, -0), Object.is(expected, -0), label + " has a -0 sign mismatch at " + path);
		return;
	}
	if (Array.isArray(actual) && Array.isArray(expected)) {
		for (let i = 0; i < Math.min(actual.length, expected.length); i++)
			assertZeroSigns(actual[i], expected[i], label, path + "[" + i + "]");
		return;
	}
	if (actual && expected && typeof actual === "object" && typeof expected === "object") {
		for (const key of Object.keys(actual))
			if (Object.hasOwn(expected, key)) assertZeroSigns(actual[key], expected[key], label, path + "." + key);
	}
}

const examples = await verifyDocument(new URL("./examples.md", import.meta.url));
const english = await verifyDocument(new URL("../README.md", import.meta.url));
const spanish = await verifyDocument(new URL("./README.es.md", import.meta.url));

const compareExampleSets = (left, right, label) => {
	assert.deepStrictEqual([...left.keys()].sort(), [...right.keys()].sort(), label + " example ids differ");
	for (const id of left.keys()) {
		const a = left.get(id);
		const b = right.get(id);
		assert.equal(a.grammar, b.grammar, label + " dialect differs for " + id);
		assertZeroSigns(a.actual, b.actual, label + " " + id);
		assert.deepStrictEqual(a.actual, b.actual, label + " semantics differ for " + id);
	}
};

compareExampleSets(english.entries, spanish.entries, "English/Spanish");

const overviewValue = (document, heading) => {
	const pattern = new RegExp(
		"### ALE\\s*(?:~~~ale|~~~)\\s*\\n([\\s\\S]*?)\\n~~~\\s*### " +
		heading + "\\s*~~~json\\s*\\n([\\s\\S]*?)\\n~~~",
	);
	const match = document.text.match(pattern);
	assert.ok(match, "Overview ALE/JSON pair not found for " + heading);
	const expected = JSON.parse(match[2]);
	const marker = document.entries.get("readme-overview");
	assert.ok(marker, "Missing readme-overview example marker");
	assertZeroSigns(parseALE(match[1], { grammar: marker.grammar }), expected, "overview visible JSON");
	assert.deepStrictEqual(parseALE(match[1], { grammar: marker.grammar }), expected, "overview visible JSON value differs");
	assert.deepStrictEqual(expected, marker.expected, "overview metadata does not match visible JSON");
	return expected;
};

assert.deepStrictEqual(
	overviewValue(english, "Equivalent JSON"),
	overviewValue(spanish, "JSON equivalente"),
	"English/Spanish visible overview JSON differs",
);

console.log(
	"Verified " + examples.entries.size + " example pairs, " +
	english.entries.size + " English examples, " +
	spanish.entries.size + " Spanish examples, round-trips, and canonical cases.",
);
