# LightPad Agent Guidelines

## Specifications
**IMPORTANT:** Before implementing any feature, consult `specs/README.md`.

- **Assume NOT implemented.** Specs describe planned or designed behaviour; always verify in the actual source before concluding something exists.
- **Check the codebase first.** Specs describe intent; code describes reality.
- **Use specs as guidance.** Follow the design patterns defined in the relevant spec.
- **Spec index:** `specs/README.md` lists all specifications by category.

## Commands
Here are the exact commands to run, build, test, and release this project:

- **Run Dev Web Server**: `npm run dev`
- **Run Test Harness Mode (Web)**: `npm run dev:harness` (opens browser with `?harness=true`)
- **Run Tauri Application (Desktop Dev)**: `npm run tauri dev`
- **Build Web Assets**: `npm run build`
- **Run End-to-End Tests**: `npm run test:harness` (runs Playwright integration tests)
- **Run Signed Release Script**: `./release.ps1` (PowerShell script for signing and compiling Tauri installers)
- **Run Signed Dev Script**: `./run-dev-signed.ps1`

## Architecture
LightPad is a lightweight desktop text editor wrapper built on Tauri, Vite, and Vanilla JavaScript. The frontend orchestrates file editing using CodeMirror 6 (for plain text, code, and todo list documents) and QuillJS (for rich text `.doc` documents), with state managed centrally in `src/state.js`. A retro arcade game and sound synthesizer are embedded directly in the canvas view to engage users during idle coding breaks.

## Code Style
Please adhere to these codebase-specific code styles and patterns:

- **Centralized State**: All mutable application state belongs in the shared `state` object inside [`src/state.js`](./src/state.js). Do not create local state stores.
- **Debounced Sessions**: Call `saveSessionDebounced()` or `saveSession()` immediately following any state mutation to persist current tabs and selections to local storage.
- **Kebab-Case File Names**: Source file names must use lowercase kebab-case (e.g., [`editor-manager.js`](./src/editor-manager.js), [`tabs-ui.js`](./src/tabs-ui.js)).
- **Dynamic Module Imports**: To prevent circular dependency cycles, perform dynamic `import(...)` statements inside event handlers or callbacks rather than static top-level imports.
- **Fallow Directives**: Respect the Fallow-specific annotations like `// fallow-ignore-next-line circular-dependency` or `// fallow-ignore-file` when adding or modifying import statements.
- **Tauri Native Access**: Route all native Tauri APIs through [`src/tauri-bridge.js`](./src/tauri-bridge.js) imports (`invoke`, `readTextFile`, `writeTextFile`, etc.) to support both app-native and web-harness mock environments.
