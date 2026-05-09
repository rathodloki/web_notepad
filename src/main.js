// main.js — Application entry point (orchestrator)
import { state } from './state.js';
import { toggleLineWrapping, applyLineWrappingToState } from './editor.js';
import { switchTab, createNewTab, closeTab, closeMultipleTabs, spawnTodoList, spawnDocProcess, closedTabsHistory, createEditorStateFromContent } from './editor-manager.js';
import { openFile, saveFile, deleteActiveFile } from './file-io.js';
import { saveSession, loadSession, saveSessionDebounced } from './session.js';
import { renderTabs } from './tabs-ui.js';
import { showStatus, updateCursorStatus, updateTitle } from './status-bar.js';
import { loadFileHistory, addToFileHistory } from './history.js';
import { toggleQuickOpen, closeQuickOpen, toggleGlobalSearch, closeGlobalSearch, toggleLanguageOpen, closeLanguageOpen as closeLanguageModal, setupOverlays, setupFileDrop, askConfirmUI } from './overlays.js';
import { getLanguageExtension, createEditorState, detectLanguageFromContent } from './editor.js';
import { invoke, readTextFile, writeTextFile, openDialog, saveDialog } from './tauri-bridge.js';
import { getFilename } from './utils.js';
import { setupTextFormatMenu } from './text-format.js';
import { setupSessionMenu } from './session-manager.js';
import { setupWindowManager } from './window-manager.js';
import './quill-init.js';

/* ── Toggle helpers ─────────────────────────────────────────────── */

function toggleAutoSave() {
    state.isAutoSaveEnabled = !state.isAutoSaveEnabled;
    localStorage.setItem('lightpad-autosave', state.isAutoSaveEnabled.toString());
    updateAutoSaveUI();
    showStatus(state.isAutoSaveEnabled ? 'Auto-Save Enabled' : 'Auto-Save Disabled');
    if (state.isAutoSaveEnabled) {
        state.tabs.forEach(tab => {
            if (tab.isUnsaved && tab.path) {
                import('./session.js').then(m => m.autoSaveDiskDebounced(tab, 0));
            }
        });
    }
}

function updateAutoSaveUI() {
    const btn = document.getElementById('btn-auto-save');
    const statusEl = document.getElementById('status-autosave');
    if (btn) {
        if (state.isAutoSaveEnabled) btn.classList.add('active');
        else btn.classList.remove('active');
    }
    if (statusEl) {
        statusEl.textContent = state.isAutoSaveEnabled ? 'Auto-Save: ON' : 'Auto-Save: OFF';
    }
}

function toggleWordWrap() {
    state.isWordWrapEnabled = !state.isWordWrapEnabled;
    localStorage.setItem('lightpad-wordwrap', state.isWordWrapEnabled.toString());
    const btn = document.getElementById('btn-wordwrap');
    if (btn) {
        if (state.isWordWrapEnabled) btn.classList.add('active');
        else btn.classList.remove('active');
    }
    state.tabs.forEach(tab => {
        if (!tab.isDoc && tab.state) {
            tab.state = applyLineWrappingToState(tab.state, state.isWordWrapEnabled);
        }
    });
    if (state.editorView) toggleLineWrapping(state.editorView, state.isWordWrapEnabled);
}

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

