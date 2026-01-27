// ale.js — ALE v0.0.2 parser + stringifier (JS ⇄ ALE)
// Node >= 16 (also works in browser if you remove exports)

export function parseALE(input) {
	const src = String(input ?? "");
	const rawLines = src.replace(/\r\n?/g, "\n").split("\n");

	// Keep original line numbers for errors.
	const lines = rawLines
		.map((text, i) => ({ text, lineNo: i + 1 }))
		.filter((l) => l.text.trim().length > 0); // empty lines ignored

	// Detect indentation style (tabs vs spaces) & unit.
	const indent = detectIndent(lines);

	// Pre-parse line -> {indentLevel, content, lineNo}
	const L = lines.map((l) => {
		const { level, content } = splitIndent(l.text, indent);
		return { level, content, lineNo: l.lineNo };
	});

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

export function stringifyALE(value, options = {}) {
	const opt = {
		indent: "    ",
		useTables: true,
		inlineArrayMax: 6,
		booleanShortcuts: true,
		useSpread: true,
		...options,
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
	// Look ahead for the first line at baseLevel (or deeper if equal?) to decide.
	for (let j = i; j < L.length; j++) {
		if (L[j].level < baseLevel) break;
		if (L[j].level > baseLevel) continue;
		const c = L[j].content.trim();
		if (c.length === 0) continue;

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
	return (c.startsWith("!") || c.startsWith("¡")) && !c.includes(":");
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
			obj[key] = flag === "¡";
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
			obj[key] = rows;
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

		if (rawVal.length === 0) {
			// Block-inferred. Decide by peeking at children.
			i++;
			const childLevel = requireChildLevelAllowEmpty(L, i, baseLevel);
			if (childLevel == null) {
				// key: (sin valor ni bloque) => null (como en tu ejemplo word:/meaning:)
				obj[key] = null;
				continue;
			}
			const kind = inferBlockKind(L, i, childLevel);
			const { value, next } = parseBlock(L, i, childLevel, { kind });
			obj[key] = value;
			i = next;
			continue;
		}

		// key: inlineValue / slot marker / table-in-cell marker? (only via rows)
		obj[key] = parseScalarOrInline(rawVal, line);
		i++;
	}

	return { value: obj, next: i };
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
			const childLevel = requireChildLevel(L, i, baseLevel, line);
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
			const childLevel = requireChildLevel(L, i, baseLevel, line);
			const { value: rows, next } = parseTableRowsBlock(L, i, childLevel, cols);
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
				arr.push([]); // empty table
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
			buildingObj[key] = rows;
			i = next;
			continue;
		}

		// Flag line inside array => applies to current building object
		if (isFlagLine(c)) {
			if (!buildingObj) buildingObj = {};
			const flag = c[0];
			const key = parseKey(c.slice(1), line);
			buildingObj[key] = flag === "¡";
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
					buildingObj[key] = null;
					continue;
				}
				const kind = inferBlockKind(L, i, childLevel);
				const { value, next } = parseBlock(L, i, childLevel, { kind });
				buildingObj[key] = value;
				i = next;
				continue;
			}

			buildingObj[key] = parseScalarOrInline(rawVal, line);
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
	const cols = splitCSVLike(colsText, lineObj).map((s) => s.trim()).filter(Boolean);
	if (!cols.length) throw aleError(lineObj, "Empty column list in table header.");
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

		// Map to object by columns (extra cells ignored, missing => null)
		const obj = {};
		const placeholders = []; // complex columns in this row: slot/table placeholder

		for (let colIdx = 0; colIdx < columns.length; colIdx++) {
			const colName = columns[colIdx];
			const cell = (cells[colIdx] ?? "").trim();

			const v = parseTableCell(cell, line);
			if (v && v.__ale_placeholder) {
				placeholders.push({ colName, kind: v.kind, columns: v.columns });
				obj[colName] = v.kind === "slot" ? [] : [];
			} else {
				obj[colName] = v;
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
				targetObj[ph.colName].push({ [key]: flag === "¡" });
				return;
			}

			if (isKeyValueLine(fake)) {
				const idx = findTopLevelColon(fake);
				const key = parseKey(fake.slice(0, idx), lineObj);
				const rawVal = fake.slice(idx + 1).trim();
				targetObj[ph.colName].push({ [key]: rawVal.length ? parseScalarOrInline(rawVal, lineObj) : [] });
				return;
			}

			// free text literal
			targetObj[ph.colName].push(parseScalarOrInline(fake, lineObj));
			return;
		}

		if (ph.kind === "table") {
			// Inline content is a table row
			const cells = splitCSVLike(inlineText, lineObj);
			const obj = {};
			for (let colIdx = 0; colIdx < ph.columns.length; colIdx++) {
				const colName = ph.columns[colIdx];
				const cell = (cells[colIdx] ?? "").trim();
				obj[colName] = parseTableCell(cell, lineObj);
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
			const looksLikeNameSelector =
				!rest.includes(",") &&
				!rest.includes(":") &&
				!rest.startsWith("[") &&
				!rest.startsWith("{");

			if (looksLikeNameSelector) {
				const idx = pickByName(rest);
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
			buildingObj[key] = flag === "¡";
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
			buildingObj[key] = rows;
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
					buildingObj[key] = null;
					continue;
				}
				const kind = inferBlockKind(L, i, childLevel);
				const { value, next } = parseBlock(L, i, childLevel, { kind });
				buildingObj[key] = value;
				i = next;
				continue;
			}

			buildingObj[key] = parseScalarOrInline(rawVal, line);
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
		const obj = {};
		for (let colIdx = 0; colIdx < columns.length; colIdx++) {
			const colName = columns[colIdx];
			const cell = (cells[colIdx] ?? "").trim();
			obj[colName] = parseTableCell(cell, line);
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

	// Number (int/float)
	if (/^[+-]?\d+(\.\d+)?$/.test(t)) {
		const n = Number(t);
		if (!Number.isFinite(n)) throw aleError(lineObj, `Invalid number "${t}"`);
		return n;
	}

	// Bare string with escapes \n \, \"
	return unescapeBareString(t);
}

function unescapeBareString(s) {
	// Only the escapes defined in spec.
	return s
		.replace(/\\n/g, "\n")
		.replace(/\\,/g, ",")
		.replace(/\\"/g, '"');
}

function unescapeQuotedString(s, lineObj) {
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
			else if (ch === "]") bracketDepth = Math.max(0, bracketDepth - 1);
			else if (ch === "{") braceDepth++;
			else if (ch === "}") braceDepth = Math.max(0, braceDepth - 1);
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
	out.push(indent(level, opt) + scalarToALE(v));
}

function writeObject(out, obj, level, opt, ctx) {
	const keys = Object.keys(obj);

	for (const k of keys) {
		const key = keyToALE(k);
		const v = obj[k];

		// Short scalar array => inline
		if (Array.isArray(v)) {
			const allScalars = v.every((x) => x == null || typeof x !== "object");
			if (allScalars && v.length <= opt.inlineArrayMax) {
				out.push(indent(level, opt) + `${key}: [${v.map(scalarToALE).join(", ")}]`);
				continue;
			}
		}

		// Keyed table for object's array
		if (Array.isArray(v) && opt.useTables && isObjectArray(v)) {
			const cols = tableColumnsUnion(v);
			out.push(indent(level, opt) + `${key}{${cols.join(", ")}}:`);

			for (const row of v) {
				const cells = [];
				const placeholders = [];

				for (const col of cols) {
					const r = cellToALE(row?.[col]);
					cells.push(r.text);
					if (r.placeholder) placeholders.push({ colName: col, ...r.placeholder });
				}

				out.push(indent(level + 1, opt) + cells.join(", "));

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
			out.push(indent(level, opt) + `${key}:`);
			writeValue(out, v, level + 1, opt, { ...ctx, inSlot: false });
			continue;
		}

		// Normal scalar (null => empty)
		if (v === null || v === undefined) {
			out.push(indent(level, opt) + `${key}:`);
		} else {
			out.push(indent(level, opt) + `${key}: ${scalarToALE(v)}`);
		}
	}
}

function writeArray(out, arr, level, opt, ctx) {
	// Prefer inline if short and all scalars
	const allScalars = arr.every((x) => x == null || typeof x !== "object");
	if (allScalars && arr.length <= opt.inlineArrayMax) {
		out.push(indent(level, opt) + `[${arr.map(scalarToALE).join(", ")}]`);
		return;
	}

	// Homogeneous objects => anonymous table (WITH placeholders continuations)
	if (opt.useTables && isHomogeneousObjectArray(arr)) {
		const cols = tableColumns(arr);
		out.push(indent(level, opt) + `{${cols.join(", ")}}:`);

		for (const row of arr) {
			const cells = [];
			const placeholders = [];

			for (const col of cols) {
				const r = cellToALE(row[col]);
				cells.push(r.text);
				if (r.placeholder) placeholders.push({ colName: col, ...r.placeholder });
			}

			out.push(indent(level + 1, opt) + cells.join(", "));

			if (placeholders.length)
				writeRowContinuation(out, placeholders, level + 2, opt);
		}
		return;
	}

	// Otherwise: block array elements
	let prevWasObject = false;

	for (let idx = 0; idx < arr.length; idx++) {
		const el = arr[idx];

		// Spread run: ...{a,b}: for runs of >=2 objects with the same keys and scalar values
		if (opt.useTables && opt.useSpread && el && typeof el === "object" && !Array.isArray(el)) {
			const keys0 = Object.keys(el);
			const scalarish0 = keys0.every(k => (el[k] == null || typeof el[k] !== "object"));
			if (keys0.length && scalarish0) {
				let j = idx;
				const run = [];
				while (j < arr.length) {
					const it = arr[j];
					if (!it || typeof it !== "object" || Array.isArray(it)) break;
					const keys = Object.keys(it);
					if (keys.length !== keys0.length) break;
					// Same keys (same set)
					const same = keys.slice().sort().join("|") === keys0.slice().sort().join("|");
					if (!same) break;
					// Scalar values
					const scalarish = keys0.every(k => (it[k] == null || typeof it[k] !== "object"));
					if (!scalarish) break;
					run.push(it);
					j++;
				}

				if (run.length >= 2) {
					out.push(indent(level, opt) + `...{${keys0.join(", ")}}:`);
					for (const row of run)
						out.push(
							indent(level + 1, opt) +
							keys0.map(k => cellToALE(row[k]).text).join(", ")
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
				out.push(indent(level, opt) + `[${el.map(scalarToALE).join(", ")}]`);
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
					out.push(indent(level, opt) + `${prefix}${key}: [${v.map(scalarToALE).join(", ")}]`);
					firstKey = false;
					continue;
				}
				}

				// Keyed table inside array-object element: languages{name,...}:
				if (Array.isArray(v) && opt.useTables && isObjectArray(v)) {
				const cols = tableColumnsUnion(v);
				out.push(indent(level, opt) + `${prefix}${key}{${cols.join(", ")}}:`);

				for (const row of v) {
					const cells = [];
					const placeholders = [];

					for (const col of cols) {
					const r = cellToALE(row?.[col]);
					cells.push(r.text);
					if (r.placeholder) placeholders.push({ colName: col, ...r.placeholder });
					}

					out.push(indent(level + 1, opt) + cells.join(", "));

					if (placeholders.length) {
					writeRowContinuation(out, placeholders, level + 2, opt);
					}
				}

				firstKey = false;
				continue;
				}

				if (Array.isArray(v) || (v && typeof v === "object")) {
				out.push(indent(level, opt) + `${prefix}${key}:`);
				writeValue(out, v, level + 1, opt, { ...ctx, inSlot: false });
				} else {
				if (opt.booleanShortcuts && (v === true || v === false)) {
					out.push(indent(level, opt) + `${prefix}${v ? "¡" : "!"}${key}`);
				} else {
					out.push(indent(level, opt) + `${prefix}${key}: ${scalarToALE(v)}`);
				}
				}

				firstKey = false;
			}

			prevWasObject = true;
			continue;
		} else {
			out.push(indent(level, opt) + scalarToALE(el));
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
				if (cell && typeof cell === "object") return scalarToALE(JSON.stringify(cell));
				return scalarToALE(cell);
			}).join(", ");

			if (needSwitch) {
				out.push(indent(level, opt) + `<${mkLine(rows[0])}`);
				for (let r = 1; r < rows.length; r++)
					out.push(indent(level, opt) + mkLine(rows[r]));
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
					out.push(indent(level, opt) + `[${el.map(scalarToALE).join(", ")}]`);
				} else if (opt.useTables && isHomogeneousObjectArray(el)) {
					const cols = tableColumns(el);
					out.push(indent(level, opt) + `{${cols.join(", ")}}:`);
					for (const row of el)
						out.push(indent(level + 1, opt) + cols.map((c) => cellToALE(row[c]).text).join(", "));
				} else {
					// as fallback: each line an element
					writeSlotLines(out, el, level, opt);
				}
				prevWasObject = false;
				continue;
			}

			// Object into the slot
			const keys = Object.keys(el);
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
							out.push(indent(level, opt) + `${prefix}${key}: ${scalarToALE(v)}`);
						}
					}
				}
				firstKey = false;
			}

			prevWasObject = true;
			continue;
		}

		// Scalar / free text
		out.push(indent(level, opt) + scalarToALE(el));
		prevWasObject = false;
	}
}

