import { state } from './state.js';
import { saveSessionDebounced, autoSaveDiskDebounced } from './session.js';
import { askLinkUI } from './overlays.js';
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
}

// Expose globally for editor-manager.js switchTab
window.initializeQuill = initializeQuill;
