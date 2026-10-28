// ale.js — ALE v0.1.0 release candidate parser + stringifier (JS ⇄ ALE)
// Node >= 16.9 (uses Object.hasOwn; ESM entrypoint)

export function parseALE(input, options = {}) {
	const grammar = options?.grammar ?? "current";
	if (grammar !== "current" && grammar !== "legacy" && grammar !== "next")
		throw new TypeError(`Unknown ALE grammar "${grammar}"`);
	const src = String(input ?? "");
	const rawLines = src.replace(/\r\n?/g, "\n").split("\n");

	// Keep original line numbers for errors.
	const lines = rawLines
		.map((text, i) => ({ text, lineNo: i + 1 }))
		.filter((l) => l.text.trim().length > 0); // empty lines ignored
	if (lines.length === 0) {
		if (grammar === "legacy") return [];
		throw aleError({ lineNo: 1 }, "Empty ALE document is not valid.");
	}

	// Detect indentation style (tabs vs spaces) & unit.
	const indent = detectIndent(lines);

	// Pre-parse line -> {indentLevel, content, lineNo}
	const L = lines.map((l) => {
		const { level, content } = splitIndent(l.text, indent);
		return { level, content, lineNo: l.lineNo, grammar };
	});

	if (grammar !== "legacy" && L.length === 1 && L[0].level === 0) {
		if (L[0].content.trim() === "{}") return {};
		if (L[0].content.trim() === "[]") return [];
		if (grammar !== "legacy" && !isKeyValueLine(L[0].content) && !isFlagLine(L[0].content))
			return parseScalarOrInline(L[0].content, L[0]);
	}
	if (grammar !== "legacy" && L[0].level === 0 && isExplicitArrayHeader(L[0].content)) {
		const parsed = parseExplicitArrayBlock(L, 0, 0);
		if (parsed.next < L.length)
			throw aleError(L[parsed.next], `Unexpected extra content at top-level: "${L[parsed.next].content}"`);
		return parsed.value;
	}
	if (grammar !== "legacy" && L[0].level === 0 && isAnonymousTableHeaderLine(L[0].content)) {
		const m = L[0].content.match(/^\{(.+)\}:\s*$/);
		const columns = parseColumns(m[1], L[0]);
		const childLevel = requireChildLevelAllowEmpty(L, 1, 0);
		const parsed = childLevel == null
			? { value: [], next: 1 }
			: parseTableRowsBlock(L, 1, childLevel, columns);
		if (parsed.next < L.length)
			throw aleError(L[parsed.next], `Unexpected extra content at top-level: "${L[parsed.next].content}"`);
		return parsed.value;
	}

	let i = 0;

	// Parse a top-level "block" that may resolve to object or array.
	const { value, next } = parseBlock(L, i, 0, { kind: "auto" });
	i = next;

	// If there are leftover lines at top-level same indent, parse and merge:
	// (This mostly occurs if parseBlock ended early due to mode; we keep strict.)
	if (i < L.length)
		throw aleError(L[i], `Unexpected extra content at top-level: "${L[i].content}"`);

	return value;
}

function isExplicitArrayHeader(content) {
	return content.trim() === "[]:";
}

function isDirectContainerValue(content) {
	const value = content.trim();
	return value === "{}" || (value.startsWith("[") && value.endsWith("]"));
}

function parseDirectContainerValue(content, line) {
	const value = content.trim();
	return value === "{}" ? {} : parseScalarOrInline(value, line);
}

export function stringifyALE(value, options = {}) {
	const grammar = options?.grammar ?? "current";
	if (grammar !== "current" && grammar !== "legacy" && grammar !== "next")
		throw new TypeError(`Unknown ALE grammar "${grammar}"`);
	const opt = {
		indent: "    ",
		useTables: true,
		inlineArrayMax: 6,
		booleanShortcuts: true,
		useSpread: true,
		...options,
		grammar,
		_tableShapeCache: new WeakMap(),
	};

	const out = [];
	writeValue(out, value, 0, opt, { preferInline: false, inSlot: false });
	// Remove any leading blank lines (none expected)
	return out.join("\n").replace(/^\n+/, "");
}

/* ------------------------------ INDENTATION ------------------------------ */

function detectIndent(lines) {
	// Find first indented (leading whitespace) line
	for (const l of lines) {
		const m = l.text.match(/^([ \t]+)/);
		if (!m) continue;

		const ws = m[1];
		const hasTabs = ws.includes("\t");
		const hasSpaces = ws.includes(" ");

		if (hasTabs && hasSpaces)
			throw aleError({ lineNo: l.lineNo }, "Mixed tabs and spaces in indentation.");
		if (hasTabs)
			return { type: "tab", unit: "\t" };

		// spaces
		// unit = count of leading spaces in the first indented line
		return { type: "space", unit: " ".repeat(ws.length) };
	}
	// No indentation present — still valid.
	return { type: "none", unit: "" };
}

function splitIndent(text, indent) {
	if (indent.type === "none") return { level: 0, content: text.trimStart() };

	const m = text.match(/^([ \t]*)(.*)$/);
	const ws = m ? m[1] : "";
	const content = m ? m[2] : text;

	if (indent.type === "tab") {
		if (ws.includes(" "))
			throw aleError({}, "Mixed spaces with tab indentation.");
		return { level: ws.length, content: content.trimEnd() };
	}

	// spaces
	if (ws.includes("\t"))
		throw aleError({}, "Mixed tabs with space indentation.");

	const unitLen = indent.unit.length || 1;

	if (ws.length % unitLen !== 0)
		throw aleError({}, `Indentation is not a multiple of the indent unit (${unitLen} spaces).`);

	return { level: ws.length / unitLen, content: content.trimEnd() };
}

function aleError(line, msg) {
	const ln = line?.lineNo ? `Line ${line.lineNo}: ` : "";
	const e = new Error(ln + msg);
	e.name = "ALEParseError";
	return e;
}

/* ------------------------------ CORE PARSER ------------------------------ */

function parseBlock(L, startIdx, baseLevel, mode) {
	// mode.kind: "auto" | "object" | "array" | "slot" | "tableRows"
	// Returns {value, next}
	let i = startIdx;

	// Determine kind if auto:
	let kind = mode.kind;
	if (kind === "auto")
		kind = inferBlockKind(L, i, baseLevel);

	if (kind === "object") return parseObjectBlock(L, i, baseLevel);
	if (kind === "array") return parseArrayBlock(L, i, baseLevel);
	if (kind === "slot") return parseSlotBlock(L, i, baseLevel, mode.slotSpec);
	if (kind === "tableRows") return parseTableRowsBlock(L, i, baseLevel, mode.columns);

	throw new Error(`Unknown block kind: ${kind}`);
}

function inferBlockKind(L, i, baseLevel) {
	// A sibling marker cannot be an object property; honor it as an explicit array cue.
	if (L[i]?.grammar !== "legacy") {
		for (let j = i; j < L.length && L[j].level >= baseLevel; j++) {
			if (L[j].level === baseLevel && L[j].content.trim().startsWith(">")) return "array";
		}
	}
	// Look ahead for the first line at baseLevel (or deeper if equal?) to decide.
	for (let j = i; j < L.length; j++) {
		if (L[j].level < baseLevel) break;
		if (L[j].level > baseLevel) continue;
		const c = L[j].content.trim();
		if (c.length === 0) continue;
		if (isSpreadTableHeaderLine(c) || isAnonymousTableHeaderLine(c) || isArrayAsElementTableHeaderLine(c))
			return "array";

		// If it's clearly a key/value-ish line => object, else => array
		if (isKeyValueLine(c) || isFlagLine(c) || isKeyedTableHeaderLine(c)) return "object";
		// Anonymous table header like "{a,b}:" should be array element
		return "array";
	}
	// Empty block => array (safe default)
	return "array";
}

/* ------------------------------ LINE HELPERS ----------------------------- */

function isFlagLine(c) {
	return (c.startsWith("!") || c.startsWith("¡")) && findTopLevelColon(c.slice(1)) === -1;
}

function isKeyValueLine(c) {
	// key: value OR key:
	// key can be quoted "a b"
	// We'll accept a colon not inside quotes (simple scan).
	const idx = findTopLevelColon(c);
	if (idx === -1) return false;
	const keyPart = c.slice(0, idx).trim();
	return keyPart.length > 0;
}

function isKeyedTableHeaderLine(c) {
	// key{a,b}:
	// key can be quoted
	const m = c.match(/^(.+?)\{(.+)\}:\s*$/);
	if (!m) return false;
	const key = m[1].trim();
	return key.length > 0;
}

function isSpreadTableHeaderLine(c) {
	// ...{a,b}:
	return /^\.{3}\{(.+)\}:\s*$/.test(c.trim());
}

function isArrayAsElementTableHeaderLine(c) {
	// [{a,b}]:
	return /^\[\{(.+)\}\]:\s*$/.test(c.trim());
}

