export const optionCases = [
	{},
	{ useTables: false },
	{ useSpread: false },
	{ booleanShortcuts: false },
	{ inlineArrayMax: 0 },
	{ useTables: false, useSpread: false },
	{ useTables: true, useSpread: true, booleanShortcuts: false, inlineArrayMax: 2 },
];

export function makeRandom(seed) {
	let state = seed >>> 0;
	return () => {
		state += 0x6d2b79f5;
		let t = state;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 0x1_0000_0000;
	};
}

export function makeGenerator(seed, {
	maxDepth = 4,
	maxNodes = 128,
	maxContainerSize = 4,
} = {}) {
	const random = makeRandom(seed);
	const pick = (items) => items[Math.floor(random() * items.length)];
	const int = (max) => Math.floor(random() * max);
	const edgeStrings = [
		"", "0", "-0", "123", "1e-7", "true", "false", "null", "-",
		"{}", "[]", "[]:", "[:]", "...{x}", ">", "<", "<alpha",
		"a,b", "a\"b", "a\\b", "line\nbreak", "carriage\rreturn", "tab\there",
		" leading", "trailing ", "キツネ🦊", "\uD800", "\uDC00", "snow 雪",
	];
	const specialKeys = [
		"__proto__", "constructor", "prototype", "true", "null", "-", "a,b", "a:b",
		"<alpha", "[]", "name", "", "キツネ", " leading",
	];
	const edgeNumbers = [0, -0, 1, -1, 1e-7, 1e21, Number.MAX_VALUE, Number.MIN_VALUE];

	const scalar = () => {
		const kind = int(4);
		if (kind === 0) return null;
		if (kind === 1) return random() < 0.5;
		if (kind === 2) return random() < 0.7 ? pick(edgeNumbers) : (random() - 0.5) * 1e100;
		return random() < 0.65 ? pick(edgeStrings) : `s${int(100)}_${pick(edgeStrings)}`;
	};

	const value = (depth = 0, state = { nodes: 0 }) => {
		state.nodes++;
		if (depth >= maxDepth || state.nodes >= maxNodes || random() < 0.46) return scalar();
		const available = Math.max(0, maxNodes - state.nodes);
		const size = Math.min(int(maxContainerSize + 1), available);
		if (random() < 0.52)
			return Array.from({ length: size }, () => value(depth + 1, state));

		const result = {};
		for (let i = 0; i < size; i++) {
			const key = random() < 0.6 ? pick(specialKeys) : `k${int(20)}`;
			Object.defineProperty(result, key, {
				value: value(depth + 1, state), enumerable: true, configurable: true, writable: true,
			});
		}
		return result;
	};
	return { value };
}

export function makeDeepChain(depth) {
	let value = "leaf";
	for (let i = 0; i < depth; i++)
		value = i % 2 === 0 ? [value] : { [`level${i}`]: value };
	return value;
}

export function measureDepth(value) {
	if (Array.isArray(value)) return 1 + Math.max(0, ...value.map(measureDepth));
	if (value && typeof value === "object") return 1 + Math.max(0, ...Object.values(value).map(measureDepth));
	return 0;
}
