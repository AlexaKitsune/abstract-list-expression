import assert from "node:assert/strict";
import { parseALE, stringifyALE } from "../../ale.js";

const requested = Math.max(1, Number(process.env.ALE_NEXT_NUMERIC_CASES ?? 100_000));
const mask = (1n << 64n) - 1n;
let state = 0x5f5f5e2026n;
const view = new DataView(new ArrayBuffer(8));
const special = [0n, 0x8000000000000000n, 1n, 0x000fffffffffffffn, 0x0010000000000000n, 0x7fefffffffffffffn, 0x7fefffffffffffffn | 0x8000000000000000n];
let checked = 0;
let generated = 0;
const failures = [];

while (checked < requested) {
	let bits;
	if (generated < special.length) bits = special[generated];
	else {
		state ^= state << 13n;
		state ^= state >> 7n;
		state ^= state << 17n;
		state &= mask;
		bits = state;
	}
	generated++;
	view.setBigUint64(0, bits);
	const value = view.getFloat64(0);
	if (!Number.isFinite(value)) continue;
	const encoded = stringifyALE(value, { grammar: "next" });
	const decoded = parseALE(encoded, { grammar: "next" });
	if (!Object.is(decoded, value)) failures.push({ bits: `0x${bits.toString(16)}`, value, encoded, decoded });
	const canonicalAgain = stringifyALE(decoded, { grammar: "next" });
	if (canonicalAgain !== encoded) failures.push({ bits: `0x${bits.toString(16)}`, value, encoded, canonicalAgain, kind: "unstable" });
	checked++;
}

const report = { grammar: "next", seed: "0x5f5f5e2026", requestedFiniteValues: requested, rawBitPatternsGenerated: generated, checked: checked, exactByObjectIs: failures.filter((x) => !x.kind).length === 0, canonicalStable: failures.length === 0, failures };
console.log(JSON.stringify(report, null, 2));
if (failures.length) process.exitCode = 1;
