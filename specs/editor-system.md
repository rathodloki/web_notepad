# Editor System

## Overview

The LightPad editor system handles text editing operations. It configures and mounts CodeMirror 6, manages language detection, coordinates keyboard shortcut bindings, and triggers text transformation routines.

- **Compartmentalized Reconfiguration** — Use CodeMirror `Compartment` objects to adjust preferences (like line wrapping and languages) on live editor instances.
- **Asynchronous Extensions Loading** — Defer language-specific highlighting packages using dynamic imports to keep initialization speeds high.
- **Deduplicated Document Mutations** — Modify selected document blocks uniformly, routing both standard text and rich document ranges through a shared transformation API.

## Core Types / Structure

### CodeMirror Interface

[`src/editor.js`](../src/editor.js) | [`src/editor-impl.js`](../src/editor-impl.js)

```javascript
export function createEditorState(initialDoc, langExtensions = [], otherExtensions = [], isWordWrapEnabled = false);
export function createEditorView(state, parent);
```

| Name | Signature / Type | Purpose |
|------|------------------|---------|
| `getBaseExtensions` | `(isWordWrapEnabled, langExtensions, otherExtensions) => Extension[]` | Combines base CodeMirror utilities (gutters, selection, keymaps) with dynamic extensions. |
| `toggleLineWrapping` | `(view: EditorView, isEnabled: Boolean)` | Reconfigures a live view's word wrap state via `wordWrapCompartment`. |
| `applyLineWrappingToState` | `(state: EditorState, isEnabled: Boolean) => EditorState` | Reconfigures a passive state object's word wrap configuration. |
| `setLanguageExtension` | `(view: EditorView, extensions: Extension[])` | Updates a live view's grammar extension via `languageCompartment`. |
| `applyLanguageExtensionToState` | `(state: EditorState, extensions: Extension[]) => EditorState` | Reconfigures a passive state's grammar extensions. |
| `createUpdateListenerExtension` | `(callback: Function) => Extension` | Injects a document change listener wrapper. |

### Language Detector

[`src/languages.js`](../src/languages.js)

| Parameter / Method | Type | Purpose |
|------|------|---------|
| `supportedLanguages` | `Array` | List of supported display names and target extensions. |
| `detectLanguageFromContent` | `(content: String) => String` | Analyzes shebangs, JSON delimiters, PowerShell signatures, and Python syntax. |
| `getLanguageExtension` | `(filename: String, content: String, manualExt: String) => Promise<Extension[]>` | Asynchronously resolves grammar extensions. |

### Text Transformation Helpers

[`src/text-format.js`](../src/text-format.js)

| Method | Signature | Purpose |
|--------|-----------|---------|
| `modifyEditorSelection` | `(transformFn: Function)` | Alters the selected string synchronous (e.g. UPPERCASE, reverse). |
| `modifyEditorSelectionAsync` | `(transformFnAsync: Function)` | Alters the selected string asynchronously (e.g. JSON pretty-printing). |

## Core Behaviors

### Keymap & Shortcuts
Global key inputs are intercepted in [`src/main.js`](../src/main.js) and dispatched:

| Key Combination | Action | Target / Function |
|-----------------|--------|-------------------|
| `Ctrl + N` | New Tab | `createNewTab()` |
| `Ctrl + O` | Open File | `openFile()` |
| `Ctrl + S` | Save File | `saveFile()` |
| `Ctrl + W` | Close Tab | `closeTab(activeTabId)` |
| `Ctrl + Shift + W` | Close All Tabs | `closeMultipleTabs(tabs)` |
| `Ctrl + Shift + T` | Restore Tab | Recovers last tab block in `closedTabsHistory`. |
| `Ctrl + Tab` / `Alt + ArrowRight` | Next Tab | Shifts active focus right. |
| `Ctrl + Shift + Tab` / `Alt + ArrowLeft` | Previous Tab | Shifts active focus left. |
| `Ctrl + T` | Quick Open | `toggleQuickOpen()` |
| `Ctrl + Shift + F` | Global Search | `toggleGlobalSearch()` |
| `Ctrl + 1` | Spawn Checklist | `spawnTodoList()` |
| `Ctrl + 2` | Spawn Rich Doc | `spawnDocProcess()` |
| `Ctrl + 3` | Toggle Arcade | `toggleGameView()` |
| `Alt + Z` | Word Wrap | `toggleWordWrap()` |

### Language Resolving Lifecycle
1. The editor update listener detects document changes in `createUpdateListener()`.
2. If the user hasn't set a manual override, it extracts the file path extension or runs `detectLanguageFromContent(doc)`.
3. If the resolved language changes, it requests extensions via `getLanguageExtension(...)` and reconfigures the tab state asynchronously.
4. Active configurations update the live `state.editorView` using `setLanguageExtension()`.

## Related Specs
- [State Management](./state-management.md) — Coordinates active editor states.
- [Custom File Formats](./custom-editors.md) — Connects specialized syntax and custom checklist keymaps.
- [UI & Rendering](./ui-rendering.md) — Receives selection triggers from menus.
