# Data & Native Integration

## Overview

The LightPad integration layer coordinates native filesystem operations, window boundary states, background auto-saves, and Rust backend commands. It utilizes a bridge layer to support both Tauri desktop installs and virtual browser test harness runtimes.

- **Decoupled Native Bridges** — Execute backend queries through a thin routing layer, allowing mock modules to swap in virtual file systems for browser tests.
- **Fail-Safe Sessions** — Restore workspace documents sequentially, automatically catching disk access errors and skipping missing files to prevent application crashes.
- **Independent Window Memory** — Record physical size and coordinates inside background intervals, centering pages on default dimensions if local storage contains corrupted metrics.

```
+-----------------------------------------------------------+
|                          Frontend                         |
|    - file-io.js           - session.js                    |
+-----------------------------+-----------------------------+
                              | (Import Bridge)
                              v
+-----------------------------------------------------------+
|                     tauri-bridge.js                       |
+-----------------------------+-----------------------------+
               /                             \
              / (Native App)                  \ (Web Harness)
             v                                 v
+---------------------------+     +-------------------------+
|      Tauri Runtime        |     |      tauri-mock.js      |
|    - Rust main.rs         |     |    - Virtual VFS        |
|    - Local Filesystem     |     |    - Mock audio context |
+---------------------------+     +-------------------------+
```

## Core Types / Structure

### Tauri Bridge Layer

[`src/tauri-bridge.js`](../src/tauri-bridge.js)

```javascript
export { invoke, appWindow, readTextFile, writeTextFile, openDialog, saveDialog };
```

| Name | Type | Purpose |
|------|------|---------|
| `invoke` | `Function` | Invokes custom backend Rust commands. |
| `appWindow` | `Object` | Coordinates window minimization, maximization, and titles. |
| `readTextFile` | `Function` | Reads file paths from disk (returns string content). |
| `writeTextFile`| `Function` | Writes string content to absolute file paths. |
| `openDialog` | `Function` | Launches OS file selection overlays. |
| `saveDialog` | `Function` | Launches OS save path selection overlays. |

### File I/O Interface

[`src/file-io.js`](../src/file-io.js)

| Method | Signature | Purpose |
|--------|-----------|---------|
| `openFile` | `()` | Prompts user to pick a file and loads it into a new tab. |
| `saveFile` | `(returnResult: Boolean) => Promise<Boolean>` | Persists active editor text. Prompts target overlays for new documents. |
| `deleteActiveFile` | `()` | Deletes the active file from disk and closes its tab. |
| `openFileFromHistory` | `(path: String)` | Restores historical paths, pruning entries if files no longer exist. |
| `openDroppedPaths` | `(paths: String[])` | Sequentially mounts dropped file arrays into new tab states. |
| `renameActiveFile` | `()` | Prompts target paths, copies content, and deletes the old source. |

### Session Management

[`src/session.js`](../src/session.js) | [`src/session-manager.js`](../src/session-manager.js)

| Method | Signature | Purpose |
|--------|-----------|---------|
| `saveSession` | `()` | Serializes tab configurations, paths, content diffs, selections, and closed histories to local storage. |
| `loadSession` | `()` | Restores serialized tabs, initializing editor states on startup. |
| `saveExplicitSession` | `()` | Serializes active tabs natively to JSON files with the `.lpsession` extension. |
| `loadExplicitSession` | `()` | Prompts for a `.lpsession` file, closes active tabs, and restores the saved workspace. |

### Rust Backend Commands

[`src-tauri/src/main.rs`](../src-tauri/src/main.rs)

| Command Name | Arguments | Purpose |
|--------------|-----------|---------|
| `global_search` | `(query: String, match_case: bool, tabs: Vec<TabContent>)` | Iterates rapidly through tab contents in Rust, returning matched lines and offsets. |
| `get_file_modified` | `(path: String)` | Returns the system's modified UNIX epoch seconds. |
| `format_json` | `(text: String)` | Pretty-prints JSON strings. |
| `minify_json` | `(text: String)` | Minifies JSON strings. |
| `fetch_url` | `(url: String)` | Fetches remote document payloads asynchronously using `reqwest`. |

### E2E Test Suite

[`tests/lightpad.spec.js`](../tests/lightpad.spec.js) | [`tests/game.spec.js`](../tests/game.spec.js)

The test suite validates editor and game features inside Playwright:
*   `lightpad.spec.js`: Validates tab cycling, file creation, CodeMirror typing, mock VFS loads/saves, Settings menus, URL fetches, and game toggling.
*   `game.spec.js`: Validates retro shooter gameplay bounds, scoring, and pauses.

## Core Behaviors

### Live External Modification Checks
When the application gains focus (monitored via `window.focus` in [`src/main.js`](../src/main.js)):
1.  Iterates through active tabs containing absolute disk paths.
2.  Triggers `get_file_modified` for each tab to retrieve modified timestamps.
3.  If the timestamp exceeds the recorded `lastModified` metric, triggers `handleExternalFileChange(path, mtime)`.
4.  For unmodified files, prompts the user to reload using `askConfirmUI()`. Discards modified flags if rejected.

### File Drag-and-Drop
File drops are intercepted by listeners registered in `setupFileDrop()` within [`src/overlays.js`](../src/overlays.js):
*   **Tauri App**: Listens for native events (`tauri://file-drop-hover`, `tauri://file-drop`). Displays drop overlays and opens files using `openDroppedPaths()`.
*   **Web Harness**: Falls back to HTML5 drag-and-drop events (`dragenter`, `dragover`, `drop`). Extracts dropped file texts and creates new tabs.

## Related Specs
- [State Management](./state-management.md) — Connects integration changes to tab arrays.
- [Editor System](./editor-system.md) — Re-configures editor contents on file reloads and parses incoming text.
- [UI & Rendering](./ui-rendering.md) — Hosts the file drop overlays and displays modal indicators.
