import { ViewPlugin, Decoration, EditorView } from "@codemirror/view";
import { StateField, StateEffect } from "@codemirror/state";

// Regular expressions to detect checkbox states at the start of lines
const UNCHECKED_REGEX = /^(\s*)⬜\s/;
const CHECKED_REGEX = /^(\s*)✅\s/;

// Creates a styling decoration for lines that start with ✅
const checkedLineDecoration = Decoration.line({
    class: "cm-todo-completed"
});

// A CodeMirror ViewPlugin that provides the visual "grey-out and strikethrough" styling dynamically 
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
                if (CHECKED_REGEX.test(line.text)) {
                    builder.push(checkedLineDecoration.range(line.from, line.from));
                }
                pos = line.to + 1;
            }
        }
        return Decoration.set(builder, true);
    }
}, {
    decorations: v => v.decorations
});

// An interaction handler that flips ⬜ to ✅ (and vice versa) when clicked
export const todoClickHandler = EditorView.domEventHandlers({
    mousedown(event, view) {
        // Only intercept if we clicked exactly on a character 
        const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
        if (pos === null) return false;

        const line = view.state.doc.lineAt(pos);

        // Ensure the click was actually on the emoji part of the line (first 3-4 chars typically)
        // by checking cursor horizontal distance from the line start
        const headMatch = line.text.match(/^(\s*)([⬜✅])/);
        if (!headMatch) return false;

        const emojiOffset = headMatch[1].length;
        const clickedOnEmoji = pos >= line.from + emojiOffset && pos <= line.from + emojiOffset + 1;

        if (clickedOnEmoji) {
            const isChecked = headMatch[2] === '✅';
            const newChar = isChecked ? '⬜' : '✅';

            // Dispatch transaction replacing exactly that single character
            view.dispatch({
                changes: {
                    from: line.from + emojiOffset,
                    to: line.from + emojiOffset + 1,
                    insert: newChar
                }
            });
            return true; // Stop event bubbling
        }
        return false;
    }
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
            const match = line.text.match(/^(\s*[⬜✅]\s*)/);

            if (match) {
                // If they pressed enter on a completely EMPTY checkbox, delete it to escape the list pattern
                if (line.text.trim() === '⬜' || line.text.trim() === '✅') {
                    view.dispatch({
                        changes: { from: line.from, to: line.to, insert: "" },
                        selection: { anchor: line.from }
                    });
                    return true;
                }

                const prefix = match[1].replace('✅', '⬜'); // always convert to unchecked on new line
                view.dispatch({
                    changes: {
                        from: selection.head,
                        insert: "\n" + prefix
                    },
                    // Move cursor down exactly after the injected prefix
                    selection: { anchor: selection.head + 1 + prefix.length }
                });
                return true;
            }
            return false;
        }
    }
];

export function activateTodoMode() {
    return [
        todoHighlighter,
        todoClickHandler
    ];
}
