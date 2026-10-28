import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { makeRandom } from "./value-generator.js";

const fixedCases = [
	["indent-irregular", "root:\n    child\n   sibling"],
	["dedent-unexpected", "root:\n        child\n    sibling\n  tail"],
	["mixed-tabs-spaces", "root:\n\tchild\n    sibling"],
	["unclosed-delimiters", "value: [1, {x: 2]"],
	["unclosed-string", 'value: "unterminated'],
	["dangling-escape", "value: \"tail" + "\\"],
	["unknown-escape", String.raw`value: "\q"`],
	["short-unicode-escape", String.raw`value: "\u12"`],
	["too-many-table-cells", "rows{a}:\n    one, extra"],
	["duplicate-table-columns", "rows{a, a}:\n    first, second"],
	["missing-selector", "rows{slot, table}:\n    [:], {x}\n        hello\n        <missing"],
	["continuation-outside-context", "root:\n    <missing"],
	["explicit-array-no-child", "items: []:"],
	["invalid-sibling-marker", "items: []:\n    >not-a-property"],
	["duplicate-object-key", "same: first\nsame: second"],
	["incomplete-structural-value", "value: {"],
	["unclosed-table-quote", 'rows{a, b}:\n    "x, y'],
	["executable-looking-data", 'payload: "globalThis.__ALE_FUZZ_EXECUTED__ = true"'],
	["empty-key-and-prototype-keys", '"": 1\n"__proto__": 2\nconstructor: 3\nprototype: 4'],
];

const lineFragments = [
	"a:", "a: []:", "{}", "[]", "[:]", "-", "true", "false", "1e+",
	"x: [", "x: ]", 'x: "', 'x: ' + '"' + "\\",
	"rows{a}: ", "rows{a, a}:\n    0, 1", "<next", ">", ">:", ">!\"x\"",
	"<one, two", "key:", "key: {}", "...{a}: ", "[{a}]:", "a: 1\na: 2",
	"!\"a:b\"", "¡\"__proto__\"", "text: x, y, z",
];

export function makeFuzzCorpus(seed, count = 400) {
	const cases = fixedCases.map(([category, source]) => ({ category, source }));
	const random = makeRandom(seed);
	const pick = (items) => items[Math.floor(random() * items.length)];
	const indents = ["", " ", "  ", "    ", "\t", "  \t"];
	for (let i = 0; cases.length < count; i++) {
		const lineCount = 1 + Math.floor(random() * 5);
		const lines = [];
		for (let j = 0; j < lineCount; j++)
			lines.push(pick(indents) + pick(lineFragments));
		cases.push({ category: "composed-fragments", source: lines.join("\n") });
	}
	return cases.slice(0, count);
}

export function evaluateFuzzCorpus(cases, { timeoutMs = 8000 } = {}) {
	const workerPath = fileURLToPath(new URL("./fuzz-worker.js", import.meta.url));
	const child = spawnSync(process.execPath, [workerPath], {
		input: JSON.stringify(cases),
		encoding: "utf8",
		timeout: timeoutMs,
		maxBuffer: 2 * 1024 * 1024,
	});
	if (child.error) return { timeout: child.error.code === "ETIMEDOUT", spawnError: child.error.message };
	if (child.status !== 0) return { exitCode: child.status, stderr: child.stderr, stdout: child.stdout };
	try { return JSON.parse(child.stdout); }
	catch (error) { return { invalidWorkerOutput: error.message, stdout: child.stdout, stderr: child.stderr }; }
}

export { fixedCases };
