import { createEditorState, createEditorView, getLanguageExtension, toggleLineWrapping, applyLineWrappingToState, detectLanguageFromContent, setLanguageExtension, applyLanguageExtensionToState } from './editor.js';
import { EditorView } from "@codemirror/view";

// Quill.js
import Quill from 'quill';
import BlotFormatter from 'quill-blot-formatter';
import QuillImageDropAndPaste from 'quill-image-drop-and-paste';

Quill.register('modules/blotFormatter', BlotFormatter);
Quill.register('modules/imageDropAndPaste', QuillImageDropAndPaste);

let invoke, appWindow, readTextFile, writeTextFile, openDialog, saveDialog;

const editorContainer = document.getElementById('editor-container');
const quillWrapper = document.getElementById('quill-wrapper');
const statusText = document.getElementById('status-text');
const statusCursor = document.getElementById('status-cursor');
const statusEncoding = document.getElementById('status-encoding');
const tabBar = document.getElementById('tab-bar');

let tabs = [];
let activeTabId = null;
let editorView = null;
let quillView = null;
let tabCounter = 0;
let sessionTimeout = null;
let contextMenuTargetId = null;

// Multi-instance Sync
const syncChannel = new BroadcastChannel('lightpad_sync');
syncChannel.onmessage = (event) => {
    if (event.data.type === 'file_saved') {
        handleExternalFileChange(event.data.path, event.data.content, event.data.mtime);
    }
};

async function handleExternalFileChange(path, content, mtime) {
    const tab = tabs.find(t => t.path === path);
    if (!tab) return;
    
    // If the tab is unsaved (has local changes), don't blindly overwrite
    if (tab.isUnsaved) {
        showStatus(`File ${getFilename(path)} was modified externally. Save to overwrite.`, 5000);
        return;
    }

    tab.lastModified = mtime;
    tab.savedContent = content;

    if (tab.id === activeTabId) {
        if (tab.isDoc && quillView) {
            quillView.root.innerHTML = content;
        } else if (editorView) {
            editorView.dispatch({
                changes: { from: 0, to: editorView.state.doc.length, insert: content }
            });
        }
        showStatus(`Reloaded ${getFilename(path)} (modified externally)`);
    } else {
        if (!tab.isDoc && tab.state) {
            tab.state = tab.state.update({
                changes: { from: 0, to: tab.state.doc.length, insert: content }
            }).state;
        }
        tab.needsRender = true;
    }
}

// Drag state
let draggedTabId = null;
let draggedTabEl = null;

// File History tracking
let fileHistory = [];
let closedTabsHistory = [];
let isRestoringTab = false;
let currentCloseBatch = null;

let isWordWrapEnabled = localStorage.getItem('lightpad-wordwrap') === 'true';
let isAutoSaveEnabled = localStorage.getItem('lightpad-autosave') === 'true';
let isMarkdownPreviewEnabled = false;

function toggleAutoSave() {
    isAutoSaveEnabled = !isAutoSaveEnabled;
    localStorage.setItem('lightpad-autosave', isAutoSaveEnabled.toString());

    updateAutoSaveUI();

    showStatus(isAutoSaveEnabled ? 'Auto-Save Enabled' : 'Auto-Save Disabled');

    // Auto-save any currently unsaved tabs immediately
    if (isAutoSaveEnabled) {
        tabs.forEach(tab => {
            if (tab.isUnsaved && tab.path) {
                autoSaveDiskDebounced(tab, 0);
            }
        });
    }
}

function toggleWordWrap() {
    isWordWrapEnabled = !isWordWrapEnabled;
    localStorage.setItem('lightpad-wordwrap', isWordWrapEnabled.toString());

    const btn = document.getElementById('btn-wordwrap');
    if (btn) {
        if (isWordWrapEnabled) btn.classList.add('active');
        else btn.classList.remove('active');
    }

    tabs.forEach(tab => {
        if (!tab.isDoc && tab.state) {
            tab.state = applyLineWrappingToState(tab.state, isWordWrapEnabled);
        }
    });

    if (editorView) {
        toggleLineWrapping(editorView, isWordWrapEnabled);
    }
}

function getFilename(path) {
    if (!path) return 'Untitled';
    return path.split('\\').pop().split('/').pop();
}

function updateTitle() {
    const activeTab = tabs.find(t => t.id === activeTabId);
    if (!activeTab) {
        if (appWindow) appWindow.setTitle('LightPad');
        document.title = 'LightPad';
        return;
    }
    const filename = getFilename(activeTab.path);
    const text = `${filename} - LightPad`;
    if (appWindow) appWindow.setTitle(text);
    document.title = text;
}

function showStatus(message, timeout = 3000) {
    statusText.textContent = message;
    statusText.style.opacity = 1;
    if (timeout) {
        setTimeout(() => {
            statusText.style.opacity = 0.7;
            statusText.textContent = 'Ready';
        }, timeout);
    }
}

function updateCursorStatus() {
    if (!editorView) return;
    const pos = editorView.state.selection.main.head;
    const line = editorView.state.doc.lineAt(pos);
    statusCursor.textContent = `Ln ${line.number}, Col ${pos - line.from + 1}`;

    // Update language status
    const tab = tabs.find(t => t.id === activeTabId);
    const statusLang = document.getElementById('status-language');
    if (tab && statusLang) {
        if (tab.isDoc) {
            statusLang.textContent = "Document";
        } else if (tab.isTodo) {
            statusLang.textContent = "Todo List";
        } else {
            let extToMatch = tab.manualLanguage;
            if (extToMatch === undefined || extToMatch === null) {
                if (tab.autoLanguage) extToMatch = tab.autoLanguage;
                else if (tab.path) extToMatch = tab.path.split('.').pop().toLowerCase();
            }

            const langObj = supportedLanguages.find(l => l.ext === extToMatch);
            if (langObj) {
                statusLang.textContent = langObj.name;
            } else if (extToMatch) {
                statusLang.textContent = extToMatch.toUpperCase();
            } else {
                statusLang.textContent = "Plain Text";
            }

            // Show/Hide Markdown Preview button based on language
            const btnMarkdown = document.getElementById('btn-markdown');
            if (btnMarkdown) {
                if (extToMatch === 'md' || extToMatch === 'markdown' || statusLang.textContent === 'Markdown') {
                    btnMarkdown.style.display = 'inline-flex';
                    if (isMarkdownPreviewEnabled && activeTabId === tab.id) {
                        renderMarkdownPreview();
                    }
                } else {
                    btnMarkdown.style.display = 'none';
                    document.getElementById('markdown-preview').style.display = 'none';
                    isMarkdownPreviewEnabled = false;
                }
            }
        }
    }
}

function saveSessionDebounced() {
    if (sessionTimeout) clearTimeout(sessionTimeout);
    sessionTimeout = setTimeout(() => {
        saveSession();
    }, 1000);
}

function autoSaveDiskDebounced(tab, delay = 2000) {
    if (!isAutoSaveEnabled) return;
    if (!tab.path || !window.__TAURI__) return; // Only autosave files that exist on disk

    if (tab.autoSaveTimeout) clearTimeout(tab.autoSaveTimeout);
    tab.autoSaveTimeout = setTimeout(async () => {
        try {
            let content = '';
            if (tab.isDoc) {
                if (quillView && activeTabId === tab.id) {
                    content = quillView.root.innerHTML;
                } else {
                    content = tab.savedContent || '';
                }
            } else {
                if (editorView && activeTabId === tab.id) {
                    content = editorView.state.doc.toString();
                } else {
                    content = tab.state.doc.toString();
                }
            }
            await writeTextFile(tab.path, content);
            try {
                let mtime = await invoke('get_file_modified', { path: tab.path });
                tab.lastModified = mtime;
                syncChannel.postMessage({ type: 'file_saved', path: tab.path, content, mtime });
            } catch(e) {}
            tab.isUnsaved = false;
            tab.savedContent = content;
            renderTabs();
            updateTitle();
        } catch (e) {
            console.error("Autosave failed", e);
        }
    }, delay);
}

async function saveSession() {
    let activeDocContent = null;
    const activeTab = tabs.find(t => t.id === activeTabId);
    if (activeTab && activeTab.isDoc && quillView) {
        try {
            activeDocContent = quillView.root.innerHTML;
            activeTab.savedContent = activeDocContent;
        } catch (e) {
            console.error("QuillJS save failed", e);
        }
    }

    const sessionTabs = tabs.map(tab => {
        let content = null;
        if (tab.isDoc) {
            content = (tab.id === activeTabId && activeDocContent !== null) ? activeDocContent : tab.savedContent;
        } else {
            content = (tab.id === activeTabId && editorView)
                ? editorView.state.doc.toString()
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
    if (editorView && !activeTab?.isDoc) {
        cursorPos = editorView.state.selection.main.head;
    }

    localStorage.setItem('lightpad-session', JSON.stringify({
        tabs: sessionTabs,
        activeTabId,
        cursorPos
    }));
}

async function loadSession() {
    const sessionJson = localStorage.getItem('lightpad-session');
    if (!sessionJson) {
        switchTab(null);
        return;
    }

    try {
        const session = JSON.parse(sessionJson);
        const validTabs = session.tabs || [];
        // Filter out empty untitled tabs
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
                    try { t.lastModified = await invoke('get_file_modified', { path: t.path }); } catch(e){}
                } catch (e) {
                    console.warn(`File previously opened is missing or inaccessible: ${t.path}`, e);
                    // Use whatever content was cached in session or empty string
                    content = t.content || "";
                    t.isUnsaved = true; // Mark as unsaved/dirty

                    // Show toast warning
                    setTimeout(() => showStatus(`Error: Could not load ${getFilename(t.path)}`, 5000), 1000);
                }
            } else if (t.path && window.__TAURI__ && t.isUnsaved) {
                try {
                    savedContent = await readTextFile(t.path);
                    try { t.lastModified = await invoke('get_file_modified', { path: t.path }); } catch(e){}
                } catch (e) { }
            } else if (!t.path && t.isDoc) {
                savedContent = (t.content !== undefined && t.content !== null) ? t.content : '';
                content = savedContent;
            } else if (!t.path && !t.isUnsaved) {
                savedContent = content || '';
            }

            // Clean up history immediately if file was deleted
            if (t.path && savedContent === null && t.isUnsaved) {
                removeFromFileHistory(t.path);
            }

            const num = parseInt(t.id.split('-')[1]);
            if (num > tabCounter) tabCounter = num;

            // Enforce Todo type rendering if inherently flagged or via extension
            const isTodo = t.isTodo || (t.path && t.path.endsWith('.todo'));
            // Enforce Doc type rendering
            const isDoc = t.isDoc || (t.path && t.path.endsWith('.doc'));

            let langPath = t.path;
            if (isTodo) langPath = "tasks.todo";
            if (isDoc) langPath = "document.doc";

            const extensions = await getLanguageExtension(langPath, content || '', t.manualLanguage);

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
                state: createEditorState(content || '', extensions, [createUpdateListener(t.id)], isWordWrapEnabled)
            };
            tabs.push(newTab);
        }

        renderTabs();

        if (session.activeTabId && tabs.find(t => t.id === session.activeTabId)) {
            switchTab(session.activeTabId);
        } else {
            switchTab(tabs[0].id);
        }

        // Restore cursor pos if available
        if (session.cursorPos && editorView) {
            // Ensure pos is within bounds
            const docLength = editorView.state.doc.length;
            const safePos = Math.min(session.cursorPos, docLength);
            editorView.dispatch({ selection: { anchor: safePos, head: safePos } });
        }
    } catch (e) {
        console.error("Failed to load session", e);
        statusText.textContent = "Err: " + e.message;
        switchTab(null);
    }
}

