import { ViewPlugin, Decoration, WidgetType, EditorView } from "@codemirror/view";

// Regular expressions to detect markdown checkboxes
const UNCHECKED_REGEX = /^(\s*)-\s\[\s\]\s/;
const CHECKED_REGEX = /^(\s*)-\s\[x\]\s/i;

// -------------------------------------------------------------
// SVG Widget Builders
// -------------------------------------------------------------

class CheckboxWidget extends WidgetType {
    constructor(isChecked, from, to, isMissingPrefix = false) {
        super();
        this.isChecked = isChecked;
        this.from = from;
        this.to = to;
        this.isMissingPrefix = isMissingPrefix;
    }

    eq(other) {
        return other.isChecked === this.isChecked && other.from === this.from && other.to === this.to && other.isMissingPrefix === this.isMissingPrefix;
    }

    toDOM(view) {
        const wrap = document.createElement("span");
        wrap.className = "cm-todo-widget";
        wrap.style.cursor = "pointer";
        wrap.style.display = "inline-flex";
        wrap.style.alignItems = "center";
        wrap.style.justifyContent = "flex-start"; // Align SVG to left of fixed width block
        wrap.style.transform = "translateY(2px)";

        // Exact fixed width so text always aligns perfectly vertically on all lines
        wrap.style.width = "28px";
        // No marginRight needed since width acts as the spacer

        // Add mousedown listener directly to the widget DOM to flip state
        wrap.addEventListener("mousedown", (e) => {
            e.preventDefault();
            e.stopPropagation();

            if (this.isMissingPrefix) {
                // It was plain text, so clicking unchecked should make it checked by prepending "- [x] "
                view.dispatch({
                    changes: { from: this.from, insert: "- [x] " }
                });
            } else {
                const newText = this.isChecked ? "- [ ] " : "- [x] ";
                view.dispatch({
                    changes: { from: this.from, to: this.to, insert: newText }
                });
            }
        });

        if (this.isChecked) {
            wrap.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#50FA7B" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="4" fill="#50FA7B30"></rect>
                <path d="M8 12.5l3 3 5-6"></path>
            </svg>`;
        } else {
            wrap.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#6272a4" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="4"></rect>
            </svg>`;
        }

        return wrap;
    }

    ignoreEvent() { return true; } // Tell CM to ignore events inside the widget so we handle clicks entirely
}

// Creates a styling decoration for the entire row block
const rowBackgroundDecoration = Decoration.line({
    class: "cm-todo-row"
});

// Creates a styling decoration for lines that start with completed tasks
const checkedRowBackgroundDecoration = Decoration.line({
    class: "cm-todo-row cm-todo-completed-row"
});

// A CodeMirror ViewPlugin that provides the visual widget replacements and row styling
export const todoHighlighter = ViewPlugin.fromClass(class {
    decorations;

    constructor(view) {
        this.decorations = this.buildDecorations(view);
    }

    update(update) {
        if (update.docChanged || update.viewportChanged) {
            this.decorations = this.buildDecorations(update.view);
        }
    }

    buildDecorations(view) {
        let builder = [];
        for (let { from, to } of view.visibleRanges) {
            let pos = from;
            while (pos <= to) {
                let line = view.state.doc.lineAt(pos);

                const uncheckedMatch = line.text.match(UNCHECKED_REGEX);
                const checkedMatch = line.text.match(CHECKED_REGEX);

                if (uncheckedMatch) {
                    builder.push(rowBackgroundDecoration.range(line.from, line.from));
                    const startRawIdx = line.from + uncheckedMatch[1].length;
                    const endRawIdx = line.from + uncheckedMatch[0].length;
                    builder.push(Decoration.replace({
                        widget: new CheckboxWidget(false, startRawIdx, endRawIdx),
                        inclusive: false
                    }).range(startRawIdx, endRawIdx));
                } else if (checkedMatch) {
                    builder.push(checkedRowBackgroundDecoration.range(line.from, line.from));
                    const startRawIdx = line.from + checkedMatch[1].length;
                    const endRawIdx = line.from + checkedMatch[0].length;
                    builder.push(Decoration.replace({
                        widget: new CheckboxWidget(true, startRawIdx, endRawIdx),
                        inclusive: false
                    }).range(startRawIdx, endRawIdx));
                } else {
                    // Line does NOT have a valid checkbox prefix
                    // Visually make it a checklist item!
                    builder.push(rowBackgroundDecoration.range(line.from, line.from));
                    // Inject a widget at the very start of the line, taking up 0 width in the document
                    const whitespaceMatch = line.text.match(/^(\s*)/);
                    const injectPos = line.from + (whitespaceMatch ? whitespaceMatch[1].length : 0);

                    builder.push(Decoration.widget({
                        widget: new CheckboxWidget(false, injectPos, injectPos, true),
                        side: 1
                    }).range(injectPos, injectPos));
                }

                pos = line.to + 1;
            }
        }
        return Decoration.set(builder, true);
    }
}, {
    decorations: v => v.decorations
});


// A hotkey extension that intercepts the exactly "Enter" keypress while inside a .todo file
// It detects if the line you just pressed Enter on was a checkbox, and replicates it downward
export const todoKeymap = [
    {
        key: "Enter",
        run: (view) => {
            const state = view.state;
            const selection = state.selection.main;

            // Only auto-complete on regular typing (no giant multi-line selections)
            if (!selection.empty) return false;

            const line = state.doc.lineAt(selection.head);
            const uncheckedMatch = line.text.match(UNCHECKED_REGEX);
            const checkedMatch = line.text.match(CHECKED_REGEX);
            const match = uncheckedMatch || checkedMatch;

            if (match) {
                // If they pressed enter on a completely EMPTY checkbox, delete it to escape the list pattern
                if (line.text.trim() === '- [ ]' || line.text.trim() === '- [x]' || line.text.trim() === '- [X]') {
                    view.dispatch({
                        changes: { from: line.from, to: line.to, insert: "" },
                        selection: { anchor: line.from }
                    });
                    return true;
                }

                // always convert to unchecked on new line
                const prefix = match[1] + "- [ ] ";
                view.dispatch({
                    changes: {
                        from: selection.head,
                        insert: "\n" + prefix
                    },
                    // Move cursor down exactly after the injected prefix
                    selection: { anchor: selection.head + 1 + prefix.length }
                });
                return true;
            } else {
                // It's a non-checkbox line (e.g., an empty line or normal text)
                // Insert a newline with a checkbox!
                const whitespaceMatch = line.text.match(/^(\s*)/);
                const prefix = (whitespaceMatch ? whitespaceMatch[1] : "") + "- [ ] ";
                view.dispatch({
                    changes: {
                        from: selection.head,
                        insert: "\n" + prefix
                    },
                    selection: { anchor: selection.head + 1 + prefix.length }
                });
                return true;
            }
        }
    }
];

export function activateTodoMode() {
    return [
        todoHighlighter
    ];
}