function isAnonymousTableHeaderLine(c) {
	// {a,b}:
	return /^\{(.+)\}:\s*$/.test(c.trim());
}

function findTopLevelColon(s) {
	let inQuotes = false;
	let esc = false;
	for (let i = 0; i < s.length; i++) {
		const ch = s[i];
		if (esc) {
			esc = false;
			continue;
		}
		if (ch === "\\") {
			esc = true;
			continue;
		}
		if (ch === '"') inQuotes = !inQuotes;
		if (!inQuotes && ch === ":") return i;
	}
	return -1;
}

function parseKey(rawKey, lineObj) {
	const k = rawKey.trim();
	if (k.startsWith('"') && k.endsWith('"') && k.length >= 2)
		return unescapeQuotedString(k.slice(1, -1), lineObj);
	return k;
}

/* ------------------------------ OBJECT BLOCK ----------------------------- */

function parseObjectBlock(L, startIdx, baseLevel) {
	const obj = {};
	let i = startIdx;

	while (i < L.length) {
		const line = L[i];
		if (line.level < baseLevel) break;
		if (line.level > baseLevel)
			throw aleError(line, `Unexpected indentation inside object: "${line.content}"`);

		const c = line.content.trim();
		if (c.length === 0) {
			i++;
			continue;
		}

		if (c.startsWith(">") || c.startsWith("<"))
			// '>'/'<' are meaningful inside arrays/slots/table continuation, not in plain object root
			throw aleError(line, `Unexpected "${c[0]}" at object level.`);

		if (isFlagLine(c)) {
			const flag = c[0];
			const key = parseKey(c.slice(1), line);
			setParsedData(obj, key, flag === "¡", line);
			i++;
			continue;
		}

		// Table header key{...}:
		if (isKeyedTableHeaderLine(c)) {
			const m = c.match(/^(.+?)\{(.+)\}:\s*$/);
			const key = parseKey(m[1], line);
			const cols = parseColumns(m[2], line);

			i++;
			// Rows block must be indented
			const childLevel = requireChildLevel(L, i, baseLevel, line);
			const { value: rows, next } = parseTableRowsBlock(L, i, childLevel, cols);
			setParsedData(obj, key, rows, line);
			i = next;
			continue;
		}

		// Normal key: value OR key:
		if (!isKeyValueLine(c))
			throw aleError(line, `Invalid object line: "${c}"`);

		const idx = findTopLevelColon(c);
		const rawKey = c.slice(0, idx);
		const key = parseKey(rawKey, line);
		const rawVal = c.slice(idx + 1).trim();
		if (rawVal === "[]:") {
			if (line.grammar === "legacy") {
				setParsedData(obj, key, rawVal, line);
				i++;
				continue;
			}
			const child = L[i + 1];
			if (!child || child.level <= baseLevel)
				throw aleError(line, "Explicit array block []: requires an indented child block.");
			const parsed = parseExplicitArrayBlock(L, i, baseLevel);
			setParsedData(obj, key, parsed.value, line);
			i = parsed.next;
			continue;
		}
		if (rawVal === "[]" || (rawVal === "{}" && line.grammar !== "legacy")) {
			setParsedData(obj, key, rawVal === "{}" ? {} : [], line);
			i++;
			continue;
		}
		if (rawVal === "[:]" && line.grammar !== "legacy") {
			const childLevel = requireChildLevelAllowEmpty(L, i + 1, baseLevel);
			if (childLevel == null) {
				setParsedData(obj, key, [], line);
				i++;
			} else {
				const parsed = parseSlotBlock(L, i + 1, childLevel);
				setParsedData(obj, key, parsed.value, line);
				i = parsed.next;
			}
			continue;
		}

		if (rawVal.length === 0) {
			// Block-inferred. Decide by peeking at children.
			i++;
			const childLevel = requireChildLevelAllowEmpty(L, i, baseLevel);
			if (childLevel == null) {
				// key: (sin valor ni bloque) => null (como en tu ejemplo word:/meaning:)
				setParsedData(obj, key, null, line);
				continue;
			}
			if (line.grammar !== "legacy" && isExplicitArrayHeader(L[i].content)) {
				const parsed = parseExplicitArrayBlock(L, i, childLevel);
				setParsedData(obj, key, parsed.value, line);
				i = parsed.next;
				continue;
			}
			if (line.grammar !== "legacy" && isDirectContainerValue(L[i].content)) {
				setParsedData(obj, key, parseDirectContainerValue(L[i].content, L[i]), line);
				i++;
				continue;
			}
			const kind = inferBlockKind(L, i, childLevel);
			const { value, next } = parseBlock(L, i, childLevel, { kind });
			setParsedData(obj, key, value, line);
			i = next;
			continue;
		}

		// key: inlineValue / slot marker / table-in-cell marker? (only via rows)
		setParsedData(obj, key, parseScalarOrInline(rawVal, line), line);
		i++;
	}

	return { value: obj, next: i };
}

function setData(target, key, value) {
	Object.defineProperty(target, key, {
		value, enumerable: true, configurable: true, writable: true,
	});
}

function setParsedData(target, key, value, line) {
	if (line?.grammar !== "legacy" && Object.hasOwn(target, key))
		throw aleError(line, `Duplicate object key "${key}".`);
	setData(target, key, value);
}

