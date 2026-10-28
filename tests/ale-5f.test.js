import test from "node:test";
import assert from "node:assert/strict";
import { parseALE, stringifyALE } from "../ale.js";

test("next interprets exponent notation as numbers and canonicalizes it", () => {
	for (const [source, value] of [
		["1e3", 1000], ["1E+3", 1000], ["-2.5e-8", -2.5e-8],
		["6.02e23", 6.02e23], ["5e-324", Number.MIN_VALUE],
		["+1.25E2", 125], ["0e-9", 0], ["-0e+9", -0],
	]) assert.ok(Object.is(parseALE(source, { grammar: "next" }), value), `${source} -> ${value}`);
	assert.equal(stringifyALE(1000, { grammar: "next" }), "1000");
	assert.equal(stringifyALE(1e-7, { grammar: "next" }), "1e-7");
	assert.equal(stringifyALE(1e21, { grammar: "next" }), "1e+21");
	assert.equal(stringifyALE(-0, { grammar: "next" }), "-0");
});

test("current and legacy keep exponent-like bare strings; next quotes them", () => {
	for (const grammar of ["current", "legacy"])
		assert.equal(parseALE("value: 1e3", { grammar }).value, "1e3");
	assert.equal(parseALE("value: 1e3", { grammar: "next" }).value, 1000);
	for (const value of ["1e3", "1E+3", "-2.5e-8", "5e-324", "1e", "1e+", "1e-", "1e309", "1e-999"]) {
		const text = stringifyALE({ value }, { grammar: "next" });
		assert.match(text, /value: "[^"]+"/);
		assert.equal(parseALE(text, { grammar: "next" }).value, value);
	}
	assert.equal(stringifyALE({ value: "1e3" }), "value: 1e3");
});

test("next rejects incomplete exponents, overflow and nonzero underflow", () => {
	for (const source of ["1e", "1e+", "1e-"])
		assert.throws(() => parseALE(source, { grammar: "next" }), { name: "ALEParseError" });
	for (const source of ["1e309", "-1e9999"])
		assert.throws(() => parseALE(source, { grammar: "next" }), { name: "ALEParseError" });
	for (const source of ["1e-324", "1e-999"])
		assert.throws(() => parseALE(source, { grammar: "next" }), { name: "ALEParseError" });
	assert.equal(parseALE("0e-999", { grammar: "next" }), 0);
	assert.ok(Object.is(parseALE("-0e+999", { grammar: "next" }), -0));
});

test("next exponent numbers round-trip through inline arrays, tables, slots and nesting", () => {
	const values = [
		{ values: [1e-7, 1e21, Number.MIN_VALUE, -0] },
		{ rows: [{ amount: 1e-7, label: "1e3" }, { amount: Number.MAX_VALUE, label: "6e23" }] },
		[{ nested: { values: [5e-324, -2.5e-8] } }, "tail"],
		[{ items: [{ value: 1e-7 }, { value: 1e21 }] }],
	];
	for (const value of values) {
		const text = stringifyALE(value, { grammar: "next", inlineArrayMax: 0 });
		assert.deepStrictEqual(parseALE(text, { grammar: "next" }), value, text);
	}
});

test("next retains keys, current syntax, and canonical semantic stability", () => {
	const value = JSON.parse('{"1e3":1e3,"__proto__":1e-7,"rows":[{"x":1e21},{"x":5e-324}]}');
	const first = stringifyALE(value, { grammar: "next" });
	const decoded = parseALE(first, { grammar: "next" });
	assert.deepStrictEqual(decoded, value);
	assert.equal(stringifyALE(decoded, { grammar: "next" }), first);
	assert.equal(parseALE("value: 1e3").value, "1e3");
	assert.equal(parseALE("value: 1e3", { grammar: "legacy" }).value, "1e3");
});
