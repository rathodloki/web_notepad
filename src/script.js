import { createEditorState, createEditorView, getLanguageExtension, toggleLineWrapping, applyLineWrappingToState } from './editor.js';
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

// Drag state
let draggedTabId = null;
let draggedTabEl = null;

// File History tracking
let fileHistory = [];

let isWordWrapEnabled = localStorage.getItem('lightpad-wordwrap') === 'true';

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

            const extensions = await getLanguageExtension(langPath);

            const newTab = {
                id: t.id,
                path: t.path,
                title: t.title,
                isUnsaved: t.isUnsaved,
                isTodo: isTodo,
                isDoc: isDoc,
                savedContent: savedContent,
                state: createEditorState(content || '', [...extensions, createUpdateListener(t.id)], isWordWrapEnabled)
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

async function createNewTab(path = null, content = '') {
    tabCounter++;
    const id = `tab-${tabCounter}`;

    const isTodo = path ? path.endsWith('.todo') : false;
    const isDoc = path ? path.endsWith('.doc') : false;

    let state = null;
    if (!isDoc) {
        const extensions = await getLanguageExtension(path);
        state = createEditorState(content, [...extensions, createUpdateListener(id)], isWordWrapEnabled);
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
        if (quillView) {
            quillWrapper.style.display = 'none';
        }
        editorContainer.style.display = 'block';

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
                renderTabs();
                saveSessionDebounced();
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

    renderTabs();
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
        const btnCancel = document.getElementById('modal-btn-cancel');

        msg.textContent = message;
        btnYTA.style.display = multiple ? 'inline-block' : 'none';
        if (btnCancel) btnCancel.style.display = showCancel ? 'inline-block' : 'none';
        modal.style.display = 'flex';

        const handleYes = () => { cleanup(); resolve('yes'); };
        const handleNo = () => { cleanup(); resolve('no'); };
        const handleYTA = () => { cleanup(); resolve('all'); };
        const handleCancel = () => { cleanup(); resolve('cancel'); };

        const cleanup = () => {
            modal.style.display = 'none';
            btnYes.removeEventListener('click', handleYes);
            btnNo.removeEventListener('click', handleNo);
            btnYTA.removeEventListener('click', handleYTA);
            if (btnCancel) btnCancel.removeEventListener('click', handleCancel);
        };

        btnYes.addEventListener('click', handleYes);
        btnNo.addEventListener('click', handleNo);
        btnYTA.addEventListener('click', handleYTA);
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
    let saveAll = false;
    let multipleFiles = unsavedTabs.length > 1;

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

    const docBtn = document.getElementById('btn-doc');
    if (docBtn) {
        docBtn.addEventListener('click', spawnDocProcess);
    }

    const wordWrapBtn = document.getElementById('btn-wordwrap');
    if (wordWrapBtn) {
        if (isWordWrapEnabled) wordWrapBtn.classList.add('active');
        wordWrapBtn.addEventListener('click', toggleWordWrap);
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
    // Alt+Z (Word Wrap)
    if (e.altKey && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        toggleWordWrap();
    }
});

async function spawnTodoList() {
    const defaultName = "tasks.todo";
    const initialContent = "- [ ] ";

    // Create a new todo tab
    tabCounter++;
    const id = `tab-${tabCounter}`;

    const extensions = await getLanguageExtension("tasks.todo");
    const state = await import("./editor.js").then(m => m.createEditorState(initialContent, [...extensions, createUpdateListener(id)], isWordWrapEnabled));

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
    const initialContent = "";

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
