// main.js — Application entry point (orchestrator)
import { state } from './state.js';

if (window.__lightpadHarness) {
    window.__lightpadHarness.state = state;
}
import { undo, redo } from "@codemirror/commands";
import './quill-init.js';

// Static imports to keep UI interactions synchronous and responsive
import { createNewTab, switchTab, closeTab, closeMultipleTabs, closedTabsHistory, spawnTodoList, spawnDocProcess, handleExternalFileChange, toggleGameView } from './editor-manager.js';
import { renameActiveFile, deleteActiveFile, openFile, saveFile } from './file-io.js';
import { toggleQuickOpen, toggleGlobalSearch, handleGlobalKeyboard, setupOverlays, setupFileDrop } from './overlays.js';
import { setupSettingsMenu, toggleWordWrap } from './settings-manager.js';
import { setupMusicPlayer } from './music-manager.js';
import { showStatus, updateCursorStatus, updateLanguageStatus } from './status-bar.js';
import { invoke } from './tauri-bridge.js';
import { loadFileHistory } from './history.js';
import { setupWindowManager } from './window-manager.js';
import { loadSession } from './session.js';
import { updateScrollShadows } from './tabs-ui.js';

/* ── Toggle helpers ─────────────────────────────────────────────── */

/* ── Markdown preview ───────────────────────────────────────────── */

function renderMarkdownPreview(content = null) {
    if (!state.isMarkdownPreviewEnabled) return;
    const preview = document.getElementById('markdown-preview');
    if (!preview) return;
    let text = content;
    if (text === null) {
        text = state.editorView ? state.editorView.state.doc.toString() : '';
    }
    try {
        preview.innerHTML = DOMPurify.sanitize(marked.parse(text));
    } catch (e) {
        console.error("Markdown parsing failed", e);
    }
}
window.renderMarkdownPreview = renderMarkdownPreview;
state.renderMarkdownPreview = renderMarkdownPreview;

/* ── Keyboard shortcuts ─────────────────────────────────────────── */

function shiftActiveTab(offset) {
    if (state.tabs.length > 1) {
        const ci = state.tabs.findIndex(t => t.id === state.activeTabId);
        const ni = (Math.max(0, ci) + offset + state.tabs.length) % state.tabs.length;
        switchTab(state.tabs[ni].id);
    }
}

function handleTabNavigation(e) {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Tab') {
        e.preventDefault();
        shiftActiveTab(e.shiftKey ? -1 : 1);
        return true;
    }
    if (e.altKey && !e.ctrlKey && !e.metaKey) {
        if (e.key === 'ArrowRight') {
            e.preventDefault();
            shiftActiveTab(1);
            return true;
        }
        if (e.key === 'ArrowLeft') {
            e.preventDefault();
            shiftActiveTab(-1);
            return true;
        }
    }
    return false;
}

function handleFileShortcuts(e) {
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 's') { 
        e.preventDefault(); 
        saveFile(); 
        return true; 
    }
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'o') { 
        e.preventDefault(); 
        openFile(); 
        return true; 
    }
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'w') { 
        e.preventDefault(); 
        closeMultipleTabs([...state.tabs]); 
        return true; 
    }
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'w') { 
        e.preventDefault(); 
        if (state.activeTabId) {
            closeTab(state.activeTabId); 
        }
        return true; 
    }
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 't') {
        e.preventDefault();
        if (closedTabsHistory.length > 0) {
            document.getElementById('menu-undo-close')?.click();
        } else {
            showStatus('No recently closed tabs');
        }
        return true;
    }
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'n') { 
        e.preventDefault(); 
        createNewTab(); 
        return true; 
    }
    return false;
}

