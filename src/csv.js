/**
 * Rainbow CSV – CodeMirror 6 extension (auto-detection mode)
 *
 * Automatically detects whether the editor content looks like CSV or TSV
 * by inspecting the first several non-empty lines. When detected, each
 * column segment is decorated with a per-column CSS class (.csv-col-N).
 *
 * Detection heuristics:
 *  - Needs at least 2 non-empty lines
 *  - Majority of lines must have the same (or ±1) delimiter count
 *  - At least 1 delimiter per line
 *  - Re-evaluated on every document change (so it activates as you type)
 */
import { ViewPlugin, Decoration } from '@codemirror/view';
import { RangeSetBuilder } from '@codemirror/state';

const NUM_COLORS = 10;       // matches .csv-col-0 … .csv-col-9
const SAMPLE_LINES = 15;     // lines to sample for detection
const MIN_LINES = 2;         // minimum non-empty lines before detection kicks in

// ─── Quoted-field-aware delimiter counter ────────────────────────────────────
function countDelimiters(line, delimiter) {
    let count = 0;
    let inQuote = false;
    for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (inQuote) {
            if (ch === '"') {
                if (i + 1 < line.length && line[i + 1] === '"') i++; // escaped ""
                else inQuote = false;
            }
        } else {
            if (ch === '"') { inQuote = true; }
            else if (ch === delimiter) { count++; }
        }
    }
    return count;
}

// ─── Detect delimiter from document ──────────────────────────────────────────
function detectDelimiter(doc) {
    const lines = [];
    for (let i = 1; i <= doc.lines && lines.length < SAMPLE_LINES; i++) {
        const text = doc.line(i).text.trim();
        if (text.length > 0) lines.push(text);
    }

    if (lines.length < MIN_LINES) return null;

    for (const delimiter of [',', '\t']) {
        const counts = lines.map(l => countDelimiters(l, delimiter));

        // Every sampled line must have at least one delimiter
        if (counts.some(c => c === 0)) continue;

        // Column counts must be consistent (max deviation ≤ 1)
        const min = Math.min(...counts);
        const max = Math.max(...counts);
        if (max - min <= 1) return delimiter;
    }

    return null;
}

// ─── Parse a single line into {start, end} column spans ──────────────────────
function parseLineSpans(line, delimiter) {
    const spans = [];
    const len = line.length;
    let colStart = 0;
    let inQuote = false;
    let i = 0;

    while (i < len) {
        const ch = line[i];
        if (inQuote) {
            if (ch === '"') {
                if (i + 1 < len && line[i + 1] === '"') { i += 2; }
                else { inQuote = false; i++; }
            } else { i++; }
        } else {
            if (ch === '"') { inQuote = true; i++; }
            else if (ch === delimiter) {
                spans.push({ start: colStart, end: i });
                colStart = i + 1;
                i++;
            } else { i++; }
        }
    }
    spans.push({ start: colStart, end: len });
    return spans;
}

// ─── Build decorations for all visible ranges ─────────────────────────────────
function buildDecorations(view, delimiter) {
    const builder = new RangeSetBuilder();
    const { doc } = view.state;

    for (const { from, to } of view.visibleRanges) {
        let lineStart = doc.lineAt(from).from;
        while (lineStart <= to) {
            const line = doc.lineAt(lineStart);
            if (line.text.trim().length > 0) {
                const spans = parseLineSpans(line.text, delimiter);
                spans.forEach((span, colIndex) => {
                    const spanFrom = line.from + span.start;
                    const spanTo = line.from + span.end;
                    if (spanFrom < spanTo) {
                        builder.add(spanFrom, spanTo,
                            Decoration.mark({ class: `csv-col-${colIndex % NUM_COLORS}` }));
                    }
                });
            }
            if (line.to >= doc.length) break;
            lineStart = line.to + 1;
        }
    }
    return builder.finish();
}

// ─── The plugin ───────────────────────────────────────────────────────────────
const rainbowPlugin = ViewPlugin.fromClass(
    class {
        constructor(view) {
            this.delimiter = detectDelimiter(view.state.doc);
            this.decorations = this.delimiter
                ? buildDecorations(view, this.delimiter)
                : Decoration.none;
        }

        update(update) {
            if (update.docChanged || update.viewportChanged) {
                this.delimiter = detectDelimiter(update.view.state.doc);
                this.decorations = this.delimiter
                    ? buildDecorations(update.view, this.delimiter)
                    : Decoration.none;
            }
        }
    },
    { decorations: v => v.decorations }
);

/**
 * Returns the auto-detecting rainbow CSV extension.
 * Add this to every editor state – it will only colour when content
 * looks like CSV/TSV, regardless of filename.
 */
export function rainbowCsvExtension() {
    return [rainbowPlugin];
}