function createUpdateListener(id) {
    return EditorView.updateListener.of((update) => {
        if (update.docChanged) {
            const tab = tabs.find(t => t.id === id);
            if (tab) {
                const currentContent = update.state.doc.toString();
                let isNowUnsaved = true;
                if (tab.savedContent !== null && currentContent === tab.savedContent) {
                    isNowUnsaved = false;
                }

                if (tab.isUnsaved !== isNowUnsaved) {
                    tab.isUnsaved = isNowUnsaved;
                    const tabEl = document.querySelector(`.tab[data-id="${tab.id}"] .tab-dot`);
                    if (tabEl) {
                        if (isNowUnsaved) tabEl.classList.add('unsaved');
                        else tabEl.classList.remove('unsaved');
                    }
                }

                if (isNowUnsaved && isAutoSaveEnabled) {
                    autoSaveDiskDebounced(tab);
                }

                if (isMarkdownPreviewEnabled && id === activeTabId && typeof marked !== 'undefined' && typeof DOMPurify !== 'undefined') {
                    renderMarkdownPreview(currentContent);
                }

                if (!tab.manualLanguage && !tab.isTodo && !tab.isDoc) {
                    let newAutoExt = detectLanguageFromContent(currentContent);
                    if (!newAutoExt && tab.path) newAutoExt = tab.path.split('.').pop().toLowerCase();

                    if (newAutoExt !== tab.autoLanguage) {
                        tab.autoLanguage = newAutoExt;
                        getLanguageExtension(tab.path, currentContent).then(extensions => {
                            if (tab.autoLanguage === newAutoExt) {
                                tab.state = applyLanguageExtensionToState(tab.state, extensions);
                                if (activeTabId === tab.id && editorView) {
                                    setLanguageExtension(editorView, extensions);
                                    updateCursorStatus();
                                }
                            }
                        });
                    }
                }
            }
            saveSessionDebounced();
        }
        if (update.selectionSet && id === activeTabId) {
            updateCursorStatus();
            saveSessionDebounced();
        }
    });
}

/* --- Scroll Shadows --- */
function updateScrollShadows() {
    const leftShadow = document.querySelector('.tab-scroll-shadow-left');
    const rightShadow = document.querySelector('.tab-scroll-shadow-right');
    if (!leftShadow || !rightShadow || !tabBar) return;

    const { scrollLeft, scrollWidth, clientWidth } = tabBar;

    if (scrollLeft > 0) {
        leftShadow.classList.add('show');
    } else {
        leftShadow.classList.remove('show');
    }

    if (Math.ceil(scrollLeft + clientWidth) < scrollWidth) {
        rightShadow.classList.add('show');
    } else {
        rightShadow.classList.remove('show');
    }
}

// Ensure shadows update on window resize
window.addEventListener('resize', updateScrollShadows);

function renderTabs() {
    tabBar.innerHTML = '';

    tabs.forEach(tab => {
        let classes = ['tab'];
        if (tab.id === activeTabId) classes.push('active');
        if (tab.isTodo) classes.push('is-todo');
        if (tab.isDoc) classes.push('is-doc');

        const tabEl = document.createElement('div');
        tabEl.className = classes.join(' ');
        tabEl.dataset.id = tab.id;

        const dot = document.createElement('div');
        dot.className = `tab-dot ${tab.isUnsaved ? 'unsaved' : ''}`;

        const titleSpan = document.createElement('span');
        titleSpan.textContent = getFilename(tab.path) || tab.title;
        titleSpan.className = 'tab-title';

        const closeBtn = document.createElement('span');
        closeBtn.className = 'tab-close';
        closeBtn.innerHTML = '<svg viewBox="0 0 10 10" width="10" height="10"><path d="M1.5,1.5 L8.5,8.5 M8.5,1.5 L1.5,8.5" stroke="currentColor" stroke-width="1.2"/></svg>';

        tabEl.appendChild(dot);
        tabEl.appendChild(titleSpan);
        tabEl.appendChild(closeBtn);

        tabEl.addEventListener('click', (e) => {
            if (e.target.closest('.tab-close') || isDraggingTab) return;
            switchTab(tab.id);
        });

        // Middle-click to close tab (standard editor behavior)
        tabEl.addEventListener('auxclick', (e) => {
            if (e.button === 1) { // middle click
                e.preventDefault();
                e.stopPropagation();
                closeTab(tab.id);
            }
        });

        closeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            closeTab(tab.id);
        });

        tabEl.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            contextMenuTargetId = tab.id;
            const menu = document.getElementById('tab-context-menu');
            if (menu) {
                menu.style.display = 'flex';
                menu.style.left = `${e.clientX}px`;
                menu.style.top = `${e.clientY}px`;
            }
        });

        let startX = 0;
        let isDraggingTab = false;

        tabEl.addEventListener('pointerdown', (e) => {
            if (e.target.closest('.tab-close') || e.button !== 0) return;
            e.currentTarget.setPointerCapture(e.pointerId);
            draggedTabId = tab.id;
            draggedTabEl = e.currentTarget;
            startX = e.clientX;
            isDraggingTab = false;
        });

        tabEl.addEventListener('pointermove', (e) => {
            if (!draggedTabId || draggedTabId !== tab.id || !draggedTabEl) return;

            const dragOffsetX = e.clientX - startX;
            if (Math.abs(dragOffsetX) > 5) {
                isDraggingTab = true;
                draggedTabEl.classList.add('tab-dragging');
            }

            if (!isDraggingTab) return;

            draggedTabEl.style.transform = `translateX(${dragOffsetX}px)`;
            draggedTabEl.style.zIndex = '1000';
            draggedTabEl.style.position = 'relative';

            const elements = document.elementsFromPoint(e.clientX, e.clientY);
            const dropTarget = elements.find(el => el.classList.contains('tab') && el !== draggedTabEl);

            document.querySelectorAll('.tab').forEach(t => {
                t.classList.remove('tab-drag-over-left', 'tab-drag-over-right');
            });

            if (dropTarget) {
                const targetRect = dropTarget.getBoundingClientRect();
                const isRightHalf = e.clientX > targetRect.left + (targetRect.width / 2);
                if (isRightHalf) {
                    dropTarget.classList.add('tab-drag-over-right');
                } else {
                    dropTarget.classList.add('tab-drag-over-left');
                }
            }
        });

        tabEl.addEventListener('pointerup', (e) => {
            if (!draggedTabEl) return;

            draggedTabEl.classList.remove('tab-dragging');
            draggedTabEl.style.transform = '';
            draggedTabEl.style.zIndex = '';
            draggedTabEl.style.position = '';
            draggedTabEl.releasePointerCapture(e.pointerId);

            const leftTarget = document.querySelector('.tab.tab-drag-over-left');
            const rightTarget = document.querySelector('.tab.tab-drag-over-right');
            const dropTarget = leftTarget || rightTarget;

            document.querySelectorAll('.tab').forEach(t => {
                t.classList.remove('tab-drag-over-left', 'tab-drag-over-right');
            });

            if (isDraggingTab && dropTarget) {
                const dropIdx = Array.from(tabBar.children).indexOf(dropTarget);
                if (dropIdx !== -1) {
                    const targetId = tabs[dropIdx].id;
                    const fromIdx = tabs.findIndex(t => t.id === draggedTabId);
                    const toIdx = tabs.findIndex(t => t.id === targetId);

                    if (fromIdx !== -1 && toIdx !== -1 && fromIdx !== toIdx) {
                        const isRightHalf = !!rightTarget;
                        let insertBefore = isRightHalf ? toIdx + 1 : toIdx;

                        const [movedTab] = tabs.splice(fromIdx, 1);
                        const adjustedIndex = insertBefore > fromIdx ? insertBefore - 1 : insertBefore;
                        tabs.splice(adjustedIndex, 0, movedTab);
                        renderTabs();
                    }
                }
            }

            draggedTabId = null;
            draggedTabEl = null;

            // Give a tiny delay before resetting isDraggingTab so click event has time to see it was true
            setTimeout(() => {
                isDraggingTab = false;
            }, 50);

            saveSessionDebounced();
        });

        tabEl.addEventListener('pointercancel', (e) => {
            if (draggedTabEl) {
                draggedTabEl.classList.remove('tab-dragging');
                draggedTabEl.style.transform = '';
                draggedTabEl.style.zIndex = '';
                draggedTabEl.style.position = '';
                draggedTabEl.releasePointerCapture(e.pointerId);
            }
            document.querySelectorAll('.tab').forEach(t => {
                t.classList.remove('tab-drag-over-left', 'tab-drag-over-right');
            });
            draggedTabId = null;
            draggedTabEl = null;
        });

        tabBar.appendChild(tabEl);
    });

    if (draggedTabId) {
        draggedTabEl = document.querySelector(`[data-id="${draggedTabId}"]`);
    }

    // Add scroll listener if it hasn't been added yet
    if (!tabBar.dataset.scrollListenerAdded) {
        tabBar.addEventListener('scroll', updateScrollShadows);
        tabBar.dataset.scrollListenerAdded = 'true';
    }

    // Auto-scroll to active tab if it's out of view
    const activeTabEl = tabBar.querySelector('.tab.active');
    if (activeTabEl) {
        // Use a slight delay to allow CSS widths to calculate after DOM insertion
        setTimeout(() => {
            const barRect = tabBar.getBoundingClientRect();
            const tabRect = activeTabEl.getBoundingClientRect();

            if (tabRect.left < barRect.left) {
                // Tab is hidden to the left
                tabBar.scrollBy({ left: tabRect.left - barRect.left - 20, behavior: 'smooth' });
            } else if (tabRect.right > barRect.right) {
                // Tab is hidden to the right
                tabBar.scrollBy({ left: tabRect.right - barRect.right + 20, behavior: 'smooth' });
            }
        }, 10);
    }

    // Update shadows immediately after rendering tabs
    requestAnimationFrame(updateScrollShadows);
}

