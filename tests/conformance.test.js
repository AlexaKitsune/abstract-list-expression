import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { parseALE, stringifyALE } from "../ale.js";

test("implicit object and inline arrays", () => {
	assert.deepStrictEqual(parseALE("id: 1\nname: Booker\ntags: [shark, friend]"), {
		id: 1, name: "Booker", tags: ["shark", "friend"],
	});
});

test("indentation infers a heterogeneous array", () => {
	assert.deepStrictEqual(parseALE('items:\n    1\n    "hello"\n    [1,2]'), { items: [1, "hello", [1, 2]] });
});

test("keyed tables map rows to objects", () => {
	assert.deepStrictEqual(parseALE("characters{id, name}:\n    1, Eleanor\n    2, Swifty"), { characters: [
		{ id: 1, name: "Eleanor" }, { id: 2, name: "Swifty" },
	] });
});

test("compact booleans and nulls", () => {
	assert.deepStrictEqual(parseALE("!active\n¡visible\nexplicit: true\nmissing: -"), {
		active: false, visible: true, explicit: true, missing: null,
	});
});

test("quoted strings and Unicode", () => {
	assert.deepStrictEqual(parseALE('text: "Hola, soy \\"Ale\\" (Alexa)"\nfox: キツネ'), {
		text: 'Hola, soy "Ale" (Alexa)', fox: "キツネ",
	});
});

test("> separates consecutive object elements in an inferred array", () => {
	assert.deepStrictEqual(parseALE("mixed:\n    id: 1\n    name: Booker\n    >id: 0\n    name: Alexa"), { mixed: [
		{ id: 1, name: "Booker" }, { id: 0, name: "Alexa" },
	] });
});

test("slot marker accepts an indented block under an object key", () => {
	assert.deepStrictEqual(parseALE('notes: [:]\n    word: konnichiwa\n    >word: neko\n    hello'), { notes: [
		{ word: "konnichiwa" }, { word: "neko" }, "hello",
	] });
});

test("named slot selector directs continuation rows", () => {
	assert.deepStrictEqual(parseALE("rows{notes, stats}:\n    [:], {kind}\n        first\n        <stats\n        alpha\n"), { rows: [
		{ notes: ["first"], stats: [{ kind: "alpha" }] },
	] });
});

test("nested table cell continuation", () => {
	assert.deepStrictEqual(parseALE("rows{details}:\n    {kind}\n        alpha\n        beta"), { rows: [
		{ details: [{ kind: "alpha" }, { kind: "beta" }] },
	] });
});

test("ALE-1 PARSE-03: spread table expands rows under an implicit array key", () => {
	assert.deepStrictEqual(parseALE("items:\n    ...{id, name}:\n        1, Alexa\n        2, Booker"), { items: [
		{ id: 1, name: "Alexa" }, { id: 2, name: "Booker" },
	] });
	assert.deepStrictEqual(parseALE("items: []:\n    ...{id, name}:\n        1, Alexa\n        2, Booker"), { items: [
		{ id: 1, name: "Alexa" }, { id: 2, name: "Booker" },
	] });
	assert.deepStrictEqual(parseALE("items:\n    ...{id, name}:\n        1, Alexa\n        2,"), { items: [
		{ id: 1, name: "Alexa" }, { id: 2, name: null },
	] });
	assert.deepStrictEqual(parseALE("items: []:\n    ...{id, name}:\n    3"), { items: [3] });
});

test("ALE-1 PARSE-04: array-as-element table preserves a nested array under a key", () => {
	assert.deepStrictEqual(parseALE("items:\n    [{id, name}]:\n        1, Alexa\n        2, Booker"), { items: [[
		{ id: 1, name: "Alexa" }, { id: 2, name: "Booker" },
	]] });
	assert.deepStrictEqual(parseALE("items: []:\n    [{id, name}]:\n        1, Alexa"), { items: [[{ id: 1, name: "Alexa" }]] });
});

