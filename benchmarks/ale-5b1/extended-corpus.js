const tabular = (count) => Array.from({ length: count }, (_, i) => ({
	id: i + 1,
	name: `record-${String(i + 1).padStart(4, "0")}`,
	group: `group-${i % 8}`,
	active: i % 3 !== 0,
	score: Number(((i * 37) % 1000) / 10),
}));

let nested = { leaf: "end" };
for (let depth = 12; depth >= 1; depth--)
	nested = { [`level${depth}`]: nested };

export const extendedCorpus = [
	...[10, 100, 1000].map((n) => ({
		id: `homogeneous-table-${n}`,
		category: `tabla homogénea (${n} filas)`,
		origin: `Generado determinísticamente: id secuencial, 8 grupos, patrón activo y score modular; ${n} filas.`,
		value: { records: tabular(n) },
	})),
	{
		id: "heterogeneous-extended",
		category: "objetos heterogéneos",
		origin: "Fixture determinista, escrito para cubrir propiedades dispares, objetos anidados y escalares mezclados.",
		value: { records: [
			{ id: 1, name: "Ada", enabled: true },
			{ id: 2, metadata: { region: "west", tags: ["blue", "fast"] } },
			{ message: "missing id", retries: 0, extra: null },
			"plain entry",
		] },
	},
	{
		id: "nested-extended",
		category: "anidamiento extendido",
		origin: "Cadena anidada determinista de 12 niveles con un objeto en cada nivel.",
		value: nested,
	},
	{
		id: "conversation-extended",
		category: "conversación",
		origin: "40 turnos deterministas alternando user/assistant con Unicode ocasional.",
		value: { messages: Array.from({ length: 40 }, (_, i) => ({
			role: i % 2 === 0 ? "user" : "assistant",
			content: i % 7 === 0 ? `Turn ${i + 1}: ¿Qué significa 狐?` : `Turn ${i + 1}: response text with context and detail.`,
		})) },
	},
	{
		id: "api-response-extended",
		category: "respuesta API",
		origin: "Respuesta determinista con 50 elementos, paginación, cabeceras y metadatos anidados.",
		value: { status: 200, headers: { "content-type": "application/json", "x-trace": "trace-0001" }, body: {
			page: 1, next: null, items: Array.from({ length: 50 }, (_, i) => ({ id: `item-${i + 1}`, score: (i + 1) / 100, labels: i % 4 ? ["active"] : ["active", "new"] })),
		} },
	},
	{
		id: "unicode-extended",
		category: "strings Unicode",
		origin: "32 strings deterministas rotando latín acentuado, CJK, cirílico, árabe y emoji válidos.",
		value: { samples: Array.from({ length: 32 }, (_, i) => `${i}: café / こんにちは / Кот / مرحبا / 🦊`) },
	},
	{
		id: "numbers-extended",
		category: "números ordinarios y extremos",
		origin: "Fixture fijo: enteros, fracciones, exponentes, límites de precisión y extremos IEEE-754 finitos.",
		value: { ordinary: [0, 1, -1, 12.5, -0.125, 9007199254740991], extremes: [1e-7, 1e21, Number.MAX_VALUE, Number.MIN_VALUE, -Number.MAX_VALUE] },
	},
];