function updateActiveTabUI() {
    const tabEls = tabBar.querySelectorAll('.tab');
    tabEls.forEach(el => {
        if (el.dataset.id === activeTabId) {
            el.classList.add('active');

            // Auto-scroll to active tab if it's out of view
            const barRect = tabBar.getBoundingClientRect();
            const tabRect = el.getBoundingClientRect();

            if (tabRect.left < barRect.left) {
                tabBar.scrollBy({ left: tabRect.left - barRect.left - 20, behavior: 'instant' });
            } else if (tabRect.right > barRect.right) {
                tabBar.scrollBy({ left: tabRect.right - barRect.right + 20, behavior: 'instant' });
            }
        } else {
            el.classList.remove('active');
        }
    });

    // Update scroll shadows
    requestAnimationFrame(updateScrollShadows);
}

async function createNewTab(path = null, content = '') {
    tabCounter++;
    const id = `tab-${tabCounter}`;

    const isTodo = path ? path.endsWith('.todo') : false;
    const isDoc = path ? path.endsWith('.doc') : false;

    let state = null;
    let autoLanguage = null;
    if (!isDoc) {
        const extensions = await getLanguageExtension(path, content);
        state = createEditorState(content, extensions, [createUpdateListener(id)], isWordWrapEnabled);

        autoLanguage = detectLanguageFromContent(content);
        if (!autoLanguage && path) autoLanguage = path.split('.').pop().toLowerCase();
    }

    const newTab = {
        id,
        path,
        title: 'Untitled',
        isUnsaved: false,
        isTodo,
        isDoc,
        savedContent: content,
        manualLanguage: null,
        autoLanguage,
        state
    };

    tabs.push(newTab);
    renderTabs();
    switchTab(id);
    saveSessionDebounced();
}

function switchTab(id) {
    if (editorView && activeTabId) {
        const prevTab = tabs.find(t => t.id === activeTabId);
        if (prevTab && !prevTab.isDoc) {
            prevTab.state = editorView.state;
        }
    }

    if (id === null) {
        activeTabId = null;
        if (editorView) {
            editorView.destroy();
            editorView = null;
        }
        if (quillView) {
            quillWrapper.style.display = 'none';
        }
        editorContainer.style.display = 'block';
        document.getElementById('markdown-preview').style.display = 'none';
        isMarkdownPreviewEnabled = false;

        updateActiveTabUI();
        updateTitle();
        statusCursor.textContent = '';
        saveSessionDebounced();
        return;
    }

    activeTabId = id;
    const tab = tabs.find(t => t.id === id);
    if (!tab) return;

    if (tab.isDoc) {
        editorContainer.style.display = 'none';
        quillWrapper.style.display = 'flex';

        if (!quillView) {
            quillView = new Quill('#quill-editor', {
                theme: 'snow',
                modules: {
                    blotFormatter: {}, // Enable image resizing and moving
                    imageDropAndPaste: {
                        handler: async function (imageDataUrl, type, imageData) {
                            if (!window.__TAURI__) return;

                            const filename = `media_${Date.now()}_${Math.floor(Math.random() * 1000)}.png`;

                            const { appDataDir, join } = window.__TAURI__.path;
                            const { writeBinaryFile, createDir, exists } = window.__TAURI__.fs;

                            const appDataPath = await appDataDir();
                            const mediaDir = await join(appDataPath, 'LightPadMedia');

                            try {
                                const dirExists = await exists(mediaDir);
                                if (!dirExists) await createDir(mediaDir, { recursive: true });
                            } catch (err) { }

                            // Convert base64 to Uint8Array
                            const base64Data = imageDataUrl.replace(/^data:image\/\w+;base64,/, "");
                            const binaryString = window.atob(base64Data);
                            const len = binaryString.length;
                            const bytes = new Uint8Array(len);
                            for (let i = 0; i < len; i++) {
                                bytes[i] = binaryString.charCodeAt(i);
                            }

                            const filePath = await join(mediaDir, filename);
                            await writeBinaryFile(filePath, bytes);

                            const url = window.__TAURI__.tauri.convertFileSrc(filePath);
                            const range = quillView.getSelection() || { index: quillView.getLength() };
                            quillView.insertEmbed(range.index, 'image', url);
                        }
                    },
                    history: { delay: 500, maxStack: 100 },
                    toolbar: {
                        container: [
                            [{ 'header': [1, 2, 3, false] }],
                            ['bold', 'italic', 'underline', 'strike'],
                            ['blockquote', 'code-block'],
                            [{ 'align': [] }],
                            [{ 'list': 'ordered' }, { 'list': 'bullet' }, { 'list': 'check' }],
                            ['link', 'image'],
                            ['clean']
                        ],
                        handlers: {
                            link: async function (value) {
                                let selection = this.quill.getSelection();
                                let selectedText = '';
                                let existingHref = '';
                                let isExistingLink = false;
                                let format = this.quill.getFormat(selection);

                                if (format.link) {
                                    existingHref = format.link;
                                    isExistingLink = true;
                                    // Expand selection to the entire link
                                    let [leaf, offset] = this.quill.getLeaf(selection.index);
                                    if (leaf !== null && leaf.parent && leaf.parent.domNode.tagName === 'A') {
                                        let linkNode = leaf.parent;
                                        let blIndex = this.quill.getIndex(linkNode);
                                        let blLength = linkNode.length();
                                        this.quill.setSelection(blIndex, blLength);
                                        selection = this.quill.getSelection();
                                    }
                                }

                                if (selection && selection.length > 0) {
                                    selectedText = this.quill.getText(selection.index, selection.length);
                                }

                                let defaultUrl = existingHref;
                                if (!defaultUrl && /^(https?:\/\/|www\.|[/])/i.test(selectedText.trim())) {
                                    defaultUrl = selectedText.trim();
                                }

                                const result = await askLinkUI(selectedText, defaultUrl);

                                if (result !== null) {
                                    if (result.url) {
                                        if (selection && selection.length > 0) {
                                            if (result.text !== selectedText) {
                                                this.quill.deleteText(selection.index, selection.length);
                                                this.quill.insertText(selection.index, result.text, 'link', result.url);
                                                this.quill.setSelection(selection.index, result.text.length);
                                            } else {
                                                this.quill.format('link', result.url);
                                            }
                                        } else {
                                            const insertIndex = selection ? selection.index : this.quill.getLength();
                                            const insertText = result.text || result.url;
                                            this.quill.insertText(insertIndex, insertText, 'link', result.url);
                                            this.quill.setSelection(insertIndex + insertText.length);
                                        }
                                    } else if (isExistingLink) {
                                        this.quill.format('link', false); // Cancel / remove link case if url is empty
                                    }
                                }
                            },
                            image: async function () {
                                if (!window.__TAURI__) return;
                                const selected = await openDialog({
                                    filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp'] }]
                                });
                                if (selected) {
                                    const ext = selected.split('.').pop() || 'png';
                                    const filename = `media_${Date.now()}_${Math.floor(Math.random() * 1000)}.${ext}`;

                                    const { appDataDir, join } = window.__TAURI__.path;
                                    const { readBinaryFile, writeBinaryFile, createDir, exists } = window.__TAURI__.fs;

                                    const appDataPath = await appDataDir();
                                    const mediaDir = await join(appDataPath, 'LightPadMedia');

                                    try {
                                        const dirExists = await exists(mediaDir);
                                        if (!dirExists) await createDir(mediaDir, { recursive: true });
                                    } catch (err) { }

                                    const uint8Array = await readBinaryFile(selected);
                                    const filePath = await join(mediaDir, filename);
                                    await writeBinaryFile(filePath, uint8Array);

                                    const url = window.__TAURI__.tauri.convertFileSrc(filePath);
                                    const range = this.quill.getSelection(true) || { index: this.quill.getLength() };
                                    this.quill.insertEmbed(range.index, 'image', url);
                                    this.quill.setSelection(range.index + 1);
                                }
                            }
                        }
                    }
                }
            });

            quillView.on('text-change', () => {
                const currentTab = tabs.find(t => t.id === activeTabId);
                if (!currentTab || !currentTab.isDoc) return;
                currentTab.isUnsaved = true;
                currentTab.needsRender = true;
                const tabEl = document.querySelector(`.tab[data-id="${currentTab.id}"] .tab-dot`);
                if (tabEl) tabEl.classList.add('unsaved');
                saveSessionDebounced();

                if (isAutoSaveEnabled) {
                    autoSaveDiskDebounced(currentTab);
                }
            });

            quillView.root.addEventListener('click', (e) => {
                if (e.target.tagName === 'A') {
                    // Pre-select the link range manually because native Quill tooltip is bypassed
                    const blIndex = quillView.getIndex(Quill.find(e.target));
                    quillView.setSelection(blIndex, e.target.innerText.length);
                    const toolbar = quillView.getModule('toolbar');
                    toolbar.handlers.link.call(toolbar, true);
                }
            });
        }

        const fallback = tab.savedContent !== undefined && tab.savedContent !== null ? tab.savedContent : '';
        quillView.root.innerHTML = fallback;
        setTimeout(() => quillView.focus(), 50);

    } else {
        editorContainer.style.display = 'block';
        quillWrapper.style.display = 'none';

        if (editorView) {
            editorView.setState(tab.state);
        } else {
            editorView = createEditorView(tab.state, editorContainer);
        }
        editorView.focus();
    }

    updateActiveTabUI();
    updateTitle();
    updateCursorStatus();
    saveSessionDebounced();
}

