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

    // 2) Modal overlays (discard, link, quick-open, language, global search)
    const activeModal = document.querySelector('.modal-overlay[style*="display: flex"], .modal-overlay[style*="display: block"]');
    if (activeModal) {
        if (e.key === 'Escape') {
            if (activeModal.id === 'discard-modal') { /* buttons handle their own cleanup */ }
            else if (activeModal.id === 'link-modal') { activeModal.style.display = 'none'; if (state.quillView) state.quillView.focus(); }
            else if (activeModal.id === 'quick-open-modal') closeQuickOpen();
            else if (activeModal.id === 'global-search-modal') closeGlobalSearch();
            else if (activeModal.id === 'language-modal') closeLanguageModal();
            return;
        }

        // Discard/Link modal: ArrowLeft/Right to navigate between visible buttons
        if (activeModal.id === 'discard-modal' || activeModal.id === 'link-modal') {
            const buttons = Array.from(activeModal.querySelectorAll('button, input'))
                .filter(el => window.getComputedStyle(el).display !== 'none');
            if (buttons.length > 0) {
                const fi = buttons.indexOf(document.activeElement);
                if (e.key === 'ArrowRight' || e.key === 'Tab') {
                    e.preventDefault();
                    const ni = fi + 1 >= buttons.length ? 0 : fi + 1;
                    buttons[ni].focus();
                    return;
                }
                if (e.key === 'ArrowLeft' || (e.key === 'Tab' && e.shiftKey)) {
                    e.preventDefault();
                    const ni = fi - 1 < 0 ? buttons.length - 1 : fi - 1;
                    buttons[ni].focus();
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

/* ── Text format menu helper ────────────────────────────────────── */

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

/* ── Session manager helpers ────────────────────────────────────── */

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

/* ── DOMContentLoaded — wire everything ─────────────────────────── */

window.addEventListener('DOMContentLoaded', () => {
    const appWindow = window.__TAURI__?.window?.appWindow;

    if (window.__TAURI__) {
        // Version display
        if (window.__TAURI__.app) {
            window.__TAURI__.app.getVersion().then(v => {
                const el = document.getElementById('status-version');
                if (el) el.textContent = 'v' + v;
            }).catch(() => {});
        }

        // Window size/position restore
        requestAnimationFrame(() => {
            setTimeout(async () => {
                const { LogicalSize, PhysicalSize, PhysicalPosition } = window.__TAURI__.window;
                await appWindow.setMinSize(new LogicalSize(400, 300));
                try {
                    const stateStr = localStorage.getItem('lightpad-window');
                    if (stateStr) {
                        const ws = JSON.parse(stateStr);
                        if (ws.width >= 400 && ws.height >= 300) await appWindow.setSize(new PhysicalSize(ws.width, ws.height));
                        else await appWindow.setSize(new LogicalSize(900, 650));
                        if (ws.x !== undefined && ws.y !== undefined) await appWindow.setPosition(new PhysicalPosition(ws.x, ws.y));
                        else await appWindow.center();
                        if (ws.maximized) await appWindow.maximize();
                    } else { await appWindow.setSize(new LogicalSize(900, 650)); await appWindow.center(); }
                } catch (e) { await appWindow.setSize(new LogicalSize(900, 650)); await appWindow.center(); }
                appWindow.show();
                setInterval(async () => {
                    if (!appWindow) return;
                    try {
                        const isMax = await appWindow.isMaximized();
                        if (!isMax) {
                            const size = await appWindow.outerSize();
                            const pos = await appWindow.outerPosition();
                            if (size.width >= 400 && size.height >= 300) {
                                localStorage.setItem('lightpad-window', JSON.stringify({ width: size.width, height: size.height, x: pos.x, y: pos.y, maximized: false }));
                            }
                        } else {
                            const saved = JSON.parse(localStorage.getItem('lightpad-window') || '{}');
                            saved.maximized = true;
                            localStorage.setItem('lightpad-window', JSON.stringify(saved));
                        }
                    } catch (e) {}
                }, 1000);
            }, 50);
        });

        // Titlebar buttons
        document.getElementById('titlebar-minimize').addEventListener('click', () => appWindow.minimize());
        document.getElementById('titlebar-maximize').addEventListener('click', () => appWindow.toggleMaximize());
        document.getElementById('titlebar-close').addEventListener('click', async () => { saveSession(); appWindow.close(); });

        window.addEventListener('beforeunload', () => saveSession());

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

    // Text formatting menu
    const textFormatBtn = document.getElementById('btn-text-format');
    const textFormatMenu = document.getElementById('text-format-menu');
    if (textFormatBtn && textFormatMenu) {
        textFormatBtn.addEventListener('click', (e) => { e.stopPropagation(); textFormatMenu.style.display = textFormatMenu.style.display === 'block' ? 'none' : 'block'; });
        document.addEventListener('click', (e) => { if (!textFormatBtn.contains(e.target) && !textFormatMenu.contains(e.target)) textFormatMenu.style.display = 'none'; });
        document.getElementById('menu-format-upper').addEventListener('click', () => { modifyEditorSelection(t => t.toUpperCase()); textFormatMenu.style.display = 'none'; });
        document.getElementById('menu-format-lower').addEventListener('click', () => { modifyEditorSelection(t => t.toLowerCase()); textFormatMenu.style.display = 'none'; });
        document.getElementById('menu-format-title').addEventListener('click', () => { modifyEditorSelection(t => t.split(/(?<=\s|-|_)/).map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join('')); textFormatMenu.style.display = 'none'; });
        document.getElementById('menu-format-sort').addEventListener('click', () => { modifyEditorSelection(t => t.split('\n').sort().join('\n')); textFormatMenu.style.display = 'none'; });
        document.getElementById('menu-format-reverse').addEventListener('click', () => { modifyEditorSelection(t => t.split('').reverse().join('')); textFormatMenu.style.display = 'none'; });
        document.getElementById('menu-format-remove-empty').addEventListener('click', () => { modifyEditorSelection(t => t.split('\n').filter(l => l.trim().length > 0).join('\n')); textFormatMenu.style.display = 'none'; });
    }

    // Session manager menu
    const sessionManagerBtn = document.getElementById('btn-session-manager');
    const sessionMenu = document.getElementById('session-menu');
    if (sessionManagerBtn && sessionMenu) {
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
            window.isRestoringTab = true;
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
            window.isRestoringTab = false;
        } else showStatus('No recently closed tabs');
    });

    // Setup overlays (quick-open, language, global search event listeners)
    setupOverlays();

    // Resize shadows
    window.addEventListener('resize', () => {
        import('./tabs-ui.js').then(m => m.updateScrollShadows());
    });
});
