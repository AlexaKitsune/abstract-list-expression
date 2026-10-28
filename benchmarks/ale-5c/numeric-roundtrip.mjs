import { isDeepStrictEqual } from "node:util";
import { parseALE, stringifyALE } from "../../ale.js";

const requested = Number(process.env.ALE_NUMERIC_CASES ?? 100_000);
const mask = (1n << 64n) - 1n;
let state = 0x9e3779b97f4a7c15n;
const buffer = new ArrayBuffer(8);
const view = new DataView(buffer);
let checked = 0;
const failures = [];

for (let i = 0; i < requested; i++) {
	state ^= state << 13n;
	state ^= state >> 7n;
	state ^= state << 17n;
	state &= mask;
	view.setBigUint64(0, state);
	const value = view.getFloat64(0);
	if (!Number.isFinite(value)) continue;
	const actual = parseALE(stringifyALE(value));
	checked++;
	if (!Object.is(actual, value)) failures.push({ index: i, value, encoded: stringifyALE(value), actual });
}

console.log(JSON.stringify({ seed: "0x9e3779b97f4a7c15", requested, checkedFiniteValues: checked, failures }, null, 2));
if (failures.length) process.exitCode = 1;
