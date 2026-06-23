import { state } from './state.js';
import { saveSessionDebounced, autoSaveDiskDebounced } from './session.js';
import Quill from 'quill';
import BlotFormatter from 'quill-blot-formatter';
import QuillImageDropAndPaste from 'quill-image-drop-and-paste';

Quill.register('modules/blotFormatter', BlotFormatter);
Quill.register('modules/imageDropAndPaste', QuillImageDropAndPaste);

export function initializeQuill() {
    if (state.quillView) return;
    const openDialog = window.__TAURI__?.dialog?.open;

    state.quillView = new Quill('#quill-editor', {
        theme: 'snow',
        placeholder: '',
        modules: {
            blotFormatter: {},
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
                    const base64Data = imageDataUrl.replace(/^data:image\/\w+;base64,/, "");
                    const binaryString = window.atob(base64Data);
                    const len = binaryString.length;
                    const bytes = new Uint8Array(len);
                    for (let i = 0; i < len; i++) bytes[i] = binaryString.charCodeAt(i);
                    const filePath = await join(mediaDir, filename);
                    await writeBinaryFile(filePath, bytes);
                    const url = window.__TAURI__.tauri.convertFileSrc(filePath);
                    const range = state.quillView.getSelection() || { index: state.quillView.getLength() };
                    state.quillView.insertEmbed(range.index, 'image', url);
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
                        const { askLinkUI } = await import('./overlays.js');
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
                                this.quill.format('link', false);
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

    state.quillView.on('text-change', () => {
        const currentTab = state.tabs.find(t => t.id === state.activeTabId);
        if (!currentTab || !currentTab.isDoc) return;
        currentTab.isUnsaved = true;
        currentTab.needsRender = true;
        if (!currentTab.path) {
            const currentContent = state.quillView.getText().trim();
            const firstLine = currentContent.split('\n')[0].trim();
            const newTitle = firstLine ? (firstLine.length > 20 ? firstLine.substring(0, 20) + '...' : firstLine) : 'Untitled';
            if (currentTab.title !== newTitle) {
                currentTab.title = newTitle;
                import('./tabs-ui.js').then(m => m.renderTabs());
            }
        }
        
        const tabEl = document.querySelector(`.tab[data-id="${currentTab.id}"] .tab-dot`);
        if (tabEl) tabEl.classList.add('unsaved');
        saveSessionDebounced();
        if (state.isAutoSaveEnabled) autoSaveDiskDebounced(currentTab);
    });

    state.quillView.root.addEventListener('click', (e) => {
        if (e.target.tagName === 'A') {
            const blIndex = state.quillView.getIndex(Quill.find(e.target));
            state.quillView.setSelection(blIndex, e.target.innerText.length);
            const toolbar = state.quillView.getModule('toolbar');
            toolbar.handlers.link.call(toolbar, true);
        }
    });

    // Setup doc zoom from localStorage or default
    const ZOOM_STEPS = [1, 50, 100, 150, 200, 250];
    const DEFAULT_ZOOM = 100;
    let stored = localStorage.getItem('lightpad-doc-zoom');
    let currentZoom = DEFAULT_ZOOM;
    if (stored) {
        let parsed = parseInt(stored, 10);
        if (!isNaN(parsed)) {
            if (parsed <= 40) {
                // Migrate from old pixel-based Zoom (where 15px = 100%)
                const pct = Math.round((parsed / 15) * 100);
                currentZoom = ZOOM_STEPS.reduce((prev, curr) => Math.abs(curr - pct) < Math.abs(prev - pct) ? curr : prev);
            } else {
                currentZoom = ZOOM_STEPS.reduce((prev, curr) => Math.abs(curr - parsed) < Math.abs(prev - parsed) ? curr : prev);
            }
        }
    }
    state.docZoomLevel = currentZoom;
    localStorage.setItem('lightpad-doc-zoom', state.docZoomLevel.toString());

    const qlToolbar = document.querySelector('.ql-toolbar');
    if (qlToolbar && !qlToolbar.querySelector('.ql-zoom-formats')) {
        // Create custom zoom group
        const zoomGroup = document.createElement('span');
        zoomGroup.className = 'ql-formats ql-zoom-formats';
        zoomGroup.style.display = 'inline-flex';
        zoomGroup.style.alignItems = 'center';
        
        // Zoom Out Button
        const zoomOutBtn = document.createElement('button');
        zoomOutBtn.type = 'button';
        zoomOutBtn.className = 'ql-zoom-out';
        zoomOutBtn.title = 'Zoom Out (Ctrl+Minus)';
        zoomOutBtn.innerHTML = `<svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none" style="vertical-align: middle;"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line><line x1="8" y1="11" x2="14" y2="11"></line></svg>`;
        zoomOutBtn.style.width = '28px';
        zoomOutBtn.style.height = '24px';
        zoomOutBtn.style.padding = '0';
        zoomOutBtn.style.cursor = 'pointer';
        
        // Zoom Level Indicator
        const zoomIndicator = document.createElement('span');
        zoomIndicator.className = 'ql-zoom-indicator';
        zoomIndicator.style.display = 'inline-block';
        zoomIndicator.style.fontSize = '12px';
        zoomIndicator.style.color = 'var(--text-secondary)';
        zoomIndicator.style.margin = '0 6px';
        zoomIndicator.style.minWidth = '36px';
        zoomIndicator.style.textAlign = 'center';
        zoomIndicator.style.verticalAlign = 'middle';
        zoomIndicator.style.userSelect = 'none';
        
        // Zoom In Button
        const zoomInBtn = document.createElement('button');
        zoomInBtn.type = 'button';
        zoomInBtn.className = 'ql-zoom-in';
        zoomInBtn.title = 'Zoom In (Ctrl+Plus)';
        zoomInBtn.innerHTML = `<svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none" style="vertical-align: middle;"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line><line x1="8" y1="11" x2="14" y2="11"></line><line x1="11" y1="8" x2="11" y2="14"></line></svg>`;
        zoomInBtn.style.width = '28px';
        zoomInBtn.style.height = '24px';
        zoomInBtn.style.padding = '0';
        zoomInBtn.style.cursor = 'pointer';
        
        zoomGroup.appendChild(zoomOutBtn);
        zoomGroup.appendChild(zoomIndicator);
        zoomGroup.appendChild(zoomInBtn);
        qlToolbar.appendChild(zoomGroup);

        zoomOutBtn.addEventListener('click', () => {
            zoomOut();
        });

        zoomInBtn.addEventListener('click', () => {
            zoomIn();
        });
    }

    // Block native browser page zoom globally when scrolling with Ctrl inside a document tab
    if (!window._zoomGlobalWheelHandler) {
        window._zoomGlobalWheelHandler = (e) => {
            const activeTab = state.tabs.find(t => t.id === state.activeTabId);
            if (activeTab && activeTab.isDoc && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
            }
        };
        window.addEventListener('wheel', window._zoomGlobalWheelHandler, { passive: false });
    }

    // Wheel event for Ctrl + Scroll (Trackpad Pinch & Mouse Wheel) Zoom
    let accumDelta = 0;
    state.quillView.root.addEventListener('wheel', (e) => {
        if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            accumDelta += e.deltaY;
            if (Math.abs(accumDelta) >= 40) {
                if (accumDelta > 0) {
                    zoomOut();
                } else {
                    zoomIn();
                }
                accumDelta = 0;
            }
        }
    }, { passive: false });

    // Touch screen pinch-to-zoom support
    let touchStartDistance = 0;

    state.quillView.root.addEventListener('touchstart', (e) => {
        if (e.touches.length === 2) {
            touchStartDistance = Math.hypot(
                e.touches[0].clientX - e.touches[1].clientX,
                e.touches[0].clientY - e.touches[1].clientY
            );
        }
    }, { passive: true });

    state.quillView.root.addEventListener('touchmove', (e) => {
        if (e.touches.length === 2 && touchStartDistance > 0) {
            e.preventDefault();
            const dist = Math.hypot(
                e.touches[0].clientX - e.touches[1].clientX,
                e.touches[0].clientY - e.touches[1].clientY
            );
            const ratio = dist / touchStartDistance;
            if (ratio >= 1.25) {
                zoomIn();
                touchStartDistance = dist;
            } else if (ratio <= 0.8) {
                zoomOut();
                touchStartDistance = dist;
            }
        }
    }, { passive: false });

    state.quillView.root.addEventListener('touchend', (e) => {
        if (e.touches.length < 2) {
            touchStartDistance = 0;
        }
    });



    // Apply zoom on init
    updateZoomIndicatorAndApply();
}

export const ZOOM_STEPS = [1, 50, 100, 150, 200, 250];

export function zoomIn() {
    const current = state.docZoomLevel || 100;
    const closest = ZOOM_STEPS.reduce((prev, curr) => Math.abs(curr - current) < Math.abs(prev - current) ? curr : prev);
    const idx = ZOOM_STEPS.indexOf(closest);
    if (idx < ZOOM_STEPS.length - 1) {
        state.docZoomLevel = ZOOM_STEPS[idx + 1];
    } else {
        state.docZoomLevel = ZOOM_STEPS[ZOOM_STEPS.length - 1];
    }
    localStorage.setItem('lightpad-doc-zoom', state.docZoomLevel.toString());
    updateZoomIndicatorAndApply();
}

export function zoomOut() {
    const current = state.docZoomLevel || 100;
    const closest = ZOOM_STEPS.reduce((prev, curr) => Math.abs(curr - current) < Math.abs(prev - current) ? curr : prev);
    const idx = ZOOM_STEPS.indexOf(closest);
    if (idx > 0) {
        state.docZoomLevel = ZOOM_STEPS[idx - 1];
    } else {
        state.docZoomLevel = ZOOM_STEPS[0];
    }
    localStorage.setItem('lightpad-doc-zoom', state.docZoomLevel.toString());
    updateZoomIndicatorAndApply();
}

export function applyDocZoom() {
    const qlEditor = document.querySelector('.ql-editor');
    if (qlEditor) {
        const fontSize = Math.max(1, ((state.docZoomLevel || 100) / 100) * 15);
        qlEditor.style.fontSize = `${fontSize}px`;
    }
}

export function updateZoomIndicatorAndApply() {
    const indicator = document.querySelector('.ql-zoom-indicator');
    if (indicator) {
        indicator.textContent = `${state.docZoomLevel || 100}%`;
    }
    applyDocZoom();
}


