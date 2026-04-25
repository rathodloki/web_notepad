import { state } from './state.js';
import { createEditorState, createEditorView, getLanguageExtension, setLanguageExtension, applyLanguageExtensionToState, detectLanguageFromContent } from './editor.js';
import { renderTabs, updateActiveTabUI } from './tabs-ui.js';
import { showStatus, updateCursorStatus, updateTitle } from './status-bar.js';
import { saveSessionDebounced, autoSaveDiskDebounced } from './session.js';
import { askConfirmUI, askLinkUI } from './overlays.js';
import { invoke, readTextFile, writeTextFile } from './tauri-bridge.js';
import { getFilename } from './utils.js';
import { EditorView } from '@codemirror/view';

export const syncChannel = new BroadcastChannel('lightpad_sync');

let isPromptingReload = false;
export let currentCloseBatch = null;
export let closedTabsHistory = [];

syncChannel.onmessage = (event) => {
    const { type, path, content, mtime } = event.data;
    if (type === 'file_saved') {
        const tab = state.tabs.find(t => t.path === path);
        if (tab && tab.lastModified && mtime > tab.lastModified) {
            handleExternalFileChange(path, mtime, content);
        }
    }
};

export function handleExternalFileChange(path, mtime, content = null) {
    const tab = state.tabs.find(t => t.path === path);
    if (tab) {
        if (!tab.isUnsaved) {
            tab.lastModified = mtime;
            if (content !== null) {
                tab.savedContent = content;
                if (state.activeTabId === tab.id) {
                     if (tab.isDoc && state.quillView) state.quillView.root.innerHTML = content;
                     else if (state.editorView) {
                         state.editorView.dispatch({
                             changes: { from: 0, to: state.editorView.state.doc.length, insert: content }
                         });
                     }
                } else if (!tab.isDoc && tab.state) {
                     tab.state = tab.state.update({
                         changes: { from: 0, to: tab.state.doc.length, insert: content }
                     }).state;
                }
            } else {
                tab.externalModified = mtime;
                checkPendingReload(tab);
            }
        } else {
            if (!tab.externalModified) {
                tab.externalModified = mtime;
                tab.isUnsaved = true;
                tab.needsRender = true;
                renderTabs();
                checkPendingReload(tab); 
            }
        }
    }
}

export async function checkPendingReload(tab) {
    if (!tab) return;
    if (state.activeTabId === tab.id && tab.externalModified && !isPromptingReload && invoke) {
        isPromptingReload = true;
        let answer = await askConfirmUI(`New changes detected on disk for "${getFilename(tab.path)}". Reload to see?`, true);
        isPromptingReload = false;
        
        if (answer === 'yes') {
            try {
                const newContent = await readTextFile(tab.path);
                tab.savedContent = newContent;
                tab.lastModified = tab.externalModified;
                tab.externalModified = null;
                tab.isUnsaved = false;
                tab.needsRender = true;
                
                if (state.activeTabId === tab.id) {
                     if (tab.isDoc && state.quillView) state.quillView.root.innerHTML = newContent;
                     else if (state.editorView) {
                         state.editorView.dispatch({
                             changes: { from: 0, to: state.editorView.state.doc.length, insert: newContent }
                         });
                     }
                } else if (!tab.isDoc && tab.state) {
                     tab.state = tab.state.update({
                         changes: { from: 0, to: tab.state.doc.length, insert: newContent }
                     }).state;
                }
                showStatus(`Reloaded ${getFilename(tab.path)}`);
            } catch (e) {
                console.error("Popup File Read error", e);
            }
        } else if (answer === 'no') {
            tab.externalModified = null; 
            tab.isUnsaved = true; 
            showStatus(`Ignored external changes for ${getFilename(tab.path)}`);
        }
        renderTabs();
    }
}

export function createUpdateListener(id) {
    return EditorView.updateListener.of((update) => {
        if (update.docChanged) {
            const tab = state.tabs.find(t => t.id === id);
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

                if (isNowUnsaved && state.isAutoSaveEnabled) {
                    autoSaveDiskDebounced(tab);
                }

                if (state.isMarkdownPreviewEnabled && id === state.activeTabId && typeof marked !== 'undefined' && typeof DOMPurify !== 'undefined') {
                    if (window.renderMarkdownPreview) window.renderMarkdownPreview(currentContent);
                }

                if (!tab.manualLanguage && !tab.isTodo && !tab.isDoc) {
                    let newAutoExt = detectLanguageFromContent(currentContent);
                    if (!newAutoExt && tab.path) newAutoExt = tab.path.split('.').pop().toLowerCase();

                    if (newAutoExt !== tab.autoLanguage) {
                        tab.autoLanguage = newAutoExt;
                        getLanguageExtension(tab.path, currentContent).then(extensions => {
                            if (tab.autoLanguage === newAutoExt) {
                                tab.state = applyLanguageExtensionToState(tab.state, extensions);
                                if (state.activeTabId === tab.id && state.editorView) {
                                    setLanguageExtension(state.editorView, extensions);
                                    updateCursorStatus();
                                }
                            }
                        });
                    }
                }
            }
            saveSessionDebounced();
        }
        if (update.selectionSet && id === state.activeTabId) {
            updateCursorStatus();
            saveSessionDebounced();
        }
    });
}

