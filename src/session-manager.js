// session-manager.js — Workspace session save/load and menu wiring
import { state } from './state.js';
import { showStatus, updateTitle } from './status-bar.js';
import { readTextFile, writeTextFile, openDialog, saveDialog, invoke } from './tauri-bridge.js';
import { askConfirmUI } from './overlays.js';
import { closeMultipleTabs, createNewTab } from './editor-manager.js';
import { saveSession, loadSession } from './session.js';
import { addToFileHistory } from './history.js';
import { getFilename } from './utils.js';

async function saveExplicitSession() {
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

async function loadExplicitSession() {
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
            for (const t of sessionParams.tabs) {
                let content = t.content;
                if (content === null && t.path) { try { content = await readTextFile(t.path); } catch (e) { content = ''; } }
                else if (content === undefined || content === null) content = '';
                await createNewTab(t.path || null, content);
                const newT = state.tabs[state.tabs.length - 1];
                if (t.isTodo) newT.isTodo = true;
                if (t.isDoc) newT.isDoc = true;
                if (t.title) newT.title = t.title;
                if (t.manualLanguage) newT.manualLanguage = t.manualLanguage;
                if (t.path) {
                    try { newT.lastModified = await invoke('get_file_modified', { path: t.path }); } catch (err) {}
                    addToFileHistory(t.path);
                }
            }
            updateTitle();
            showStatus('Workspace loaded successfully');
        }
    } catch (e) { console.error(e); showStatus('Error loading session'); }
}

/**
 * Wire up the session manager dropdown menu.
 * Call once from DOMContentLoaded.
 */
export function setupSessionMenu() {
    const sessionManagerBtn = document.getElementById('btn-session-manager');
    const sessionMenu = document.getElementById('session-menu');
    if (!sessionManagerBtn || !sessionMenu) return;

    sessionManagerBtn.addEventListener('click', (e) => { e.stopPropagation(); sessionMenu.style.display = sessionMenu.style.display === 'block' ? 'none' : 'block'; });
    document.addEventListener('click', (e) => { if (!sessionManagerBtn.contains(e.target) && !sessionMenu.contains(e.target)) sessionMenu.style.display = 'none'; });
    document.getElementById('menu-session-save').addEventListener('click', async () => { sessionMenu.style.display = 'none'; await saveExplicitSession(); });
    document.getElementById('menu-session-load').addEventListener('click', async () => { sessionMenu.style.display = 'none'; await loadExplicitSession(); });
    document.getElementById('menu-session-set-default').addEventListener('click', async () => {
        sessionMenu.style.display = 'none';
        if (!state.activeSessionPath && state.isPrimaryInstance) return showStatus('Already using Default Session');
        state.isPrimaryInstance = true;
        state.activeSessionPath = null;
        saveSession();
        updateTitle();
        showStatus('Current tabs set to Default Session');
    });
    document.getElementById('menu-session-load-default').addEventListener('click', async () => {
        sessionMenu.style.display = 'none';
        if (state.tabs.length > 0) {
            let answer = await askConfirmUI('Close current tabs before reverting to Default Session?', true);
            if (answer === 'yes') await closeMultipleTabs(state.tabs);
            else if (answer === 'cancel') return;
        }
        state.activeSessionPath = null;
        state.isPrimaryInstance = true;
        loadSession();
        updateTitle();
        showStatus('Loaded Default Session');
    });
}