function isHomogeneousObjectArray(arr) {
	if (!Array.isArray(arr) || arr.length === 0) return false;
	if (!arr.every((x) => x && typeof x === "object" && !Array.isArray(x))) return false;
	const keys0 = Object.keys(arr[0]).sort().join("|");
		for (let i = 1; i < arr.length; i++)
			if (Object.keys(arr[i]).sort().join("|") !== keys0) return false;
	return true;
}

function isObjectArray(arr) {
	return Array.isArray(arr) && arr.length > 0 && arr.every(x => x && typeof x === "object" && !Array.isArray(x));
}

function tableColumnsUnion(arr) {
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

function cellToALE(v) {
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
		if (isHomogeneousObjectArray(v)) {
			const cols = tableColumns(v);
			return { text: `{${cols.join(", ")}}`, placeholder: { kind: "table", columns: cols, value: v } };
		}

		// Array of scalars only => inline array [a,b,c]
		const allScalars = v.every((x) => x == null || typeof x !== "object");
		if (allScalars)
			return { text: `[${v.map(scalarToALE).join(", ")}]` };

		// Heterogeneous array (objects/strings/etc) => slot [:]
		return { text: "[:]", placeholder: { kind: "slot", value: v } };
	}

	// Object within a cell: not in spec v0.2 as a direct value.
	// We represent it as a slot of an element (to be valid and reversible).
	if (v && typeof v === "object")
		return { text: "[:]", placeholder: { kind: "slot", value: [v] } };

	// Normal scalar
	return { text: scalarToALE(v) };
}

