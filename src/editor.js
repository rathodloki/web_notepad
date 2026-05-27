import { EditorState, Compartment, StateEffect } from "@codemirror/state";
import { EditorView, lineNumbers, highlightActiveLineGutter, highlightSpecialChars, drawSelection, dropCursor, rectangularSelection, crosshairCursor, highlightActiveLine, keymap, placeholder } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { searchKeymap, highlightSelectionMatches } from "@codemirror/search";
import { syntaxHighlighting, HighlightStyle, bracketMatching, foldGutter, foldKeymap, indentOnInput, StreamLanguage } from "@codemirror/language";
import { closeBrackets, autocompletion, closeBracketsKeymap, completionKeymap } from "@codemirror/autocomplete";
import { tags as t } from "@lezer/highlight";
import { rainbowCsvExtension } from "./csv.js";

// Languages unloaded by default to reduce boot time

export const wordWrapCompartment = new Compartment();
export const languageCompartment = new Compartment();

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
        backgroundColor: "transparent !important",
        color: "var(--text-primary)",
        height: "100%",
        fontSize: "16px",
        fontWeight: "450",
        letterSpacing: "-0.02em",
        fontFamily: "'Geist Mono', 'JetBrains Mono', 'Fira Code', monospace"
    },
    ".cm-scroller": {
        padding: "8px 0",
        fontFamily: "inherit"
    },
    ".cm-content": {
        caretColor: "#60a5fa",
        paddingLeft: "12px"
    },
    "&.cm-focused .cm-cursor": {
        borderLeftColor: "#60a5fa !important",
        borderLeftWidth: "2px !important",
        animation: "cm-blink-smooth 1s ease-in-out infinite"
    },
    "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection": {
        backgroundColor: "rgba(59, 130, 246, 0.18) !important"
    },
    ".cm-activeLine": {
        backgroundColor: "rgba(255, 255, 255, 0.03)"
    },
    ".cm-activeLineGutter": {
        backgroundColor: "transparent !important",
        color: "#60a5fa !important",
        fontWeight: "bold"
    },
    ".cm-gutters": {
        backgroundColor: "transparent",
        color: "rgba(255, 255, 255, 0.28) !important",
        border: "none",
        borderRight: "1px solid var(--border)"
    },
    ".cm-lineNumbers .cm-gutterElement": {
        padding: "0 8px 0 16px",
        minWidth: "40px",
        textAlign: "right",
        color: "rgba(255, 255, 255, 0.28) !important"
    },
    ".cm-foldGutter .cm-gutterElement": {
        width: "12px",
        padding: "0",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "rgba(255, 255, 255, 0.28) !important"
    },
    ".cm-panels": {
        backgroundColor: "var(--bg-surface)",
        color: "var(--text-primary)",
        borderTop: "1px solid var(--border) !important",
        fontFamily: "'Inter', system-ui, sans-serif"
    },
    ".cm-panels.cm-panels-bottom": {
        borderTop: "1px solid var(--border)"
    },
    ".cm-search": {
        padding: "8px 12px",
        display: "flex",
        alignItems: "center",
        flexWrap: "wrap",
        gap: "8px"
    },
    ".cm-search input": {
        backgroundColor: "var(--bg-primary)",
        border: "1px solid var(--border)",
        color: "var(--text-primary)",
        borderRadius: "4px",
        padding: "4px 8px",
        fontSize: "13px",
        outline: "none",
        transition: "border-color 0.15s"
    },
    ".cm-search input:focus": {
        borderColor: "var(--accent)"
    },
    ".cm-search button": {
        backgroundColor: "transparent",
        color: "var(--text-secondary)",
        border: "1px solid var(--border)",
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
        color: "var(--text-secondary)",
        textTransform: "none"
    },
    ".cm-search button[name=close]:hover": {
        color: "var(--danger)"
    },
    ".cm-search button:hover": {
        backgroundColor: "var(--bg-hover)",
        color: "var(--text-primary)"
    },
    ".cm-search label": {
        fontSize: "12px",
        color: "var(--text-secondary)",
        display: "flex",
        alignItems: "center",
        gap: "4px",
        cursor: "pointer",
        textTransform: "capitalize"
    },
    ".cm-search input[type=checkbox]": {
        accentColor: "var(--accent)",
        cursor: "pointer"
    },
    ".cm-searchMatch": {
        backgroundColor: "var(--accent-soft)"
    },
    ".cm-searchMatch.cm-searchMatch-selected": {
        backgroundColor: "var(--accent)",
        color: "#ffffff",
        outline: "1px solid var(--accent)",
        outlineOffset: "-1px"
    },
    ".cm-foldPlaceholder": {
        backgroundColor: "transparent",
        border: "none",
        color: "var(--accent)"
    },
    ".cm-placeholder": {
        color: "#3a3a4a !important",
        fontStyle: "normal"
    }
}, { dark: true });

export function createEditorState(initialDoc, langExtensions = [], otherExtensions = [], isWordWrapEnabled = false) {
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
            placeholder("Start typing..."),
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
            wordWrapCompartment.of(isWordWrapEnabled ? EditorView.lineWrapping : []),
            languageCompartment.of(langExtensions),
            ...otherExtensions,
            ...rainbowCsvExtension()
        ]
    });
}

export function createEditorView(state, parent) {
    return new EditorView({
        state,
        parent
    });
}

