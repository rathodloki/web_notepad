// state.js
export const state = {
    tabs: [],
    activeTabId: null,
    editorView: null,
    quillView: null,
    tabCounter: 0,
    sessionTimeout: null,
    contextMenuTargetId: null,
    activeSessionPath: null,
    isPrimaryInstance: false,
    fileHistory: [],
    isPromptingReload: false,
    isWordWrapEnabled: localStorage.getItem('lightpad-wordwrap') === 'true',
    isAutoSaveEnabled: localStorage.getItem('lightpad-autosave') === 'true',
    isMarkdownPreviewEnabled: false
};
