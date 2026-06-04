import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { getBaseExtensions } from "./editor-impl.js";

export function createEditorState(initialDoc, langExtensions = [], otherExtensions = [], isWordWrapEnabled = false) {
    return EditorState.create({
        doc: initialDoc,
        extensions: getBaseExtensions(isWordWrapEnabled, langExtensions, otherExtensions)
    });
}

export function createEditorView(state, parent) {
    return new EditorView({
        state,
        parent
    });
}

export {
    toggleLineWrapping,
    applyLineWrappingToState,
    setLanguageExtension,
    applyLanguageExtensionToState,
    createUpdateListenerExtension
} from "./editor-impl.js";

export { getLanguageExtension, detectLanguageFromContent } from "./languages.js";