function parseExplicitArrayBlock(L, headerIdx, parentLevel) {
	const header = L[headerIdx];
	const child = L[headerIdx + 1];
	if (!child || child.level <= parentLevel)
		throw aleError(header, "Explicit array block []: requires an indented child block.");
	const itemLevel = child.level;
	const arr = [];
	let buildingObj = null;
	let i = headerIdx + 1;
	const flushObj = () => {
		if (buildingObj) arr.push(buildingObj);
		buildingObj = null;
	};

	while (i < L.length) {
		const line = L[i];
		if (line.level < itemLevel) break;
		if (line.level > itemLevel)
			throw aleError(line, "Unexpected indentation in explicit array block.");
		const c = line.content.trim();

		if (c === ">:") {
			flushObj();
			i++;
			const objectLevel = requireChildLevel(L, i, itemLevel, line);
			const parsed = parseObjectBlock(L, i, objectLevel);
			if (parsed.next === i) throw aleError(line, "Expected an object after >:.");
			arr.push(parsed.value);
			i = parsed.next;
			continue;
		}

		if (c.startsWith(">")) {
			flushObj();
			const rest = c.slice(1).trim();
			if (!rest) throw aleError(line, "Expected an object property or value after >.");
			if (rest === "{}") {
				arr.push({});
				i++;
				continue;
			}
			if (rest === "[]") {
				arr.push([]);
				i++;
				continue;
			}
			if (isKeyedTableHeaderLine(rest)) {
				const m = rest.match(/^(.+?)\{(.+)\}:\s*$/);
				const key = parseKey(m[1], line);
				const columns = parseColumns(m[2], line);
				const childLevel = requireChildLevel(L, i + 1, itemLevel, line);
				const parsed = parseTableRowsBlock(L, i + 1, childLevel, columns);
				buildingObj = {};
				setParsedData(buildingObj, key, parsed.value, line);
				i = parsed.next;
				continue;
			}
			if (isFlagLine(rest)) {
				buildingObj = {};
				const flag = rest[0];
				const key = parseKey(rest.slice(1), line);
				setParsedData(buildingObj, key, flag === "¡", line);
				i++;
				continue;
			}
			if (!isKeyValueLine(rest)) throw aleError(line, "The > separator must begin an object element.");
			buildingObj = {};
			const idx = findTopLevelColon(rest);
			const key = parseKey(rest.slice(0, idx), line);
			const rawVal = rest.slice(idx + 1).trim();
			if (rawVal === "[]:") {
				const parsed = parseExplicitArrayBlock(L, i, itemLevel);
				setParsedData(buildingObj, key, parsed.value, line);
				i = parsed.next;
			} else if (rawVal === "{}" || rawVal === "[]") {
				setParsedData(buildingObj, key, rawVal === "{}" ? {} : [], line);
				i++;
			} else if (rawVal === "[:]") {
				i++;
				const child = L[i];
				if (child && child.level > itemLevel) {
					const parsed = parseSlotBlock(L, i, child.level);
					setParsedData(buildingObj, key, parsed.value, line);
					i = parsed.next;
				} else setParsedData(buildingObj, key, [], line);
			} else if (!rawVal) {
				i++;
				const child = L[i];
				if (child && child.level > itemLevel) {
					if (line.grammar !== "legacy" && isDirectContainerValue(child.content)) {
						setParsedData(buildingObj, key, parseDirectContainerValue(child.content, child), line);
						i++;
					} else if (isExplicitArrayHeader(child.content)) {
						const parsed = parseExplicitArrayBlock(L, i, child.level);
						setParsedData(buildingObj, key, parsed.value, line);
						i = parsed.next;
					} else {
						const kind = inferBlockKind(L, i, child.level);
						const parsed = parseBlock(L, i, child.level, { kind });
						setParsedData(buildingObj, key, parsed.value, line);
						i = parsed.next;
					}
				} else setParsedData(buildingObj, key, null, line);
			} else {
				setParsedData(buildingObj, key, parseScalarOrInline(rawVal, line), line);
				i++;
			}
			continue;
		}

		if (isSpreadTableHeaderLine(c)) {
			flushObj();
			const m = c.match(/^\.{3}\{(.+)\}:\s*$/);
			const columns = parseColumns(m[1], line);
			i++;
			const childLevel = requireChildLevelAllowEmpty(L, i, itemLevel);
			if (childLevel == null) continue;
			const parsed = parseTableRowsBlock(L, i, childLevel, columns);
			arr.push(...parsed.value);
			i = parsed.next;
			continue;
		}

		if (isArrayAsElementTableHeaderLine(c)) {
			flushObj();
			const m = c.match(/^\[\{(.+)\}\]:\s*$/);
			const columns = parseColumns(m[1], line);
			i++;
			const childLevel = requireChildLevelAllowEmpty(L, i, itemLevel);
			const rows = childLevel == null ? { value: [], next: i } : parseTableRowsBlock(L, i, childLevel, columns);
			arr.push(rows.value);
			i = rows.next;
			continue;
		}

		if (isAnonymousTableHeaderLine(c)) {
			flushObj();
			const m = c.match(/^\{(.+)\}:\s*$/);
			const columns = parseColumns(m[1], line);
			i++;
			const childLevel = requireChildLevelAllowEmpty(L, i, itemLevel);
			let rows;
			if (childLevel == null && line.grammar === "legacy") rows = parseInlineTableRows(L, i, itemLevel, columns);
			else if (childLevel == null) rows = { value: [], next: i };
			else rows = parseTableRowsBlock(L, i, childLevel, columns);
			arr.push(rows.value);
			i = rows.next;
			continue;
		}

		if (isKeyedTableHeaderLine(c)) {
			if (!buildingObj) buildingObj = {};
			const m = c.match(/^(.+?)\{(.+)\}:\s*$/);
			const key = parseKey(m[1], line);
			const columns = parseColumns(m[2], line);
			i++;
			const childLevel = requireChildLevel(L, i, itemLevel, line);
			const rows = parseTableRowsBlock(L, i, childLevel, columns);
			setParsedData(buildingObj, key, rows.value, line);
			i = rows.next;
			continue;
		}

		if (isExplicitArrayHeader(c)) {
			flushObj();
			const parsed = parseExplicitArrayBlock(L, i, itemLevel);
			arr.push(parsed.value);
			i = parsed.next;
			continue;
		}

		if (c === "{}" || c === "[]") {
			flushObj();
			arr.push(c === "{}" ? {} : []);
			i++;
			continue;
		}

		if (isKeyValueLine(c)) {
			if (!buildingObj) buildingObj = {};
			const idx = findTopLevelColon(c);
			const key = parseKey(c.slice(0, idx), line);
			const rawVal = c.slice(idx + 1).trim();
			if (!rawVal) {
				i++;
				const child = L[i];
				if (child && child.level > itemLevel) {
					if (line.grammar !== "legacy" && (child.content.trim() === "{}" || child.content.trim() === "[]")) {
						setParsedData(buildingObj, key, child.content.trim() === "{}" ? {} : [], line);
						i++;
					} else if (isExplicitArrayHeader(child.content)) {
						const parsed = parseExplicitArrayBlock(L, i, child.level);
						setParsedData(buildingObj, key, parsed.value, line);
						i = parsed.next;
					} else {
						const kind = inferBlockKind(L, i, child.level);
						const parsed = parseBlock(L, i, child.level, { kind });
						setParsedData(buildingObj, key, parsed.value, line);
						i = parsed.next;
					}
				} else setParsedData(buildingObj, key, null, line);
				continue;
			}
			if (rawVal === "[:]") {
				i++;
				const child = L[i];
				if (child && child.level > itemLevel) {
					const parsed = parseSlotBlock(L, i, child.level);
					setParsedData(buildingObj, key, parsed.value, line);
					i = parsed.next;
				} else setParsedData(buildingObj, key, [], line);
				continue;
			}
			if (rawVal === "[]:") {
				const parsed = parseExplicitArrayBlock(L, i, itemLevel);
				setParsedData(buildingObj, key, parsed.value, line);
				i = parsed.next;
			} else {
				setParsedData(buildingObj, key, rawVal ? parseScalarOrInline(rawVal, line) : null, line);
				i++;
			}
			continue;
		}

		if (isFlagLine(c)) {
			if (!buildingObj) buildingObj = {};
			const flag = c[0];
			const key = parseKey(c.slice(1), line);
			setParsedData(buildingObj, key, flag === "¡", line);
			i++;
			continue;
		}

		flushObj();
		arr.push(parseScalarOrInline(c, line));
		i++;
	}

	flushObj();
	return { value: arr, next: i };
}

/* ------------------------------ ARRAY BLOCK ------------------------------ */

function parseArrayBlock(L, startIdx, baseLevel) {
	const arr = [];
	let i = startIdx;

	let buildingObj = null; // when consecutive key-lines form an object element

	const flushObj = () => {
		if (buildingObj && Object.keys(buildingObj).length > 0) arr.push(buildingObj);
		buildingObj = null;
	};

	while (i < L.length) {
		const line = L[i];
		if (line.level < baseLevel) break;
		if (line.level > baseLevel) {
			// This is a child block for the *previous* element.
			// We attach it depending on what the previous element is.
			const prev = arr.length ? arr[arr.length - 1] : buildingObj;
			if (prev == null) throw aleError(line, "Unexpected indentation (no parent element).");

			// If we are still building an object but haven't flushed yet, previous is buildingObj.
			// We interpret child block as:
			// - if prev is scalar => it becomes an array? Spec doesn't define; treat as error.
			// - if prev is object => child block must be assigned? Not defined; error.
			throw aleError(line, `Unexpected nested block after element "${String(prev)}". Use key: to introduce blocks.`);
		}

		let c = line.content.trim();
		if (c.length === 0) {
			i++;
			continue;
		}

		// Sibling separator in arrays: starts a new sibling element
		if (c.startsWith(">")) {
			// close current object if building
			flushObj();
			c = c.slice(1).trim();
			if (c.length === 0) {
				i++;
				continue;
			}
			// then parse the remainder as if it were a normal line at this level
			// (fallthrough)
		}

		// Spread table header as element: ...{a,b}:
		if (isSpreadTableHeaderLine(c)) {
			flushObj();
			const m = c.match(/^\.{3}\{(.+)\}:\s*$/);
			const cols = parseColumns(m[1], line);
			i++;
			const childLevel = requireChildLevelAllowEmpty(L, i, baseLevel);
			if (childLevel == null) continue;
			const { value: rows, next } = parseTableRowsBlock(L, i, childLevel, cols);
			for (const r of rows) arr.push(r);
			i = next;
			continue;
		}

		// Array-as-element table header: [{a,b}]:
		if (isArrayAsElementTableHeaderLine(c)) {
			flushObj();
			const m = c.match(/^\[\{(.+)\}\]:\s*$/);
			const cols = parseColumns(m[1], line);
			i++;
			const childLevel = requireChildLevelAllowEmpty(L, i, baseLevel);
			const { value: rows, next } = childLevel == null
				? { value: [], next: i }
				: parseTableRowsBlock(L, i, childLevel, cols);
			arr.push(rows); // single element which is an array
			i = next;
			continue;
		}

		// Anonymous table header: {a,b}:
		if (isAnonymousTableHeaderLine(c)) {
			flushObj();
			const m = c.match(/^\{(.+)\}:\s*$/);
			const cols = parseColumns(m[1], line);
			i++;
			const childLevel = requireChildLevelAllowEmpty(L, i, baseLevel);
			if (childLevel == null) {
				if (line.grammar === "legacy") {
					const inline = parseInlineTableRows(L, i, baseLevel, cols);
					arr.push(inline.value);
					i = inline.next;
				} else arr.push([]);
				continue;
			}
			const { value: rows, next } = parseTableRowsBlock(L, i, childLevel, cols);
			arr.push(rows);
			i = next;
			continue;
		}

		// Keyed table header line inside array => means "object element being built"
		// and that key's value is that table.
		if (isKeyedTableHeaderLine(c)) {
			if (!buildingObj) buildingObj = {};
			const m = c.match(/^(.+?)\{(.+)\}:\s*$/);
			const key = parseKey(m[1], line);
			const cols = parseColumns(m[2], line);
			i++;
			const childLevel = requireChildLevel(L, i, baseLevel, line);
			const { value: rows, next } = parseTableRowsBlock(L, i, childLevel, cols);
				setParsedData(buildingObj, key, rows, line);
			i = next;
			continue;
		}

		// Flag line inside array => applies to current building object
		if (isFlagLine(c)) {
			if (!buildingObj) buildingObj = {};
			const flag = c[0];
			const key = parseKey(c.slice(1), line);
				setParsedData(buildingObj, key, flag === "¡", line);
			i++;
			continue;
		}

		// key: value inside array => contributes to current object element
		if (isKeyValueLine(c)) {
			if (!buildingObj) buildingObj = {};
			const idx = findTopLevelColon(c);
			const rawKey = c.slice(0, idx);
			const key = parseKey(rawKey, line);
			const rawVal = c.slice(idx + 1).trim();

			if (rawVal.length === 0) {
				// Block after key:
				i++;
				const childLevel = requireChildLevelAllowEmpty(L, i, baseLevel);
				if (childLevel == null) {
					setParsedData(buildingObj, key, null, line);
					continue;
				}
				if (line.grammar !== "legacy" && isExplicitArrayHeader(L[i].content)) {
					const parsed = parseExplicitArrayBlock(L, i, childLevel);
					setParsedData(buildingObj, key, parsed.value, line);
					i = parsed.next;
					continue;
				}
				if (line.grammar !== "legacy" && isDirectContainerValue(L[i].content)) {
					setParsedData(buildingObj, key, parseDirectContainerValue(L[i].content, L[i]), line);
					i++;
					continue;
				}
				const kind = inferBlockKind(L, i, childLevel);
				const { value, next } = parseBlock(L, i, childLevel, { kind });
				setParsedData(buildingObj, key, value, line);
				i = next;
				continue;
			}

			setParsedData(buildingObj, key, parseScalarOrInline(rawVal, line), line);
			i++;
			continue;
		}

		// Otherwise it's a free element (scalar / inline array / quoted string)
		flushObj();
		arr.push(parseScalarOrInline(c, line));
		i++;
	}

	flushObj();
	return { value: arr, next: i };
}

