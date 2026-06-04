// session-manager.js — Workspace session save/load and menu wiring
import { state } from './state.js';
import { showStatus, updateTitle } from './status-bar.js';
import { readTextFile, writeTextFile, openDialog, saveDialog, invoke } from './tauri-bridge.js';
import { askConfirmUI } from './overlays.js';
import { closeMultipleTabs, createNewTab } from './editor-manager.js';
import { saveSession, loadSession } from './session.js';
import { addToFileHistory } from './history.js';
import { getFilename } from './utils.js';

export async function saveExplicitSession() {
    if (!window.__TAURI__) return alert('Saving sessions is only supported in the app.');
    try {
        let activeDocContent = null;
        const activeTab = state.tabs.find(t => t.id === state.activeTabId);
        if (activeTab && activeTab.isDoc && state.quillView) activeDocContent = state.quillView.root.innerHTML;
        const sessionTabs = state.tabs.map(tab => {
            let content = null;
            if (tab.isDoc) content = (tab.id === state.activeTabId && activeDocContent !== null) ? activeDocContent : tab.savedContent;
            else content = (tab.id === state.activeTabId && state.editorView) ? state.editorView.state.doc.toString() : tab.state.doc.toString();
            return { path: tab.path, title: tab.title, isTodo: tab.isTodo, isDoc: tab.isDoc, manualLanguage: tab.manualLanguage, content: tab.isUnsaved || !tab.path || tab.isTodo || tab.isDoc ? content : null };
        });
        const sessionData = JSON.stringify({ tabs: sessionTabs, version: 1 }, null, 2);
        const selected = await saveDialog({ filters: [{ name: 'LightPad Session', extensions: ['lpsession'] }] });
        if (selected) {
            await writeTextFile(selected, sessionData);
            state.activeSessionPath = selected;
            updateTitle();
            showStatus('Workspace Session saved natively');
        }
    } catch (e) { console.error(e); showStatus('Error saving Workspace'); }
}

async function restoreSingleTab(t) {
    let content = t.content;
    if (content === null && t.path) { 
        try { content = await readTextFile(t.path); } catch (e) { content = ''; } 
    } else if (content === undefined || content === null) {
        content = '';
    }
    await createNewTab(t.path || null, content, t.isTodo, t.isDoc);
    const newT = state.tabs[state.tabs.length - 1];
    if (newT) {
        if (t.isTodo) newT.isTodo = true;
        if (t.isDoc) newT.isDoc = true;
        if (t.title) newT.title = t.title;
        if (t.manualLanguage) newT.manualLanguage = t.manualLanguage;
        if (t.path) {
            try { newT.lastModified = await invoke('get_file_modified', { path: t.path }); } catch (err) {}
            addToFileHistory(t.path);
        }
    }
}

async function restoreSessionTabs(tabs) {
    for (const t of tabs) {
        await restoreSingleTab(t);
    }
}

export async function loadExplicitSession() {
    if (!window.__TAURI__) return alert('Loading sessions is only supported in the app.');
    try {
        const selected = await openDialog({ filters: [{ name: 'LightPad Session', extensions: ['lpsession'] }] });
        if (selected) {
            const rawData = await readTextFile(selected);
            let sessionParams;
            try { sessionParams = JSON.parse(rawData); } catch (e) { return showStatus('Invalid or corrupted Session format'); }
            if (!sessionParams.tabs || !Array.isArray(sessionParams.tabs)) return showStatus('No valid tabs found in session file');
            if (state.tabs.length > 0) {
                let answer = await askConfirmUI('Close current tabs before loading the Workspace?', true);
                if (answer === 'yes') await closeMultipleTabs(state.tabs);
                else if (answer === 'cancel') return;
            }
            state.activeSessionPath = selected;
            await restoreSessionTabs(sessionParams.tabs);
            updateTitle();
            showStatus('Workspace loaded successfully');
        }
    } catch (e) { console.error(e); showStatus('Error loading session'); }
}