function askConfirmUI(message, multiple = false, showCancel = false) {
    return new Promise((resolve) => {
        const modal = document.getElementById('discard-modal');
        const msg = document.getElementById('discard-modal-message');
        const btnYes = document.getElementById('modal-btn-yes');
        const btnNo = document.getElementById('modal-btn-no');
        const btnYTA = document.getElementById('modal-btn-yestoall');
        const btnNTA = document.getElementById('modal-btn-notoall');
        const btnCancel = document.getElementById('modal-btn-cancel');

        msg.textContent = message;
        btnYTA.style.display = multiple ? 'inline-block' : 'none';
        if (btnNTA) btnNTA.style.display = multiple ? 'inline-block' : 'none';
        if (btnCancel) btnCancel.style.display = showCancel ? 'inline-block' : 'none';
        modal.style.display = 'flex';

        const handleYes = () => { cleanup(); resolve('yes'); };
        const handleNo = () => { cleanup(); resolve('no'); };
        const handleYTA = () => { cleanup(); resolve('all'); };
        const handleNTA = () => { cleanup(); resolve('no_all'); };
        const handleCancel = () => { cleanup(); resolve('cancel'); };

        const cleanup = () => {
            modal.style.display = 'none';
            btnYes.removeEventListener('click', handleYes);
            btnNo.removeEventListener('click', handleNo);
            btnYTA.removeEventListener('click', handleYTA);
            if (btnNTA) btnNTA.removeEventListener('click', handleNTA);
            if (btnCancel) btnCancel.removeEventListener('click', handleCancel);
        };

        btnYes.addEventListener('click', handleYes);
        btnNo.addEventListener('click', handleNo);
        btnYTA.addEventListener('click', handleYTA);
        if (btnNTA) btnNTA.addEventListener('click', handleNTA);
        if (btnCancel) btnCancel.addEventListener('click', handleCancel);

        // Auto-focus the Yes button for fluid keyboard usage
        setTimeout(() => btnYes.focus(), 10);
    });
}

function askLinkUI(defaultText = '', defaultUrl = '') {
    return new Promise((resolve) => {
        const modal = document.getElementById('link-modal');
        const inputUrl = document.getElementById('link-modal-url');
        const inputText = document.getElementById('link-modal-text');
        const btnInsert = document.getElementById('link-modal-insert');
        const btnCancel = document.getElementById('link-modal-cancel');

        inputText.value = defaultText;
        inputUrl.value = defaultUrl;
        modal.style.display = 'flex';

        const cleanup = () => {
            modal.style.display = 'none';
            btnInsert.removeEventListener('click', handleInsert);
            btnCancel.removeEventListener('click', handleCancel);
            inputUrl.removeEventListener('keydown', handleKey);
            inputText.removeEventListener('keydown', handleKey);
        };

        const handleInsert = () => {
            cleanup();
            if (!inputUrl.value.trim() && !defaultUrl) { resolve(null); return; }
            resolve({ url: inputUrl.value.trim(), text: inputText.value.trim() });
        };
        const handleCancel = () => { cleanup(); resolve(null); };

        const handleKey = (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                handleInsert();
            } else if (e.key === 'Escape') {
                e.preventDefault();
                handleCancel();
            }
        };

        btnInsert.addEventListener('click', handleInsert);
        btnCancel.addEventListener('click', handleCancel);
        inputUrl.addEventListener('keydown', handleKey);
        inputText.addEventListener('keydown', handleKey);

        setTimeout(() => {
            if (defaultText && !defaultUrl) inputUrl.focus();
            else inputText.focus();
        }, 10);
    });
}

async function closeTab(id, forceClose = false, multipleFiles = false) {
    const tabIndex = tabs.findIndex(t => t.id === id);
    if (tabIndex === -1) return false;
    const tab = tabs[tabIndex];

    let result = 'closed';

    if (tab.isUnsaved) {
        let askPrompt = true;

        let content = '';
        if (tab.isDoc) {
            content = (tab.id === activeTabId && quillView) ? quillView.root.innerHTML : (tab.savedContent || '');
        } else {
            content = (tab.id === activeTabId && editorView)
                ? editorView.state.doc.toString()
                : tab.state.doc.toString();
        }

        if (!tab.path && content.trim() === '') {
            askPrompt = false;
        }

        if (tab.path && window.__TAURI__) {
            try {
                if (window.__TAURI__.fs.exists) {
                    const exists = await window.__TAURI__.fs.exists(tab.path);
                    if (!exists) askPrompt = false;
                } else {
                    await window.__TAURI__.fs.readTextFile(tab.path);
                }
            } catch (e) {
                // file deleted or unreadable
                askPrompt = false;
            }
        }

        if (askPrompt && !forceClose) {
            let answer = await askConfirmUI(`Do you want to save changes to "${getFilename(tab.path)}"?`, multipleFiles, true);
            if (answer === 'cancel') return false;

            if (answer === 'all') {
                result = 'save_all';
                // Switch focus to tab so save logic knows what to save
                if (activeTabId !== tab.id) switchTab(tab.id);
                try {
                    const saveResult = await saveFile(true); // Call saveFile, knowing it will prompt OS
                    if (!saveResult) return false; // OS Save dialog cancelled
                } catch (e) { return false; }
            } else if (answer === 'no_all') {
                result = 'force_all';
            } else if (answer === 'yes') {
                if (activeTabId !== tab.id) switchTab(tab.id);
                try {
                    const saveResult = await saveFile(true);
                    if (!saveResult) return false;
                } catch (e) { return false; }
            } else if (answer === 'no') {
                // Do nothing, just proceed to close
            }
        }
    }

    // Since we awaited, the array might have shifted index. Find again to safely splice.
    const newTabIndex = tabs.findIndex(t => t.id === id);
    if (newTabIndex === -1) return false;

    if (!isRestoringTab) {
        const closedTabInfo = {
            path: tab.path,
            title: tab.title,
            isTodo: tab.isTodo,
            isDoc: tab.isDoc,
            manualLanguage: tab.manualLanguage,
        };
        if (tab.isDoc) {
            closedTabInfo.content = (tab.id === activeTabId && quillView) ? quillView.root.innerHTML : (tab.savedContent || '');
        } else {
            closedTabInfo.content = (tab.id === activeTabId && editorView) ? editorView.state.doc.toString() : tab.state.doc.toString();
        }

        if (currentCloseBatch !== null) {
            currentCloseBatch.push(closedTabInfo);
        } else {
            closedTabsHistory.push([closedTabInfo]);
            if (closedTabsHistory.length > 50) closedTabsHistory.shift();
        }
    }

    tabs.splice(newTabIndex, 1);
    if (tabs.length === 0) {
        switchTab(null);
    } else if (activeTabId === id) {
        renderTabs();
        const nextTab = tabs[Math.max(0, newTabIndex - 1)];
        switchTab(nextTab.id);
    } else {
        renderTabs();
    }
    saveSessionDebounced();
    return result;
}

async function closeMultipleTabs(tabsToClose) {
    const unsavedTabs = tabsToClose.filter(t => t.isUnsaved);
    let forceClose = false;
    let saveAll = false;
    let multipleFiles = unsavedTabs.length > 1;

    currentCloseBatch = [];

    const toClose = [...tabsToClose];
    for (const t of toClose) {
        if (saveAll && t.isUnsaved) {
            // Re-use logic to explicitly save without re-prompting
            if (activeTabId !== t.id) switchTab(t.id);
            const saveResult = await saveFile(true);
            if (!saveResult) {
                // If they cancel an OS save prompt for one file during "Save All", abort remaining tab closes
                break;
            }
            await closeTab(t.id, true); // Safe to force close now
        } else {
            const res = await closeTab(t.id, forceClose, multipleFiles);
            if (res === false) break; // User hit cancel on this tab, abort the multi-close operation
            if (res === 'save_all') {
                saveAll = true;
                // The first tab handles its own save during closeTab internally returning 'save_all' if 'all' was picked
            }
            if (res === 'force_all') {
                forceClose = true;
            }
        }
    }

    if (currentCloseBatch.length > 0) {
        closedTabsHistory.push(currentCloseBatch);
        if (closedTabsHistory.length > 50) closedTabsHistory.shift();
    }
    currentCloseBatch = null;
}

