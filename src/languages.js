import { StreamLanguage } from "@codemirror/language";
import { keymap } from "@codemirror/view";

// languages.js — Supported languages definition for editor syntax highlighting
// fallow-ignore-next-line unused-export
export const supportedLanguages = [
    { name: 'Plain Text', ext: '' },
    { name: 'JavaScript', ext: 'js' },
    { name: 'TypeScript', ext: 'ts' },
    { name: 'Python', ext: 'py' },
    { name: 'HTML', ext: 'html' },
    { name: 'CSS', ext: 'css' },
    { name: 'C / C++', ext: 'cpp' },
    { name: 'Java', ext: 'java' },
    { name: 'JSON', ext: 'json' },
    { name: 'Markdown', ext: 'md' },
    { name: 'YAML', ext: 'yaml' },
    { name: 'Properties/INI', ext: 'ini' },
    { name: 'Shell/Bash', ext: 'sh' },
    { name: 'PowerShell', ext: 'ps1' },
    { name: 'Ruby', ext: 'rb' },
    { name: 'Go', ext: 'go' },
    { name: 'Rust', ext: 'rs' },
    { name: 'Todo List', ext: 'todo' }
];

function detectByShebang(firstLine) {
    if (!firstLine.startsWith('#!')) return null;
    if (firstLine.includes('python')) return 'py';
    if (firstLine.includes('node')) return 'js';
    if (firstLine.match(/\b(bash|sh|zsh)\b/)) return 'sh';
    if (firstLine.includes('ruby')) return 'rb';
    if (firstLine.match(/\b(pwsh|powershell)\b/i)) return 'ps1';
    return null;
}

function detectByJson(content) {
    if (content.startsWith('{') || content.startsWith('[')) {
        try {
            JSON.parse(content);
            return 'json';
        } catch (e) { }
    }
    return null;
}

