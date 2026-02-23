import { EditorState } from "@codemirror/state";
import { EditorView, lineNumbers, highlightActiveLineGutter, highlightSpecialChars, drawSelection, dropCursor, rectangularSelection, crosshairCursor, highlightActiveLine, keymap } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { searchKeymap, highlightSelectionMatches } from "@codemirror/search";
import { syntaxHighlighting, HighlightStyle, bracketMatching, foldGutter, foldKeymap, indentOnInput, StreamLanguage } from "@codemirror/language";
import { closeBrackets, autocompletion, closeBracketsKeymap, completionKeymap } from "@codemirror/autocomplete";
import { tags as t } from "@lezer/highlight";

// Languages unloaded by default to reduce boot time

const cyberpunkHighlightStyle = HighlightStyle.define([
    { tag: [t.keyword, t.controlKeyword, t.moduleKeyword], color: "#FF79C6", fontWeight: "bold" },
    { tag: [t.string, t.special(t.string), t.inserted], color: "#50FA7B" },
    { tag: [t.meta, t.comment, t.lineComment, t.blockComment], color: "#6272A4", fontStyle: "italic" },
    { tag: [t.number, t.bool, t.null, t.changed, t.className], color: "#FFB86C" },
    { tag: [t.operator, t.operatorKeyword, t.punctuation, t.derefOperator], color: "#FF79C6" },
    { tag: [t.function(t.variableName), t.function(t.propertyName), t.definition(t.name)], color: "#8BE9FD" },
    { tag: [t.variableName, t.propertyName, t.name], color: "#F8F8F2" },
    { tag: [t.typeName, t.typeOperator, t.standard(t.name)], color: "#8BE9FD", fontStyle: "italic" },
    { tag: [t.special(t.variableName), t.macroName, t.local(t.variableName)], color: "#BD93F9" },
    { tag: t.invalid, color: "#F8F8F0", backgroundColor: "#FF79C6" }
]);

const customTheme = EditorView.theme({
    "&": {
        backgroundColor: "#000000 !important",
        color: "#ABB2BF",
        height: "100%",
        fontSize: "14.5px",
        fontFamily: "'JetBrains Mono', 'Consolas', monospace"
    },
    ".cm-content": {
        caretColor: "#528BFF"
    },
    "&.cm-focused .cm-cursor": {
        borderLeftColor: "#528BFF"
    },
    "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection": {
        backgroundColor: "#3E4451"
    },
    ".cm-panels": {
        backgroundColor: "#14171c",
        color: "#f0f0f0",
        borderTop: "1px solid #ffffff10 !important",
        fontFamily: "'Inter', system-ui, sans-serif"
    },
    ".cm-panels.cm-panels-bottom": {
        borderTop: "1px solid #ffffff10"
    },
    ".cm-search": {
        padding: "8px 12px",
        display: "flex",
        alignItems: "center",
        flexWrap: "wrap",
        gap: "8px"
    },
    ".cm-search input": {
        backgroundColor: "#0f1115",
        border: "1px solid #ffffff10",
        color: "#f0f0f0",
        borderRadius: "4px",
        padding: "4px 8px",
        fontSize: "13px",
        outline: "none",
        transition: "border-color 0.15s"
    },
    ".cm-search input:focus": {
        borderColor: "#3b82f6"
    },
    ".cm-search button": {
        backgroundColor: "transparent",
        color: "#8b92a5",
        border: "1px solid #ffffff10",
        borderRadius: "4px",
        padding: "4px 10px",
        fontSize: "12px",
        cursor: "pointer",
        transition: "all 0.15s",
        textTransform: "capitalize",
        backgroundImage: "none"
    },
    ".cm-search button[name=close]": {
        position: "absolute",
        top: "8px",
        right: "8px",
        border: "none",
        fontSize: "16px",
        padding: "0 6px",
        color: "#8b92a5",
        textTransform: "none"
    },
    ".cm-search button[name=close]:hover": {
        color: "#FF5555"
    },
    ".cm-search button:hover": {
        backgroundColor: "#ffffff0a",
        color: "#f0f0f0"
    },
    ".cm-search label": {
        fontSize: "12px",
        color: "#8b92a5",
        display: "flex",
        alignItems: "center",
        gap: "4px",
        cursor: "pointer",
        textTransform: "capitalize"
    },
    ".cm-search input[type=checkbox]": {
        accentColor: "#3b82f6",
        cursor: "pointer"
    },
    ".cm-searchMatch": {
        backgroundColor: "#3b82f630"
    },
    ".cm-searchMatch.cm-searchMatch-selected": {
        backgroundColor: "#3b82f660",
        color: "#f0f0f0",
        outline: "1px solid #3b82f6",
        outlineOffset: "-1px"
    },
    ".cm-activeLine": {
        backgroundColor: "#2c313a"
    },
    ".cm-activeLineGutter": {
        backgroundColor: "#2c313a",
        color: "#C678DD"
    },
    ".cm-gutters": {
        backgroundColor: "#000000",
        color: "#4B5263",
        border: "none",
        borderRight: "1px solid #181A1F"
    },
    ".cm-foldPlaceholder": {
        backgroundColor: "transparent",
        border: "none",
        color: "#528BFF"
    }
}, { dark: true });