async function openFile() {
    if (!window.__TAURI__) return alert('Opening files is only supported in the app.');
    try {
        const selected = await openDialog({
            filters: [{ name: 'All Files', extensions: ['*'] }]
        });

        if (selected) {
            const existingTab = tabs.find(t => t.path === selected);
            if (existingTab) {
                switchTab(existingTab.id);
                return;
            }

            const contents = await readTextFile(selected);
            await createNewTab(selected, contents);
            try {
                const newT = tabs[tabs.length - 1];
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

async function saveFile(returnResult = false) {
    if (!window.__TAURI__) {
        alert('Saving files is only supported in the app.');
        return returnResult ? false : undefined;
    }

    const tab = tabs.find(t => t.id === activeTabId);
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
                if (quillView) {
                    content = quillView.root.innerHTML;
                } else {
                    content = tab.savedContent || '';
                }
            } else {
                content = editorView.state.doc.toString();
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

async function deleteActiveFile() {
    const tab = tabs.find(t => t.id === activeTabId);
    if (!tab) return;

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
        closeTab(tab.id, true);
    }
}

window.addEventListener('DOMContentLoaded', () => {
    if (window.__TAURI__) {
        invoke = window.__TAURI__.tauri.invoke;
        appWindow = window.__TAURI__.window.appWindow;
        readTextFile = window.__TAURI__.fs.readTextFile;
        writeTextFile = window.__TAURI__.fs.writeTextFile;
        openDialog = window.__TAURI__.dialog.open;
        saveDialog = window.__TAURI__.dialog.save;

        if (window.__TAURI__.app) {
            window.__TAURI__.app.getVersion().then(v => {
                const el = document.getElementById('status-version');
                if (el) el.textContent = 'v' + v;
            }).catch(e => console.error("Failed fetching version", e));
        }

        requestAnimationFrame(() => {
            setTimeout(async () => {
                const { LogicalSize, PhysicalSize, PhysicalPosition } = window.__TAURI__.window;
                await appWindow.setMinSize(new LogicalSize(400, 300));

                try {
                    const stateStr = localStorage.getItem('lightpad-window');
                    if (stateStr) {
                        const state = JSON.parse(stateStr);
                        // Restore Size
                        if (state.width >= 400 && state.height >= 300) {
                            await appWindow.setSize(new PhysicalSize(state.width, state.height));
                        } else {
                            await appWindow.setSize(new LogicalSize(900, 650));
                        }

                        // Restore Position
                        if (state.x !== undefined && state.y !== undefined) {
                            await appWindow.setPosition(new PhysicalPosition(state.x, state.y));
                        } else {
                            await appWindow.center();
                        }

                        // Restore Maximize
                        if (state.maximized) {
                            await appWindow.maximize();
                        }
                    } else {
                        await appWindow.setSize(new LogicalSize(900, 650));
                        await appWindow.center();
                    }
                } catch (e) {
                    await appWindow.setSize(new LogicalSize(900, 650));
                    await appWindow.center();
                    console.error("Error restoring window position", e);
                }

                appWindow.show();

                // Start tracking window bounds reliably over time, bypassing Tauri's built-in plugin bugs on Windows
                setInterval(async () => {
                    if (!appWindow) return;
                    try {
                        const isMax = await appWindow.isMaximized();
                        if (!isMax) {
                            const size = await appWindow.outerSize();
                            const pos = await appWindow.outerPosition();
                            if (size.width >= 400 && size.height >= 300) {
                                localStorage.setItem('lightpad-window', JSON.stringify({
                                    width: size.width,
                                    height: size.height,
                                    x: pos.x,
                                    y: pos.y,
                                    maximized: false
                                }));
                            }
                        } else {
                            // Only update maximized state, keep previous width/height
                            const savedStr = localStorage.getItem('lightpad-window');
                            const saved = savedStr ? JSON.parse(savedStr) : {};
                            saved.maximized = true;
                            localStorage.setItem('lightpad-window', JSON.stringify(saved));
                        }
                    } catch (e) { }
                }, 1000);

            }, 50);
        });

        const themeBlueBtn = document.getElementById('theme-blue');
        if (themeBlueBtn) themeBlueBtn.addEventListener('click', () => setTheme('blue-theme'));
        const themeHackerBtn = document.getElementById('theme-hacker');
        if (themeHackerBtn) themeHackerBtn.addEventListener('click', () => setTheme('hacker-theme'));

        // Init dropping
        setupFileDrop();

        document.getElementById('titlebar-minimize').addEventListener('click', () => appWindow.minimize());

        document.getElementById('titlebar-maximize').addEventListener('click', () => appWindow.toggleMaximize());

        document.getElementById('titlebar-close').addEventListener('click', async () => {
            saveSession(); // ensure latest state saved
            appWindow.close();
        });

        // Use standard beforeunload for 100% reliable synchronous save right before the webview dies
        window.addEventListener('beforeunload', () => {
            saveSession();
        });

        // External Modification Checking on Window Focus
        window.addEventListener('focus', async () => {
            if (!window.__TAURI__) return;
            for (let tab of tabs) {
                if (tab.path && !tab.isUnsaved) {
                    try {
                        let mtime = await invoke('get_file_modified', { path: tab.path });
                        if (tab.lastModified && mtime > tab.lastModified) {
                            tab.lastModified = mtime;
                            const newContent = await readTextFile(tab.path);
                            handleExternalFileChange(tab.path, newContent, mtime);
                        }
                    } catch (e) { }
                }
            }
        });

        navigator.locks.request('lightpad-primary-instance', { mode: 'exclusive', ifAvailable: true }, async (lock) => {
            if (lock) {
                loadSession();
                return new Promise(() => {}); // Hold lock indefinitely
            } else {
                console.log("Secondary instance started, opening blank slate.");
            }
        });
    } else {
        console.warn("Tauri API not found. Running in browser mode.");
        loadSession();
    }

    loadFileHistory();

    document.getElementById('btn-open').addEventListener('click', openFile);
    document.getElementById('btn-save').addEventListener('click', saveFile);
    document.getElementById('btn-find').addEventListener('click', () => {
        if (editorView) {
            import('@codemirror/search').then(({ openSearchPanel }) => {
                openSearchPanel(editorView);
            });
        }
    });



    const deleteBtn = document.getElementById('btn-delete');
    if (deleteBtn) {
        deleteBtn.addEventListener('click', deleteActiveFile);
    }

    const quickOpenBtn = document.getElementById('btn-quick-open');
    if (quickOpenBtn) {
        quickOpenBtn.addEventListener('click', toggleQuickOpen);
    }

    // --- Text Formatting Menu Logic ---
    const textFormatBtn = document.getElementById('btn-text-format');
    const textFormatMenu = document.getElementById('text-format-menu');

    if (textFormatBtn && textFormatMenu) {
        textFormatBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const isVisible = textFormatMenu.style.display === 'block';
            textFormatMenu.style.display = isVisible ? 'none' : 'block';
        });

        document.addEventListener('click', (e) => {
            if (!textFormatBtn.contains(e.target) && !textFormatMenu.contains(e.target)) {
                textFormatMenu.style.display = 'none';
            }
        });

        function modifyEditorSelection(transformFn) {
            const tab = tabs.find(t => t.id === activeTabId);
            if (!tab) return;

            if (tab.isDoc && quillView) {
                let range = quillView.getSelection();
                if (!range || range.length === 0) {
                    range = { index: 0, length: quillView.getLength() - 1 }; // whole doc minus trailing newline
                }
                if (range.length > 0) {
                    const text = quillView.getText(range.index, range.length);
                    const newText = transformFn(text);
                    quillView.deleteText(range.index, range.length);
                    quillView.insertText(range.index, newText);
                    quillView.setSelection(range.index, newText.length);
                }
            } else if (editorView) {
                const selection = editorView.state.selection.main;
                let from = selection.from;
                let to = selection.to;
                let targetText = editorView.state.doc.sliceString(from, to);

                if (from === to) { // No selection, apply to whole document
                    from = 0;
                    to = editorView.state.doc.length;
                    targetText = editorView.state.doc.toString();
                }

                if (targetText.length > 0) {
                    const newText = transformFn(targetText);
                    editorView.dispatch({
                        changes: { from, to, insert: newText },
                        selection: { anchor: from, head: from + newText.length }
                    });
                }
            }
            textFormatMenu.style.display = 'none';
        }

        document.getElementById('menu-format-upper').addEventListener('click', () => {
            modifyEditorSelection(text => text.toUpperCase());
        });

        document.getElementById('menu-format-lower').addEventListener('click', () => {
            modifyEditorSelection(text => text.toLowerCase());
        });

        document.getElementById('menu-format-title').addEventListener('click', () => {
            modifyEditorSelection(text => {
                return text.split(/(?<=\s|-|_)/).map(word => {
                    return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
                }).join('');
            });
        });

        document.getElementById('menu-format-sort').addEventListener('click', () => {
            modifyEditorSelection(text => {
                return text.split('\n').sort().join('\n');
            });
        });

        document.getElementById('menu-format-reverse').addEventListener('click', () => {
            modifyEditorSelection(text => text.split('').reverse().join(''));
        });

        document.getElementById('menu-format-remove-empty').addEventListener('click', () => {
            modifyEditorSelection(text => {
                return text.split('\n').filter(line => line.trim().length > 0).join('\n');
            });
        });
    }

    const newTabBtn = document.getElementById('btn-new-tab');
    if (newTabBtn) {
        newTabBtn.addEventListener('click', async () => await createNewTab());
    }

    // --- Markdown Preview Logic ---
    function renderMarkdownPreview(content = null) {
        if (!isMarkdownPreviewEnabled) return;
        const preview = document.getElementById('markdown-preview');
        if (!preview) return;

        let textToRender = content;
        if (textToRender === null) {
            if (editorView) textToRender = editorView.state.doc.toString();
            else textToRender = '';
        }

        try {
            preview.innerHTML = DOMPurify.sanitize(marked.parse(textToRender));
        } catch (e) {
            console.error("Markdown parsing failed", e);
        }
    }

    const markdownBtn = document.getElementById('btn-markdown');
    if (markdownBtn) {
        markdownBtn.addEventListener('click', () => {
            isMarkdownPreviewEnabled = !isMarkdownPreviewEnabled;
            const preview = document.getElementById('markdown-preview');
            if (isMarkdownPreviewEnabled) {
                preview.style.display = 'block';
                markdownBtn.classList.add('active');
                renderMarkdownPreview();
            } else {
                preview.style.display = 'none';
                markdownBtn.classList.remove('active');
            }
        });
    }

    const todoBtn = document.getElementById('btn-todo');
    if (todoBtn) {
        todoBtn.addEventListener('click', spawnTodoList);
    }

    const docBtn = document.getElementById('btn-doc');
    if (docBtn) {
        docBtn.addEventListener('click', spawnDocProcess);
    }

    const wordWrapBtn = document.getElementById('btn-wordwrap');
    if (wordWrapBtn) {
        if (isWordWrapEnabled) wordWrapBtn.classList.add('active');
        wordWrapBtn.addEventListener('click', toggleWordWrap);
    }

    // --- Auto Save Logic ---
    const autoSaveBtn = document.getElementById('btn-auto-save');
    if (autoSaveBtn) {
        autoSaveBtn.addEventListener('click', toggleAutoSave);
        updateAutoSaveUI(); // Initialize UI based on default state
    }

    const tabBarContainer = document.querySelector('.tab-bar-container');
    if (tabBarContainer) {
        tabBarContainer.addEventListener('dblclick', (e) => {
            if (e.target === tabBarContainer || e.target === tabBar) {
                createNewTab();
            }
        });
    }

    // Context menu handlers
    document.addEventListener('click', () => {
        const menu = document.getElementById('tab-context-menu');
        if (menu) menu.style.display = 'none';
    });

    document.getElementById('menu-close-all')?.addEventListener('click', async () => {
        const tabsToClose = [...tabs];
        await closeMultipleTabs(tabsToClose);
    });

    document.getElementById('menu-close-others')?.addEventListener('click', async () => {
        if (!contextMenuTargetId) return;
        const tabsToClose = tabs.filter(t => t.id !== contextMenuTargetId);
        await closeMultipleTabs(tabsToClose);
    });

    document.getElementById('menu-close-right')?.addEventListener('click', async () => {
        if (!contextMenuTargetId) return;
        const targetIndex = tabs.findIndex(t => t.id === contextMenuTargetId);
        if (targetIndex === -1) return;
        const tabsToClose = tabs.slice(targetIndex + 1);
        await closeMultipleTabs(tabsToClose);
    });

    document.getElementById('menu-close-saved')?.addEventListener('click', async () => {
        const tabsToClose = tabs.filter(t => !t.isUnsaved);
        await closeMultipleTabs(tabsToClose);
    });

    document.getElementById('menu-undo-close')?.addEventListener('click', async () => {
        if (closedTabsHistory.length > 0) {
            isRestoringTab = true;
            const batch = closedTabsHistory.pop();

            // Restore in reverse order to approximate original tab sequence structure
            for (let i = batch.length - 1; i >= 0; i--) {
                const restoredTabInfo = batch[i];
                tabCounter++;
                const id = `tab-${tabCounter}`;

                let state = null;
                if (!restoredTabInfo.isDoc) {
                    let langPath = restoredTabInfo.path;
                    if (restoredTabInfo.isTodo) langPath = "tasks.todo";

                    const extensions = await getLanguageExtension(langPath, restoredTabInfo.content || '', restoredTabInfo.manualLanguage);
                    state = createEditorState(restoredTabInfo.content || '', extensions, [createUpdateListener(id)], isWordWrapEnabled);
                }

                const newTab = {
                    id,
                    path: restoredTabInfo.path,
                    title: restoredTabInfo.title,
                    isUnsaved: false,
                    isTodo: restoredTabInfo.isTodo,
                    isDoc: restoredTabInfo.isDoc,
                    savedContent: restoredTabInfo.content,
                    manualLanguage: restoredTabInfo.manualLanguage,
                    autoLanguage: detectLanguageFromContent(restoredTabInfo.content) || (restoredTabInfo.path ? restoredTabInfo.path.split('.').pop().toLowerCase() : null),
                    state
                };
                tabs.push(newTab);
                switchTab(id);
            }

            showStatus(batch.length > 1 ? `Restored ${batch.length} tabs` : 'Tab restored');
            isRestoringTab = false;
        } else {
            showStatus('No recently closed tabs');
        }
    });
});

// Keyboard shortcuts
window.addEventListener('keydown', async (e) => {
    // Ctrl+Tab (Next Tab) / Ctrl+Shift+Tab (Prev Tab)
    if ((e.ctrlKey || e.metaKey) && e.key === 'Tab') {
        e.preventDefault();
        if (tabs.length > 1) {
            const currentIndex = tabs.findIndex(t => t.id === activeTabId);
            if (e.shiftKey) {
                // Ctrl+Shift+Tab: Previous tab
                const prevIndex = (Math.max(0, currentIndex) - 1 + tabs.length) % tabs.length;
                switchTab(tabs[prevIndex].id);
            } else {
                // Ctrl+Tab: Next tab
                const nextIndex = (Math.max(0, currentIndex) + 1) % tabs.length;
                switchTab(tabs[nextIndex].id);
            }
        }
        return; // Don't process further
    }

    // Ctrl+S / Cmd+S
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 's') {
        e.preventDefault();
        await saveFile();
    }
    // Ctrl+O / Cmd+O
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'o') {
        e.preventDefault();
        await openFile();
    }
    // Ctrl+Shift+W / Cmd+Shift+W (Close All) — must check before Ctrl+W
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'w') {
        e.preventDefault();
        const tabsToClose = [...tabs];
        await closeMultipleTabs(tabsToClose);
        return;
    }
    // Ctrl+W / Cmd+W (Close Current)
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'w') {
        e.preventDefault();
        if (activeTabId) await closeTab(activeTabId);
        return;
    }
    // Ctrl+Shift+T / Cmd+Shift+T (Reopen Last Closed Tab)
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 't') {
        e.preventDefault();
        if (closedTabsHistory.length > 0) {
            document.getElementById('menu-undo-close')?.click();
        } else {
            showStatus('No recently closed tabs');
        }
        return;
    }
    // Ctrl+N / Cmd+N (New File)
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'n') {
        e.preventDefault();
        await createNewTab();
        return;
    }
    // Ctrl+T / Cmd+T (Open File History Search)
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 't') {
        e.preventDefault();
        toggleQuickOpen();
        return;
    }
    // Ctrl+Shift+F / Cmd+Shift+F (Global Search)
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        toggleGlobalSearch();
    }
    // Ctrl+1 / Cmd+1 (Quick Todo List)
    if ((e.ctrlKey || e.metaKey) && e.key === '1') {
        e.preventDefault();
        spawnTodoList();
    }
    // Ctrl+2 / Cmd+2 (Quick Notion Doc)
    if ((e.ctrlKey || e.metaKey) && e.key === '2') {
        e.preventDefault();
        spawnDocProcess();
    }
    // Alt+Z (Word Wrap)
    if (e.altKey && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        toggleWordWrap();
    }

    // Modal Generic Keyboard Navigation
    const activeModal = document.querySelector('.modal-overlay[style*="display: flex"], .modal-overlay[style*="display: block"]');
    if (activeModal) {
        if (e.key === 'Escape') {
            // Check specifically which modal to close based on ID or a generic close mechanism
            if (activeModal.id === 'discard-modal') cancelClose();
            if (activeModal.id === 'link-modal') {
                activeModal.style.display = 'none';
                if (quillView) quillView.focus();
            }
            if (activeModal.id === 'quick-open-modal') closeQuickOpen();
            if (activeModal.id === 'global-search-modal') closeGlobalSearch();
            if (activeModal.id === 'language-modal') closeLanguageModal();
            return;
        }

        // Don't intercept arrow Left/Right when an input/textarea is focused (allow cursor movement in text fields)
        const activeEl = document.activeElement;
        const isInTextField = activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA');

        // Handle ArrowKeys / Tab for focusable elements inside the modal
        const focusableElements = Array.from(activeModal.querySelectorAll('button:not([style*="display: none"]), input:not([style*="display: none"]), a:not([style*="display: none"]), .quick-open-item, .quick-open-result'))
            .filter(el => {
                // Ignore elements hidden by parent
                let parent = el;
                while (parent && parent !== activeModal) {
                    if (window.getComputedStyle(parent).display === 'none') return false;
                    parent = parent.parentElement;
                }
                return true;
            });

        if (focusableElements.length > 0) {
            let currentIndex = focusableElements.findIndex(el =>
                document.activeElement === el ||
                (el.classList.contains('selected') && !['INPUT', 'BUTTON', 'A'].includes(el.tagName))
            );

            if (e.key === 'Tab' || e.key === 'ArrowDown' || (e.key === 'ArrowRight' && !isInTextField)) {
                e.preventDefault();
                let nextIndex = currentIndex + 1;
                if (nextIndex >= focusableElements.length) nextIndex = 0;

                // For Quick Search / Language list items specifically
                if (focusableElements[nextIndex].classList.contains('quick-open-item') || focusableElements[nextIndex].classList.contains('quick-open-result')) {
                    focusableElements.forEach(el => el.classList.remove('selected'));
                    focusableElements[nextIndex].classList.add('selected');
                    focusableElements[nextIndex].scrollIntoView({ block: 'nearest' });
                } else {
                    focusableElements[nextIndex].focus();
                }

            } else if (e.key === 'ArrowUp' || (e.key === 'ArrowLeft' && !isInTextField)) {
                e.preventDefault();
                let prevIndex = currentIndex - 1;
                if (prevIndex < 0) prevIndex = focusableElements.length - 1;

                if (focusableElements[prevIndex].classList.contains('quick-open-item') || focusableElements[prevIndex].classList.contains('quick-open-result')) {
                    focusableElements.forEach(el => el.classList.remove('selected'));
                    focusableElements[prevIndex].classList.add('selected');
                    focusableElements[prevIndex].scrollIntoView({ block: 'nearest' });
                } else {
                    focusableElements[prevIndex].focus();
                }
            } else if (e.key === 'Enter') {
                // If it's a div list item (quick open, language, global results) simulate click
                if (currentIndex !== -1 && (focusableElements[currentIndex].classList.contains('quick-open-item') || focusableElements[currentIndex].classList.contains('quick-open-result'))) {
                    e.preventDefault();
                    focusableElements[currentIndex].click();
                }
                // Buttons and Inputs will naturally handle Enter via their own native focus or specific event listeners
            }
        }
    }
});

