// text-format.js — Text transformation utilities and format menu wiring
import { state } from './state.js';
import { showStatus } from './status-bar.js';
import { invoke } from './tauri-bridge.js';

export function modifyEditorSelection(transformFn) {
    const tab = state.tabs.find(t => t.id === state.activeTabId);
    if (!tab) return;
    if (tab.isDoc && state.quillView) {
        let range = state.quillView.getSelection();
        if (!range || range.length === 0) range = { index: 0, length: state.quillView.getLength() - 1 };
        if (range.length > 0) {
            const text = state.quillView.getText(range.index, range.length);
            const newText = transformFn(text);
            state.quillView.deleteText(range.index, range.length);
            state.quillView.insertText(range.index, newText);
            state.quillView.setSelection(range.index, newText.length);
        }
    } else if (state.editorView) {
        const sel = state.editorView.state.selection.main;
        let from = sel.from, to = sel.to;
        let targetText = state.editorView.state.doc.sliceString(from, to);
        if (from === to) { from = 0; to = state.editorView.state.doc.length; targetText = state.editorView.state.doc.toString(); }
        if (targetText.length > 0) {
            const newText = transformFn(targetText);
            state.editorView.dispatch({ changes: { from, to, insert: newText }, selection: { anchor: from, head: from + newText.length } });
        }
    }
}

export async function modifyEditorSelectionAsync(transformFnAsync) {
    const tab = state.tabs.find(t => t.id === state.activeTabId);
    if (!tab) return;
    if (tab.isDoc && state.quillView) {
        let range = state.quillView.getSelection();
        if (!range || range.length === 0) range = { index: 0, length: state.quillView.getLength() - 1 };
        if (range.length > 0) {
            const text = state.quillView.getText(range.index, range.length);
            const newText = await transformFnAsync(text);
            state.quillView.deleteText(range.index, range.length);
            state.quillView.insertText(range.index, newText);
            state.quillView.setSelection(range.index, newText.length);
        }
    } else if (state.editorView) {
        const sel = state.editorView.state.selection.main;
        let from = sel.from, to = sel.to;
        let targetText = state.editorView.state.doc.sliceString(from, to);
        if (from === to) { from = 0; to = state.editorView.state.doc.length; targetText = state.editorView.state.doc.toString(); }
        if (targetText.length > 0) {
            const newText = await transformFnAsync(targetText);
            state.editorView.dispatch({ changes: { from, to, insert: newText }, selection: { anchor: from, head: from + newText.length } });
        }
    }
}


