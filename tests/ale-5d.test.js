import test from "node:test";
import assert from "node:assert/strict";
import { parseALE, stringifyALE } from "../ale.js";

test("compact structural commas preserve quoted comma-space content and escapes", () => {
	const value = {
		inline: ["comma, stays", 'quote " stays', "slash \\ stays"],
		rows: [
			{ id: 1, text: "comma, stays", note: 'say "hi", still quoted', empty: null },
			{ id: 2, text: "next", note: "slash \\ and comma, stays", empty: null },
		],
	};
	const source = stringifyALE(value);
	assert.ok(source.includes('inline: ["comma, stays","quote \\" stays","slash \\\\ stays"]'));
	assert.ok(source.includes("rows{id,text,note,empty}:"));
	assert.ok(source.includes('1,"comma, stays","say \\"hi\\", still quoted",'));
	assert.deepStrictEqual(parseALE(source), value);
	assert.deepStrictEqual(parseALE(source, { grammar: "legacy" }), value);
});

test("compact delimiters preserve nested arrays, nested tables, slots and empty cells", () => {
	const value = {
		inline: [[1, 2], [3, 4]],
		rows: [
			{ id: 1, detail: [{ x: 1, y: "a,b" }, { x: 2, y: "c" }], notes: ["one", "two"] },
			{ id: 2, detail: [{ x: 3, y: "d" }, { x: 4, y: "e" }], notes: ["three"] },
		],
	};
	const source = stringifyALE(value);
	assert.deepStrictEqual(parseALE(source), value);
	assert.ok(source.includes("rows{id,detail,notes}:"));
	assert.ok(source.includes("1,{x,y},[one,two]"));
});

test("compact delimiters preserve special keys and legacy-compatible table syntax", () => {
	const special = JSON.parse('{"a,b":"v, w","say\\\"hi":"x, y","__proto__":"safe"}');
	const specialText = stringifyALE(special);
	assert.deepStrictEqual(parseALE(specialText), special);
	assert.deepStrictEqual(parseALE(specialText, { grammar: "legacy" }), special);

	const legacyValue = { rows: [{ id: 1, name: "Ada" }, { id: 2, name: "Bo" }], tags: ["a", "b"] };
	const legacyText = stringifyALE(legacyValue);
	assert.deepStrictEqual(parseALE(legacyText, { grammar: "legacy" }), legacyValue);
});

test("compact delimiter output remains reversible with a one-space indent", () => {
	const value = { rows: [{ id: 1, title: "a, b" }, { id: 2, title: "c" }], tags: ["x", "y"] };
	const source = stringifyALE(value, { indent: " " });
	assert.deepStrictEqual(parseALE(source), value);
	assert.deepStrictEqual(parseALE(source, { grammar: "legacy" }), value);
});

test("quoted Unicode emits valid surrogate pairs literally and escapes isolated surrogates", () => {
	const strings = [
		"", "😀🚀", "漢字かなカナ", "áé ñ", "e\u0301", "quote \" slash \\",
		"line\nreturn\rtab\t", "\uD800", "\uDC00", "x\uD800y\uDC00z",
	];
	for (const value of strings) {
		const encoded = stringifyALE({ value });
		assert.deepStrictEqual(parseALE(encoded), { value }, `current: ${JSON.stringify(value)}`);
	}
	for (const value of ["😀🚀", "漢字かなカナ", "áé ñ", "e\u0301", "quote \" slash \\"])
		assert.deepStrictEqual(parseALE(stringifyALE({ value }), { grammar: "legacy" }), { value }, `legacy: ${JSON.stringify(value)}`);
	assert.ok(stringifyALE({ value: "😀" }).includes("😀"));
	assert.ok(stringifyALE({ value: "漢" }).includes("漢"));
	assert.ok(stringifyALE({ value: "\uD800" }).includes("\\ud800"));
});