/* ------------------------------ TABLES ----------------------------------- */

function parseColumns(colsText, lineObj) {
	// split by comma, respecting escapes and quotes
	const cols = splitCSVLike(colsText, lineObj)
		.map((s) => s.trim())
		.filter(Boolean)
		.map((s) => parseKey(s, lineObj));
	if (!cols.length) throw aleError(lineObj, "Empty column list in table header.");
	if (lineObj?.grammar !== "legacy") {
		const seen = new Set();
		for (const col of cols) {
			if (seen.has(col)) throw aleError(lineObj, `Duplicate table column "${col}".`);
			seen.add(col);
		}
	}
	return cols;
}

function parseTableRowsBlock(L, startIdx, baseLevel, columns) {
  const rows = [];
  let i = startIdx;

	while (i < L.length) {
		const line = L[i];
		if (line.level < baseLevel) break;
		if (line.level > baseLevel)
			throw aleError(line, `Unexpected indentation in table rows: "${line.content}"`);

		let c = line.content.trim();
		if (c.length === 0) {
			i++;
			continue;
		}

		// Parse one CSV-like row into cells
		const cells = splitCSVLike(c, line);
		if (line.grammar !== "legacy" && cells.length > columns.length)
			throw aleError(line, `Table row has ${cells.length} cells but only ${columns.length} columns.`);

		// Map to object by columns (extra cells ignored, missing => null)
		const obj = {};
		const placeholders = []; // complex columns in this row: slot/table placeholder

		for (let colIdx = 0; colIdx < columns.length; colIdx++) {
			const colName = columns[colIdx];
			const cell = (cells[colIdx] ?? "").trim();

			const v = parseTableCell(cell, line);
			if (v && v.__ale_placeholder) {
				placeholders.push({ colName, kind: v.kind, columns: v.columns });
				setData(obj, colName, []);
			} else {
				setData(obj, colName, v);
			}
		}

		i++;

		// If next line is indented: continuation block for placeholders, in order.
		const nextLine = L[i];
		if (nextLine && nextLine.level > baseLevel && placeholders.length) {
			const contLevel = nextLine.level;

			// Fill placeholders by reading continuation lines until dedent back to baseLevel.
			const { next } = fillPlaceholdersFromContinuation(L, i, contLevel, obj, placeholders);
			i = next;
		}

		rows.push(obj);
	}

	return { value: rows, next: i };
}

function parseInlineTableRows(L, startIdx, level, columns) {
	const rows = [];
	let i = startIdx;
	if (columns.length < 2) return { value: rows, next: i };
	while (i < L.length && L[i].level === level) {
		const line = L[i];
		const cells = splitCSVLike(line.content.trim(), line);
		if (cells.length !== columns.length) break;
		const row = {};
		for (let colIdx = 0; colIdx < columns.length; colIdx++) {
			const value = parseTableCell(cells[colIdx].trim(), line);
			if (value?.__ale_placeholder)
				throw aleError(line, "Unindented table rows cannot contain continuation placeholders.");
			setData(row, columns[colIdx], value);
		}
		rows.push(row);
		i++;
	}
	return { value: rows, next: i };
}

function parseTableCell(cell, lineObj) {
	// Null rules: "-" => null ; empty cell => null
	if (cell === "" || cell === "-") return null;

	// Boolean shortcuts inside tables:
	if (cell === "¡") return true;
	if (cell === "!") return false;

	// Slot marker:
	if (cell === "[:]")
		return { __ale_placeholder: true, kind: "slot" };

	// Table placeholder inside a cell: "{a,b,c}"
	if (cell.startsWith("{") && cell.endsWith("}")) {
		const inner = cell.slice(1, -1);
		const cols = parseColumns(inner, lineObj);
		return { __ale_placeholder: true, kind: "table", columns: cols };
	}

	// Otherwise a scalar/inline array
	return parseScalarOrInline(cell, lineObj);
}

function fillPlaceholdersFromContinuation(L, startIdx, contLevel, targetObj, placeholders) {
	let i = startIdx;
	let activeIndex = 0;

	const pickByName = (name) => {
		const idx = placeholders.findIndex((p) => p.colName === name);
		if (idx === -1) return null;
		return idx;
	};

	const advance = () => {
		activeIndex = Math.min(activeIndex + 1, placeholders.length - 1);
	};

	const consumeInlineForActive = (inlineText, lineObj) => {
		const ph = placeholders[activeIndex];
		if (!ph) throw aleError(lineObj, "No active placeholder for inline continuation content.");

		if (ph.kind === "slot") {
			// Inline content behaves like a normal slot line (can be key/value, flag, free text, etc)
			const fake = inlineText.trim();

			if (fake.startsWith(">")) {
				// In a slot, '>' splits siblings; simplest inline: treat remainder as a line
				const rem = fake.slice(1).trim();
				if (rem.length) targetObj[ph.colName].push(parseScalarOrInline(rem, lineObj));
				return;
			}

			if (isFlagLine(fake)) {
				// flags inside slot usually apply to an object sibling, but inline fallback = object as element
				const flag = fake[0];
				const key = parseKey(fake.slice(1), lineObj);
				const entry = {};
				setData(entry, key, flag === "¡");
				targetObj[ph.colName].push(entry);
				return;
			}

			if (isKeyValueLine(fake)) {
				const idx = findTopLevelColon(fake);
				const key = parseKey(fake.slice(0, idx), lineObj);
				const rawVal = fake.slice(idx + 1).trim();
					const entry = {};
					setData(entry, key, rawVal.length ? parseScalarOrInline(rawVal, lineObj) : []);
					targetObj[ph.colName].push(entry);
				return;
			}

			// free text literal
			targetObj[ph.colName].push(parseScalarOrInline(fake, lineObj));
			return;
		}

		if (ph.kind === "table") {
			// Inline content is a table row
			const cells = splitCSVLike(inlineText, lineObj);
			if (lineObj.grammar !== "legacy" && cells.length > ph.columns.length)
				throw aleError(lineObj, "Continuation row has more cells than its table placeholder.");
			const obj = {};
			for (let colIdx = 0; colIdx < ph.columns.length; colIdx++) {
				const colName = ph.columns[colIdx];
				const cell = (cells[colIdx] ?? "").trim();
				setData(obj, colName, parseTableCell(cell, lineObj));
			}
			targetObj[ph.colName].push(obj);
			return;
		}

		throw aleError(lineObj, `Unknown placeholder kind "${ph.kind}"`);
	};

	while (i < L.length) {
		const line = L[i];
		if (line.level < contLevel) break;
		if (line.level > contLevel)
			throw aleError(line, `Unexpected extra indentation in continuation: "${line.content}"`);

		let c = line.content.trim();
		if (c.length === 0) {
			i++;
			continue;
		}

		// Slot selection / next slot: < or <name or <row...
		if (c.startsWith("<")) {
			const rest = c.slice(1).trim();

			// "<" alone => next placeholder, consume line
			if (rest.length === 0) {
				advance();
				i++;
				continue;
			}

			// If rest looks like a name selector (no commas, no ":" etc), just switch
			const isQuotedName = line.grammar === "legacy"
				? rest.startsWith('"') && rest.endsWith('"')
				: rest.startsWith('"') && rest.endsWith('"') && splitCSVLike(rest, line).length === 1;
			const looksLikeNameSelector = isQuotedName || (
				splitCSVLike(rest, line).length === 1 &&
				findTopLevelColon(rest) === -1 &&
				!rest.startsWith("[") &&
				!rest.startsWith("{")
			);

			if (looksLikeNameSelector) {
				const idx = pickByName(parseKey(rest, line));
				if (idx == null) throw aleError(line, `Unknown slot/table name "${rest}" in <name selection.`);
				activeIndex = idx;
				i++;
				continue;
			}

			// "<something, ...": advance to next placeholder AND treat "something, ..." as content, while consuming THIS SAME LINE.
			advance();
			consumeInlineForActive(rest, line);
			i++;
			continue;
		}

		const ph = placeholders[activeIndex];
		if (!ph) throw aleError(line, "No active placeholder for continuation content.");

		if (ph.kind === "slot") {
			const { value: add, next } = parseSlotUntilSwitch(L, i, contLevel);
			targetObj[ph.colName].push(...add);
			if (next === i) throw aleError(line, "Parser made no progress in slot continuation (infinite loop guard).");
			i = next;
			continue;
		}

		if (ph.kind === "table") {
			const { value: add, next } = parseTableRowsUntilSwitch(L, i, contLevel, ph.columns);
			targetObj[ph.colName].push(...add);
			if (next === i) throw aleError(line, "Parser made no progress in table continuation (infinite loop guard).");
			i = next;
			continue;
		}

		throw aleError(line, `Unknown placeholder kind "${ph.kind}"`);
	}

	return { next: i };
}