window.addEventListener('keydown', async (e) => {
    // Ctrl+Tab / Ctrl+Shift+Tab
    if ((e.ctrlKey || e.metaKey) && e.key === 'Tab') {
        e.preventDefault();
        if (state.tabs.length > 1) {
            const ci = state.tabs.findIndex(t => t.id === state.activeTabId);
            const ni = e.shiftKey
                ? (Math.max(0, ci) - 1 + state.tabs.length) % state.tabs.length
                : (Math.max(0, ci) + 1) % state.tabs.length;
            switchTab(state.tabs[ni].id);
        }
        return;
    }
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 's') { e.preventDefault(); await saveFile(); }
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'o') { e.preventDefault(); await openFile(); }
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'w') { e.preventDefault(); await closeMultipleTabs([...state.tabs]); return; }
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'w') { e.preventDefault(); if (state.activeTabId) await closeTab(state.activeTabId); return; }
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 't') {
        e.preventDefault();
        if (closedTabsHistory.length > 0) document.getElementById('menu-undo-close')?.click();
        else showStatus('No recently closed tabs');
        return;
    }
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'n') { e.preventDefault(); await createNewTab(); return; }
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 't') { e.preventDefault(); toggleQuickOpen(); return; }
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'f') { e.preventDefault(); toggleGlobalSearch(); }
    if ((e.ctrlKey || e.metaKey) && e.key === '1') { e.preventDefault(); spawnTodoList(); }
    if ((e.ctrlKey || e.metaKey) && e.key === '2') { e.preventDefault(); spawnDocProcess(); }
    if (e.altKey && e.key.toLowerCase() === 'z') { e.preventDefault(); toggleWordWrap(); }

    /* ── Unified popup/menu keyboard navigation ─────────────────── */

    // 1) Context menus & dropdown menus (ArrowUp/Down, Enter, Escape)
    const openMenu = document.querySelector('.context-menu[style*="display: block"]');
    if (openMenu) {
        const items = Array.from(openMenu.querySelectorAll('.menu-item:not(.divider)'));
        if (items.length === 0) return;
        const activeItem = openMenu.querySelector('.menu-item.kb-active');
        let ci = activeItem ? items.indexOf(activeItem) : -1;

        if (e.key === 'Escape') {
            e.preventDefault();
            openMenu.style.display = 'none';
            items.forEach(el => el.classList.remove('kb-active'));
            return;
        }
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            items.forEach(el => el.classList.remove('kb-active'));
            const ni = ci + 1 >= items.length ? 0 : ci + 1;
            items[ni].classList.add('kb-active');
            items[ni].scrollIntoView({ block: 'nearest' });
            return;
        }
        if (e.key === 'ArrowUp') {
            e.preventDefault();
            items.forEach(el => el.classList.remove('kb-active'));
            const ni = ci - 1 < 0 ? items.length - 1 : ci - 1;
            items[ni].classList.add('kb-active');
            items[ni].scrollIntoView({ block: 'nearest' });
            return;
        }
        if (e.key === 'Enter' && ci !== -1) {
            e.preventDefault();
            items[ci].click();
            openMenu.style.display = 'none';
            items.forEach(el => el.classList.remove('kb-active'));
            return;
        }
        return; // Absorb other keys while menu is open
    }

    // 2) Modal overlays (discard, link, quick-open, language, global search, open-url)
    const modals = [
        'discard-modal',
        'link-modal',
        'quick-open-modal',
        'language-modal',
        'global-search-modal',
        'open-url-modal'
    ];
    const activeModal = modals.map(id => document.getElementById(id)).find(el => el && el.style.display !== 'none');
    if (activeModal) {
        if (e.key === 'Escape') {
            if (activeModal.id === 'discard-modal') document.getElementById('modal-btn-cancel')?.click();
            else if (activeModal.id === 'link-modal') document.getElementById('link-modal-cancel')?.click();
            else if (activeModal.id === 'quick-open-modal') closeQuickOpen();
            else if (activeModal.id === 'language-modal') closeLanguageModal();
            else if (activeModal.id === 'global-search-modal') closeGlobalSearch();
            else if (activeModal.id === 'open-url-modal') document.getElementById('btn-cancel-url')?.click();
            return;
        }

        // General Modal Keyboard Navigation (Discard, Link, Open URL)
        if (activeModal.id === 'discard-modal' || activeModal.id === 'link-modal' || activeModal.id === 'open-url-modal') {
            const focusables = Array.from(activeModal.querySelectorAll('button, input'))
                .filter(el => window.getComputedStyle(el).display !== 'none');

            // Handle Enter to submit (clicks primary button) when an input is focused
            if (e.key === 'Enter') {
                if (document.activeElement && document.activeElement.tagName === 'INPUT') {
                    const primaryBtn = activeModal.querySelector('.modal-btn.primary') || activeModal.querySelector('#modal-btn-yes');
                    if (primaryBtn) {
                        e.preventDefault();
                        primaryBtn.click();
                        return;
                    }
                }
            }

            if (focusables.length > 0) {
                const fi = focusables.indexOf(document.activeElement);
                if (e.key === 'ArrowRight' || (e.key === 'Tab' && !e.shiftKey)) {
                    e.preventDefault();
                    const ni = fi + 1 >= focusables.length ? 0 : fi + 1;
                    focusables[ni].focus();
                    return;
                }
                if (e.key === 'ArrowLeft' || (e.key === 'Tab' && e.shiftKey)) {
                    e.preventDefault();
                    const ni = fi - 1 < 0 ? focusables.length - 1 : fi - 1;
                    focusables[ni].focus();
                    return;
                }
            }
        }

        // Global search results: ArrowUp/Down to navigate result items
        if (activeModal.id === 'global-search-modal') {
            const resultsContainer = document.getElementById('global-search-results');
            if (resultsContainer && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
                const resultItems = Array.from(resultsContainer.querySelectorAll('.gs-result-item'));
                if (resultItems.length > 0) {
                    const activeResult = resultsContainer.querySelector('.gs-result-item.kb-active');
                    let ri = activeResult ? resultItems.indexOf(activeResult) : -1;
                    resultItems.forEach(el => el.classList.remove('kb-active'));
                    if (e.key === 'ArrowDown') {
                        e.preventDefault();
                        ri = ri + 1 >= resultItems.length ? 0 : ri + 1;
                    } else {
                        e.preventDefault();
                        ri = ri - 1 < 0 ? resultItems.length - 1 : ri - 1;
                    }
                    resultItems[ri].classList.add('kb-active');
                    resultItems[ri].scrollIntoView({ block: 'nearest' });
                    return;
                }
            }
            if (e.key === 'Enter') {
                const activeResult = document.querySelector('#global-search-results .gs-result-item.kb-active');
                if (activeResult) { e.preventDefault(); activeResult.click(); return; }
            }
        }
    }
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
            const { handleExternalFileChange } = await import('./editor-manager.js');
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
        navigator.locks.request('lightpad-primary-instance', { mode: 'exclusive', ifAvailable: true }, async (lock) => {
            if (lock) { state.isPrimaryInstance = true; loadSession(); return new Promise(() => {}); }
            else console.log("Secondary instance started, opening blank slate.");
        });

        // File drop
        setupFileDrop();
    } else {
        console.warn("Tauri API not found. Running in browser mode.");
        loadSession();
    }

    loadFileHistory();

    // Toolbar buttons
    document.getElementById('btn-open').addEventListener('click', openFile);
    document.getElementById('btn-save').addEventListener('click', saveFile);
    document.getElementById('btn-find').addEventListener('click', () => {
        if (state.editorView) import('@codemirror/search').then(({ openSearchPanel }) => openSearchPanel(state.editorView));
    });
    document.getElementById('btn-delete')?.addEventListener('click', deleteActiveFile);
    document.getElementById('btn-quick-open')?.addEventListener('click', toggleQuickOpen);
    document.getElementById('btn-new-tab')?.addEventListener('click', async () => await createNewTab());
    document.getElementById('btn-todo')?.addEventListener('click', spawnTodoList);
    document.getElementById('btn-doc')?.addEventListener('click', spawnDocProcess);
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

    // Word wrap
    const wordWrapBtn = document.getElementById('btn-wordwrap');
    if (wordWrapBtn) {
        if (state.isWordWrapEnabled) wordWrapBtn.classList.add('active');
        wordWrapBtn.addEventListener('click', toggleWordWrap);
    }

    // Auto-save
    const autoSaveBtn = document.getElementById('btn-auto-save');
    if (autoSaveBtn) {
        autoSaveBtn.addEventListener('click', toggleAutoSave);
        updateAutoSaveUI();
    }

    // Markdown preview
    const markdownBtn = document.getElementById('btn-markdown');
    if (markdownBtn) {
        markdownBtn.addEventListener('click', () => {
            state.isMarkdownPreviewEnabled = !state.isMarkdownPreviewEnabled;
            const preview = document.getElementById('markdown-preview');
            if (state.isMarkdownPreviewEnabled) { preview.style.display = 'block'; markdownBtn.classList.add('active'); renderMarkdownPreview(); }
            else { preview.style.display = 'none'; markdownBtn.classList.remove('active'); }
        });
    }

    // Tab bar double-click to create new tab
    const tabBarContainer = document.querySelector('.tab-bar-container');
    if (tabBarContainer) {
        const tabBar = document.getElementById('tab-bar');
        tabBarContainer.addEventListener('dblclick', (e) => {
            if (e.target === tabBarContainer || e.target === tabBar) createNewTab();
        });
    }

    // Extracted module setups
    setupTextFormatMenu();
    setupSessionMenu();

    // Context menu
    document.addEventListener('click', () => { const menu = document.getElementById('tab-context-menu'); if (menu) menu.style.display = 'none'; });
    document.getElementById('menu-close-all')?.addEventListener('click', async () => await closeMultipleTabs([...state.tabs]));
    document.getElementById('menu-close-others')?.addEventListener('click', async () => {
        if (!state.contextMenuTargetId) return;
        await closeMultipleTabs(state.tabs.filter(t => t.id !== state.contextMenuTargetId));
    });
    document.getElementById('menu-close-right')?.addEventListener('click', async () => {
        if (!state.contextMenuTargetId) return;
        const ti = state.tabs.findIndex(t => t.id === state.contextMenuTargetId);
        if (ti !== -1) await closeMultipleTabs(state.tabs.slice(ti + 1));
    });
    document.getElementById('menu-close-saved')?.addEventListener('click', async () => await closeMultipleTabs(state.tabs.filter(t => !t.isUnsaved)));
    document.getElementById('menu-undo-close')?.addEventListener('click', async () => {
        if (closedTabsHistory.length > 0) {
            state.isRestoringTab = true;
            const batch = closedTabsHistory.pop();
            for (let i = batch.length - 1; i >= 0; i--) {
                const info = batch[i];
                await createNewTab(info.path || null, info.content || '');
                const newTab = state.tabs[state.tabs.length - 1];
                if (info.isTodo) newTab.isTodo = true;
                if (info.isDoc) newTab.isDoc = true;
                if (info.title) newTab.title = info.title;
                if (info.manualLanguage) newTab.manualLanguage = info.manualLanguage;
            }
            showStatus(batch.length > 1 ? `Restored ${batch.length} tabs` : 'Tab restored');
            state.isRestoringTab = false;
        } else showStatus('No recently closed tabs');
    });

    // Setup overlays (quick-open, language, global search event listeners)
    setupOverlays();

    // Resize shadows
    window.addEventListener('resize', () => {
        import('./tabs-ui.js').then(m => m.updateScrollShadows());
    });
});