test("README ALE example parses to its documented JSON structure", async () => {
	const readme = await readFile(new URL("../README.md", import.meta.url), "utf8");
	const match = readme.match(/### ALE\s*(?:```|~~~)\s*\n([\s\S]*?)\n(?:```|~~~)/);
	assert.ok(match, "README must contain its ALE example");
	const data = parseALE(match[1]);
	assert.equal(data.name, "Alexa");
	assert.equal(data.age, 28);
	assert.deepStrictEqual(data.characters, [
		{ id: 1, name: "Eleanor" }, { id: 2, name: "Swifty" },
	]);
	assert.deepStrictEqual(data.mixedArray.slice(0, 4), [
		1, [1, 2],
		{ id: 1, name: "Booker" },
		{ id: 0, name: "Alexa" },
	]);
});

test("ALE-1 README-01: final anonymous table in README example parses as a nested table array", async () => {
	const readme = await readFile(new URL("../README.md", import.meta.url), "utf8");
	const match = readme.match(/### ALE\s*(?:```|~~~)\s*\n([\s\S]*?)\n(?:```|~~~)/);
	assert.ok(match);
	const data = parseALE(match[1]);
	assert.deepStrictEqual(data.mixedArray.at(-1), [
		{ name: "Alexa", age: 28 }, { name: "Booker", age: null },
	]);
	assert.deepStrictEqual(parseALE(stringifyALE(data)), data);
});

test("round-trip preserves ordinary JSON scalars, arrays and objects", () => {
	const value = { title: "hello", count: 12, enabled: false, absent: null, list: [1, "two", true] };
	assert.deepStrictEqual(parseALE(stringifyALE(value)), value);
});

test("round-trip preserves Unicode and supported escaped punctuation", () => {
	const value = { fox: "キツネ", comma: "a,b", quote: 'a"b', newline: "a\nb", slash: "a\\b" };
	assert.deepStrictEqual(parseALE(stringifyALE(value)), value);
});

test("round-trip preserves table arrays with a common property set", () => {
	const value = { users: [{ id: 1, name: "Alexa" }, { id: 2, name: "Booker" }] };
	assert.deepStrictEqual(parseALE(stringifyALE(value)), value);
});

test("round-trip respects serializer options on representable values", () => {
	const value = { values: [1, 2, 3], rows: [{ x: 1 }, { y: 2 }], active: true };
	for (const options of [
		{ useTables: false }, { inlineArrayMax: 0 }, { booleanShortcuts: false },
		{ useSpread: false }, { indent: "\t" },
	]) assert.deepStrictEqual(parseALE(stringifyALE(value, options)), value, JSON.stringify(options));
});

test("round-trip preserves ambiguous scalar-looking strings", () => {
	const value = { truth: "true", falsehood: "false", nil: "-", digits: "123", exponent: "1e3", signed: "+12" };
	assert.deepStrictEqual(parseALE(stringifyALE(value)), value);
});

test("round-trip preserves JSON numeric notation including exponent, extremes and negative zero", () => {
	const value = { large: 1e21, small: 1e-7, max: Number.MAX_VALUE, min: Number.MIN_VALUE, negativeZero: -0 };
	assert.deepStrictEqual(parseALE(stringifyALE(value)), value);
	assert.ok(Object.is(parseALE(stringifyALE(value)).negativeZero, -0));
});

test("round-trip preserves empty objects at root and as values", () => {
	for (const value of [{}, { empty: {} }, [{}, 1]])
		assert.deepStrictEqual(parseALE(stringifyALE(value)), value);
});

test("round-trip preserves nested arrays beyond the inline threshold", () => {
	const value = { nested: [[1, 2, 3, 4, 5, 6, 7], 9] };
	assert.deepStrictEqual(parseALE(stringifyALE(value)), value);
});

test("round-trip preserves block values inside implicit array objects", () => {
	const value = { items: [{ id: 1, nested: [1, 2, 3, 4, 5, 6, 7] }, { id: 2, nested: {} }] };
	assert.deepStrictEqual(parseALE(stringifyALE(value, { useTables: false })), value);
});

test("round-trip preserves absent properties in arrays of differing objects", () => {
	const value = { rows: [{ x: 1 }, { y: 2 }] };
	assert.deepStrictEqual(parseALE(stringifyALE(value)), value);
});

test("ALE-1 RT-05: nested tables with multiple continuations round-trip", () => {
	const value = { rows: [{ a: [{ x: 1 }], b: [{ y: 2 }] }] };
	const source = stringifyALE(value);
	assert.match(source, /<b\n/);
	assert.doesNotMatch(source, /<2/);
	assert.deepStrictEqual(parseALE(source), value);
});

test("ALE-1 RT-06: object values inside table cells remain objects", () => {
	const value = { rows: [{ detail: { x: 1 } }, { detail: { x: 2 } }] };
	assert.deepStrictEqual(parseALE(stringifyALE(value)), value);
	assert.ok(!stringifyALE(value).includes("rows{detail}:"));
});

test("anonymous tables remain one nested array element at multiple levels", () => {
	assert.deepStrictEqual(parseALE("items:\n    {name, age}:\n        Alexa, 28\n        Booker,"), {
		items: [[{ name: "Alexa", age: 28 }, { name: "Booker", age: null }]],
	});
	assert.deepStrictEqual(parseALE("items: []:\n    [{name, age}]:\n        Alexa, 28\n        Booker,"), {
		items: [[{ name: "Alexa", age: 28 }, { name: "Booker", age: null }]],
	});
	assert.deepStrictEqual(parseALE("items: []:\n    [{x}]:\n        1\n    [{x}]:\n        2"), {
		items: [[{ x: 1 }], [{ x: 2 }]],
	});
});

test("multiple continuation placeholders support names, sequencing and one-column tables", () => {
	const value = { rows: [{ notes: ["alpha"], easy: [{ aspect: "sound", score: 4 }] }] };
	assert.deepStrictEqual(parseALE(stringifyALE(value)), value);
	assert.deepStrictEqual(parseALE("rows{notes, easy}:\n    [:], {aspect, score}\n        alpha\n        <easy\n        sound, 4"), { rows: [
		{ notes: ["alpha"], easy: [{ aspect: "sound", score: 4 }] },
	] });
	assert.deepStrictEqual(parseALE("rows{notes, easy}:\n    [:], {aspect}\n        alpha\n        <easy\n        sound"), { rows: [
		{ notes: ["alpha"], easy: [{ aspect: "sound" }] },
	] });
	assert.throws(() => parseALE("rows{notes, easy}:\n    [:], {aspect}\n        alpha\n        <alpha"), /Unknown slot\/table name/);
});

test("all-null table rows fall back to a reversible block representation", () => {
	for (const value of [
		[{ only: null }],
		[{ only: null }, { only: null }],
		[{ first: null, second: null }],
		[{ first: null, second: null }, { first: null, second: null }],
	]) {
		for (const options of [{}, { inlineArrayMax: 0 }, { useSpread: true }])
			assert.deepStrictEqual(parseALE(stringifyALE(value, options)), value, JSON.stringify({ value, options }));
	}
});

test("nested arrays inside table-cell slots keep their array boundaries with inlineArrayMax zero", () => {
	const protoKeyValue = JSON.parse('{"__proto__":[[0]]}');
	const cases = [
		[{ k13: [[0]] }],
		[protoKeyValue],
		{ rows: [{ details: [[1], [2, 3]] }] },
	];
	for (const value of cases)
		assert.deepStrictEqual(parseALE(stringifyALE(value, { inlineArrayMax: 0 })), value);
});

test("object sibling separators can introduce keyed tables", () => {
	const value = [{ first: 0 }, { k16: [{ k13: 0 }] }];
	assert.deepStrictEqual(parseALE(stringifyALE(value)), value);
});

test("quoted boolean flag keys parse in roots, nested objects and both array grammars", () => {
	const entries = [
		["a:b", false], ["a,b", true], ["with space", false], ["a\\b", true],
		['say"hi', false], ["キツネ", true], ["true", false], ["__proto__", true],
		["constructor", false], ["prototype", true],
	];
	const expected = Object.fromEntries(entries);
	const source = entries.map(([key, value]) => `${value ? "¡" : "!"}${JSON.stringify(key)}`).join("\n");
	const parsed = parseALE(source);
	for (const [key, value] of Object.entries(expected)) assert.equal(Object.getOwnPropertyDescriptor(parsed, key)?.value, value);
	assert.equal(Object.getPrototypeOf(parsed), Object.prototype);
	assert.deepStrictEqual(parseALE(`nested:\n    ${source.replaceAll("\n", "\n    ")}`), { nested: expected });
	assert.deepStrictEqual(parseALE(`items: []:\n    >!"a:b"\n    >¡"constructor"`), {
		items: [{ "a:b": false }, { constructor: true }],
	});
	assert.deepStrictEqual(parseALE(`items:\n    !"a:b"\n    >¡"prototype"`), {
		items: [{ "a:b": false }, { prototype: true }],
	});
});

test("quoted special table column names remain intact, including named selectors", () => {
	const columns = ["a:b", "a,b", "with space", "say\"hi", "a\\b", "キツネ", "true", "__proto__", "constructor", "prototype", ""];
	const rows = [0, 1].map((index) => {
		const row = {};
		for (const key of columns) Object.defineProperty(row, key, {
			value: index, enumerable: true, configurable: true, writable: true,
		});
		return row;
	});
	assert.deepStrictEqual(parseALE(stringifyALE(rows)), rows);
	const selected = { rows: [{ notes: [{ kind: "note" }, "one"], "a:b": [{ word: "雪" }] }] };
	const source = stringifyALE(selected);
	assert.match(source, /<"a:b"/);
	assert.deepStrictEqual(parseALE(source), selected);
});

test("current grammar keeps same-indent siblings outside anonymous table blocks", () => {
	const source = "items:\n    {a, b}:\n    x, y";
	assert.deepStrictEqual(parseALE(source), { items: [[], "x, y"] });
	assert.deepStrictEqual(parseALE(source, { grammar: "legacy" }), { items: [[{ a: "x", b: "y" }]] });
	assert.deepStrictEqual(parseALE("items: []:\n    {a, b}:\n    x, y"), { items: [[], "x, y"] });
});

test("empty table forms have explicit current-grammar outcomes", () => {
	assert.deepStrictEqual(parseALE("{a}:"), []);
	assert.deepStrictEqual(parseALE("items:\n    {a}:"), { items: [[]] });
	assert.deepStrictEqual(parseALE("items: []:\n    [{a}]:"), { items: [[]] });
	assert.deepStrictEqual(parseALE("items: []:\n    ...{a}:\n    1"), { items: [1] });
	assert.throws(() => parseALE("items{a}:"), /Expected an indented block/);
});

test("round-trip preserves empty arrays at root and as values", () => {
	for (const value of [[], { empty: [] }])
		assert.deepStrictEqual(parseALE(stringifyALE(value)), value);
});

test("round-trip preserves boundary spaces and control escapes", () => {
	const value = { leading: " start", trailing: "end ", carriage: "a\rb" };
	assert.deepStrictEqual(parseALE(stringifyALE(value)), value);
});

test("parser preserves prototype-sensitive keys as own properties", () => {
	const value = JSON.parse('{"__proto__":{"polluted":true},"constructor":1,"prototype":2,"safe":1}');
	const result = parseALE(stringifyALE(value));
	assert.deepStrictEqual(Object.getOwnPropertyDescriptor(result, "__proto__")?.value, value.__proto__);
	assert.equal(Object.hasOwn(result, "constructor"), true);
	assert.equal(Object.hasOwn(result, "prototype"), true);
	assert.equal(Object.getPrototypeOf(result), Object.prototype);
});

test("string escapes round-trip and unknown escapes fail in current grammar", () => {
	const value = { quote: '"', slash: "\\", newline: "\n", carriage: "\r", tab: "\t", nul: "\u0000", unicode: "雪🦊", loneSurrogate: "\uD800" };
	assert.deepStrictEqual(parseALE(stringifyALE(value)), value);
	assert.throws(() => parseALE('value: "\\q"'), /Unknown escape/);
	assert.throws(() => parseALE('value: "\\u12xz"'), /Invalid Unicode escape/);
	assert.equal(parseALE(String.raw`value: "\u96EA"`).value, "雪");
});

test("explicit arrays accept scalar lines, nested blocks and implicit objects", () => {
	assert.deepStrictEqual(parseALE("values: []:\n    1\n    2\n    []:\n        3\n        4\n    5"), {
		values: [1, 2, [3, 4], 5],
	});
	assert.deepStrictEqual(parseALE("characters: []:\n    id: 1\n    name: Eleanor\n    >id: 2\n    name: Swifty"), {
		characters: [{ id: 1, name: "Eleanor" }, { id: 2, name: "Swifty" }],
	});
	assert.deepStrictEqual(parseALE("items: []:\n    >:\n        id: 1\n        name: Alexa"), {
		items: [{ id: 1, name: "Alexa" }],
	});
});

test("explicit arrays preserve all scalar, object and array transitions", () => {
	const cases = [
		["items: []:\n    1\n    2", { items: [1, 2] }],
		["items: []:\n    1\n    id: 2\n    name: A", { items: [1, { id: 2, name: "A" }] }],
		["items: []:\n    id: 1\n    name: A\n    2", { items: [{ id: 1, name: "A" }, 2] }],
		["items: []:\n    id: 1\n    >id: 2", { items: [{ id: 1 }, { id: 2 }] }],
		["items: []:\n    []:\n        1\n    2", { items: [[1], 2] }],
		["items: []:\n    []:\n        1\n    id: 2", { items: [[1], { id: 2 }] }],
		["items: []:\n    id: 1\n    []:\n        2", { items: [{ id: 1 }, [2]] }],
		["items: []:\n    []:\n        1\n    []:\n        2", { items: [[1], [2]] }],
	];
	for (const [source, expected] of cases) assert.deepStrictEqual(parseALE(source), expected, source);
});

test("empty explicit array block and empty document are rejected", () => {
	assert.throws(() => parseALE("values: []:"), /requires an indented child block/);
	assert.throws(() => parseALE("[]:"), /requires an indented child block/);
	assert.throws(() => parseALE("\n  \n"), /Empty ALE document/);
	assert.throws(() => parseALE("[]:\n    1\nother: 2"), /Unexpected extra content at top-level/);
});

test("empty objects, arrays and nulls work as root and array elements", () => {
	assert.deepStrictEqual(parseALE("{}"), {});
	assert.deepStrictEqual(parseALE("[]"), []);
	assert.deepStrictEqual(parseALE("items: [{}, [], -]"), { items: [{}, [], null] });
	assert.deepStrictEqual(parseALE("missing:\nexplicit: -"), { missing: null, explicit: null });
});

test("legacy mode preserves the previous interpretation of []: scalar values", () => {
	assert.equal(parseALE("value: []:", { grammar: "legacy" }).value, "[]:");
	assert.equal(parseALE("\\q", { grammar: "legacy" })[0], "\\q");
	assert.deepStrictEqual(parseALE("1", { grammar: "legacy" }), [1]);
	assert.deepStrictEqual(parseALE("[]", { grammar: "legacy" }), [[]]);
	assert.equal(parseALE("value: {}", { grammar: "legacy" }).value, "{}");
	assert.deepStrictEqual(parseALE("{}", { grammar: "legacy" }), ["{}"]);
});

test("default grammar reads explicit root arrays and scalar roots", () => {
	assert.deepStrictEqual(parseALE("[]:\n    1\n    2"), [1, 2]);
	assert.equal(parseALE("123"), 123);
	assert.equal(parseALE('"true"'), "true");
});
