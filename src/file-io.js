import { state } from './state.js';
import { getFilename } from './utils.js';
import { renderTabs, updateActiveTabUI } from './tabs-ui.js';
import { updateTitle, showStatus } from './status-bar.js';
import { saveSessionDebounced } from './session.js';
import { switchTab, createNewTab, syncChannel } from './editor-manager.js';
import { askConfirmUI } from './overlays.js';
import { addToFileHistory, removeFromFileHistory } from './history.js';
import { invoke, readTextFile, writeTextFile, openDialog, saveDialog } from './tauri-bridge.js';

export async function openFile() {
    if (!window.__TAURI__) return alert('Opening files is only supported in the app.');
    try {
        const selected = await openDialog({
            filters: [{ name: 'All Files', extensions: ['*'] }]
        });

        if (selected) {
            const existingTab = state.tabs.find(t => t.path === selected);
            if (existingTab) {
                switchTab(existingTab.id);
                return;
            }

            const contents = await readTextFile(selected);
            await createNewTab(selected, contents);
            try {
                const newT = state.tabs[state.tabs.length - 1];
                if (newT) newT.lastModified = await invoke('get_file_modified', { path: selected });
            } catch(e){}

            addToFileHistory(selected);
            showStatus('File loaded');
        }
    } catch (e) {
        console.error(e);
        showStatus('Error opening file');
    }
}

export async function saveFile(returnResult = false) {
    if (!window.__TAURI__) {
        alert('Saving files is only supported in the app.');
        return returnResult ? false : undefined;
    }

    const tab = state.tabs.find(t => t.id === state.activeTabId);
    if (!tab) return returnResult ? false : undefined;

    try {
        let pathToSave = tab.path;
        if (!pathToSave) {
            let filters = [{ name: 'All Files', extensions: ['*'] }];
            if (tab.isTodo) {
                filters = [{ name: 'Todo Checklist', extensions: ['todo'] }];
            } else if (tab.isDoc) {
                filters = [{ name: 'Lightpad Document', extensions: ['doc'] }];
            }

            pathToSave = await saveDialog({
                filters: filters
            });
        }

        if (pathToSave) {
            let content = '';
            if (tab.isDoc) {
                if (state.quillView) {
                    content = state.quillView.root.innerHTML;
                } else {
                    content = tab.savedContent || '';
                }
            } else {
                content = state.editorView.state.doc.toString();
            }

            await writeTextFile(pathToSave, content);

            try {
                let mtime = await invoke('get_file_modified', { path: pathToSave });
                tab.lastModified = mtime;
                syncChannel.postMessage({ type: 'file_saved', path: pathToSave, content, mtime });
            } catch(e) {}

            tab.path = pathToSave;
            tab.isUnsaved = false;
            tab.savedContent = content;

            addToFileHistory(pathToSave);
            renderTabs();
            updateTitle();
            showStatus('Saved successfully');
            saveSessionDebounced();
            return returnResult ? true : undefined;
        } else {
            return returnResult ? false : undefined; // User cancelled OS save dialog
        }
    } catch (e) {
        console.error(e);
        showStatus('Error saving file');
        return returnResult ? false : undefined;
    }
}

export async function deleteActiveFile() {
    const tab = state.tabs.find(t => t.id === state.activeTabId);
    if (!tab) return;

    // Smart bypass: If the file was never actually written to disk, destroying it just closes the tab.
    if (!tab.path) {
        const { closeTab } = await import('./editor-manager.js');
        closeTab(tab.id, true);
        return;
    }

    let answer = await askConfirmUI(`Permanently delete "${getFilename(tab.path)}"?`, false);
    if (answer === 'yes') {
        if (tab.path && window.__TAURI__) {
            try {
                await window.__TAURI__.fs.removeFile(tab.path);
            } catch (e) {
                console.error("Failed to delete from disk", e);
                showStatus('Error deleting file');
            }
        }
        // Force close without unsaved changes prompt
        const { closeTab } = await import('./editor-manager.js');
        closeTab(tab.id, true);
    }
}

export async function openFileFromHistory(path) {
    if (window.closeQuickOpen) window.closeQuickOpen();

    // Check if already open open in a tab
    const existingTab = state.tabs.find(t => t.path === path);
    if (existingTab) {
        switchTab(existingTab.id);
        return;
    }

    if (!window.__TAURI__) return;
    try {
        const exists = await window.__TAURI__.fs.exists(path);
        if (!exists) {
            showStatus(`File no longer exists: ${getFilename(path)}`, 5000);
            removeFromFileHistory(path); // Auto-prune dead link
            return;
        }

        const contents = await readTextFile(path);
        await createNewTab(path, contents);
        try {
            const newT = state.tabs[state.tabs.length - 1];
            if (newT) newT.lastModified = await invoke('get_file_modified', { path: path });
        } catch(e){}
        
        showStatus('File loaded');
        // Push back to front
        addToFileHistory(path);
    } catch (e) {
        console.error(e);
        showStatus('Error opening file from history');
        removeFromFileHistory(path);
    }
}

export async function openDroppedPaths(paths) {
    for (const filePath of paths) {
        try {
            const existing = state.tabs.find(t => t.path === filePath);
            if (existing) { switchTab(existing.id); continue; }

            const content = await readTextFile(filePath);
            const name = getFilename(filePath);

            await createNewTab(filePath, content);
            try {
                const newlyCreatedTab = state.tabs[state.tabs.length - 1]; // Assume the new tab is appended to end
                newlyCreatedTab.lastModified = await invoke('get_file_modified', { path: filePath });
            } catch(e) {}

            addToFileHistory(filePath);
            showStatus(`Opened: ${name}`);
        } catch (err) {
            console.error('Error opening dropped file:', err);
            showStatus(`Error opening: ${getFilename(filePath)}`);
        }
    }
}
