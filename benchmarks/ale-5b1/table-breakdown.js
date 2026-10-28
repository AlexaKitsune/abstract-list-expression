import { readFile } from "node:fs/promises";
import { encode } from "@toon-format/toon";
import { getEncoding } from "js-tiktoken";
import { isDeepStrictEqual } from "node:util";
import { parseALE, stringifyALE } from "../../ale.js";
import { extendedCorpus } from "./extended-corpus.js";

const original = JSON.parse(await readFile(new URL("../ale-5b/corpus.json", import.meta.url), "utf8"));
const corpus = [...original, ...extendedCorpus];
const tokenizer = getEncoding("o200k_base");

for (const count of [10, 100, 1000]) {
	const records = corpus.find((entry) => entry.id === `homogeneous-table-${count}`).value.records;
	for (const [indentLabel, indentValue] of [["one-space", " "], ["tab", "\t"]]) {
		const indented = stringifyALE({ records }, { indent: indentValue });
		for (const [candidate, candidateText] of [["custom-indent", indented], ["custom-indent-and-compact-commas", indented.replaceAll(", ", ",")]])
			console.log(JSON.stringify({
				rows: count,
				format: "ALE existing serializer options candidate",
				candidate: `${indentLabel}; ${candidate}; analysis only`,
				bytesUtf8: Buffer.byteLength(candidateText, "utf8"),
				tokens: tokenizer.encode(candidateText).length,
				semanticRoundTripUnderCurrentParser: isDeepStrictEqual(parseALE(candidateText), { records }),
			}));
	}
	for (const [format, text, indent, separator] of [
		["ALE", stringifyALE({ records }), 4, ", "],
		["TOON", encode({ records }), 2, ","],
	]) {
		if (format === "ALE") {
			const compactDelimiters = text.replaceAll(", ", ",");
			console.log(JSON.stringify({
				rows: count,
				format: "ALE existing-syntax delimiter candidate",
				candidate: "replace serializer comma-space separators with commas; analysis only",
				metrics: { bytesUtf8: Buffer.byteLength(compactDelimiters, "utf8"), tokens: tokenizer.encode(compactDelimiters).length },
				current: { bytesUtf8: Buffer.byteLength(text, "utf8"), tokens: tokenizer.encode(text).length },
				semanticRoundTripUnderCurrentParser: isDeepStrictEqual(parseALE(compactDelimiters), { records }),
			}));
		}
		const lines = text.split("\n");
		const header = lines[0];
		const rows = lines.slice(1);
		const cells = rows.map((line) => line.slice(indent).split(separator));
		const cellKinds = { numbers: [], strings: [], booleans: [] };
		for (const row of cells) {
			cellKinds.numbers.push(row[0], row[4]);
			cellKinds.strings.push(row[1], row[2]);
			cellKinds.booleans.push(row[3]);
		}
		const headerBytes = Buffer.byteLength(header, "utf8");
		const indentationBytes = count * indent;
		const separatorBytes = count * 4 * Buffer.byteLength(separator, "utf8");
		const payloadBytes = rows.reduce((sum, line) => sum + Buffer.byteLength(line.slice(indent), "utf8") - 4 * Buffer.byteLength(separator, "utf8"), 0);
		const rowBoundaryBytes = count; // newline after header plus separators between the row lines
		console.log(JSON.stringify({
			rows: count,
			format,
			document: { bytesUtf8: Buffer.byteLength(text, "utf8"), tokens: tokenizer.encode(text).length },
			header: { bytesUtf8: headerBytes, isolatedTokens: tokenizer.encode(header).length },
			rowIndentation: { bytesUtf8: indentationBytes, isolatedTokens: tokenizer.encode(" ".repeat(indent).repeat(count)).length },
			cellSeparators: { bytesUtf8: separatorBytes, isolatedTokens: tokenizer.encode(Array(count).fill(separator.repeat(4)).join("\n")).length },
			cellPayloadBytesUtf8: payloadBytes,
			rowBoundaryBytesUtf8: rowBoundaryBytes,
			byteComponentsSum: headerBytes + indentationBytes + separatorBytes + payloadBytes + rowBoundaryBytes,
			cellPayloadKinds: Object.fromEntries(Object.entries(cellKinds).map(([kind, values]) => [kind, {
				bytesUtf8: Buffer.byteLength(values.join(""), "utf8"),
				isolatedTokens: tokenizer.encode(values.join(" ")).length,
			}])),
		}));
	}
}
