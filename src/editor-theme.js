import { EditorView } from "@codemirror/view";
import { HighlightStyle } from "@codemirror/language";
import { tags as t } from "@lezer/highlight";

export const cyberpunkHighlightStyle = HighlightStyle.define([
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

export const customTheme = EditorView.theme({
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
        backgroundColor: "rgba(59, 130, 246, 0.4) !important"
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
