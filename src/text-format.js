// text-format.js — Text transformation utilities and format menu wiring
import { state } from './state.js';
import { showStatus } from './status-bar.js';
import { invoke } from './tauri-bridge.js';

function getSelectionData() {
    const tab = state.tabs.find(t => t.id === state.activeTabId);
    if (!tab) return null;
    if (tab.isDoc && state.quillView) {
        let range = state.quillView.getSelection();
        if (!range || range.length === 0) range = { index: 0, length: state.quillView.getLength() - 1 };
        if (range.length > 0) {
            return {
                type: 'quill',
                range,
                text: state.quillView.getText(range.index, range.length)
            };
        }
    } else if (state.editorView) {
        const sel = state.editorView.state.selection.main;
        let from = sel.from, to = sel.to;
        let text = state.editorView.state.doc.sliceString(from, to);
        if (from === to) {
            from = 0;
            to = state.editorView.state.doc.length;
            text = state.editorView.state.doc.toString();
        }
        if (text.length > 0) {
            return {
                type: 'codemirror',
                from,
                to,
                text
            };
        }
    }
    return null;
}

function applySelectionResult(selData, newText) {
    if (selData.type === 'quill') {
        state.quillView.deleteText(selData.range.index, selData.range.length);
        state.quillView.insertText(selData.range.index, newText);
        state.quillView.setSelection(selData.range.index, newText.length);
    } else if (selData.type === 'codemirror') {
        state.editorView.dispatch({
            changes: { from: selData.from, to: selData.to, insert: newText },
            selection: { anchor: selData.from, head: selData.from + newText.length }
        });
    }
}

export function modifyEditorSelection(transformFn) {
    const selData = getSelectionData();
    if (selData) {
        applySelectionResult(selData, transformFn(selData.text));
    }
}

export async function modifyEditorSelectionAsync(transformFnAsync) {
    const selData = getSelectionData();
    if (selData) {
        applySelectionResult(selData, await transformFnAsync(selData.text));
    }
}


