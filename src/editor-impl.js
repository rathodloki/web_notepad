import { EditorState, Compartment } from "@codemirror/state";
import { EditorView, lineNumbers, highlightActiveLineGutter, highlightSpecialChars, drawSelection, dropCursor, rectangularSelection, crosshairCursor, highlightActiveLine, keymap, placeholder } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { searchKeymap, highlightSelectionMatches } from "@codemirror/search";
import { syntaxHighlighting, bracketMatching, foldGutter, foldKeymap, indentOnInput } from "@codemirror/language";
import { closeBrackets, autocompletion, closeBracketsKeymap, completionKeymap } from "@codemirror/autocomplete";
import { rainbowCsvExtension } from "./csv.js";
import { cyberpunkHighlightStyle, customTheme } from "./editor-theme.js";

const wordWrapCompartment = new Compartment();
const languageCompartment = new Compartment();

export function getBaseExtensions(isWordWrapEnabled, langExtensions, otherExtensions) {
    return [
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
    ];
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

export function createUpdateListenerExtension(callback) {
    return EditorView.updateListener.of(callback);
}
