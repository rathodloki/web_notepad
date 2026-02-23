import { createEditorState, createEditorView, getLanguageExtension } from './editor.js';
import { EditorView } from "@codemirror/view";

let invoke, appWindow, readTextFile, writeTextFile, openDialog, saveDialog;

const editorContainer = document.getElementById('editor-container');
const statusText = document.getElementById('status-text');
const statusCursor = document.getElementById('status-cursor');
const statusEncoding = document.getElementById('status-encoding');
const tabBar = document.getElementById('tab-bar');

let tabs = [];
let activeTabId = null;
let editorView = null;
let tabCounter = 0;
let sessionTimeout = null;
let contextMenuTargetId = null;

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
}

function saveSessionDebounced() {
    if (sessionTimeout) clearTimeout(sessionTimeout);
    sessionTimeout = setTimeout(() => {
        saveSession();
    }, 1000);
}

function saveSession() {
    const sessionTabs = tabs.map(tab => {
        const content = (tab.id === activeTabId && editorView)
            ? editorView.state.doc.toString()
            : tab.state.doc.toString();

        return {
            id: tab.id,
            path: tab.path,
            title: tab.title,
            isUnsaved: tab.isUnsaved,
            content: tab.isUnsaved || !tab.path ? content : null
        };
    });

    let cursorPos = 0;
    if (editorView) {
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
                } catch (e) { }
            } else if (!t.path && !t.isUnsaved) {
                savedContent = content || '';
            }

            const num = parseInt(t.id.split('-')[1]);
            if (num > tabCounter) tabCounter = num;

            const extensions = await getLanguageExtension(t.path);

            const newTab = {
                id: t.id,
                path: t.path,
                title: t.title,
                isUnsaved: t.isUnsaved,
                savedContent: savedContent,
                state: createEditorState(content || '', [...extensions, createUpdateListener(t.id)])
            };
            tabs.push(newTab);
        }

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
                    renderTabs();
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

function renderTabs() {
    tabBar.innerHTML = '';
    tabs.forEach(tab => {
        const tabEl = document.createElement('div');
        tabEl.className = `tab ${tab.id === activeTabId ? 'active' : ''}`;

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
            if (e.target.closest('.tab-close')) return;
            switchTab(tab.id);
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

        tabBar.appendChild(tabEl);
    });
}

async function createNewTab(path = null, content = '') {
    tabCounter++;
    const id = `tab-${tabCounter}`;

    const extensions = await getLanguageExtension(path);
    const state = createEditorState(content, [...extensions, createUpdateListener(id)]);

    const newTab = {
        id,
        path,
        title: 'Untitled',
        isUnsaved: false,
        savedContent: content,
        state
    };

    tabs.push(newTab);
    switchTab(id);
    saveSessionDebounced();
}

function switchTab(id) {
    if (editorView && activeTabId) {
        const prevTab = tabs.find(t => t.id === activeTabId);
        if (prevTab) {
            prevTab.state = editorView.state;
        }
    }

    if (id === null) {
        activeTabId = null;
        if (editorView) {
            editorView.destroy();
            editorView = null;
        }
        renderTabs();
        updateTitle();
        statusCursor.textContent = '';
        saveSessionDebounced();
        return;
    }

    activeTabId = id;
    const tab = tabs.find(t => t.id === id);
    if (!tab) return;

    if (editorView) {
        editorView.setState(tab.state);
    } else {
        editorView = createEditorView(tab.state, editorContainer);
    }

    renderTabs();
    updateTitle();
    updateCursorStatus();
    editorView.focus();
    saveSessionDebounced();
}

