import { readFile } from "node:fs/promises";
import { isDeepStrictEqual } from "node:util";
import { getEncoding } from "js-tiktoken";
import { parseALE, stringifyALE } from "../../ale.js";
import { extendedCorpus } from "../ale-5b1/extended-corpus.js";

const original = JSON.parse(await readFile(new URL("../ale-5b/corpus.json", import.meta.url), "utf8"));
const corpus = [...original, ...extendedCorpus];
const tokenizer = getEncoding("o200k_base");
let total = { defaultBytes: 0, compactIndentBytes: 0, defaultTokens: 0, compactIndentTokens: 0, equivalent: 0, failures: [] };

for (const { id, value } of corpus) {
	const normal = stringifyALE(value);
	const compactIndent = stringifyALE(value, { indent: " " });
	const decoded = parseALE(compactIndent);
	const equivalent = isDeepStrictEqual(decoded, value);
	total.defaultBytes += Buffer.byteLength(normal, "utf8");
	total.compactIndentBytes += Buffer.byteLength(compactIndent, "utf8");
	total.defaultTokens += tokenizer.encode(normal).length;
	total.compactIndentTokens += tokenizer.encode(compactIndent).length;
	if (equivalent) total.equivalent++;
	else total.failures.push({ id });
}

console.log(JSON.stringify({ cases: corpus.length, indent: "one space", semanticsVerifiedWithCurrentParser: true, ...total }, null, 2));
