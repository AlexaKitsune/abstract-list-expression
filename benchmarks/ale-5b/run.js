import { readFile, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
import { isDeepStrictEqual } from "node:util";
import { parseALE, stringifyALE } from "../../ale.js";

const corpus = JSON.parse(await readFile(new URL("./corpus.json", import.meta.url), "utf8"));
const yamlRun = spawnSync("ruby", [fileURLToPath(new URL("./yaml-bench.rb", import.meta.url)), fileURLToPath(new URL("./corpus.json", import.meta.url))], {
  encoding: "utf8",
  env: { ...process.env, ALE_BENCH_ITERATIONS: process.env.ALE_BENCH_ITERATIONS ?? "40", ALE_BENCH_SAMPLES: process.env.ALE_BENCH_SAMPLES ?? "9" },
  maxBuffer: 16 * 1024 * 1024,
});
if (yamlRun.status !== 0) throw new Error(`YAML worker failed: ${yamlRun.stderr}`);
const yamlResult = JSON.parse(yamlRun.stdout);
const yamlById = new Map(yamlResult.yamlRecords.map((record) => [record.id, record]));
const options = [
  ["default", {}],
  ["useTables-false", { useTables: false }],
  ["useSpread-false", { useSpread: false }],
  ["booleanShortcuts-false", { booleanShortcuts: false }],
];
const repeats = Number(process.env.ALE_BENCH_ITERATIONS ?? 40);
const samples = Number(process.env.ALE_BENCH_SAMPLES ?? 9);

function sizes(text) {
  return {
    bytesUtf8: Buffer.byteLength(text, "utf8"),
    unicodeCodePoints: [...text].length,
    utf16CodeUnits: text.length,
  };
}

function measure(fn) {
  for (let n = 0; n < 3; n++) for (let i = 0; i < corpus.length; i++) fn(i);
  const times = [];
  for (let sample = 0; sample < samples; sample++) {
    const start = performance.now();
    for (let n = 0; n < repeats; n++) for (let i = 0; i < corpus.length; i++) fn(i);
    times.push(performance.now() - start);
  }
  times.sort((a, b) => a - b);
  return { medianMs: times[Math.floor(times.length / 2)], p95Ms: times[Math.min(Math.ceil(times.length * 0.95) - 1, times.length - 1)] };
}

const rows = [];
for (const entry of corpus) {
  const value = entry.value;
  const formats = [
    ["json-compact", JSON.stringify(value), JSON.parse],
    ["json-pretty-2", JSON.stringify(value, null, 2), JSON.parse],
    ["yaml-psych", yamlById.get(entry.id).yaml, (text) => yamlById.get(entry.id).decoded],
  ];
  for (const [name, text, decode] of formats) {
    let decoded, error = null;
    try { decoded = decode(text); } catch (e) { error = `${e.name}: ${e.message}`; }
    rows.push({ id: entry.id, category: entry.category, format: name, ...sizes(text), equivalent: error === null && isDeepStrictEqual(decoded, value), error });
  }
  for (const [optionName, option] of options) {
    let text, decoded, error = null;
    try { text = stringifyALE(value, option); decoded = parseALE(text); } catch (e) { error = `${e.name}: ${e.message}`; }
    rows.push({ id: entry.id, category: entry.category, format: `ale-${optionName}`, ...(text === undefined ? {} : sizes(text)), equivalent: error === null && isDeepStrictEqual(decoded, value), error });
  }
}

const perf = {};
const jsonDocs = corpus.map(({ value }) => JSON.stringify(value));
perf["json-compact"] = {
  serialization: measure((i) => JSON.stringify(corpus[i].value)),
  parsing: measure((i) => JSON.parse(jsonDocs[i])),
    roundTrip: measure((i) => JSON.parse(JSON.stringify(corpus[i].value))),
};
for (const [name, option] of options) {
  const docs = corpus.map(({ value }) => stringifyALE(value, option));
  perf[`ale-${name}`] = {
    serialization: measure((i) => stringifyALE(corpus[i].value, option)),
    parsing: measure((i) => parseALE(docs[i])),
    roundTrip: measure((i) => parseALE(stringifyALE(corpus[i].value, option))),
  };
}
perf["yaml-psych"] = { serialization: yamlResult.serialization, parsing: yamlResult.parsing };
perf["yaml-psych"].roundTrip = yamlResult.roundTrip;
const roundTrips = {};
for (const [name, option] of options) {
  const failures = [];
  for (const entry of corpus) {
    try {
      const first = stringifyALE(entry.value, option);
      const second = stringifyALE(parseALE(first), option);
      if (first !== second) failures.push({ id: entry.id, first, second });
    } catch (e) { failures.push({ id: entry.id, error: `${e.name}: ${e.message}` }); }
  }
  roundTrips[name] = { checked: corpus.length, failures };
}

const yamlVersion = `${yamlResult.psychVersion} (Ruby ${yamlResult.rubyVersion}, stdlib Psych)`;
const report = {
  generatedAt: new Date().toISOString(),
  environment: { node: process.version, platform: process.platform, arch: process.arch, yaml: yamlVersion, benchmarkIterations: repeats, samples, warmupCorpusPasses: 3 },
  corpusCount: corpus.length,
  rows,
  performance: perf,
  yamlVersion,
  roundTrips,
};
await writeFile(new URL("./results.json", import.meta.url), JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify(report, null, 2));