export async function createEditorStateFromContent(path, content, isTodo = false, isDoc = false, manualLanguage = null, id = null) {
    if (isDoc) return null;
    let langPath = path;
    if (isTodo) langPath = "tasks.todo";
    const extensions = await getLanguageExtension(langPath, content, manualLanguage);
    const listeners = id ? [createUpdateListener(id)] : [];
    return createEditorState(content || '', extensions, listeners, state.isWordWrapEnabled);
}

export async function createNewTab(path = null, content = '') {
    state.tabCounter++;
    const id = `tab-${state.tabCounter}`;

    const isTodo = path ? path.endsWith('.todo') : false;
    const isDoc = path ? path.endsWith('.doc') : false;

    let editorState = null;
    let autoLanguage = null;
    if (!isDoc) {
        editorState = await createEditorStateFromContent(path, content, isTodo, isDoc, null, id);
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
        state: editorState
    };

    state.tabs.push(newTab);
    renderTabs();
    switchTab(id);
    saveSessionDebounced();
}

export function switchTab(id) {
    if (state.editorView && state.activeTabId) {
        const prevTab = state.tabs.find(t => t.id === state.activeTabId);
        if (prevTab && !prevTab.isDoc) {
            prevTab.state = state.editorView.state;
        }
    }

    const editorContainer = document.getElementById('editor-container');
    const quillWrapper = document.getElementById('quill-wrapper');
    const statusCursor = document.getElementById('status-cursor');

    if (id === null) {
        state.activeTabId = null;
        if (state.editorView) {
            state.editorView.destroy();
            state.editorView = null;
        }
        if (state.quillView) {
            quillWrapper.style.display = 'none';
        }
        editorContainer.style.display = 'block';
        const mdPreview = document.getElementById('markdown-preview');
        if (mdPreview) mdPreview.style.display = 'none';
        state.isMarkdownPreviewEnabled = false;

        updateActiveTabUI();
        updateTitle();
        if (statusCursor) statusCursor.textContent = '';
        saveSessionDebounced();
        return;
    }

    state.activeTabId = id;
    const tab = state.tabs.find(t => t.id === id);
    if (!tab) return;

    if (tab.isDoc) {
        editorContainer.style.display = 'none';
        quillWrapper.style.display = 'flex';

        if (!state.quillView) {
            if (window.initializeQuill) window.initializeQuill();
        }

        if (state.quillView) {
            const fallback = tab.savedContent !== undefined && tab.savedContent !== null ? tab.savedContent : '';
            state.quillView.root.innerHTML = fallback;
            setTimeout(() => state.quillView.focus(), 50);
        }
    } else {
        editorContainer.style.display = 'block';
        quillWrapper.style.display = 'none';

        if (state.editorView) {
            state.editorView.setState(tab.state);
        } else {
            state.editorView = createEditorView(tab.state, editorContainer);
        }
        state.editorView.focus();
    }

    updateActiveTabUI();
    updateTitle();
    updateCursorStatus();
    saveSessionDebounced();
    
    checkPendingReload(tab);
}