function keyToALE(k) {
	// quote if spaces or special chars
	if (/^[A-Za-z0-9_\-]+$/.test(k)) return k;
	return `"${escapeString(k, { quoted: true })}"`;
}

function scalarToALE(v) {
	// Only true scalars here. Arrays/objects must be handled by writeValue/writeObject/writeArray.
	if (v === null || v === undefined) return "-";
	if (v === true) return "true";
	if (v === false) return "false";
	if (typeof v === "number") return Number.isFinite(v) ? String(v) : "-";
	if (typeof v === "string") return stringToALE(v);

	// If something non-scalar slips through, make it obvious instead of "[object Object]"
	return stringToALE(JSON.stringify(v));
}

function stringToALE(s) {
	// Decide bare vs quoted
	const needsQuotes =
		s.length === 0 ||
		/^\s/.test(s) ||
		/,/.test(s) ||
		/:/.test(s) ||
		/[\[\]\{\}<>]/.test(s) ||
		/\n/.test(s);

	if (!needsQuotes)
		// allow \, \n \" escapes in bare strings
		return escapeString(s, { quoted: false });

	return `"${escapeString(s, { quoted: true })}"`;
}

function escapeString(s, { quoted }) {
	// ALE escapes: \n, \,, \"
	// also escape backslash in quoted mode to preserve roundtrip more safely
	let out = s.replace(/\n/g, "\\n").replace(/,/g, "\\,").replace(/"/g, '\\"');
	if (quoted) out = out.replace(/\\/g, "\\\\").replace(/\\\\n/g, "\\n").replace(/\\\\,/g, "\\,").replace(/\\\\\\"/g, '\\"');
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