import { readFile } from "node:fs/promises";
import { parseALE, stringifyALE } from "../../ale.js";
import { extendedCorpus } from "../ale-5b1/extended-corpus.js";

const source = JSON.parse(await readFile(new URL("../ale-5b/corpus.json", import.meta.url), "utf8"));
const corpus = [...source, ...extendedCorpus];
const mode = process.env.ALE_PROFILE_MODE;
const iterations = Number(process.env.ALE_PROFILE_ITERATIONS ?? 100);
const serialized = corpus.map(({ value }) => stringifyALE(value));

if (mode === "parse") {
	for (let i = 0; i < iterations; i++) for (const text of serialized) parseALE(text);
} else if (mode === "stringify") {
	for (let i = 0; i < iterations; i++) for (const { value } of corpus) stringifyALE(value);
} else {
	throw new Error("ALE_PROFILE_MODE must be 'parse' or 'stringify'.");
}

console.log(JSON.stringify({ mode, cases: corpus.length, iterations }));