async function spawnTodoList() {
    const defaultName = "tasks.todo";
    const initialContent = "- [ ] ";

    // Create a new todo tab
    tabCounter++;
    const id = `tab-${tabCounter}`;

    const extensions = await getLanguageExtension("tasks.todo");
    const state = await import("./editor.js").then(m => m.createEditorState(initialContent, extensions, [createUpdateListener(id)], isWordWrapEnabled));

    const newTab = {
        id,
        path: null,
        title: defaultName,
        isUnsaved: false,
        isTodo: true, // Explicitly tag this tab type regardless of path/extension
        savedContent: initialContent,
        manualLanguage: null,
        autoLanguage: "todo",
        state
    };

    tabs.push(newTab);
    switchTab(id);

    // Auto focus the end of the checkbox
    if (editorView) {
        editorView.dispatch({ selection: { anchor: 6, head: 6 } });
        editorView.focus();
    }
    saveSessionDebounced();
}

async function spawnDocProcess() {
    const defaultName = "document.doc";
    const initialContent = "";

    // Create a new doc tab
    tabCounter++;
    const id = `tab-${tabCounter}`;

    const newTab = {
        id,
        path: null,
        title: defaultName,
        isUnsaved: false,
        isTodo: false,
        isDoc: true, // Explicitly tag this tab type
        savedContent: initialContent,
        manualLanguage: null,
        autoLanguage: null,
        state: null
    };

    tabs.push(newTab);
    switchTab(id);
    saveSessionDebounced();
}

/* -------------------------------------------------------------------------- */
/* Quick Open Palette Logic                                                   */
/* -------------------------------------------------------------------------- */

let quickOpenSelectedIndex = -1;
let currentQuickOpenMatches = [];

function toggleQuickOpen() {
    const modal = document.getElementById('quick-open-modal');
    const input = document.getElementById('quick-open-input');
    if (!modal || !input) return;

    if (modal.style.display === 'flex') {
        closeQuickOpen();
    } else {
        modal.style.display = 'flex';
        input.value = '';
        renderQuickOpenResults();

        // Ensure input gets focused after modal is displayed
        setTimeout(() => {
            input.focus();
        }, 10);
    }
}

function closeQuickOpen() {
    const modal = document.getElementById('quick-open-modal');
    if (modal) modal.style.display = 'none';
    if (editorView) editorView.focus();
}

window.addEventListener('DOMContentLoaded', () => {
    const modal = document.getElementById('quick-open-modal');
    if (modal) {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeQuickOpen();
        });
    }

    const input = document.getElementById('quick-open-input');
    if (input) {
        input.addEventListener('keydown', async (e) => {
            if (e.key === 'Escape') {
                closeQuickOpen();
            } else if (e.key === 'ArrowDown') {
                e.preventDefault();
                if (quickOpenSelectedIndex < currentQuickOpenMatches.length - 1) {
                    quickOpenSelectedIndex++;
                    updateQuickOpenSelection();
                }
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                if (quickOpenSelectedIndex > 0) {
                    quickOpenSelectedIndex--;
                    updateQuickOpenSelection();
                }
            } else if (e.key === 'Enter') {
                e.preventDefault();
                if (quickOpenSelectedIndex >= 0 && currentQuickOpenMatches[quickOpenSelectedIndex]) {
                    await openFileFromHistory(currentQuickOpenMatches[quickOpenSelectedIndex].path);
                }
            }
        });

        input.addEventListener('input', () => {
            renderQuickOpenResults();
        });
    }
});

function updateQuickOpenSelection() {
    const results = document.getElementById('quick-open-results');
    if (!results) return;

    const items = results.querySelectorAll('.quick-open-item');
    items.forEach((item, index) => {
        if (index === quickOpenSelectedIndex) {
            item.classList.add('selected');
            item.scrollIntoView({ block: 'nearest' });
        } else {
            item.classList.remove('selected');
        }
    });
}

