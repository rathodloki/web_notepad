import { createEditorState, createEditorView, getLanguageExtension } from './editor.js';
import { EditorView } from "@codemirror/view";

// Editor.js and Plugins
import EditorJS from '@editorjs/editorjs';
import Header from '@editorjs/header';
import List from '@editorjs/list';
import Checklist from '@editorjs/checklist';
import Quote from '@editorjs/quote';
import CodeTool from '@editorjs/code';
import LinkTool from '@editorjs/link';
import Marker from '@editorjs/marker';
import InlineCode from '@editorjs/inline-code';
import Delimiter from '@editorjs/delimiter';
import ImageTool from '@editorjs/image';

let invoke, appWindow, readTextFile, writeTextFile, openDialog, saveDialog;

const editorContainer = document.getElementById('editor-container');
const editorJsContainer = document.getElementById('editorjs-container');
const statusText = document.getElementById('status-text');
const statusCursor = document.getElementById('status-cursor');
const statusEncoding = document.getElementById('status-encoding');
const tabBar = document.getElementById('tab-bar');

let tabs = [];
let activeTabId = null;
let editorView = null;
let editorJsView = null;
let tabCounter = 0;
let sessionTimeout = null;
let contextMenuTargetId = null;

// File History tracking
let fileHistory = [];

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