export function createEditorState(initialDoc, extensionList = []) {
    return EditorState.create({
        doc: initialDoc,
        extensions: [
            lineNumbers(),
            highlightActiveLineGutter(),
            highlightSpecialChars(),
            history(),
            foldGutter(),
            drawSelection(),
            dropCursor(),
            EditorState.allowMultipleSelections.of(true),
            indentOnInput(),
            bracketMatching(),
            closeBrackets(),
            autocompletion(),
            rectangularSelection(),
            crosshairCursor(),
            highlightActiveLine(),
            highlightSelectionMatches(),
            keymap.of([
                ...closeBracketsKeymap,
                ...defaultKeymap,
                ...searchKeymap,
                ...historyKeymap,
                ...foldKeymap,
                ...completionKeymap
            ]),
            syntaxHighlighting(cyberpunkHighlightStyle, { fallback: true }),
            customTheme,
            ...extensionList
        ]
    });
}

export function createEditorView(state, parent) {
    return new EditorView({
        state,
        parent
    });
}

export async function getLanguageExtension(filename) {
    if (!filename) return [];
    const ext = filename.split('.').pop().toLowerCase();
    switch (ext) {
        case 'js':
        case 'mjs':
        case 'cjs':
            const { javascript } = await import("@codemirror/lang-javascript");
            return [javascript()];
        case 'jsx':
        case 'ts':
        case 'tsx':
            const { javascript: jsTs } = await import("@codemirror/lang-javascript");
            return [jsTs({ typescript: true })];
        case 'py':
            const { python } = await import("@codemirror/lang-python");
            return [python()];
        case 'html':
            const { html } = await import("@codemirror/lang-html");
            return [html()];
        case 'css':
            const { css } = await import("@codemirror/lang-css");
            return [css()];
        case 'cpp':
        case 'cc':
        case 'h':
        case 'hpp':
        case 'c':
            const { cpp } = await import("@codemirror/lang-cpp");
            return [cpp()];
        case 'java':
            const { java } = await import("@codemirror/lang-java");
            return [java()];
        case 'json':
            const { json } = await import("@codemirror/lang-json");
            return [json()];
        case 'md':
        case 'markdown':
            const { markdown } = await import("@codemirror/lang-markdown");
            return [markdown()];
        case 'yaml':
        case 'yml':
            const { yaml } = await import("@codemirror/legacy-modes/mode/yaml");
            return [StreamLanguage.define(yaml)];
        case 'ini':
        case 'conf':
        case 'cfg':
        case 'properties':
        case 'log':
            const { properties } = await import("@codemirror/legacy-modes/mode/properties");
            return [StreamLanguage.define(properties)];
        case 'sh':
        case 'bash':
        case 'zsh':
            const { shell } = await import("@codemirror/legacy-modes/mode/shell");
            return [StreamLanguage.define(shell)];
        case 'rb':
            const { ruby } = await import("@codemirror/legacy-modes/mode/ruby");
            return [StreamLanguage.define(ruby)];
        case 'go':
            const { go } = await import("@codemirror/legacy-modes/mode/go");
            return [StreamLanguage.define(go)];
        case 'rs':
            const { rust } = await import("@codemirror/legacy-modes/mode/rust");
            return [StreamLanguage.define(rust)];
        case 'todo':
            const { activateTodoMode, todoKeymap } = await import("./todo.js");
            // Import keymap array separately so it properly registers as a functional hotkey override
            const { keymap } = await import("@codemirror/view");
            const { Prec } = await import("@codemirror/state");
            return [...activateTodoMode(), Prec.highest(keymap.of(todoKeymap))];
        case 'doc': {
            const docModule = await import("./doc.js");
            const docKeymapImport = await import("@codemirror/view");
            const docPrecImport = await import("@codemirror/state");
            const { markdown, markdownLanguage } = await import("@codemirror/lang-markdown");
            const { languages } = await import("@codemirror/language-data");
            return [
                markdown({ base: markdownLanguage, codeLanguages: languages }),
                ...docModule.activateDocMode(),
                docPrecImport.Prec.highest(docKeymapImport.keymap.of(docModule.docKeymap))
            ];
        }
        default: return [];
    }
}

