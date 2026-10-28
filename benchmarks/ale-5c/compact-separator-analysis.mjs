import { readFile } from "node:fs/promises";
import { isDeepStrictEqual } from "node:util";
import { getEncoding } from "js-tiktoken";
import { parseALE, stringifyALE } from "../../ale.js";
import { extendedCorpus } from "../ale-5b1/extended-corpus.js";

const original = JSON.parse(await readFile(new URL("../ale-5b/corpus.json", import.meta.url), "utf8"));
const corpus = [...original, ...extendedCorpus];
const tokenizer = getEncoding("o200k_base");

function compactCommaWhitespace(text) {
	let result = "";
	let quoted = false;
	let escaped = false;
	for (let i = 0; i < text.length; i++) {
		const ch = text[i];
		if (quoted) {
			result += ch;
			if (escaped) escaped = false;
			else if (ch === "\\") escaped = true;
			else if (ch === '"') quoted = false;
			continue;
		}
		if (ch === '"') quoted = true;
		result += ch;
		if (ch === ",") while (text[i + 1] === " ") i++;
	}
	return result;
}

const totals = { default: { bytes: 0, tokens: 0 }, compactSeparators: { bytes: 0, tokens: 0 }, oneSpaceIndentAndCompactSeparators: { bytes: 0, tokens: 0 }, verified: 0, failures: [] };
for (const { id, value } of corpus) {
	const docs = [stringifyALE(value), compactCommaWhitespace(stringifyALE(value)), compactCommaWhitespace(stringifyALE(value, { indent: " " }))];
	const variants = [totals.default, totals.compactSeparators, totals.oneSpaceIndentAndCompactSeparators];
	for (let i = 0; i < docs.length; i++) {
		variants[i].bytes += Buffer.byteLength(docs[i], "utf8");
		variants[i].tokens += tokenizer.encode(docs[i]).length;
		if (!isDeepStrictEqual(parseALE(docs[i]), value)) totals.failures.push({ id, variant: i });
	}
	totals.verified++;
}

console.log(JSON.stringify({ cases: corpus.length, method: "remove spaces after comma delimiters only outside quoted strings; optional existing indent=' '", ...totals }, null, 2));