function renderQuickOpenResults() {
    const input = document.getElementById('quick-open-input');
    const results = document.getElementById('quick-open-results');
    if (!input || !results) return;

    const query = input.value.toLowerCase();

    // Fuzzy search: filter history based on substrings
    if (!query) {
        currentQuickOpenMatches = fileHistory.map(path => ({ path, score: 0 }));
    } else {
        currentQuickOpenMatches = fileHistory
            .map(path => {
                const filename = getFilename(path).toLowerCase();
                const lowerPath = path.toLowerCase();

                // Score based on exact filename match > exact path match
                let score = -1;
                if (filename.includes(query)) score = 10;
                else if (lowerPath.includes(query)) score = 5;

                return { path, score, originalName: getFilename(path) };
            })
            .filter(item => item.score > 0)
            .sort((a, b) => b.score - a.score);
    }

    results.innerHTML = '';
    quickOpenSelectedIndex = currentQuickOpenMatches.length > 0 ? 0 : -1;

    if (currentQuickOpenMatches.length === 0) {
        const emptyState = document.createElement('div');
        emptyState.className = 'quick-open-empty';
        emptyState.textContent = 'No matching files found.';
        results.appendChild(emptyState);
        return;
    }

    currentQuickOpenMatches.forEach((match, index) => {
        const itemEl = document.createElement('div');
        itemEl.className = `quick-open-item ${index === 0 ? 'selected' : ''}`;

        const nameEl = document.createElement('div');
        nameEl.className = 'quick-open-filename';

        // Very basic highlighting of the matched substring in filename
        if (query && match.originalName.toLowerCase().includes(query)) {
            const startIdx = match.originalName.toLowerCase().indexOf(query);
            const before = match.originalName.substring(0, startIdx);
            const hl = match.originalName.substring(startIdx, startIdx + query.length);
            const after = match.originalName.substring(startIdx + query.length);
            nameEl.innerHTML = `${before}<span class="q-match">${hl}</span>${after}`;
        } else {
            nameEl.textContent = match.originalName || getFilename(match.path);
        }

        const pathEl = document.createElement('div');
        pathEl.className = 'quick-open-path';
        pathEl.textContent = match.path;

        itemEl.appendChild(nameEl);
        itemEl.appendChild(pathEl);

        itemEl.addEventListener('click', async () => {
            await openFileFromHistory(match.path);
        });

        itemEl.addEventListener('mouseenter', () => {
            quickOpenSelectedIndex = index;
            updateQuickOpenSelection();
        });

        results.appendChild(itemEl);
    });
}

/* -------------------------------------------------------------------------- */
/* Language Selection Palette Logic                                           */
/* -------------------------------------------------------------------------- */

let languageSelectedIndex = -1;
let currentLanguageMatches = [];
const supportedLanguages = [
    { name: 'Plain Text', ext: '' },
    { name: 'JavaScript', ext: 'js' },
    { name: 'TypeScript', ext: 'ts' },
    { name: 'Python', ext: 'py' },
    { name: 'HTML', ext: 'html' },
    { name: 'CSS', ext: 'css' },
    { name: 'C / C++', ext: 'cpp' },
    { name: 'Java', ext: 'java' },
    { name: 'JSON', ext: 'json' },
    { name: 'Markdown', ext: 'md' },
    { name: 'YAML', ext: 'yaml' },
    { name: 'Properties/INI', ext: 'ini' },
    { name: 'Shell/Bash', ext: 'sh' },
    { name: 'PowerShell', ext: 'ps1' },
    { name: 'Ruby', ext: 'rb' },
    { name: 'Go', ext: 'go' },
    { name: 'Rust', ext: 'rs' },
    { name: 'Todo List', ext: 'todo' }
];

function updateAutoSaveUI() {
    const btn = document.getElementById('btn-auto-save');
    const statusEl = document.getElementById('status-autosave');
    if (btn) {
        if (isAutoSaveEnabled) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    }
    if (statusEl) {
        statusEl.textContent = isAutoSaveEnabled ? 'Auto-Save: ON' : 'Auto-Save: OFF';
    }
}

function toggleLanguageOpen() {
    const modal = document.getElementById('language-modal');
    const input = document.getElementById('language-input');
    if (!modal || !input) return;

    if (modal.style.display === 'flex') {
        closeLanguageOpen();
    } else {
        modal.style.display = 'flex';
        input.value = '';
        renderLanguageResults();

        // Ensure input gets focused after modal is displayed
        setTimeout(() => {
            input.focus();
        }, 10);
    }
}

function closeLanguageOpen() {
    const modal = document.getElementById('language-modal');
    if (modal) modal.style.display = 'none';
    if (editorView) editorView.focus();
}

// Ensure the listener removes the state replace
async function setManualLanguage(ext) {
    closeLanguageOpen();
    if (!activeTabId) return;
    const tab = tabs.find(t => t.id === activeTabId);
    if (!tab || tab.isDoc) return;

    tab.manualLanguage = ext;

    // determine content to re-init state
    let content = '';
    if (editorView) {
        content = editorView.state.doc.toString();
    } else {
        content = tab.state.doc.toString();
    }

    const extensions = await getLanguageExtension(tab.path, content, ext);
    tab.state = applyLanguageExtensionToState(tab.state, extensions);

    if (editorView) {
        setLanguageExtension(editorView, extensions);
    }

    saveSessionDebounced();
    updateCursorStatus(); // also updates language label
}

window.addEventListener('DOMContentLoaded', () => {
    const langModal = document.getElementById('language-modal');
    if (langModal) {
        langModal.addEventListener('click', (e) => {
            if (e.target === langModal) closeLanguageOpen();
        });
    }

    const langInput = document.getElementById('language-input');
    if (langInput) {
        langInput.addEventListener('keydown', async (e) => {
            if (e.key === 'Escape') {
                closeLanguageOpen();
            } else if (e.key === 'ArrowDown') {
                e.preventDefault();
                if (languageSelectedIndex < currentLanguageMatches.length - 1) {
                    languageSelectedIndex++;
                    updateLanguageSelection();
                }
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                if (languageSelectedIndex > 0) {
                    languageSelectedIndex--;
                    updateLanguageSelection();
                }
            } else if (e.key === 'Enter') {
                e.preventDefault();
                if (languageSelectedIndex >= 0 && currentLanguageMatches[languageSelectedIndex]) {
                    await setManualLanguage(currentLanguageMatches[languageSelectedIndex].ext);
                }
            }
        });

        langInput.addEventListener('input', () => {
            renderLanguageResults();
        });
    }

    const statusLang = document.getElementById('status-language');
    if (statusLang) {
        statusLang.addEventListener('click', toggleLanguageOpen);
    }
});

function updateLanguageSelection() {
    const results = document.getElementById('language-results');
    if (!results) return;

    const items = results.querySelectorAll('.quick-open-item');
    items.forEach((item, index) => {
        if (index === languageSelectedIndex) {
            item.classList.add('selected');
            item.scrollIntoView({ block: 'nearest' });
        } else {
            item.classList.remove('selected');
        }
    });
}

function renderLanguageResults() {
    const input = document.getElementById('language-input');
    const results = document.getElementById('language-results');
    if (!input || !results) return;

    const query = input.value.toLowerCase();

    if (!query) {
        currentLanguageMatches = supportedLanguages.map(l => ({ ...l, score: 0 }));
    } else {
        currentLanguageMatches = supportedLanguages
            .map(lang => {
                const name = lang.name.toLowerCase();
                let score = -1;
                if (name.includes(query)) score = 10;
                else if (lang.ext.includes(query)) score = 5;
                return { ...lang, score };
            })
            .filter(item => item.score > 0)
            .sort((a, b) => b.score - a.score);
    }

    results.innerHTML = '';
    languageSelectedIndex = currentLanguageMatches.length > 0 ? 0 : -1;

    if (currentLanguageMatches.length === 0) {
        const emptyState = document.createElement('div');
        emptyState.className = 'quick-open-empty';
        emptyState.textContent = 'No matching languages found.';
        results.appendChild(emptyState);
        return;
    }

    currentLanguageMatches.forEach((match, index) => {
        const itemEl = document.createElement('div');
        itemEl.className = `quick-open-item ${index === 0 ? 'selected' : ''}`;

        const nameEl = document.createElement('div');
        nameEl.className = 'quick-open-filename';

        if (query && match.name.toLowerCase().includes(query)) {
            const startIdx = match.name.toLowerCase().indexOf(query);
            const before = match.name.substring(0, startIdx);
            const hl = match.name.substring(startIdx, startIdx + query.length);
            const after = match.name.substring(startIdx + query.length);
            nameEl.innerHTML = `${before}<span class="q-match">${hl}</span>${after}`;
        } else {
            nameEl.textContent = match.name;
        }

        itemEl.appendChild(nameEl);

        itemEl.addEventListener('click', async () => {
            await setManualLanguage(match.ext);
        });

        itemEl.addEventListener('mouseenter', () => {
            languageSelectedIndex = index;
            updateLanguageSelection();
        });

        results.appendChild(itemEl);
    });
}

/* -------------------------------------------------------------------------- */
/* File History Data Management                                               */
/* -------------------------------------------------------------------------- */

function loadFileHistory() {
    const historyJson = localStorage.getItem('lightpad-history');
    if (historyJson) {
        try {
            fileHistory = JSON.parse(historyJson);
        } catch (e) {
            fileHistory = [];
        }
    }
}

function saveFileHistory() {
    localStorage.setItem('lightpad-history', JSON.stringify(fileHistory));
}

function addToFileHistory(path) {
    if (!path) return;
    // Remove if exists to push to front
    fileHistory = fileHistory.filter(p => p !== path);
    fileHistory.unshift(path);
    // Keep max 50 items
    if (fileHistory.length > 50) {
        fileHistory = fileHistory.slice(0, 50);
    }
    saveFileHistory();
}

function removeFromFileHistory(path) {
    fileHistory = fileHistory.filter(p => p !== path);
    saveFileHistory();
}

