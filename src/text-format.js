// text-format.js — Text transformation utilities and format menu wiring
import { state } from './state.js';
import { showStatus } from './status-bar.js';
import { invoke } from './tauri-bridge.js';

function modifyEditorSelection(transformFn) {
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

async function modifyEditorSelectionAsync(transformFnAsync) {
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

/**
 * Wire up the text formatting dropdown menu.
 * Call once from DOMContentLoaded.
 */
export function setupTextFormatMenu() {
    const textFormatBtn = document.getElementById('btn-text-format');
    const textFormatMenu = document.getElementById('text-format-menu');
    if (!textFormatBtn || !textFormatMenu) return;

    textFormatBtn.addEventListener('click', (e) => { e.stopPropagation(); textFormatMenu.style.display = textFormatMenu.style.display === 'block' ? 'none' : 'block'; });
    document.addEventListener('click', (e) => { if (!textFormatBtn.contains(e.target) && !textFormatMenu.contains(e.target)) textFormatMenu.style.display = 'none'; });

    document.getElementById('menu-format-upper').addEventListener('click', () => { modifyEditorSelection(t => t.toUpperCase()); textFormatMenu.style.display = 'none'; });
    document.getElementById('menu-format-lower').addEventListener('click', () => { modifyEditorSelection(t => t.toLowerCase()); textFormatMenu.style.display = 'none'; });
    document.getElementById('menu-format-title').addEventListener('click', () => { modifyEditorSelection(t => t.split(/(?<=\s|-|_)/).map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join('')); textFormatMenu.style.display = 'none'; });
    document.getElementById('menu-format-sort').addEventListener('click', () => { modifyEditorSelection(t => t.split('\n').sort().join('\n')); textFormatMenu.style.display = 'none'; });
    document.getElementById('menu-format-reverse').addEventListener('click', () => { modifyEditorSelection(t => t.split('').reverse().join('')); textFormatMenu.style.display = 'none'; });
    document.getElementById('menu-format-remove-empty').addEventListener('click', () => { modifyEditorSelection(t => t.split('\n').filter(l => l.trim().length > 0).join('\n')); textFormatMenu.style.display = 'none'; });
    document.getElementById('menu-format-remove-duplicates').addEventListener('click', () => { modifyEditorSelection(t => Array.from(new Set(t.split('\n'))).join('\n')); textFormatMenu.style.display = 'none'; });
    document.getElementById('menu-format-trim').addEventListener('click', () => { modifyEditorSelection(t => t.split('\n').map(l => l.trim()).join('\n')); textFormatMenu.style.display = 'none'; });
    document.getElementById('menu-format-duplicate').addEventListener('click', () => { modifyEditorSelection(t => t + '\n' + t); textFormatMenu.style.display = 'none'; });

    document.getElementById('menu-format-json-format').addEventListener('click', async () => {
        if (window.__TAURI__) {
            await modifyEditorSelectionAsync(async t => { try { return await invoke('format_json', { text: t }); } catch(e) { showStatus('Invalid JSON'); return t; } });
        } else {
            modifyEditorSelection(t => { try { return JSON.stringify(JSON.parse(t), null, 2); } catch(e){ showStatus('Invalid JSON'); return t; } });
        }
        textFormatMenu.style.display = 'none';
    });
    document.getElementById('menu-format-json-minify').addEventListener('click', async () => {
        if (window.__TAURI__) {
            await modifyEditorSelectionAsync(async t => { try { return await invoke('minify_json', { text: t }); } catch(e) { showStatus('Invalid JSON'); return t; } });
        } else {
            modifyEditorSelection(t => { try { return JSON.stringify(JSON.parse(t)); } catch(e){ showStatus('Invalid JSON'); return t; } });
        }
        textFormatMenu.style.display = 'none';
    });

    document.getElementById('menu-format-base64-enc').addEventListener('click', () => { modifyEditorSelection(t => { try { return btoa(t); } catch(e){ showStatus('Failed to encode'); return t; } }); textFormatMenu.style.display = 'none'; });
    document.getElementById('menu-format-base64-dec').addEventListener('click', () => { modifyEditorSelection(t => { try { return atob(t); } catch(e){ showStatus('Invalid Base64'); return t; } }); textFormatMenu.style.display = 'none'; });
    document.getElementById('menu-format-url-enc').addEventListener('click', () => { modifyEditorSelection(t => { try { return encodeURIComponent(t); } catch(e){ return t; } }); textFormatMenu.style.display = 'none'; });
    document.getElementById('menu-format-url-dec').addEventListener('click', () => { modifyEditorSelection(t => { try { return decodeURIComponent(t); } catch(e){ showStatus('Invalid URL string'); return t; } }); textFormatMenu.style.display = 'none'; });
}
