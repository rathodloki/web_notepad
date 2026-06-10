# State Management

## Overview

State in LightPad is centralized within a single shared state store. All active tab data, configuration flags, editor instances, and historical access records are managed through this central store, which is persisted synchronously to local storage and native files.

- **Single Source of Truth** — All components share a single, exported global state object.
- **Centralized Synchronization** — State modifications trigger debounced serialization routines.
- **Explicit Serialization Boundaries** — Temporary window and component instances are kept volatile, while tab metadata and contents are fully serialized.

```
+-----------------------------------------------------------+
|                       localStorage                        |
+-----------------------------+-----------------------------+
                              | (Load / Save Session)
                              v
+-----------------------------------------------------------+
|                          state.js                         |
|  - tabs: Tab[]              - editorView: EditorView      |
|  - activeTabId: string      - quillView: Quill            |
|  - lastActiveTabId: string  - sessionTimeout: Timer       |
+-----------------------------------------------------------+
```

## Core Types / Structure

### Global State Object

[`src/state.js`](../src/state.js)

```javascript
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
```

| Name | Type | Purpose |
|------|------|---------|
| `tabs` | `Array` | Shared array of all active tab configurations. |
| `activeTabId` | `String` | ID of the currently selected active tab. |
| `lastActiveTabId` | `String` | ID of the previous active tab, used for restoring editor focus when returning from the arcade view. |
| `editorView` | `EditorView` | Active CodeMirror 6 view instance. |
| `quillView` | `Quill` | Active QuillJS editor instance. |
| `tabCounter` | `Number` | Autoincrementing counter used to generate unique tab IDs. |
| `sessionTimeout` | `Number` | Active timeout ID for debouncing session write operations. |
| `contextMenuTargetId` | `String` | ID of the tab which is targeted by the current tab context menu. |
| `activeSessionPath` | `String` | Absolute path of the active native workspace session file (`.lpsession`). |
| `isPrimaryInstance` | `Boolean` | Flag indicating whether this application instance holds the primary lock. |
| `fileHistory` | `Array` | Chronological list of recently accessed file paths. |
| `isPromptingReload` | `Boolean` | Flag indicating whether a reload confirmation dialog is currently active. |
| `isWordWrapEnabled` | `Boolean` | Flag indicating whether CodeMirror editor word wrapping is enabled. |
| `isAutoSaveEnabled` | `Boolean` | Flag indicating whether automatic saves to disk are enabled. |
| `isArcadeModeEnabled` | `Boolean` | Flag indicating whether idle arcade game HUD elements are active. |
| `isMarkdownPreviewEnabled` | `Boolean` | Flag indicating whether the side-by-side markdown preview is open. |
| `isRestoringTab` | `Boolean` | Flag indicating whether a tab is currently being recovered from closed-tab history. |
| `renderMarkdownPreview` | `Function` | Global reference to the markdown parser renderer. |
| `defaultNewFileType` | `String` | Default format for new blank tabs (`txt` or `doc`). |
| `musicStartedByGame` | `Boolean` | Flag indicating if music was started by retro arcade gameplay. |
| `musicPausedByGameTab` | `Boolean` | Flag indicating if music was paused when leaving arcade game views. |

### Tab Structure

[`src/state.js`](../src/state.js)

| Field | Type | Purpose |
|-------|------|---------|
| `id` | `String` | Unique tab identifier (`tab-[counter]`). |
| `path` | `String` | Absolute file path on disk (null if unsaved/scratchpad). |
| `title` | `String` | Display string in the tab bar. |
| `isUnsaved` | `Boolean` | Indicator of unsaved changes relative to savedContent/disk. |
| `isTodo` | `Boolean` | Indicator for checklist documents. |
| `isDoc` | `Boolean` | Indicator for rich text document format. |
| `isGame` | `Boolean` | Indicator for retro arcade game tab. |
| `savedContent` | `String` | Last persisted content representing disk/session state. |
| `manualLanguage` | `String` | Manually selected language extension override. |
| `autoLanguage` | `String` | Automatically detected language extension. |
| `state` | `EditorState` | CodeMirror state instance. |

### File History Module

[`src/history.js`](../src/history.js)

| Method | Signature | Purpose |
|--------|-----------|---------|
| `loadFileHistory` | `()` | Loads history from local storage. |
| `addToFileHistory` | `(path: String)` | Appends a path to the front of history, pruning duplicates and limiting the list to 50 items. |
| `removeFromFileHistory` | `(path: String)` | Prunes a path from history. |

## Core Behaviors

### Session Write Debouncing
Any state mutations that update document contents, tab ordering, active selections, or active tab indicators call `saveSessionDebounced()` inside [`src/session.js`](../src/session.js). This function sets a 1-second timeout before serializing the current configuration, preventing write overhead during rapid typing.

### File History Lifecycle
When files are opened natively, saved to new paths, or renamed:
1. `addToFileHistory(path)` is triggered.
2. The path is moved to the top of the history stack.
3. The list is stored in localStorage under `'lightpad-history'`.
4. If a file is deleted from disk or fails to load, `removeFromFileHistory(path)` is called to prune dead links.

## Related Specs
- [Editor System](./editor-system.md) — Connects centralized states to CodeMirror instances.
- [UI & Rendering](./ui-rendering.md) — Binds state properties to the tab bar UI and overlays.
- [Data & Integration](./data-integration.md) — Manages native session loading and file system saves.