function parseSlotUntilSwitch(L, startIdx, level) {
	// Similar to parseSlotBlock but stops if it sees "<" at same level.
	const arr = [];
	let i = startIdx;

	let buildingObj = null;
	const flushObj = () => {
		if (buildingObj && Object.keys(buildingObj).length > 0) arr.push(buildingObj);
		buildingObj = null;
	};

	while (i < L.length) {
		const line = L[i];
		if (line.level < level) break;
		if (line.level > level) throw aleError(line, `Unexpected indentation in slot: "${line.content}"`);

		let c = line.content.trim();
		if (c.length === 0) {
			i++;
			continue;
		}

		if (c.startsWith("<")) break; // stop, caller will handle switch

		if (c.startsWith(">")) {
			flushObj();
			c = c.slice(1).trim();
			if (c.length === 0) {
				i++;
				continue;
			}
		}

		if (line.grammar !== "legacy" && isExplicitArrayHeader(c)) {
			flushObj();
			const parsed = parseExplicitArrayBlock(L, i, level);
			arr.push(parsed.value);
			i = parsed.next;
			continue;
		}

		// In slots, table headers can appear as elements:
		if (isSpreadTableHeaderLine(c)) {
			flushObj();
			const m = c.match(/^\.{3}\{(.+)\}:\s*$/);
			const cols = parseColumns(m[1], line);
			i++;
			const childLevel = requireChildLevel(L, i, level, line);
			const { value: rows, next } = parseTableRowsBlock(L, i, childLevel, cols);
			for (const r of rows) arr.push(r);
			i = next;
			continue;
		}

		if (isArrayAsElementTableHeaderLine(c)) {
			flushObj();
			const m = c.match(/^\[\{(.+)\}\]:\s*$/);
			const cols = parseColumns(m[1], line);
			i++;
			const childLevel = requireChildLevel(L, i, level, line);
			const { value: rows, next } = parseTableRowsBlock(L, i, childLevel, cols);
			arr.push(rows);
			i = next;
			continue;
		}

		if (isAnonymousTableHeaderLine(c)) {
			flushObj();
			const m = c.match(/^\{(.+)\}:\s*$/);
			const cols = parseColumns(m[1], line);
			i++;
			const childLevel = requireChildLevelAllowEmpty(L, i, level);
			if (childLevel == null) {
				arr.push([]);
				continue;
			}
			const { value: rows, next } = parseTableRowsBlock(L, i, childLevel, cols);
			arr.push(rows);
			i = next;
			continue;
		}

		// key: value => builds object elements inside slot
		if (isFlagLine(c)) {
			if (!buildingObj) buildingObj = {};
			const flag = c[0];
			const key = parseKey(c.slice(1), line);
				setParsedData(buildingObj, key, flag === "¡", line);
			i++;
			continue;
		}

		if (isKeyedTableHeaderLine(c)) {
			if (!buildingObj) buildingObj = {};
			const m = c.match(/^(.+?)\{(.+)\}:\s*$/);
			const key = parseKey(m[1], line);
			const cols = parseColumns(m[2], line);
			i++;
			const childLevel = requireChildLevel(L, i, level, line);
			const { value: rows, next } = parseTableRowsBlock(L, i, childLevel, cols);
				setParsedData(buildingObj, key, rows, line);
			i = next;
			continue;
		}

		if (isKeyValueLine(c)) {
			if (!buildingObj) buildingObj = {};
			const idx = findTopLevelColon(c);
			const key = parseKey(c.slice(0, idx), line);
			const rawVal = c.slice(idx + 1).trim();

			if (rawVal.length === 0) {
				i++;
				const childLevel = requireChildLevelAllowEmpty(L, i, level);
				if (childLevel == null) {
					setParsedData(buildingObj, key, null, line);
					continue;
				}
				if (line.grammar !== "legacy" && isExplicitArrayHeader(L[i].content)) {
					const parsed = parseExplicitArrayBlock(L, i, childLevel);
					setParsedData(buildingObj, key, parsed.value, line);
					i = parsed.next;
					continue;
				}
				if (line.grammar !== "legacy" && isDirectContainerValue(L[i].content)) {
					setParsedData(buildingObj, key, parseDirectContainerValue(L[i].content, L[i]), line);
					i++;
					continue;
				}
				const kind = inferBlockKind(L, i, childLevel);
				const { value, next } = parseBlock(L, i, childLevel, { kind });
				setParsedData(buildingObj, key, value, line);
				i = next;
				continue;
			}

			setParsedData(buildingObj, key, parseScalarOrInline(rawVal, line), line);
			i++;
			continue;
		}

    	// Free text inside slot => string literal appended (rule 13)
		flushObj();
		arr.push(parseScalarOrInline(c, line));
		i++;
  	}

	flushObj();
	return { value: arr, next: i };
}

function parseTableRowsUntilSwitch(L, startIdx, level, columns) {
	const rows = [];
	let i = startIdx;

	while (i < L.length) {
		const line = L[i];
		if (line.level < level) break;
		if (line.level > level) throw aleError(line, `Unexpected indentation in table continuation: "${line.content}"`);

		const c0 = line.content.trim();
		if (c0.length === 0) {
			i++;
			continue;
		}
		if (c0.startsWith("<")) break;

		const cells = splitCSVLike(c0, line);
		if (line.grammar !== "legacy" && cells.length > columns.length)
			throw aleError(line, `Table row has ${cells.length} cells but only ${columns.length} columns.`);
		const obj = {};
		for (let colIdx = 0; colIdx < columns.length; colIdx++) {
			const colName = columns[colIdx];
			const cell = (cells[colIdx] ?? "").trim();
				setData(obj, colName, parseTableCell(cell, line));
			// Placeholders inside these nested table continuations are not supported in v0.1 here.
		}

		rows.push(obj);
		i++;
	}

	return { value: rows, next: i };
}

/* ------------------------------ SLOTS ------------------------------------ */

function parseSlotBlock(L, startIdx, baseLevel) {
	// Slots are arrays that accept free elements (like array block), but with rule 13.
	// We treat it like parseArrayBlock-ish, but allow free text lines (strings).
	return parseSlotUntilSwitch(L, startIdx, baseLevel);
}

/* -------------------------- SCALAR / INLINE PARSING ----------------------- */

