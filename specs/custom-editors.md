# Custom Editors

## Overview

LightPad extends standard code editing with three customized, domain-specific document workspaces: custom todo lists (`.todo`), tabular CSV highlights (`.csv`), and formatted documents (`.doc`). 

- **State-Synchronized Widgets** — Embed interactive SVG elements directly in the editor buffer that dispatch document changes and sync state instantly.
- **Auto-Detection Delimiters** — Evaluate raw tabular text structures to identify separator types (comma or tab) and color column spans dynamically.
- **Native-Linked Media Directories** — Store pasted or dropped binary rich text attachments in a secure native subdirectory, referencing them using converted local URI sources.

## Core Types / Structure

### Todo Checklist Widgets

[`src/todo.js`](../src/todo.js)

```javascript
class CheckboxWidget extends WidgetType {
    constructor(isChecked, from, to, isMissingPrefix = false) { ... }
    toDOM(view) { ... }
}
```

| Name | Type | Purpose |
|------|------|---------|
| `UNCHECKED_REGEX` | `RegExp` | Matches active unchecked markdown boxes (`- [ ]`). |
| `CHECKED_REGEX` | `RegExp` | Matches completed markdown boxes (`- [x]`). |
| `todoHighlighter` | `ViewPlugin` | Scans the viewport ranges and replaces raw checkbox syntax with interactive `CheckboxWidget` instances. |
| `todoKeymap` | `Extension` | Intercepts keyboard events. Overrides `Enter` to auto-insert a new checklist bullet, and `Backspace` to safely delete prefixes. |
| `todoEnsureCheckbox` | `TransactionFilter` | Ensures a blank todo document always defaults to containing at least one `- [ ] ` checklist bullet. |

### Rainbow CSV Highlighter

[`src/csv.js`](../src/csv.js)

| Parameter / Method | Type | Purpose |
|------|------|---------|
| `SAMPLE_LINES` | `Number` | Max lines inspected for delimiter verification (default: `15`). |
| `detectDelimiter` | `(doc: Text) => String` | Inspects document text for consistent comma or tab delimiters. |
| `parseLineSpans` | `(line: String, delimiter: String) => Array` | Resolves start/end column segment offsets, ignoring delimiters within escaped quotation blocks. |
| `rainbowCsvExtension` | `() => Extension[]` | Returns the `ViewPlugin` that applies styling classes `.csv-col-0` through `.csv-col-9` to parsed ranges. |

### Quill Rich Text Editor

[`src/quill-init.js`](../src/quill-init.js)

```javascript
export function initializeQuill();
```

| Module / Event | Handler / Hook | Purpose |
|------|------|---------|
| `BlotFormatter` | Snow editor module | Enables visual scaling, aligning, and resizing of embedded image layers. |
| `imageDropAndPaste` | `handler(imageDataUrl, type, imageData)` | Catches file drops, writes files to native appData directory `LightPadMedia/`, and embeds Tauri local media URLs. |
| `toolbar.handlers.link` | `handler(value)` | Intercepts link buttons to prompt the user for Display Text and URL via custom overlay modals. |

## Core Behaviors

### Checklist Keyboard Events
Inside `.todo` checklists, backspaces and returns trigger custom behaviors inside `todoKeymap`:
*   **Enter**: Appends `\n` followed by a checkbox prefix with matching indentation (`- [ ] `) and places the cursor right after the space.
*   **Backspace**: If the cursor sits immediately after an empty checkbox bullet, the entire bullet is removed. If it is the last line of the document, deletion is blocked to prevent a blank editor state.

### Image Drop Natively Saved
When an image is pasted or dropped into the Quill editor workspace:
1. `imageDropAndPaste` intercepts the data URL.
2. The folder `LightPadMedia` is verified/created within the app-specific native directory.
3. The raw base64 data is converted to binary and written to disk as a `.png` file.
4. The local asset is mapped to an internal URI using Tauri's `convertFileSrc` and inserted as an `<img>` tag.

## Related Specs
- [Editor System](./editor-system.md) — Attaches checklists and CSV parser plugins to editor states.
- [UI & Rendering](./ui-rendering.md) — Hosts the HTML container for `#quill-editor` and styling tokens.
- [Data & Integration](./data-integration.md) — Saves document structures to file storage.