async function saveSession() {
    let activeDocContent = null;
    const activeTab = tabs.find(t => t.id === activeTabId);
    if (activeTab && activeTab.isDoc && editorJsView) {
        try {
            const data = await editorJsView.save();
            activeDocContent = JSON.stringify(data);
            activeTab.savedContent = activeDocContent;
        } catch (e) {
            console.error("EditorJS save failed", e);
        }
    }

    const sessionTabs = tabs.map(tab => {
        let content = null;
        if (tab.isDoc) {
            content = (tab.id === activeTabId && activeDocContent) ? activeDocContent : tab.savedContent;
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

            const extensions = await getLanguageExtension(langPath);

            const newTab = {
                id: t.id,
                path: t.path,
                title: t.title,
                isUnsaved: t.isUnsaved,
                isTodo: isTodo,
                isDoc: isDoc,
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
        let classes = ['tab'];
        if (tab.id === activeTabId) classes.push('active');
        if (tab.isTodo) classes.push('is-todo');
        if (tab.isDoc) classes.push('is-doc');

        const tabEl = document.createElement('div');
        tabEl.className = classes.join(' ');

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

    const isTodo = path ? path.endsWith('.todo') : false;
    const isDoc = path ? path.endsWith('.doc') : false;

    let state = null;
    if (!isDoc) {
        const extensions = await getLanguageExtension(path);
        state = createEditorState(content, [...extensions, createUpdateListener(id)]);
    }

    const newTab = {
        id,
        path,
        title: 'Untitled',
        isUnsaved: false,
        isTodo,
        isDoc,
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
        if (editorJsView) {
            editorJsView.destroy();
            editorJsView = null;
        }
        editorContainer.style.display = 'block';
        editorJsContainer.style.display = 'none';

        renderTabs();
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
        editorJsContainer.style.display = 'block';

        if (editorJsView) {
            editorJsView.destroy();
            editorJsView = null;
        }

        let defaultData = {};
        try {
            if (tab.savedContent) {
                defaultData = JSON.parse(tab.savedContent);
            }
        } catch (e) { }

        editorJsView = new EditorJS({
            holder: 'editorjs-container',
            data: defaultData,
            autofocus: true,
            tools: {
                header: Header,
                list: List,
                checklist: Checklist,
                quote: Quote,
                code: CodeTool,
                linkTool: LinkTool,
                marker: Marker,
                inlineCode: InlineCode,
                delimiter: Delimiter,
                image: ImageTool
            },
            onChange: () => {
                tab.isUnsaved = true;
                tab.needsRender = true;
                renderTabs();
                saveSessionDebounced();
            }
        });
    } else {
        editorContainer.style.display = 'block';
        editorJsContainer.style.display = 'none';

        if (editorView) {
            editorView.setState(tab.state);
        } else {
            editorView = createEditorView(tab.state, editorContainer);
        }
        editorView.focus();
    }

    renderTabs();
    updateTitle();
    updateCursorStatus();
    saveSessionDebounced();
}

function askConfirmUI(message, multiple = false) {
    return new Promise((resolve) => {
        const modal = document.getElementById('discard-modal');
        const msg = document.getElementById('discard-modal-message');
        const btnYes = document.getElementById('modal-btn-yes');
        const btnNo = document.getElementById('modal-btn-no');
        const btnYTA = document.getElementById('modal-btn-yestoall');

        msg.textContent = message;
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

        // Auto-focus the Yes button for fluid keyboard usage
        setTimeout(() => btnYes.focus(), 10);
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
            content = (tab.id === activeTabId && editorJsView) ? JSON.stringify(await editorJsView.save()) : tab.savedContent;
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
            let answer = await askConfirmUI(`Discard unsaved changes to "${getFilename(tab.path)}"?`, multipleFiles);
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
            addToFileHistory(selected);
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
            let filters = [{ name: 'All Files', extensions: ['*'] }];
            if (tab.isTodo) {
                filters = [{ name: 'Todo Checklist', extensions: ['todo'] }];
            } else if (tab.isDoc) {
                filters = [{ name: 'Notion Document', extensions: ['doc'] }];
            }

            pathToSave = await saveDialog({
                filters: filters
            });
        }

        if (pathToSave) {
            let content = '';
            if (tab.isDoc) {
                if (editorJsView) {
                    const data = await editorJsView.save();
                    content = JSON.stringify(data);
                } else {
                    content = tab.savedContent || '{}';
                }
            } else {
                content = editorView.state.doc.toString();
            }

            await writeTextFile(pathToSave, content);

            tab.path = pathToSave;
            tab.isUnsaved = false;
            tab.savedContent = content;

            addToFileHistory(pathToSave);
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

    const newTabBtn = document.getElementById('btn-new-tab');
    if (newTabBtn) {
        newTabBtn.addEventListener('click', async () => await createNewTab());
    }

    const todoBtn = document.getElementById('btn-todo');
    if (todoBtn) {
        todoBtn.addEventListener('click', spawnTodoList);
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
window.addEventListener('keydown', async (e) => {
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
    // Ctrl+W / Cmd+W (Close Current)
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'w') {
        e.preventDefault();
        if (activeTabId) await closeTab(activeTabId);
    }
    // Ctrl+Shift+W / Cmd+Shift+W (Close All)
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'w') {
        e.preventDefault();
        const tabsToClose = [...tabs];
        await closeMultipleTabs(tabsToClose);
    }
    // Ctrl+N / Cmd+N (New File)
    // Ctrl+T / Cmd+T (Open File History Search)
    if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === 'n' || e.key.toLowerCase() === 't')) {
        e.preventDefault();
        if (e.key.toLowerCase() === 't') {
            toggleQuickOpen();
        } else {
            await createNewTab();
        }
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
});

async function spawnTodoList() {
    const defaultName = "tasks.todo";
    const initialContent = "- [ ] ";

    // Create a new todo tab
    tabCounter++;
    const id = `tab-${tabCounter}`;

    const extensions = await getLanguageExtension("tasks.todo");
    const state = await import("./editor.js").then(m => m.createEditorState(initialContent, [...extensions, createUpdateListener(id)]));

    const newTab = {
        id,
        path: null,
        title: defaultName,
        isUnsaved: true,
        isTodo: true, // Explicitly tag this tab type regardless of path/extension
        savedContent: null,
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
    const initialContent = "{}";

    // Create a new doc tab
    tabCounter++;
    const id = `tab-${tabCounter}`;

    const newTab = {
        id,
        path: null,
        title: defaultName,
        isUnsaved: true,
        isTodo: false,
        isDoc: true, // Explicitly tag this tab type
        savedContent: initialContent,
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
        showStatus('File loaded');
        // Push back to front
        addToFileHistory(path);
    } catch (e) {
        console.error(e);
        showStatus('Error opening file from history');
        removeFromFileHistory(path);
    }
}