function parseScalarOrInline(text, lineObj) {
	const t = text.trim();
	if (t === "{}" && lineObj?.grammar !== "legacy") return {};

	// Slot marker as scalar (usually appears in table cell): [:]
	if (t === "[:]") return []; // slot resolves to [] (will be filled by continuation if applicable)

	// Null
	if (t === "-") return null;

	// Booleans explicit
	if (t === "true") return true;
	if (t === "false") return false;

	// Inline array: [ ... ]
	if (t.startsWith("[") && t.endsWith("]")) {
		const inner = t.slice(1, -1).trim();
		if (inner.length === 0) return [];
		const parts = splitCSVLike(inner, lineObj);
		return parts.map((p) => parseScalarOrInline(p.trim(), lineObj));
	}

	// Quoted string
	if (t.startsWith('"') && t.endsWith('"') && t.length >= 2)
		return unescapeQuotedString(t.slice(1, -1), lineObj);
	if (lineObj?.grammar !== "legacy" && hasMalformedScalarStructure(t))
		throw aleError(lineObj, "Unclosed quote or structural delimiter in scalar.");

	const isNext = lineObj?.grammar === "next";
	const numericPattern = isNext
		? /^[+-]?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?$/
		: /^[+-]?\d+(?:\.\d+)?$/;
	if (numericPattern.test(t)) {
		const n = Number(t);
		if (!Number.isFinite(n)) throw aleError(lineObj, `Invalid number "${t}"`);
		if (isNext && n === 0 && /[1-9]/.test(t.split(/[eE]/, 1)[0]))
			throw aleError(lineObj, `Numeric underflow in "${t}"`);
		return n;
	}
	if (isNext && /^[+-]?\d+(?:\.\d+)?[eE][+-]?$/.test(t))
		throw aleError(lineObj, `Incomplete numeric exponent "${t}"`);

	// Bare string with escapes \n \, \"
	return unescapeBareString(t, lineObj);
}

