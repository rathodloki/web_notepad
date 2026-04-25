// status-bar.js
import { state } from './state.js';
import { getFilename } from './utils.js';
import { appWindow } from './tauri-bridge.js';

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
    if (!view || !statusCursor) return;
    const pos = view.state.selection.main.head;
    const line = view.state.doc.lineAt(pos);
    statusCursor.textContent = `Ln ${line.number}, Col ${pos - line.from + 1}`;
}

export function updateTitle() {
    const activeTab = state.tabs.find(t => t.id === state.activeTabId);
    let workspaceStr = state.activeSessionPath ? getFilename(state.activeSessionPath).replace('.lpsession', '') : 'Default';
    
    const statusWorkspace = document.getElementById('status-workspace');
    if (statusWorkspace) {
        statusWorkspace.textContent = `Workspace: ${workspaceStr}`;
        statusWorkspace.style.color = state.activeSessionPath ? 'var(--accent)' : '';
    }

    if (!activeTab) {
        let text = `LightPad - [${workspaceStr}]`;
        if (appWindow) appWindow.setTitle(text);
        document.title = text;
        return;
    }
    const filename = getFilename(activeTab.path);
    const text = `${filename} - LightPad - [${workspaceStr}]`;
    if (appWindow) appWindow.setTitle(text);
    document.title = text;
}
