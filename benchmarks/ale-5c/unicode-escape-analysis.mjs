import { isDeepStrictEqual } from "node:util";
import { getEncoding } from "js-tiktoken";
import { parseALE, stringifyALE } from "../../ale.js";
import { extendedCorpus } from "../ale-5b1/extended-corpus.js";

const value = extendedCorpus.find((entry) => entry.id === "unicode-extended").value;
const currentText = stringifyALE(value);
const candidateText = currentText.replaceAll("\\ud83e\\udd8a", "🦊");
const tokenizer = getEncoding("o200k_base");
const measure = (text) => ({ bytesUtf8: Buffer.byteLength(text, "utf8"), tokensO200kBase: tokenizer.encode(text).length });

console.log(JSON.stringify({
	case: "unicode-extended",
	replacementCount: (currentText.match(/\\ud83e\\udd8a/g) ?? []).length,
	currentSerializerOutput: measure(currentText),
	quotedLiteralUnicodeCandidate: measure(candidateText),
	candidateParsesToSameValue: isDeepStrictEqual(parseALE(candidateText), value),
	classification: "analysis-only candidate; not output by current stringifyALE",
}, null, 2));
