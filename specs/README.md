# LightPad Design Specifications Index

LightPad is a lightweight desktop text editor wrapper built using vanilla HTML, CSS, JavaScript, and Tauri.

## Core Architecture

| Spec | Code | Purpose |
|------|------|---------|
| [State Management](./state-management.md) | [`src/state.js`](../src/state.js) | Centralized state engine, tracking active/inactive tabs, config properties, and sessions. |
| [Editor System](./editor-system.md) | [`src/main.js`](../src/main.js), [`src/editor.js`](../src/editor.js) | Application entry orchestration, CodeMirror 6 extension configuration, and dynamic language detection. |

## Custom File Formats

| Spec | Code | Purpose |
|------|------|---------|
| [Custom Editors](./custom-editors.md) | [`src/todo.js`](../src/todo.js), [`src/quill-init.js`](../src/quill-init.js) | Todo checklist widgets, Rainbow CSV highlighting, and QuillJS rich text document integration. |

## UI & Rendering

| Spec | Code | Purpose |
|------|------|---------|
| [UI & Rendering](./ui-rendering.md) | [`src/tabs-ui.js`](../src/tabs-ui.js), [`src/status-bar.js`](../src/status-bar.js) | HTML/CSS shell layout, drag-and-drop pointer tab sorting, settings menus, and dialog overlay modals. |

## Data Layer & Native Integration

| Spec | Code | Purpose |
|------|------|---------|
| [Data & Integration](./data-integration.md) | [`src/file-io.js`](../src/file-io.js), [`src/session.js`](../src/session.js) | Native dialog triggers, background auto-saves, window boundaries state management, and mock test harness setup. |

## Arcade Game & Audio

| Spec | Code | Purpose |
|------|------|---------|
| [Arcade Game & Audio](./arcade-game-audio.md) | [`src/game.js`](../src/game.js), [`src/music-manager.js`](../src/music-manager.js) | Canvas-based space shooter arcade, dynamic difficulty boss mechanics, and custom music player. |