async function openFileFromHistory(path) {
    closeQuickOpen();

    // Check if already open open in a tab
    const existingTab = tabs.find(t => t.path === path);
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
            const newT = tabs[tabs.length - 1];
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

/* -------------------------------------------------------------------------- */
/* Global Search & Replace                                                    */
/* -------------------------------------------------------------------------- */

let globalSearchMatches = [];

function toggleGlobalSearch() {
    const modal = document.getElementById('global-search-modal');
    const input = document.getElementById('global-search-input');
    if (!modal || !input) return;

    if (modal.style.display === 'flex') {
        closeGlobalSearch();
    } else {
        modal.style.display = 'flex';
        input.value = '';
        document.getElementById('global-replace-input').value = '';
        document.getElementById('global-search-results').innerHTML = '';
        globalSearchMatches = [];
        setTimeout(() => input.focus(), 10);
    }
}

function closeGlobalSearch() {
    const modal = document.getElementById('global-search-modal');
    if (modal) modal.style.display = 'none';
    if (editorView) editorView.focus();
}

function performGlobalSearch() {
    const query = document.getElementById('global-search-input').value;
    const matchCase = document.getElementById('global-search-case').checked;
    const resultsContainer = document.getElementById('global-search-results');

    globalSearchMatches = [];
    resultsContainer.innerHTML = '';

    if (!query) return;

    tabs.forEach(tab => {
        let content = '';
        if (tab.id === activeTabId && editorView && !tab.isDoc) {
            content = editorView.state.doc.toString();
        } else if (tab.id === activeTabId && quillView && tab.isDoc) {
            content = quillView.getText();
        } else if (tab.state) {
            content = tab.state.doc.toString();
        } else {
            content = tab.savedContent || '';
        }

        const lines = content.split('\n');
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const searchLine = matchCase ? line : line.toLowerCase();
            const searchQuery = matchCase ? query : query.toLowerCase();

            const col = searchLine.indexOf(searchQuery);
            if (col !== -1) {
                globalSearchMatches.push({
                    tabId: tab.id,
                    filename: getFilename(tab.path) || tab.title,
                    line: i + 1,
                    col: col + 1,
                    text: line.trim() || '...',
                    fullLineText: line
                });
            }
        }
    });

    renderGlobalSearchResults();
}

function renderGlobalSearchResults() {
    const resultsContainer = document.getElementById('global-search-results');
    const query = document.getElementById('global-search-input').value;
    resultsContainer.innerHTML = '';

    if (globalSearchMatches.length === 0) {
        const noRes = document.createElement('div');
        noRes.className = 'gs-empty';
        noRes.textContent = 'No matches found in open tabs.';
        resultsContainer.appendChild(noRes);
        return;
    }

    // Group results by file
    const grouped = {};
    globalSearchMatches.forEach(match => {
        if (!grouped[match.tabId]) {
            grouped[match.tabId] = { filename: match.filename, matches: [] };
        }
        grouped[match.tabId].matches.push(match);
    });

    // Count total
    const countEl = document.createElement('div');
    countEl.className = 'gs-count';
    countEl.textContent = `${globalSearchMatches.length} result${globalSearchMatches.length !== 1 ? 's' : ''} in ${Object.keys(grouped).length} file${Object.keys(grouped).length !== 1 ? 's' : ''}`;
    resultsContainer.appendChild(countEl);

    Object.keys(grouped).forEach(tabId => {
        const group = grouped[tabId];

        // File header
        const fileHeader = document.createElement('div');
        fileHeader.className = 'gs-file-header';
        fileHeader.innerHTML = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg><span>${group.filename}</span><span class="gs-file-count">${group.matches.length}</span>`;
        resultsContainer.appendChild(fileHeader);

        group.matches.forEach(match => {
            const item = document.createElement('div');
            item.className = 'gs-result-item';

            const lineNum = document.createElement('span');
            lineNum.className = 'gs-line-num';
            lineNum.textContent = match.line;

            const snippet = document.createElement('span');
            snippet.className = 'gs-snippet';

            // Highlight the match within the snippet
            const trimmedText = match.text;
            const matchCase = document.getElementById('global-search-case')?.checked;
            const searchText = matchCase ? trimmedText : trimmedText.toLowerCase();
            const searchQuery = matchCase ? query : query.toLowerCase();
            const matchIdx = searchText.indexOf(searchQuery);

            if (matchIdx !== -1) {
                const before = trimmedText.substring(0, matchIdx);
                const hl = trimmedText.substring(matchIdx, matchIdx + query.length);
                const after = trimmedText.substring(matchIdx + query.length);
                snippet.innerHTML = `${escapeHtml(before)}<span class="gs-highlight">${escapeHtml(hl)}</span>${escapeHtml(after)}`;
            } else {
                snippet.textContent = trimmedText;
            }

            item.appendChild(lineNum);
            item.appendChild(snippet);

            item.addEventListener('click', () => {
                const searchLen = query.length;
                switchTab(match.tabId);
                closeGlobalSearch();

                // Use requestAnimationFrame to ensure editorView is ready after switchTab
                requestAnimationFrame(() => {
                    const tab = tabs.find(t => t.id === match.tabId);
                    if (editorView && tab && !tab.isDoc) {
                        try {
                            const lineInfo = editorView.state.doc.line(match.line);
                            const from = lineInfo.from + match.col - 1;
                            const to = from + searchLen;
                            editorView.dispatch({
                                selection: { anchor: from, head: to },
                                effects: EditorView.scrollIntoView(from, { y: "center" })
                            });
                            editorView.focus();
                        } catch (e) {
                            console.warn('Failed to navigate to search result', e);
                        }
                    }
                });
            });

            resultsContainer.appendChild(item);
        });
    });
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function performGlobalReplaceAll() {
    const query = document.getElementById('global-search-input').value;
    const replaceWith = document.getElementById('global-replace-input').value;
    const matchCase = document.getElementById('global-search-case').checked;

    if (!query) return;

    let totalReplaced = 0;

    tabs.forEach(tab => {
        let content = '';
        if (tab.id === activeTabId && editorView && !tab.isDoc) {
            content = editorView.state.doc.toString();
        } else if (tab.id === activeTabId && quillView && tab.isDoc) {
            content = quillView.getText();
        } else if (tab.state) {
            content = tab.state.doc.toString();
        } else {
            content = tab.savedContent || '';
        }

        if (!content) return;

        let regexFlags = 'g';
        if (!matchCase) regexFlags += 'i';

        // Escape regex special chars for literal string replacement
        const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(escapedQuery, regexFlags);

        if (regex.test(content)) {
            const matchesCount = (content.match(regex) || []).length;
            totalReplaced += matchesCount;
            const newContent = content.replace(regex, replaceWith);

            if (tab.id === activeTabId && editorView && !tab.isDoc) {
                editorView.dispatch({
                    changes: { from: 0, to: editorView.state.doc.length, insert: newContent }
                });
            } else if (tab.id === activeTabId && quillView && tab.isDoc) {
                quillView.setText(newContent);
            } else if (tab.state) {
                tab.state = tab.state.update({
                    changes: { from: 0, to: tab.state.doc.length, insert: newContent }
                }).state;
            } else {
                tab.savedContent = newContent;
            }
            tab.isUnsaved = true;
            tab.needsRender = true;
        }
    });

    if (totalReplaced > 0) {
        showStatus(`Replaced ${totalReplaced} occurrence(s) left in open tabs.`);
        renderTabs();
        saveSessionDebounced();
        performGlobalSearch(); // refresh results
    } else {
        showStatus(`No occurrences found to replace.`);
    }
}

window.addEventListener('DOMContentLoaded', () => {
    // ... existing quick-open setups

    // Global search setups
    const searchModal = document.getElementById('global-search-modal');
    if (searchModal) {
        searchModal.addEventListener('click', (e) => {
            if (e.target === searchModal) closeGlobalSearch();
        });
    }

    const searchInput = document.getElementById('global-search-input');
    if (searchInput) {
        let debounceTimer;
        searchInput.addEventListener('input', () => {
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(performGlobalSearch, 300);
        });
        searchInput.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') closeGlobalSearch();
        });
    }

    const replaceInput = document.getElementById('global-replace-input');
    if (replaceInput) {
        replaceInput.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') closeGlobalSearch();
            if (e.key === 'Enter') performGlobalReplaceAll();
        });
    }

    const replaceBtn = document.getElementById('btn-global-replace-all');
    if (replaceBtn) replaceBtn.addEventListener('click', performGlobalReplaceAll);

    const matchCaseCB = document.getElementById('global-search-case');
    if (matchCaseCB) matchCaseCB.addEventListener('change', performGlobalSearch);

    const btnGlobalSearchIcon = document.getElementById('btn-global-search');
    if (btnGlobalSearchIcon) {
        btnGlobalSearchIcon.addEventListener('click', toggleGlobalSearch);
    }
});

/* -------------------------------------------------------------------------- */
/* File Drag-and-Drop to Open                                                 */
/* -------------------------------------------------------------------------- */

async function openDroppedPaths(paths) {
    for (const filePath of paths) {
        try {
            const existing = tabs.find(t => t.path === filePath);
            if (existing) { switchTab(existing.id); continue; }

            const content = await readTextFile(filePath);
            const name = getFilename(filePath);

            await createNewTab(filePath, content);
            try {
                const newlyCreatedTab = tabs[tabs.length - 1]; // Assume the new tab is appended to end
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

async function setupFileDrop() {
    const overlay = document.getElementById('file-drop-overlay');
    if (!overlay) return;

    if (window.__TAURI__) {
        const { listen } = window.__TAURI__.event;

        await listen('tauri://file-drop-hover', () => {
            overlay.style.display = 'flex';
            document.body.classList.add('is-dragging-file');
        });

        await listen('tauri://file-drop-cancelled', () => {
            overlay.style.display = 'none';
            document.body.classList.remove('is-dragging-file');
        });

        await listen('tauri://file-drop', async (event) => {
            overlay.style.display = 'none';
            document.body.classList.remove('is-dragging-file');
            const paths = event.payload;
            if (paths && paths.length > 0) {
                await openDroppedPaths(paths);
            }
        });
    } else {
        // Browser fallback
        let dragDepth = 0;
        function isFileDrag(e) {
            return e.dataTransfer && e.dataTransfer.types &&
                Array.from(e.dataTransfer.types).includes('Files');
        }
        document.addEventListener('dragenter', (e) => {
            if (!isFileDrag(e)) return;
            e.preventDefault();
            dragDepth++;
            overlay.style.display = 'flex';
            document.body.classList.add('is-dragging-file');
        });
        document.addEventListener('dragleave', () => {
            dragDepth = Math.max(0, dragDepth - 1);
            if (dragDepth === 0) {
                overlay.style.display = 'none';
                document.body.classList.remove('is-dragging-file');
            }
        });
        document.addEventListener('dragover', (e) => {
            if (!isFileDrag(e)) return;
            e.preventDefault();
            e.dataTransfer.dropEffect = 'copy';
        });
        document.addEventListener('drop', async (e) => {
            e.preventDefault();
            dragDepth = 0;
            overlay.style.display = 'none';
            document.body.classList.remove('is-dragging-file');

            const files = Array.from(e.dataTransfer.files || []);
            for (const file of files) {
                try {
                    const content = await file.text();
                    await createNewTab(null, content);
                    showStatus(`Opened: ${file.name}`);
                } catch (err) {
                    showStatus(`Error opening: ${file.name}`);
                }
            }
        });
    }
}