function handleToggleAndSpawnShortcuts(e) {
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 't') { 
        e.preventDefault(); 
        toggleQuickOpen(); 
        return true; 
    }
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'f') { 
        e.preventDefault(); 
        toggleGlobalSearch(); 
        return true; 
    }
    if ((e.ctrlKey || e.metaKey) && e.key === '1') { 
        e.preventDefault(); 
        spawnTodoList(); 
        return true; 
    }
    if ((e.ctrlKey || e.metaKey) && e.key === '2') { 
        e.preventDefault(); 
        spawnDocProcess(); 
        return true; 
    }
    if ((e.ctrlKey || e.metaKey) && e.key === '3') { 
        e.preventDefault(); 
        toggleGameView(); 
        return true; 
    }
    if (e.altKey && e.key.toLowerCase() === 'z') { 
        e.preventDefault(); 
        toggleWordWrap(); 
        return true; 
    }
    return false;
}

window.addEventListener('keydown', (e) => {
    if (handleTabNavigation(e)) return;
    if (handleFileShortcuts(e)) return;
    if (handleToggleAndSpawnShortcuts(e)) return;

    // Delegate Modal/Menu navigation to overlays.js
    handleGlobalKeyboard(e);
});

/* ── DOMContentLoaded — wire everything ─────────────────────────── */