function askDiscardUI(filename, multiple) {
    return new Promise((resolve) => {
        const modal = document.getElementById('discard-modal');
        const msg = document.getElementById('discard-modal-message');
        const btnYes = document.getElementById('modal-btn-yes');
        const btnNo = document.getElementById('modal-btn-no');
        const btnYTA = document.getElementById('modal-btn-yestoall');

        msg.textContent = `Discard unsaved changes to "${filename}"?`;
        btnYTA.style.display = multiple ? 'inline-block' : 'none';
        modal.style.display = 'flex';

        const handleYes = () => { cleanup(); resolve('yes'); };
        const handleNo = () => { cleanup(); resolve('no'); };
        const handleYTA = () => { cleanup(); resolve('all'); };

        const cleanup = () => {
            modal.style.display = 'none';
            btnYes.removeEventListener('click', handleYes);
            btnNo.removeEventListener('click', handleNo);
            btnYTA.removeEventListener('click', handleYTA);
        };

        btnYes.addEventListener('click', handleYes);
        btnNo.addEventListener('click', handleNo);
        btnYTA.addEventListener('click', handleYTA);
    });
}

async function closeTab(id, forceClose = false, multipleFiles = false) {
    const tabIndex = tabs.findIndex(t => t.id === id);
    if (tabIndex === -1) return false;
    const tab = tabs[tabIndex];

    let result = 'closed';

    if (tab.isUnsaved) {
        let askPrompt = true;

        const content = (tab.id === activeTabId && editorView)
            ? editorView.state.doc.toString()
            : tab.state.doc.toString();

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
            let answer = await askDiscardUI(getFilename(tab.path), multipleFiles);
            if (answer === 'no') return false;
            if (answer === 'all') result = 'force_all';
        }
    }

    // Since we awaited, the array might have shifted index. Find again to safely splice.
    const newTabIndex = tabs.findIndex(t => t.id === id);
    if (newTabIndex === -1) return false;

    tabs.splice(newTabIndex, 1);
    if (tabs.length === 0) {
        switchTab(null);
    } else if (activeTabId === id) {
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
    let multipleFiles = unsavedTabs.length > 1;

    const toClose = [...tabsToClose];
    for (const t of toClose) {
        const res = await closeTab(t.id, forceClose, multipleFiles);
        if (res === 'force_all') {
            forceClose = true;
        }
    }
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
            showStatus('File loaded');
        }
    } catch (e) {
        console.error(e);
        showStatus('Error opening file');
    }
}

async function saveFile() {
    if (!window.__TAURI__) return alert('Saving files is only supported in the app.');

    const tab = tabs.find(t => t.id === activeTabId);
    if (!tab) return;

    try {
        let pathToSave = tab.path;
        if (!pathToSave) {
            pathToSave = await saveDialog({
                filters: [{ name: 'All Files', extensions: ['*'] }]
            });
        }

        if (pathToSave) {
            const content = editorView.state.doc.toString();
            await writeTextFile(pathToSave, content);

            tab.path = pathToSave;
            tab.isUnsaved = false;
            tab.savedContent = content;

            renderTabs();
            updateTitle();
            showStatus('Saved successfully');
            saveSessionDebounced();
        }
    } catch (e) {
        console.error(e);
        showStatus('Error saving file');
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

        loadSession();
    } else {
        console.warn("Tauri API not found. Running in browser mode.");
        loadSession();
    }

    document.getElementById('btn-open').addEventListener('click', openFile);
    document.getElementById('btn-save').addEventListener('click', saveFile);
    document.getElementById('btn-find').addEventListener('click', () => {
        if (editorView) {
            import('@codemirror/search').then(({ openSearchPanel }) => {
                openSearchPanel(editorView);
            });
        }
    });

    const newTabBtn = document.getElementById('btn-new-tab');
    if (newTabBtn) {
        newTabBtn.addEventListener('click', async () => await createNewTab());
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
});

// Keyboard shortcuts
window.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        saveFile();
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 'o') {
        e.preventDefault();
        openFile();
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 'w') {
        e.preventDefault();
        if (activeTabId) closeTab(activeTabId);
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
        e.preventDefault();
        createNewTab();
    }
});