function detectByPowerShell(content) {
    if (content.startsWith('<#')) return 'ps1';
    const isPs = content.match(/\b(Write-|Get-|Set-|Invoke-|Out-|Start-|Stop-|New-|Remove-|Format-|ForEach-Object|Where-Object)\b/i) ||
        content.match(/^\$[a-zA-Z_]\w*\s*=/m) ||
        content.match(/\[CmdletBinding\(\)\]/i) ||
        content.match(/\bparam\s*\(/i);
    return isPs ? 'ps1' : null;
}

function detectByPython(content) {
    const isPy = content.match(/^(import|from\s+[\w.]+\s+import|def|class)\s+[a-zA-Z_]/m) ||
        content.match(/^print\(|^\s*try:|^\s*except.*:|^\s*elif.*:|^\s*def\s+\w+\s*\(/m);
    return isPy ? 'py' : null;
}

export function detectLanguageFromContent(content) {
    if (!content) return null;
    const firstLine = content.split('\n')[0].trim();
    
    const byShebang = detectByShebang(firstLine);
    if (byShebang) return byShebang;

    const trimmed = content.trim();
    const byJson = detectByJson(trimmed);
    if (byJson) return byJson;

    const byPs = detectByPowerShell(content);
    if (byPs) return byPs;

    if (content.includes('<!DOCTYPE html>') || content.includes('<html')) {
        return 'html';
    }

    const byPy = detectByPython(content);
    if (byPy) return byPy;

    return null;
}

const METADATA = {
    js: { pkg: "@codemirror/lang-javascript" },
    mjs: { pkg: "@codemirror/lang-javascript" },
    cjs: { pkg: "@codemirror/lang-javascript" },
    jsx: { pkg: "@codemirror/lang-javascript", ts: true },
    ts: { pkg: "@codemirror/lang-javascript", ts: true },
    tsx: { pkg: "@codemirror/lang-javascript", ts: true },
    py: { pkg: "@codemirror/lang-python" },
    html: { pkg: "@codemirror/lang-html" },
    css: { pkg: "@codemirror/lang-css" },
    cpp: { pkg: "@codemirror/lang-cpp" },
    cc: { pkg: "@codemirror/lang-cpp" },
    h: { pkg: "@codemirror/lang-cpp" },
    hpp: { pkg: "@codemirror/lang-cpp" },
    c: { pkg: "@codemirror/lang-cpp" },
    java: { pkg: "@codemirror/lang-java" },
    json: { pkg: "@codemirror/lang-json" },
    md: { pkg: "@codemirror/lang-markdown" },
    markdown: { pkg: "@codemirror/lang-markdown" },
    yaml: { pkg: "@codemirror/legacy-modes/mode/yaml", legacy: "yaml" },
    yml: { pkg: "@codemirror/legacy-modes/mode/yaml", legacy: "yaml" },
    ini: { pkg: "@codemirror/legacy-modes/mode/properties", legacy: "properties" },
    conf: { pkg: "@codemirror/legacy-modes/mode/properties", legacy: "properties" },
    cfg: { pkg: "@codemirror/legacy-modes/mode/properties", legacy: "properties" },
    properties: { pkg: "@codemirror/legacy-modes/mode/properties", legacy: "properties" },
    log: { pkg: "@codemirror/legacy-modes/mode/properties", legacy: "properties" },
    sh: { pkg: "@codemirror/legacy-modes/mode/shell", legacy: "shell" },
    bash: { pkg: "@codemirror/legacy-modes/mode/shell", legacy: "shell" },
    zsh: { pkg: "@codemirror/legacy-modes/mode/shell", legacy: "shell" },
    ps1: { pkg: "@codemirror/legacy-modes/mode/powershell", legacy: "powerShell" },
    psm1: { pkg: "@codemirror/legacy-modes/mode/powershell", legacy: "powerShell" },
    psd1: { pkg: "@codemirror/legacy-modes/mode/powershell", legacy: "powerShell" },
    pwsh: { pkg: "@codemirror/legacy-modes/mode/powershell", legacy: "powerShell" },
    powershell: { pkg: "@codemirror/legacy-modes/mode/powershell", legacy: "powerShell" },
    rb: { pkg: "@codemirror/legacy-modes/mode/ruby", legacy: "ruby" },
    go: { pkg: "@codemirror/legacy-modes/mode/go", legacy: "go" },
    rs: { pkg: "@codemirror/legacy-modes/mode/rust", legacy: "rust" },
    todo: { todo: true }
};

/**
 * Loads a CodeMirror language package based on the package name and options.
 * Using a switch statement ensures Rollup/Vite can analyze the dynamic import paths.
 */
async function loadModernPackage(pkg, meta) {
    switch (pkg) {
        case "@codemirror/lang-javascript": {
            const { javascript } = await import("@codemirror/lang-javascript");
            return [javascript({ typescript: meta.ts })];
        }
        case "@codemirror/lang-python": {
            const { python } = await import("@codemirror/lang-python");
            return [python()];
        }
        case "@codemirror/lang-html": {
            const { html } = await import("@codemirror/lang-html");
            return [html()];
        }
        case "@codemirror/lang-css": {
            const { css } = await import("@codemirror/lang-css");
            return [css()];
        }
        case "@codemirror/lang-cpp": {
            const { cpp } = await import("@codemirror/lang-cpp");
            return [cpp()];
        }
        case "@codemirror/lang-java": {
            const { java } = await import("@codemirror/lang-java");
            return [java()];
        }
        case "@codemirror/lang-json": {
            const { json } = await import("@codemirror/lang-json");
            return [json()];
        }
        case "@codemirror/lang-markdown": {
            const { markdown } = await import("@codemirror/lang-markdown");
            return [markdown()];
        }
        default:
            return null;
    }
}

async function loadLegacyMode(pkg) {
    switch (pkg) {
        case "@codemirror/legacy-modes/mode/yaml": {
            const { yaml } = await import("@codemirror/legacy-modes/mode/yaml");
            return [StreamLanguage.define(yaml)];
        }
        case "@codemirror/legacy-modes/mode/properties": {
            const { properties } = await import("@codemirror/legacy-modes/mode/properties");
            return [StreamLanguage.define(properties)];
        }
        case "@codemirror/legacy-modes/mode/shell": {
            const { shell } = await import("@codemirror/legacy-modes/mode/shell");
            return [StreamLanguage.define(shell)];
        }
        case "@codemirror/legacy-modes/mode/powershell": {
            const { powerShell } = await import("@codemirror/legacy-modes/mode/powershell");
            return [StreamLanguage.define(powerShell)];
        }
        case "@codemirror/legacy-modes/mode/ruby": {
            const { ruby } = await import("@codemirror/legacy-modes/mode/ruby");
            return [StreamLanguage.define(ruby)];
        }
        case "@codemirror/legacy-modes/mode/go": {
            const { go } = await import("@codemirror/legacy-modes/mode/go");
            return [StreamLanguage.define(go)];
        }
        case "@codemirror/legacy-modes/mode/rust": {
            const { rust } = await import("@codemirror/legacy-modes/mode/rust");
            return [StreamLanguage.define(rust)];
        }
        default:
            return null;
    }
}

/**
 * Loads a CodeMirror language package based on the package name and options.
 * Delegates to modern or legacy loaders to keep each function under size limits.
 */
async function loadPackage(pkg, meta) {
    const modern = await loadModernPackage(pkg, meta);
    if (modern) return modern;
    const legacy = await loadLegacyMode(pkg);
    if (legacy) return legacy;
    return [];
}

/**
 * Returns CodeMirror language extensions matching a filename or custom content analysis.
 * Generates appropriate extensions dynamically at runtime.
 */
export async function getLanguageExtension(filename, content = '', manualExt = null) {
    let ext = manualExt;

    if (!ext && filename) {
        ext = filename.split('.').pop().toLowerCase();
    }

    if (!ext && content) {
        ext = detectLanguageFromContent(content);
    }

    if (!ext) return [];

    const meta = METADATA[ext];
    if (!meta) return [];

    if (meta.todo) {
        const { activateTodoMode, todoKeymap } = await import("./todo.js");
        const { Prec } = await import("@codemirror/state");
        return [...activateTodoMode(), Prec.highest(keymap.of(todoKeymap))];
    }

    return loadPackage(meta.pkg, meta);
}