export function detectLanguageFromContent(content) {
    if (!content) return null;
    const firstLine = content.split('\n')[0].trim();
    if (firstLine.startsWith('#!')) {
        if (firstLine.includes('python')) return 'py';
        if (firstLine.includes('node')) return 'js';
        if (firstLine.match(/\b(bash|sh|zsh)\b/)) return 'sh';
        if (firstLine.includes('ruby')) return 'rb';
        if (firstLine.match(/\b(pwsh|powershell)\b/i)) return 'ps1';
    }

    // basic content heuristics if shebang is missing
    if (content.startsWith('<#')) return 'ps1';

    // JSON heuristics (must be before powershell to prevent {"Set-Cookie": "..."} triggering powershell)
    const trimmedContent = content.trim();
    if (trimmedContent.startsWith('{') || trimmedContent.startsWith('[')) {
        try {
            JSON.parse(content);
            return 'json';
        } catch (e) { }
    }

    // PowerShell heuristics
    if (content.match(/\b(Write-|Get-|Set-|Invoke-|Out-|Start-|Stop-|New-|Remove-|Format-|ForEach-Object|Where-Object)\b/i) ||
        content.match(/^\$[a-zA-Z_]\w*\s*=/m) ||
        content.match(/\[CmdletBinding\(\)\]/i) ||
        content.match(/\bparam\s*\(/i)) {
        return 'ps1';
    }

    if (content.includes('<!DOCTYPE html>') || content.includes('<html')) return 'html';

    // Python heuristics
    if (content.match(/^(import|from\s+[\w.]+\s+import|def|class)\s+[a-zA-Z_]/m) ||
        content.match(/^print\(|^\s*try:|^\s*except.*:|^\s*elif.*:|^\s*def\s+\w+\s*\(/m)) {
        return 'py';
    }

    return null;
}

export async function getLanguageExtension(filename, content = '', manualExt = null) {
    let ext = manualExt;

    if (!ext && filename) {
        ext = filename.split('.').pop().toLowerCase();
    }

    if (!ext && content) {
        ext = detectLanguageFromContent(content);
    }

    if (!ext) return [];

    switch (ext) {
        case 'js':
        case 'mjs':
        case 'cjs': {
            const { javascript } = await import("@codemirror/lang-javascript");
            return [javascript()];
        }
        case 'jsx':
        case 'ts':
        case 'tsx': {
            const { javascript: jsTs } = await import("@codemirror/lang-javascript");
            return [jsTs({ typescript: true })];
        }
        case 'py': {
            const { python } = await import("@codemirror/lang-python");
            return [python()];
        }
        case 'html': {
            const { html } = await import("@codemirror/lang-html");
            return [html()];
        }
        case 'css': {
            const { css } = await import("@codemirror/lang-css");
            return [css()];
        }
        case 'cpp':
        case 'cc':
        case 'h':
        case 'hpp':
        case 'c': {
            const { cpp } = await import("@codemirror/lang-cpp");
            return [cpp()];
        }
        case 'java': {
            const { java } = await import("@codemirror/lang-java");
            return [java()];
        }
        case 'json': {
            const { json } = await import("@codemirror/lang-json");
            return [json()];
        }
        case 'md':
        case 'markdown': {
            const { markdown } = await import("@codemirror/lang-markdown");
            return [markdown()];
        }
        case 'yaml':
        case 'yml': {
            const { yaml } = await import("@codemirror/legacy-modes/mode/yaml");
            return [StreamLanguage.define(yaml)];
        }
        case 'ini':
        case 'conf':
        case 'cfg':
        case 'properties':
        case 'log': {
            const { properties } = await import("@codemirror/legacy-modes/mode/properties");
            return [StreamLanguage.define(properties)];
        }
        case 'sh':
        case 'bash':
        case 'zsh': {
            const { shell } = await import("@codemirror/legacy-modes/mode/shell");
            return [StreamLanguage.define(shell)];
        }
        case 'ps1':
        case 'psm1':
        case 'psd1':
        case 'pwsh':
        case 'powershell': {
            const { powerShell } = await import("@codemirror/legacy-modes/mode/powershell");
            return [StreamLanguage.define(powerShell)];
        }
        case 'rb': {
            const { ruby } = await import("@codemirror/legacy-modes/mode/ruby");
            return [StreamLanguage.define(ruby)];
        }
        case 'go': {
            const { go } = await import("@codemirror/legacy-modes/mode/go");
            return [StreamLanguage.define(go)];
        }
        case 'rs': {
            const { rust } = await import("@codemirror/legacy-modes/mode/rust");
            return [StreamLanguage.define(rust)];
        }
        case 'todo': {
            const { activateTodoMode, todoKeymap } = await import("./todo.js");
            const { Prec } = await import("@codemirror/state");
            return [...activateTodoMode(), Prec.highest(keymap.of(todoKeymap))];
        }
        default: return [];
    }
}

export function toggleLineWrapping(view, isEnabled) {
    view.dispatch({
        effects: wordWrapCompartment.reconfigure(isEnabled ? EditorView.lineWrapping : [])
    });
}

export function applyLineWrappingToState(state, isEnabled) {
    return state.update({
        effects: wordWrapCompartment.reconfigure(isEnabled ? EditorView.lineWrapping : [])
    }).state;
}

export function setLanguageExtension(view, extensions) {
    view.dispatch({
        effects: languageCompartment.reconfigure(extensions)
    });
}

export function applyLanguageExtensionToState(state, extensions) {
    return state.update({
        effects: languageCompartment.reconfigure(extensions)
    }).state;
}

/**
 * Creates an EditorView update listener extension.
 * Centralizes EditorView import so other modules don't need it directly.
 */
export function createUpdateListenerExtension(callback) {
    return EditorView.updateListener.of(callback);
}