function unescapeBareString(s, lineObj) {
	if (lineObj?.grammar !== "legacy") return decodeEscapes(s, lineObj, false);
	// Only the escapes defined in spec.
	return s
		.replace(/\\n/g, "\n")
		.replace(/\\,/g, ",")
		.replace(/\\"/g, '"');
}

function unescapeQuotedString(s, lineObj) {
	if (lineObj?.grammar !== "legacy") return decodeEscapes(s, lineObj, true);
	// In quoted strings, we respect \" and \n and \, as well.
	// Also allow \\ for literal backslash.
	let out = "";
	let esc = false;
	for (let i = 0; i < s.length; i++) {
		const ch = s[i];
		if (!esc) {
			if (ch === "\\") {
				esc = true;
				continue;
			}
			out += ch;
			continue;
		}
		// escaped
		esc = false;
		if (ch === "n") out += "\n";
		else if (ch === ",") out += ",";
		else if (ch === '"') out += '"';
		else if (ch === "\\") out += "\\";
		else out += ch; // permissive
	}
	if (esc) throw aleError(lineObj, "Dangling escape at end of string.");
	return out;
}

function decodeEscapes(s, lineObj, quoted) {
	let out = "";
	for (let i = 0; i < s.length; i++) {
		const ch = s[i];
		if (ch !== "\\") {
			out += ch;
			continue;
		}
		const code = s[++i];
		if (code === undefined) throw aleError(lineObj, "Dangling escape at end of string.");
		if (code === '"') out += '"';
		else if (code === "\\") out += "\\";
		else if (code === "n") out += "\n";
		else if (code === "r") out += "\r";
		else if (code === "t") out += "\t";
		else if (code === ",") out += ",";
		else if (code === "u") {
			const hex = s.slice(i + 1, i + 5);
			if (!/^[0-9a-fA-F]{4}$/.test(hex))
				throw aleError(lineObj, "Invalid Unicode escape; expected four hexadecimal digits after \\u.");
			out += String.fromCharCode(parseInt(hex, 16));
			i += 4;
		} else throw aleError(lineObj, `Unknown escape \\${code}.`);
	}
	return out;
}

function hasMalformedScalarStructure(text) {
	if (text.includes('"')) return !(text.startsWith('"') && text.endsWith('"'));
	const stack = [];
	for (const ch of text) {
		if (ch === "[" || ch === "{") stack.push(ch === "[" ? "]" : "}");
		else if (ch === "]" || ch === "}") {
			if (stack.pop() !== ch) return true;
		}
	}
	return stack.length > 0;
}

/* ------------------------------ CSV-LIKE SPLIT ---------------------------- */

function splitCSVLike(s, lineObj) {
	// Split on commas not inside quotes, and not inside [] or {} nesting.
	const out = [];
	let cur = "";
	let inQuotes = false;
	let esc = false;
	let bracketDepth = 0; // []
	let braceDepth = 0;   // {}

	for (let i = 0; i < s.length; i++) {
		const ch = s[i];

		if (esc) {
			// keep escapes for later unescape stage
			cur += "\\" + ch;
			esc = false;
			continue;
		}

		if (ch === "\\") {
			esc = true;
			continue;
		}

		if (ch === '"') {
			inQuotes = !inQuotes;
			cur += ch;
			continue;
		}

		if (!inQuotes) {
			if (ch === "[") bracketDepth++;
			else if (ch === "]") {
				if (bracketDepth === 0 && lineObj?.grammar !== "legacy")
					throw aleError(lineObj, "Unexpected closing array delimiter.");
				bracketDepth = Math.max(0, bracketDepth - 1);
			}
			else if (ch === "{") braceDepth++;
			else if (ch === "}") {
				if (braceDepth === 0 && lineObj?.grammar !== "legacy")
					throw aleError(lineObj, "Unexpected closing object delimiter.");
				braceDepth = Math.max(0, braceDepth - 1);
			}
		}

		if (!inQuotes && bracketDepth === 0 && braceDepth === 0 && ch === ",") {
			out.push(cur.trim());
			cur = "";
			continue;
		}

		cur += ch;
	}

	if (esc) throw aleError(lineObj, "Dangling escape at end of line.");
	if (inQuotes) throw aleError(lineObj, "Unclosed quote in line.");
	if (lineObj?.grammar !== "legacy" && (bracketDepth !== 0 || braceDepth !== 0))
		throw aleError(lineObj, "Unclosed structural delimiter in line.");
	out.push(cur.trim());

	return out;
}

/* ------------------------------ CHILD LEVEL HELPERS ----------------------- */

function requireChildLevel(L, i, parentLevel, lineObj) {
	const n = L[i];
	if (!n) throw aleError(lineObj, "Expected an indented block, but reached end of input.");
	if (n.level <= parentLevel) throw aleError(lineObj, "Expected an indented block after ':', but none found.");
	return n.level;
}

function requireChildLevelAllowEmpty(L, i, parentLevel) {
	const n = L[i];
	if (!n) return null;
	if (n.level <= parentLevel) return null;
	return n.level;
}

/* ------------------------------ STRINGIFY -------------------------------- */

function writeValue(out, v, level, opt, ctx) {
	if (Array.isArray(v)) {
		writeArray(out, v, level, opt, ctx);
		return;
	}
	if (v && typeof v === "object") {
		writeObject(out, v, level, opt, ctx);
		return;
	}
	out.push(indent(level, opt) + scalarToALE(v, opt));
}

function writeObject(out, obj, level, opt, ctx) {
	const keys = Object.keys(obj);
	if (keys.length === 0) {
		out.push(indent(level, opt) + "{}");
		return;
	}

	for (const k of keys) {
		const key = keyToALE(k);
		const v = obj[k];

		// Short scalar array => inline
		if (Array.isArray(v)) {
			const allScalars = v.every((x) => x == null || typeof x !== "object");
			if (allScalars && v.length <= opt.inlineArrayMax) {
				out.push(indent(level, opt) + `${key}: [${v.map((item) => scalarToALE(item, opt)).join(",")}]`);
				continue;
			}
		}

		// Keyed table for object's array
		if (Array.isArray(v) && opt.useTables && isObjectArray(v, opt)) {
			const cols = tableColumnsUnion(v, opt);
			out.push(indent(level, opt) + `${key}{${columnsToALE(cols)}}:`);

			for (const row of v) {
				const cells = [];
				const placeholders = [];

				for (const col of cols) {
					const r = cellToALE(row?.[col], opt);
					cells.push(r.text);
					if (r.placeholder) placeholders.push({ colName: col, ...r.placeholder });
				}

				out.push(indent(level + 1, opt) + cells.join(","));

				if (placeholders.length)
					writeRowContinuation(out, placeholders, level + 2, opt);
			}
			continue;
		}

		// Boolean shortcuts
		if (opt.booleanShortcuts && (v === true || v === false)) {
			out.push(indent(level, opt) + (v ? "¡" : "!") + key);
			continue;
		}

		// Complex array/object => block
		if (v && typeof v === "object") {
			if (!Array.isArray(v) && Object.keys(v).length === 0) {
				out.push(indent(level, opt) + `${key}: {}`);
				continue;
			}
			out.push(indent(level, opt) + `${key}:`);
			writeValue(out, v, level + 1, opt, { ...ctx, inSlot: false });
			continue;
		}

		// Normal scalar (null => empty)
		if (v === null || v === undefined) {
			out.push(indent(level, opt) + `${key}:`);
		} else {
			out.push(indent(level, opt) + `${key}: ${scalarToALE(v, opt)}`);
		}
	}
}

function writeArray(out, arr, level, opt, ctx) {
	// Prefer inline if short and all scalars
	const allScalars = arr.every((x) => x == null || typeof x !== "object");
	if (allScalars && arr.length <= opt.inlineArrayMax) {
		out.push(indent(level, opt) + `[${arr.map((item) => scalarToALE(item, opt)).join(",")}]`);
		return;
	}

	// Homogeneous objects => anonymous table (WITH placeholders continuations)
	if (opt.useTables && isHomogeneousObjectArray(arr, opt)) {
		const cols = tableColumns(arr);
		out.push(indent(level, opt) + `{${columnsToALE(cols)}}:`);

		for (const row of arr) {
			const cells = [];
			const placeholders = [];

			for (const col of cols) {
				const r = cellToALE(row[col], opt);
				cells.push(r.text);
				if (r.placeholder) placeholders.push({ colName: col, ...r.placeholder });
			}

			out.push(indent(level + 1, opt) + cells.join(","));

			if (placeholders.length)
				writeRowContinuation(out, placeholders, level + 2, opt);
		}
		return;
	}

	// Otherwise: block array elements
	out.push(indent(level, opt) + "[]:");
	level++;
	let prevWasObject = false;

	for (let idx = 0; idx < arr.length; idx++) {
		const el = arr[idx];

		// Spread run: ...{a,b}: for runs of >=2 objects with the same keys and scalar values
		if (opt.useTables && opt.useSpread && el && typeof el === "object" && !Array.isArray(el)) {
			const keys0 = Object.keys(el);
			const scalarish0 = keys0.length > 0 && keys0.every(k => (el[k] == null || typeof el[k] !== "object"));
			const hasCellValue0 = keys0.some(k => el[k] != null);
			if (scalarish0 && hasCellValue0) {
				let j = idx;
				const run = [];
				while (j < arr.length) {
					const it = arr[j];
					if (!it || typeof it !== "object" || Array.isArray(it)) break;
					const keys = Object.keys(it);
					if (keys.length !== keys0.length) break;
					// Same keys (same set)
					const same = sameKeySet(keys, keys0);
					if (!same) break;
					// Scalar values
					const scalarish = keys0.every(k => (it[k] == null || typeof it[k] !== "object"));
					const hasCellValue = keys0.some(k => it[k] != null);
					if (!scalarish || !hasCellValue) break;
					run.push(it);
					j++;
				}

				if (run.length >= 2) {
					out.push(indent(level, opt) + `...{${columnsToALE(keys0)}}:`);
					for (const row of run)
						out.push(
							indent(level + 1, opt) +
						keys0.map(k => cellToALE(row[k], opt).text).join(",")
						);
					idx = j - 1;
					prevWasObject = false;
					continue;
				}
			}
		}

			if (el && typeof el === "object") {
			if (Array.isArray(el)) {
				// Nested array element
				const scalarish = el.every((x) => x == null || typeof x !== "object");
				if (scalarish && el.length <= opt.inlineArrayMax) {
				out.push(indent(level, opt) + `[${el.map((item) => scalarToALE(item, opt)).join(",")}]`);
				} else {
				writeArray(out, el, level, opt, ctx);
				}
				prevWasObject = false;
				continue;
			}

			// Object element: emit implicit object lines.
			const keys = Object.keys(el);
			if (keys.length === 0) {
				out.push(indent(level, opt) + "{}");
				prevWasObject = false;
				continue;
			}

			let firstKey = true;
			for (const k of keys) {
				const key = keyToALE(k);
				const v = el[k];
				const prefix = (firstKey && prevWasObject) ? ">" : "";

				// Inline arrays of scalars (fix tags: [shark, friend] inside array objects)
				if (Array.isArray(v)) {
				const scalarish = v.every((x) => x == null || typeof x !== "object");
				if (scalarish && v.length <= opt.inlineArrayMax) {
					out.push(indent(level, opt) + `${prefix}${key}: [${v.map((item) => scalarToALE(item, opt)).join(",")}]`);
					firstKey = false;
					continue;
				}
				}

				// Keyed table inside array-object element: languages{name,...}:
				if (Array.isArray(v) && opt.useTables && isObjectArray(v, opt)) {
				const cols = tableColumnsUnion(v, opt);
				out.push(indent(level, opt) + `${prefix}${key}{${columnsToALE(cols)}}:`);

				for (const row of v) {
					const cells = [];
					const placeholders = [];

					for (const col of cols) {
					const r = cellToALE(row?.[col], opt);
					cells.push(r.text);
					if (r.placeholder) placeholders.push({ colName: col, ...r.placeholder });
					}

					out.push(indent(level + 1, opt) + cells.join(","));

					if (placeholders.length) {
					writeRowContinuation(out, placeholders, level + 2, opt);
					}
				}

				firstKey = false;
				continue;
				}

				if (Array.isArray(v) || (v && typeof v === "object")) {
				if (!Array.isArray(v) && Object.keys(v).length === 0) {
					out.push(indent(level, opt) + `${prefix}${key}: {}`);
				} else {
				out.push(indent(level, opt) + `${prefix}${key}:`);
				writeValue(out, v, level + 1, opt, { ...ctx, inSlot: false });
				}
				} else {
				if (opt.booleanShortcuts && (v === true || v === false)) {
					out.push(indent(level, opt) + `${prefix}${v ? "¡" : "!"}${key}`);
				} else {
					out.push(indent(level, opt) + `${prefix}${key}: ${scalarToALE(v, opt)}`);
				}
				}

				firstKey = false;
			}

			prevWasObject = true;
			continue;
		} else {
			out.push(indent(level, opt) + scalarToALE(el, opt));
			prevWasObject = false;
			continue;
		}
	}
}

function writeRowContinuation(out, placeholders, level, opt) {
	for (let p = 0; p < placeholders.length; p++) {
		const ph = placeholders[p];

		const needSwitch = (p > 0);

		if (ph.kind === "slot") {
		if (needSwitch) out.push(indent(level, opt) + `<${keyToALE(ph.colName)}`);
			writeSlotLines(out, ph.value, level, opt);
		} else if (ph.kind === "table") {
			// Compact form: "<" + first row (no name)
			const rows = ph.value;

			if (rows.length === 0) return;

			// constructs local function for a row
			const mkLine = (row) => ph.columns.map((c) => {
				const cell = row[c];
				if (cell === null || cell === undefined) return "";
				if (cell === true) return "¡";
				if (cell === false) return "!";
				if (cell && typeof cell === "object") return cellToALE(cell, opt).text;
				return scalarToALE(cell, opt);
			}).join(",");

			if (needSwitch) {
				if (ph.columns.length === 1) {
					out.push(indent(level, opt) + `<${keyToALE(ph.colName)}`);
					for (const row of rows) out.push(indent(level, opt) + mkLine(row));
				} else {
					out.push(indent(level, opt) + `<${mkLine(rows[0])}`);
					for (let r = 1; r < rows.length; r++)
					out.push(indent(level, opt) + mkLine(rows[r]));
				}
			} else {
				// first placeholder: sin "<"
				for (const row of rows) out.push(indent(level, opt) + mkLine(row));
			}
		}
	}
}

function writeSlotLines(out, arr, level, opt) {
	// Slot: a free list of elements (strings, objects, arrays, etc.)
	// We use the same style as writeArray, but without brackets.
	let prevWasObject = false;

	for (const el of arr) {
		if (el && typeof el === "object") {
			if (Array.isArray(el)) {
				// Nested array inside slot
				const allScalars = el.every((x) => x == null || typeof x !== "object");
				if (allScalars && el.length <= opt.inlineArrayMax) {
					out.push(indent(level, opt) + `[${el.map((item) => scalarToALE(item, opt)).join(",")}]`);
				} else if (opt.useTables && isHomogeneousObjectArray(el, opt)) {
					const cols = tableColumns(el);
					out.push(indent(level, opt) + `{${columnsToALE(cols)}}:`);
					for (const row of el)
						out.push(indent(level + 1, opt) + cols.map((c) => cellToALE(row[c], opt).text).join(","));
				} else {
					// Preserve this nested array as one slot element.
					writeArray(out, el, level, opt, { inSlot: true });
				}
				prevWasObject = false;
				continue;
			}

			// Object into the slot
			const keys = Object.keys(el);
			if (keys.length === 0) {
				out.push(indent(level, opt) + "{}");
				prevWasObject = false;
				continue;
			}
			let firstKey = true;
			for (const k of keys) {
				const key = keyToALE(k);
				const v = el[k];
				const prefix = (firstKey && prevWasObject) ? ">" : "";

				if (Array.isArray(v) || (v && typeof v === "object")) {
					out.push(indent(level, opt) + `${prefix}${key}:`);
					writeValue(out, v, level + 1, opt, { inSlot: true });
				} else {
					if (opt.booleanShortcuts && (v === true || v === false)) {
						out.push(indent(level, opt) + `${prefix}${v ? "¡" : "!"}${key}`);
					} else {
						if (v === null || v === undefined) {
							out.push(indent(level, opt) + `${prefix}${key}:`);
						} else if (opt.booleanShortcuts && (v === true || v === false)) {
							out.push(indent(level, opt) + `${prefix}${v ? "¡" : "!"}${key}`);
						} else {
							out.push(indent(level, opt) + `${prefix}${key}: ${scalarToALE(v, opt)}`);
						}
					}
				}
				firstKey = false;
			}

			prevWasObject = true;
			continue;
		}

		// Scalar / free text
		out.push(indent(level, opt) + scalarToALE(el, opt));
		prevWasObject = false;
	}
}

function isHomogeneousObjectArray(arr, opt) {
	if (!Array.isArray(arr) || arr.length === 0) return false;
	const cache = opt?._tableShapeCache;
	if (cache?.has(arr)) return cache.get(arr);
	const result = analyzeHomogeneousObjectArray(arr, opt);
	cache?.set(arr, result);
	return result;
}

function analyzeHomogeneousObjectArray(arr, opt) {
	if (!arr.every((x) => x && typeof x === "object" && !Array.isArray(x))) return false;
	if (Object.keys(arr[0]).length === 0) return false;
	const keys0 = Object.keys(arr[0]);
	// Direct objects are not table cells. A nested object-array can use one
	// table placeholder level, provided its own cells are scalar (or inline
	// scalar arrays); deeper table continuations currently have no reversible
	// encoding and must use regular object/array blocks.
	if (arr.some((row) => Object.values(row).some((v) => {
		if (!v || typeof v !== "object") return false;
		if (!Array.isArray(v)) return true;
		return isShallowTableArray(v, opt) && v.some((nestedRow) => Object.values(nestedRow).some((cell) =>
			cell !== null && typeof cell === "object" &&
			(!Array.isArray(cell) || cell.some((item) => item !== null && typeof item === "object"))
		));
	}))) return false;
	// A one-column all-null row serializes as an ignorable blank line.
	if (arr.some((row) => Object.keys(row).every((key) => row[key] == null))) return false;
		for (let i = 1; i < arr.length; i++)
			if (!sameKeySet(Object.keys(arr[i]), keys0)) return false;
	return true;
}

function isShallowTableArray(arr, opt) {
	if (!Array.isArray(arr) || arr.length === 0 || !arr.every((row) => row && typeof row === "object" && !Array.isArray(row)))
		return false;
	const keys = Object.keys(arr[0]);
	return keys.length > 0 && arr.every((row) => sameKeySet(Object.keys(row), keys));
}

function sameKeySet(a, b) {
	if (a.length !== b.length) return false;
	let sameOrder = true;
	for (let i = 0; i < a.length; i++) {
		if (a[i] !== b[i]) {
			sameOrder = false;
			break;
		}
	}
	if (sameOrder) return true;
	const keys = new Set(b);
	return a.every((key) => keys.has(key));
}

function isObjectArray(arr, opt) {
	return isHomogeneousObjectArray(arr, opt);
}

function tableColumnsUnion(arr, opt) {
	if (isHomogeneousObjectArray(arr, opt)) return tableColumns(arr);
	const seen = new Set();
	const cols = [];
	for (const obj of arr)
		for (const k of Object.keys(obj))
			if (!seen.has(k)) {
				seen.add(k);
				cols.push(k);
			}
	return cols;
}

function tableColumns(arr) {
	// deterministic: keys of first object in insertion order
	return Object.keys(arr[0]);
}

function cellToALE(v, opt) {
	// Returns { text, placeholder? }
	// placeholder: { kind: "slot" } o { kind: "table", columns: [...] }

	// Null in table: empty cell
	if (v === null || v === undefined) return { text: "" };

	// Boolean shortcuts in table
	if (v === true) return { text: "¡" };
	if (v === false) return { text: "!" };

	// Arrays within cells:
	if (Array.isArray(v)) {
		// Array of homogeneous objects => placeholder of table {a,b}
		if (isHomogeneousObjectArray(v, opt)) {
			const cols = tableColumns(v);
			return { text: `{${columnsToALE(cols)}}`, placeholder: { kind: "table", columns: cols, value: v } };
		}

		// Array of scalars only => inline array [a,b,c]
		const allScalars = v.every((x) => x == null || typeof x !== "object");
		if (allScalars)
			return { text: `[${v.map((item) => scalarToALE(item, opt)).join(",")}]` };

		// Heterogeneous array (objects/strings/etc) => slot [:]
		return { text: "[:]", placeholder: { kind: "slot", value: v } };
	}

	// Object within a cell: not in spec v0.2 as a direct value.
	// We represent it as a slot of an element (to be valid and reversible).
	if (v && typeof v === "object")
		return { text: "[:]", placeholder: { kind: "slot", value: [v] } };

	// Normal scalar
	return { text: scalarToALE(v, opt) };
}

function keyToALE(k) {
	// quote if spaces or special chars
	if (/^[A-Za-z0-9_\-]+$/.test(k)) return k;
	return `"${escapeString(k, { quoted: true })}"`;
}

function columnsToALE(columns) {
	return columns.map(keyToALE).join(",");
}

function scalarToALE(v, opt = {}) {
	// Only true scalars here. Arrays/objects must be handled by writeValue/writeObject/writeArray.
	if (v === null || v === undefined) return "-";
	if (v === true) return "true";
	if (v === false) return "false";
	if (typeof v === "number") return Number.isFinite(v) ? numberToALE(v, opt) : "-";
	if (typeof v === "string") return stringToALE(v, opt);

	// If something non-scalar slips through, make it obvious instead of "[object Object]"
	return stringToALE(JSON.stringify(v), opt);
}

function stringToALE(s, opt = {}) {
	const needsQuotes =
		s.length === 0 ||
		/^\s|\s$/.test(s) ||
		/[,\[\]\{\}:<>]/.test(s) ||
		/^[!¡]/.test(s) ||
		/^(?:-|true|false|[+-]?\d+(?:\.\d+)?)$/.test(s) ||
		(opt.grammar === "next" && /^[+-]?\d+(?:\.\d+)?[eE][+-]?\d*$/.test(s)) ||
		/[\\"\n\r\t\u0000-\u001f\u007f]/.test(s) ||
		hasUnpairedSurrogate(s);
	if (!needsQuotes) return s;
	return `"${escapeString(s, { quoted: true })}"`;
}

function numberToALE(value, opt = {}) {
	if (Object.is(value, -0)) return "-0";
	if (opt.grammar === "next") return String(value);
	const source = String(value);
	if (!/[eE]/.test(source)) return source;
	const [mantissa, exponentText] = source.toLowerCase().split("e");
	const exponent = Number(exponentText);
	const negative = mantissa.startsWith("-");
	const unsigned = negative ? mantissa.slice(1) : mantissa;
	const point = unsigned.indexOf(".");
	const integerLength = point === -1 ? unsigned.length : point;
	const digits = unsigned.replace(".", "");
	const targetPoint = integerLength + exponent;
	let expanded;
	if (targetPoint <= 0) expanded = `0.${"0".repeat(-targetPoint)}${digits}`;
	else if (targetPoint >= digits.length) expanded = `${digits}${"0".repeat(targetPoint - digits.length)}`;
	else expanded = `${digits.slice(0, targetPoint)}.${digits.slice(targetPoint)}`;
	return negative ? `-${expanded}` : expanded;
}

function hasUnpairedSurrogate(s) {
	for (let i = 0; i < s.length; i++) {
		const code = s.charCodeAt(i);
		if (code >= 0xd800 && code <= 0xdbff) {
			const next = s.charCodeAt(i + 1);
			if (Number.isNaN(next) || next < 0xdc00 || next > 0xdfff) return true;
			i++;
		} else if (code >= 0xdc00 && code <= 0xdfff) return true;
	}
	return false;
}

function escapeString(s, { quoted }) {
	if (!quoted) return s;
	let out = "";
	for (let i = 0; i < s.length; i++) {
		const ch = s[i];
		const code = s.charCodeAt(i);
		if (ch === "\\") out += "\\\\";
		else if (ch === '"') out += '\\"';
		else if (ch === "\n") out += "\\n";
		else if (ch === "\r") out += "\\r";
		else if (ch === "\t") out += "\\t";
		else if (code < 0x20 || code === 0x7f) out += `\\u${code.toString(16).padStart(4, "0")}`;
		else if (code >= 0xd800 && code <= 0xdfff) {
			if (code <= 0xdbff && i + 1 < s.length) {
				const next = s.charCodeAt(i + 1);
				if (next >= 0xdc00 && next <= 0xdfff) {
					out += ch + s[i + 1];
					i++;
				} else out += `\\u${code.toString(16).padStart(4, "0")}`;
			} else out += `\\u${code.toString(16).padStart(4, "0")}`;
		}
		else out += ch;
	}
	return out;
}

function indent(level, opt) {
	return opt.indent.repeat(level);
}

/* ------------------------------ QUICK DEMO ------------------------------- */
// Example usage:
//
// import { parseALE, stringifyALE } from "./ale.js";
// const obj = parseALE(aleText);
// const aleBack = stringifyALE(obj, { useTables: true });