window.addEventListener('DOMContentLoaded', () => {
    const appWindow = window.__TAURI__?.window?.appWindow;

    if (window.__TAURI__) {
        // Window management (size, position, titlebar)
        setupWindowManager(appWindow);

        // External file modification check on focus
        window.addEventListener('focus', async () => {
            if (!window.__TAURI__) return;
            for (let tab of state.tabs) {
                if (tab.path && !tab.isUnsaved) {
                    try {
                        let mtime = await invoke('get_file_modified', { path: tab.path });
                        if (tab.lastModified && mtime > tab.lastModified) handleExternalFileChange(tab.path, mtime);
                    } catch (e) {}
                }
            }
        });

        // Primary instance lock
        navigator.locks.request('lightpad-primary-instance', { mode: 'exclusive', ifAvailable: true }, (lock) => {
            if (lock) { 
                state.isPrimaryInstance = true; 
                loadSession(); 
                return new Promise(() => {}); 
            } else {
                console.log("Secondary instance started, opening blank slate.");
            }
        });

        // File drop
        setupFileDrop();
    } else {
        console.warn("Tauri API not found. Running in browser mode.");
        loadSession();
    }

    loadFileHistory();

    // Toolbar buttons
    document.getElementById('btn-open').addEventListener('click', () => {
        openFile();
    });
    document.getElementById('btn-save').addEventListener('click', () => {
        saveFile();
    });
    document.getElementById('btn-find').addEventListener('click', () => {
        if (state.editorView) {
            import('@codemirror/search').then(({ openSearchPanel }) => openSearchPanel(state.editorView));
        }
    });
    document.getElementById('btn-undo')?.addEventListener('click', () => {
        const activeTab = state.tabs.find(t => t.id === state.activeTabId);
        if (activeTab?.isDoc && state.quillView) {
            state.quillView.history.undo();
        } else if (state.editorView) {
            undo(state.editorView);
            state.editorView.focus();
        }
    });
    document.getElementById('btn-redo')?.addEventListener('click', () => {
        const activeTab = state.tabs.find(t => t.id === state.activeTabId);
        if (activeTab?.isDoc && state.quillView) {
            state.quillView.history.redo();
        } else if (state.editorView) {
            redo(state.editorView);
            state.editorView.focus();
        }
    });
    document.getElementById('btn-move')?.addEventListener('click', () => {
        renameActiveFile();
    });
    document.getElementById('btn-delete')?.addEventListener('click', () => {
        deleteActiveFile();
    });
    document.getElementById('btn-quick-open')?.addEventListener('click', () => {
        toggleQuickOpen();
    });
    document.getElementById('btn-new-tab')?.addEventListener('click', () => {
        createNewTab();
    });
    document.getElementById('btn-todo')?.addEventListener('click', () => {
        spawnTodoList();
    });
    document.getElementById('btn-doc')?.addEventListener('click', () => {
        spawnDocProcess();
    });
    document.getElementById('btn-game')?.addEventListener('click', () => {
        toggleGameView();
    });
    document.getElementById('btn-open-url')?.addEventListener('click', () => {
        document.getElementById('open-url-modal').style.display = 'flex';
        document.getElementById('open-url-input').focus();
    });

    // Open URL Modal logic
    document.getElementById('btn-cancel-url')?.addEventListener('click', () => {
        document.getElementById('open-url-modal').style.display = 'none';
        document.getElementById('open-url-input').value = '';
    });
    document.getElementById('btn-confirm-url')?.addEventListener('click', async () => {
        const url = document.getElementById('open-url-input').value.trim();
        if (url) {
            try {
                showStatus('Fetching...');
                const content = await invoke('fetch_url', { url });
                await createNewTab(null, content);
                
                // Get the newly created tab
                const newTab = state.tabs[state.tabs.length - 1];
                if (newTab) {
                    const filename = url.split('/').pop().split('?')[0] || url;
                    newTab.customTitle = filename;
                    newTab.title = filename;
                    const { renderTabs } = await import('./tabs-ui.js');
                    renderTabs();
                }

                document.getElementById('open-url-modal').style.display = 'none';
                document.getElementById('open-url-input').value = '';
                showStatus('Fetched successfully');
            } catch (e) {
                console.error(e);
                showStatus('Error fetching URL: ' + e);
            }
        }
    });

    // Tab bar double-click to create new tab
    const tabBarContainer = document.querySelector('.tab-bar-container');
    if (tabBarContainer) {
        const tabBar = document.getElementById('tab-bar');
        tabBarContainer.addEventListener('dblclick', (e) => {
            if (e.target === tabBarContainer || e.target === tabBar) {
                createNewTab();
            }
        });
    }

    // Extracted module setups
    setupSettingsMenu();
    setupMusicPlayer();

    // Context menu
    document.addEventListener('click', () => {
        const tabMenu = document.getElementById('tab-context-menu');
        if (tabMenu) tabMenu.style.display = 'none';
        const musicMenu = document.getElementById('music-context-menu');
        if (musicMenu) musicMenu.style.display = 'none';
    });
    document.getElementById('menu-close-all')?.addEventListener('click', () => {
        closeMultipleTabs([...state.tabs]);
    });
    document.getElementById('menu-close-others')?.addEventListener('click', () => {
        if (!state.contextMenuTargetId) return;
        closeMultipleTabs(state.tabs.filter(t => t.id !== state.contextMenuTargetId));
    });
    document.getElementById('menu-close-right')?.addEventListener('click', () => {
        if (!state.contextMenuTargetId) return;
        const ti = state.tabs.findIndex(t => t.id === state.contextMenuTargetId);
        if (ti !== -1) closeMultipleTabs(state.tabs.slice(ti + 1));
    });
    document.getElementById('menu-close-saved')?.addEventListener('click', () => {
        closeMultipleTabs(state.tabs.filter(t => !t.isUnsaved));
    });
    document.getElementById('menu-undo-close')?.addEventListener('click', async () => {
        if (closedTabsHistory.length > 0) {
            state.isRestoringTab = true;
            const batch = closedTabsHistory.pop();
            for (let i = batch.length - 1; i >= 0; i--) {
                const info = batch[i];
                await createNewTab(info.path || null, info.content || '', info.isTodo, info.isDoc);
                const newTab = state.tabs[state.tabs.length - 1];
                if (info.isTodo) newTab.isTodo = true;
                if (info.isDoc) newTab.isDoc = true;
                if (info.title) newTab.title = info.title;
                if (info.manualLanguage) newTab.manualLanguage = info.manualLanguage;
            }
            showStatus(batch.length > 1 ? `Restored ${batch.length} tabs` : 'Tab restored');
            state.isRestoringTab = false;
        } else {
            showStatus('No recently closed tabs');
        }
    });

    // Setup overlays (quick-open, language, global search event listeners)
    setupOverlays();

    // Resize shadows
    window.addEventListener('resize', () => {
        updateScrollShadows();
    });
});