export async function closeTab(id, forceClose = false, multipleFiles = false) {
    const tabIndex = state.tabs.findIndex(t => t.id === id);
    if (tabIndex === -1) return false;
    const tab = state.tabs[tabIndex];

    let result = 'closed';

    if (tab.isUnsaved) {
        let askPrompt = true;

        let content = '';
        if (tab.isDoc) {
            content = (tab.id === state.activeTabId && state.quillView) ? state.quillView.root.innerHTML : (tab.savedContent || '');
        } else {
            content = (tab.id === state.activeTabId && state.editorView)
                ? state.editorView.state.doc.toString()
                : tab.state.doc.toString();
        }

        if (!tab.path) {
            const cleanContent = content.trim();
            if (cleanContent === '' || cleanContent === '- [ ]') {
                askPrompt = false;
            }
        }

        if (tab.path && window.__TAURI__) {
            try {
                const exists = await window.__TAURI__.fs.exists(tab.path);
                if (!exists) askPrompt = false;
            } catch (e) {
                askPrompt = false;
            }
        }

        if (askPrompt && !forceClose) {
            // Lazy import saveFile to break circular dependency
            const { saveFile } = await import('./file-io.js');
            let answer = await askConfirmUI(`Do you want to save changes to "${getFilename(tab.path)}"?`, multipleFiles, true);
            if (answer === 'cancel') return false;

            if (answer === 'all') {
                result = 'save_all';
                if (state.activeTabId !== tab.id) switchTab(tab.id);
                try {
                    const saveResult = await saveFile(true); 
                    if (!saveResult) return false; 
                } catch (e) { return false; }
            } else if (answer === 'no_all') {
                result = 'force_all';
            } else if (answer === 'yes') {
                if (state.activeTabId !== tab.id) switchTab(tab.id);
                try {
                    const saveResult = await saveFile(true);
                    if (!saveResult) return false;
                } catch (e) { return false; }
            } else if (answer === 'no') {
                // Do nothing
            }
        }
    }

    const newTabIndex = state.tabs.findIndex(t => t.id === id);
    if (newTabIndex === -1) return false;

    if (!window.isRestoringTab) {
        const closedTabInfo = {
            path: tab.path,
            title: tab.title,
            isTodo: tab.isTodo,
            isDoc: tab.isDoc,
            manualLanguage: tab.manualLanguage,
        };
        if (tab.isDoc) {
            closedTabInfo.content = (tab.id === state.activeTabId && state.quillView) ? state.quillView.root.innerHTML : (tab.savedContent || '');
        } else {
            closedTabInfo.content = (tab.id === state.activeTabId && state.editorView) ? state.editorView.state.doc.toString() : tab.state.doc.toString();
        }

        if (currentCloseBatch !== null) {
            currentCloseBatch.push(closedTabInfo);
        } else {
            closedTabsHistory.push([closedTabInfo]);
            if (closedTabsHistory.length > 50) closedTabsHistory.shift();
        }
    }

    state.tabs.splice(newTabIndex, 1);
    if (state.tabs.length === 0) {
        switchTab(null);
    } else if (state.activeTabId === id) {
        renderTabs();
        const nextTab = state.tabs[Math.max(0, newTabIndex - 1)];
        switchTab(nextTab.id);
    } else {
        renderTabs();
    }
    saveSessionDebounced();
    return result;
}

export async function closeMultipleTabs(tabsToClose) {
    const { saveFile } = await import('./file-io.js');
    const unsavedTabs = tabsToClose.filter(t => t.isUnsaved);
    let forceClose = false;
    let saveAll = false;
    let multipleFiles = unsavedTabs.length > 1;

    currentCloseBatch = [];

    const toClose = [...tabsToClose];
    for (const t of toClose) {
        if (saveAll && t.isUnsaved) {
            if (state.activeTabId !== t.id) switchTab(t.id);
            const saveResult = await saveFile(true);
            if (!saveResult) break;
            await closeTab(t.id, true); 
        } else {
            const res = await closeTab(t.id, forceClose, multipleFiles);
            if (res === false) break; 
            if (res === 'save_all') saveAll = true;
            if (res === 'force_all') forceClose = true;
        }
    }

    if (currentCloseBatch.length > 0) {
        closedTabsHistory.push(currentCloseBatch);
        if (closedTabsHistory.length > 50) closedTabsHistory.shift();
    }
    currentCloseBatch = null;
}

export async function spawnTodoList() {
    const defaultName = "tasks.todo";
    const initialContent = "- [ ] ";

    state.tabCounter++;
    const id = `tab-${state.tabCounter}`;

    const editorState = await createEditorStateFromContent(null, initialContent, true, false, null, id);

    const newTab = {
        id,
        path: null,
        title: defaultName,
        isUnsaved: false,
        isTodo: true, 
        savedContent: initialContent,
        manualLanguage: null,
        autoLanguage: "todo",
        state: editorState
    };

    state.tabs.push(newTab);
    renderTabs();
    switchTab(id);

    if (state.editorView) {
        state.editorView.dispatch({ selection: { anchor: 6, head: 6 } });
        state.editorView.focus();
    }
    saveSessionDebounced();
}

export async function spawnDocProcess() {
    const defaultName = "document.doc";
    const initialContent = "";

    state.tabCounter++;
    const id = `tab-${state.tabCounter}`;

    const newTab = {
        id,
        path: null,
        title: defaultName,
        isUnsaved: false,
        isTodo: false,
        isDoc: true, 
        savedContent: initialContent,
        manualLanguage: null,
        autoLanguage: null,
        state: null
    };

    state.tabs.push(newTab);
    renderTabs();
    switchTab(id);
    saveSessionDebounced();
}
