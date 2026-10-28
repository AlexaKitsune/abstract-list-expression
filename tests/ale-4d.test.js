import test from "node:test";
import assert from "node:assert/strict";
import { parseALE, stringifyALE } from "../ale.js";

test("nested table cells with arrays and objects fall back to reversible block syntax", () => {
	const values = [
		{ a: [{ b: [{ c: [{ d: 1 }] }] }] },
		{ rows: [{ items: [[{ x: 1 }], [{ x: 2 }]] }] },
		{ rows: [{ detail: { nested: { value: true } } }, { detail: { nested: { value: false } } }] },
	];
	for (const value of values) {
		const source = stringifyALE(value);
		assert.doesNotMatch(source, /\\\"d\\\"/);
		assert.deepStrictEqual(parseALE(source), value, source);
	}
});

test("empty object in a nested slot remains an object, not an array of objects", () => {
	const minimal = [{ a: [{ x: {} }] }];
	const historicalSource = "{a}:\n    [:]\n        x:\n            {}";
	assert.deepStrictEqual(parseALE(historicalSource), minimal);
	assert.deepStrictEqual(parseALE(stringifyALE(minimal)), minimal);
	assert.deepStrictEqual(parseALE(stringifyALE(minimal), { inlineArrayMax: 0 }), minimal);
});

test("null values and null elements survive nested slot continuations", () => {
	for (const value of [
		[{ a: [null, { x: null }] }],
		[{ a: [{ x: null }, "tail"] }],
	]) for (const options of [{}, { inlineArrayMax: 0 }])
		assert.deepStrictEqual(parseALE(stringifyALE(value, options)), value, JSON.stringify({ value, options }));
});

test("quoted empty cells in a compact table continuation are not mistaken for a selector", () => {
	const value = [{ "[]": [{}], k4: [{ true: "", k2: "" }] }];
	const source = stringifyALE(value);
	assert.match(source, /<\"\",\"\"/);
	assert.deepStrictEqual(parseALE(source), value, source);
	assert.throws(() => parseALE(source, { grammar: "legacy" }), /Unknown slot\/table name/);
});

test("current grammar rejects duplicate decoded object keys throughout object contexts", () => {
	for (const source of [
		"a: 1\na: 2",
		'"a": 1\na: 2',
		"items: []:\n    a: 1\n    a: 2",
		"rows{slot}:\n    [:]\n        a: 1\n        a: 2",
	]) assert.throws(() => parseALE(source), /Duplicate object key/);

	assert.deepStrictEqual(parseALE("parent:\n    a: 1\n    child:\n        a: 2"), {
		parent: { a: 1, child: { a: 2 } },
	});
	assert.deepStrictEqual(parseALE('a: 1\n"b": 2'), { a: 1, b: 2 });
});

test("legacy object duplicate keys retain last-value-wins behavior", () => {
	assert.deepStrictEqual(parseALE('"a": 1\na: 2', { grammar: "legacy" }), { a: 2 });
	assert.deepStrictEqual(parseALE("items:\n    a: 1\n    a: 2", { grammar: "legacy" }), { items: { a: 2 } });
});

test("current grammar rejects duplicate decoded table columns; legacy keeps last value", () => {
	for (const source of [
		"items{a, a}:\n    1, 2",
		'items{"a", a}:\n    1, 2',
		"{a, a}:\n    1, 2",
	]) assert.throws(() => parseALE(source), /Duplicate table column/);
	assert.deepStrictEqual(parseALE("items{a, a}:\n    1, 2", { grammar: "legacy" }), {
		items: [{ a: 2 }],
	});
});

test("current grammar rejects excess table cells and retains nulls for missing or empty cells", () => {
	assert.throws(() => parseALE("items{a, b}:\n    1, 2, 3"), /only 2 columns/);
	assert.deepStrictEqual(parseALE("items{a, b}:\n    1"), { items: [{ a: 1, b: null }] });
	assert.deepStrictEqual(parseALE("items{a, b}:\n    , 2"), { items: [{ a: null, b: 2 }] });
	assert.deepStrictEqual(parseALE("items{a, b}:\n    1, 2, 3", { grammar: "legacy" }), {
		items: [{ a: 1, b: 2 }],
	});
});

test("empty-table policy is stable and serializer uses [] for empty arrays", () => {
	assert.deepStrictEqual(parseALE("{a, b}:"), []);
	assert.throws(() => parseALE("items{a, b}:"), /Expected an indented block/);
	assert.deepStrictEqual(parseALE("{a, b}:", { grammar: "legacy" }), [[]]);
	assert.equal(stringifyALE([]), "[]");
	assert.equal(stringifyALE({ items: [] }), "items: []");
	assert.doesNotMatch(stringifyALE([]), /\{[^}]+\}:/);
});
