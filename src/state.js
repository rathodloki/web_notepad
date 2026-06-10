// state.js
export const state = {
    tabs: [],
    activeTabId: null,
    lastActiveTabId: null,
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
    isArcadeModeEnabled: localStorage.getItem('lightpad-arcademode') !== 'false',
    isMarkdownPreviewEnabled: false,
    isRestoringTab: false,
    renderMarkdownPreview: null,
    defaultNewFileType: localStorage.getItem('lightpad-default-new-file-type') || 'txt',
    musicStartedByGame: false,
    musicPausedByGameTab: false
};
