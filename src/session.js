import { state } from './state.js';
import { invoke, writeTextFile, readTextFile } from './tauri-bridge.js';
import { renderTabs } from './tabs-ui.js';
import { showStatus } from './status-bar.js';
import { removeFromFileHistory } from './history.js';
import { getFilename } from './utils.js';
// editor-manager imports are deferred to avoid circular dependency
// switchTab, createEditorStateFromContent, syncChannel imported dynamically

export function saveSessionDebounced() {
    if (state.sessionTimeout) clearTimeout(state.sessionTimeout);
    state.sessionTimeout = setTimeout(() => {
        saveSession();
    }, 1000);
}

export function autoSaveDiskDebounced(tab, delay = 2000) {
    if (!state.isAutoSaveEnabled) return;
    if (!tab.path || !window.__TAURI__) return;

    if (tab.autoSaveTimeout) clearTimeout(tab.autoSaveTimeout);
    tab.autoSaveTimeout = setTimeout(async () => {
        try {
            let content = '';
            if (tab.isDoc) {
                if (state.quillView && state.activeTabId === tab.id) {
                    content = state.quillView.root.innerHTML;
                } else {
                    content = tab.savedContent || '';
                }
            } else {
                if (state.editorView && state.activeTabId === tab.id) {
                    content = state.editorView.state.doc.toString();
                } else {
                    content = tab.state.doc.toString();
                }
            }
            await writeTextFile(tab.path, content);
            try {
                let mtime = await invoke('get_file_modified', { path: tab.path });
                tab.lastModified = mtime;
                const { syncChannel } = await import('./editor-manager.js');
                syncChannel.postMessage({ type: 'file_saved', path: tab.path, content, mtime });
            } catch (e) {}
            tab.isUnsaved = false;
            tab.savedContent = content;
            renderTabs();
            // TODO: dispatch event to update Title
        } catch (e) {
            console.error("Autosave failed", e);
        }
    }, delay);
}

export async function saveSession() {
    let activeDocContent = null;
    const activeTab = state.tabs.find(t => t.id === state.activeTabId);
    if (activeTab && activeTab.isDoc && state.quillView) {
        try {
            activeDocContent = state.quillView.root.innerHTML;
            activeTab.savedContent = activeDocContent;
        } catch (e) {
            console.error("QuillJS save failed", e);
        }
    }

    const sessionTabs = state.tabs.map(tab => {
        let content = null;
        if (tab.isDoc) {
            content = (tab.id === state.activeTabId && activeDocContent !== null) ? activeDocContent : tab.savedContent;
        } else {
            content = (tab.id === state.activeTabId && state.editorView)
                ? state.editorView.state.doc.toString()
                : tab.state.doc.toString();
        }

        return {
            id: tab.id,
            path: tab.path,
            title: tab.title,
            isUnsaved: tab.isUnsaved,
            isTodo: tab.isTodo,
            isDoc: tab.isDoc,
            manualLanguage: tab.manualLanguage,
            autoLanguage: tab.autoLanguage,
            content: tab.isUnsaved || !tab.path ? content : null
        };
    });

    let cursorPos = 0;
    if (state.editorView && !activeTab?.isDoc) {
        cursorPos = state.editorView.state.selection.main.head;
    }

    let sessionStateStr = JSON.stringify({
        tabs: sessionTabs,
        activeTabId: state.activeTabId,
        cursorPos
    });

    if (state.activeSessionPath && window.__TAURI__) {
        try {
            const sessionData = JSON.stringify({ tabs: sessionTabs, version: 1 }, null, 2);
            window.__TAURI__.fs.writeTextFile(state.activeSessionPath, sessionData).catch(()=>{});
        } catch (e) {}
    } else {
        if (state.isPrimaryInstance || !window.__TAURI__) {
            localStorage.setItem('lightpad-session', sessionStateStr);
        }
    }
}

export async function loadSession() {
    const { switchTab, createEditorStateFromContent } = await import('./editor-manager.js');
    const sessionJson = localStorage.getItem('lightpad-session');
    if (!sessionJson) {
        switchTab(null);
        return;
    }

    try {
        const session = JSON.parse(sessionJson);
        const validTabs = session.tabs || [];
        const tabsToRestore = validTabs.filter(t => t.path !== null || (t.content !== "" && t.content !== null));

        if (tabsToRestore.length === 0) {
            switchTab(null);
            return;
        }

        for (const t of tabsToRestore) {
            let content = t.content;
            let savedContent = null;
            if (content === null && t.path && window.__TAURI__) {
                try {
                    content = await readTextFile(t.path);
                    savedContent = content;
                    try { t.lastModified = await invoke('get_file_modified', { path: t.path }); } catch (e) {}
                } catch (e) {
                    console.warn(`File previously opened is missing or inaccessible: ${t.path}`, e);
                    content = t.content || "";
                    t.isUnsaved = true;
                    setTimeout(() => showStatus(`Error: Could not load ${getFilename(t.path)}`, 5000), 1000);
                }
            } else if (t.path && window.__TAURI__ && t.isUnsaved) {
                try {
                    savedContent = await readTextFile(t.path);
                    try { t.lastModified = await invoke('get_file_modified', { path: t.path }); } catch (e) {}
                } catch (e) {}
            } else if (!t.path && t.isDoc) {
                savedContent = (t.content !== undefined && t.content !== null) ? t.content : '';
                content = savedContent;
            } else if (!t.path && !t.isUnsaved) {
                savedContent = content || '';
            }

            if (t.path && savedContent === null && t.isUnsaved) {
                removeFromFileHistory(t.path);
            }

            const num = parseInt(t.id.split('-')[1]);
            if (num > state.tabCounter) state.tabCounter = num;

            const isTodo = t.isTodo || (t.path && t.path.endsWith('.todo'));
            const isDoc = t.isDoc || (t.path && t.path.endsWith('.doc'));

            const editorState = await createEditorStateFromContent(t.path, content, isTodo, isDoc, t.manualLanguage, t.id);

            const newTab = {
                id: t.id,
                path: t.path,
                title: t.title,
                isUnsaved: t.isUnsaved,
                isTodo: isTodo,
                isDoc: isDoc,
                savedContent: savedContent,
                manualLanguage: t.manualLanguage || null,
                autoLanguage: t.autoLanguage || null,
                state: editorState
            };
            state.tabs.push(newTab);
        }

        renderTabs();

        if (session.activeTabId && state.tabs.find(t => t.id === session.activeTabId)) {
            switchTab(session.activeTabId);
        } else {
            switchTab(state.tabs[0].id);
        }

        if (session.cursorPos && state.editorView) {
            const docLength = state.editorView.state.doc.length;
            const safePos = Math.min(session.cursorPos, docLength);
            state.editorView.dispatch({ selection: { anchor: safePos, head: safePos } });
        }
    } catch (e) {
        console.error("Failed to load session", e);
        showStatus("Err: " + e.message);
        switchTab(null);
    }
}
