# UI & Rendering

## Overview

The LightPad UI system defines the application's shell, visual themes, responsive behaviors, and input overlays. It coordinates tab rendering and drag-and-drop ordering, status updates, settings dropdowns, and keyboard-navigable dialog modal overlays.

- **Responsive Glassmorphism** — Theme borders, backgrounds, and HUD controls with semi-transparent backdrops, borders, and blur filters.
- **Fluid Pointer Drag-and-Drop** — Order active document tabs dynamically using pointer capture events and CSS transform offsets.
- **Unified Keyboard Modals** — Bind keyboard listeners across all active popup palettes to support mouse-free focus shifts, executions, and cancel clicks.

```
+-----------------------------------------------------------+
|                      window-header                        |
|   [ Brand ]       [ Tab Bar ]       [ Window Controls ]   |
+-----------------------------------------------------------+
|                         toolbar                           |
+-----------------------------------------------------------+
|                       editor-shell                        |
|                                                           |
|       +---------------------+   +---------------------+   |
|       |                     |   |                     |   |
|       |     Editor Pane     |   |  Markdown Preview   |   |
|       |                     |   |                     |   |
|       +---------------------+   +---------------------+   |
+-----------------------------------------------------------+
|                        status-bar                         |
+-----------------------------------------------------------+
```

## Core Types / Structure

### Tab Bar Interface

[`src/tabs-ui.js`](../src/tabs-ui.js)

| Method | Signature | Purpose |
|--------|-----------|---------|
| `updateScrollShadows` | `()` | Adds or removes `.show` shadow class indicators on scroll boundaries. |
| `renderTabs` | `()` | Re-renders tab items, close buttons, state dots, pointer listeners, and drag structures. |
| `activateTabUI` | `(tab: Tab)` | Updates container states, switches between CodeMirror/Quill editor views, and updates the status bar. |
| `deactivateTabUI` | `()` | Destroys views and restores the blank state canvas when no tabs remain. |

### Status Bar Interface

[`src/status-bar.js`](../src/status-bar.js)

| Method | Signature | Purpose |
|--------|-----------|---------|
| `showStatus` | `(msg: String, timeout: Number)` | Renders status updates to the status bar (Note: target element `#status-text` is missing in index.html, preventing message output). |
| `updateCursorStatus` | `(view: EditorView)` | Pulls head coordinates and formats standard `"Ln X, Col Y"` strings. |
| `updateTitle` | `()` | Formats window and application page titles based on active tab paths and session names. |
| `updateLanguageStatus`| `()` | Updates display labels based on manual override selections or auto-detected formats. |

### Dialog Overlays and Modals

[`src/overlays.js`](../src/overlays.js)

| Method | Signature / Type | Purpose |
|--------|------------------|---------|
| `askConfirmUI` | `(message: String, multiple: Boolean, showCancel: Boolean) => Promise<String>` | Opens a confirm modal, offering buttons for Yes, No, Yes to All, No to All, and Cancel. |
| `askLinkUI` | `(defaultText: String, defaultUrl: String) => Promise<Object>` | Prompts QuillJS link configurations. |
| `toggleQuickOpen` | `()` | Toggles the fuzzy recent files palette. |
| `toggleGlobalSearch` | `()` | Toggles the tab search and replace interface. |
| `handleGlobalKeyboard`| `(e: KeyboardEvent)` | Decodes context-menu and modal key events. |

## Core Behaviors

### Tab Drag-and-Drop Lifecycle
Dynamic tab reordering is implemented in [`src/tabs-ui.js`](../src/tabs-ui.js) using pointer events:
1.  **pointerdown**: Captures pointer movements (`setPointerCapture`), flags active tab ID, and records starting horizontal coordinates (`startX`).
2.  **pointermove**: If movement exceeds a 5px threshold, adds `.tab-dragging`, offsets the tab element using CSS `transform: translateX()`, and queries `document.elementsFromPoint(x, y)` to find the hovered target tab. Applies `.tab-drag-over-left` or `.tab-drag-over-right` highlights.
3.  **pointerup**: Releases pointer capture, shifts elements in `state.tabs` order array, calls `renderTabs()` to draw the new sequence, and calls `saveSessionDebounced()` to persist the tab order.

### Global Keyboard Navigation
When overlays or dropdown menus are active, keyboard listeners in [`src/overlays.js`](../src/overlays.js) intercept standard navigation keys:
*   **Escape**: Closes active menus or cancels open modal prompts.
*   **ArrowDown / ArrowUp**: Moves focus highlight class `.kb-active` chronologically through settings menu items or global search results.
*   **ArrowRight / ArrowLeft / Tab**: Shifts focus sequentially among buttons and inputs within confirm, link, and URL modals.
*   **Enter**: Triggers `.click()` events on focus-highlighted elements.

### Overlay Mismatches
> [!WARNING]
> The modal close routine for the language selection palette contains a call to `closeLanguageModal()` in event handlers, which is a mismatch with the defined `closeLanguageOpen()` function. TODO: verify in runtime if this mismatch triggers runtime exceptions.

## Related Specs
- [State Management](./state-management.md) — Connects state flags to overlay values and active tab indexes.
- [Editor System](./editor-system.md) — Recovers editor focus after modal dismissals and keyboard operations.
