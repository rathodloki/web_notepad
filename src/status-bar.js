// status-bar.js
import { state } from './state.js';
import { getFilename } from './utils.js';
import { appWindow } from './tauri-bridge.js';
import { supportedLanguages } from './overlays.js';

export function showStatus(msg, timeout = 3000) {
    const statusText = document.getElementById('status-text');
    if (!statusText) return;
    
    statusText.textContent = msg;
    if (timeout) {
        setTimeout(() => {
            if (statusText.textContent === msg) {
                statusText.textContent = 'Ready';
            }
        }, timeout);
    }
}

export function updateCursorStatus(view) {
    const statusCursor = document.getElementById('status-cursor');
    if (!statusCursor) return;
    
    const targetView = view || state.editorView;
    if (!targetView) {
        statusCursor.textContent = '';
        return;
    }

    const pos = targetView.state.selection.main.head;
    const line = targetView.state.doc.lineAt(pos);
    statusCursor.textContent = `Ln ${line.number}, Col ${pos - line.from + 1}`;
}

export function updateTitle() {
    const activeTab = state.tabs.find(t => t.id === state.activeTabId);
    let workspaceStr = state.activeSessionPath ? getFilename(state.activeSessionPath).replace('.lpsession', '') : 'Default';
    
    const statusWorkspace = document.getElementById('status-workspace');
    if (statusWorkspace) {
        statusWorkspace.textContent = `Workspace: ${workspaceStr}`;
        statusWorkspace.style.fontWeight = state.activeSessionPath ? '600' : '500';
    }

    if (!activeTab) {
        let text = `LightPad - [${workspaceStr}]`;
        if (appWindow) appWindow.setTitle(text);
        document.title = text;
        return;
    }
    const filename = getFilename(activeTab.path) || activeTab.title;
    const text = `${filename} - LightPad - [${workspaceStr}]`;
    if (appWindow) appWindow.setTitle(text);
    document.title = text;
}

export function updateLanguageStatus() {
    const statusLang = document.getElementById('status-language');
    if (!statusLang) return;

    const activeTab = state.tabs.find(t => t.id === state.activeTabId);
    if (!activeTab) {
        statusLang.textContent = 'Plain Text';
        return;
    }

    if (activeTab.isDoc) {
        statusLang.textContent = 'Rich Text';
        return;
    }

    if (activeTab.isTodo) {
        statusLang.textContent = 'Todo List';
        return;
    }

    const currentExt = activeTab.manualLanguage || activeTab.autoLanguage || '';
    
    // Default fallback
    let langName = 'Plain Text';
    
    // Find matching language from supportedLanguages
    const match = supportedLanguages.find(l => l.ext === currentExt);
    if (match) {
        langName = match.name;
    } else if (currentExt) {
        // If it's an extension not explicitly in the list but auto-detected (e.g., json, rs)
        // Capitalize the first letter
        langName = currentExt.charAt(0).toUpperCase() + currentExt.slice(1);
    }
    
    statusLang.textContent = langName;
}
