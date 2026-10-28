import { readFileSync } from "node:fs";
import { parseALE } from "../ale.js";

const cases = JSON.parse(readFileSync(0, "utf8"));
const grammars = ["current", "legacy", "next"];
const summary = {
	caseCount: cases.length,
	byGrammar: Object.fromEntries(grammars.map((grammar) => [grammar, {
		accepted: 0,
		controlledErrors: 0,
		unexpectedErrors: 0,
		errorNames: {},
	}])),
	unexpected: [],
	crossGrammarDifferences: 0,
	differenceExamples: [],
	prototypeMutation: false,
	prototypeResult: false,
	contentExecuted: false,
};

const globalKeysBefore = Reflect.ownKeys(Object.prototype).map(String).sort().join("\0");
const globalProtoBefore = Object.getPrototypeOf(Object.prototype);
globalThis.__ALE_FUZZ_EXECUTED__ = false;

function verifyParsedTree(value, seen = new WeakSet()) {
	if (!value || typeof value !== "object" || seen.has(value)) return true;
	seen.add(value);
	const expectedPrototype = Array.isArray(value) ? Array.prototype : Object.prototype;
	if (Object.getPrototypeOf(value) !== expectedPrototype) return false;
	for (const key of Object.keys(value))
		if (!verifyParsedTree(value[key], seen)) return false;
	return true;
}

for (let index = 0; index < cases.length; index++) {
	const item = cases[index];
	const outcomes = {};
	for (const grammar of grammars) {
		const counter = summary.byGrammar[grammar];
		try {
			const value = parseALE(item.source, { grammar });
			counter.accepted++;
			const treeSafe = verifyParsedTree(value);
			if (!treeSafe) summary.prototypeResult = true;
			outcomes[grammar] = { kind: "value", value: JSON.stringify(value) };
		} catch (error) {
			const name = error?.name ?? typeof error;
			counter.errorNames[name] = (counter.errorNames[name] ?? 0) + 1;
			if (name === "ALEParseError") counter.controlledErrors++;
			else {
				counter.unexpectedErrors++;
				if (summary.unexpected.length < 20) summary.unexpected.push({
					index, category: item.category, grammar, source: item.source,
					name, message: error?.message ?? String(error),
				});
			}
			outcomes[grammar] = { kind: "error", name, message: error?.message ?? String(error) };
		}
	}
	if (JSON.stringify(outcomes.current) !== JSON.stringify(outcomes.legacy)) {
		summary.crossGrammarDifferences++;
		if (summary.differenceExamples.length < 12)
			summary.differenceExamples.push({ index, category: item.category, source: item.source, outcomes });
	}
	if (Reflect.ownKeys(Object.prototype).map(String).sort().join("\0") !== globalKeysBefore || Object.getPrototypeOf(Object.prototype) !== globalProtoBefore)
		summary.prototypeMutation = true;
}

summary.contentExecuted = globalThis.__ALE_FUZZ_EXECUTED__ !== false;
delete globalThis.__ALE_FUZZ_EXECUTED__;
process.stdout.write(JSON.stringify(summary));
