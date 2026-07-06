// settings-manager.js — Preferences and settings dropdown menu wiring
import { state } from './state.js';
import { showStatus } from './status-bar.js';
import { modifyEditorSelection, modifyEditorSelectionAsync } from './text-format.js';
import { saveExplicitSession, loadExplicitSession } from './session-manager.js';

function positionMainMenu(btnEl, menuEl) {
    menuEl.style.display = 'block';
    menuEl.style.left = 'auto';
    menuEl.style.right = '0';

    const menuRect = menuEl.getBoundingClientRect();
    if (menuRect.left < 0) {
        menuEl.style.left = '0';
        menuEl.style.right = 'auto';
    }
}

function positionSubmenu(parentEl, submenuEl) {
    submenuEl.style.display = 'flex';
    submenuEl.style.visibility = 'hidden';

    // Reset default values
    submenuEl.style.left = '100%';
    submenuEl.style.right = 'auto';
    submenuEl.style.top = '-5px';
    submenuEl.style.bottom = 'auto';

    const submenuRect = submenuEl.getBoundingClientRect();
    const parentRect = parentEl.getBoundingClientRect();

    // Check right viewport boundary
    if (parentRect.right + submenuRect.width > window.innerWidth) {
        // Shift to the left of the parent
        submenuEl.style.left = 'auto';
        submenuEl.style.right = '100%';
        submenuEl.style.marginRight = '4px';
        submenuEl.style.marginLeft = '0';

        // Check if shifting to the left causes left boundary overflow
        const newLeft = parentRect.left - submenuRect.width;
        if (newLeft < 0) {
            // Force align to left edge of screen (offset from parent)
            submenuEl.style.right = 'auto';
            submenuEl.style.left = `${-parentRect.left + 10}px`;
        }
    } else {
        submenuEl.style.left = '100%';
        submenuEl.style.right = 'auto';
        submenuEl.style.marginLeft = '4px';
        submenuEl.style.marginRight = '0';
    }

    // Check bottom viewport boundary
    if (parentRect.top + submenuRect.height > window.innerHeight) {
        // Shift upwards (align bottom edge)
        submenuEl.style.top = 'auto';
        submenuEl.style.bottom = '-5px';
    }

    submenuEl.style.visibility = 'visible';
}

export function updateCheckmarks() {
    // 1) Preferences checkmarks
    const autosaveCheck = document.querySelector('#menu-toggle-autosave .check-icon');
    const wordwrapCheck = document.querySelector('#menu-toggle-wordwrap .check-icon');
    const markdownCheck = document.querySelector('#menu-toggle-markdown .check-icon');

    if (autosaveCheck) autosaveCheck.style.opacity = state.isAutoSaveEnabled ? '1' : '0';
    if (wordwrapCheck) wordwrapCheck.style.opacity = state.isWordWrapEnabled ? '1' : '0';
    if (markdownCheck) markdownCheck.style.opacity = state.isMarkdownPreviewEnabled ? '1' : '0';



    // 2) Default New Tab checkmarks
    const defaultVal = state.defaultNewFileType || 'txt';
    const txtCheck = document.querySelector('#menu-default-txt .check-icon');
    const docCheck = document.querySelector('#menu-default-doc .check-icon');

    if (txtCheck) txtCheck.style.opacity = defaultVal === 'txt' ? '1' : '0';
    if (docCheck) docCheck.style.opacity = defaultVal === 'doc' ? '1' : '0';

    // 3) Show/Hide markdown option in preferences based on whether the active tab is Markdown
    const markdownItem = document.getElementById('menu-toggle-markdown');
    if (markdownItem) {
        const activeTab = state.tabs.find(t => t.id === state.activeTabId);
        const isMarkdown = activeTab && !activeTab.isDoc && 
            (activeTab.manualLanguage === 'md' || (activeTab.autoLanguage === 'md' && !activeTab.manualLanguage));
        
        markdownItem.style.display = isMarkdown ? 'flex' : 'none';
    }
}

function toggleAutoSave() {
    state.isAutoSaveEnabled = !state.isAutoSaveEnabled;
    localStorage.setItem('lightpad-autosave', state.isAutoSaveEnabled.toString());
    showStatus(state.isAutoSaveEnabled ? 'Auto-Save Enabled' : 'Auto-Save Disabled');
    if (state.isAutoSaveEnabled) {
        state.tabs.forEach(tab => {
            if (tab.isUnsaved && tab.path) {
                import('./session.js').then(m => m.autoSaveDiskDebounced(tab, 0));
            }
        });
    }
    updateCheckmarks();
}

export function toggleWordWrap() {
    state.isWordWrapEnabled = !state.isWordWrapEnabled;
    localStorage.setItem('lightpad-wordwrap', state.isWordWrapEnabled.toString());
    import('./editor.js').then(m => {
        state.tabs.forEach(tab => {
            if (!tab.isDoc && tab.state) {
                tab.state = m.applyLineWrappingToState(tab.state, state.isWordWrapEnabled);
            }
        });
        if (state.editorView) m.toggleLineWrapping(state.editorView, state.isWordWrapEnabled);
    });
    updateCheckmarks();
}

async function toggleMarkdownPreview() {
    state.isMarkdownPreviewEnabled = !state.isMarkdownPreviewEnabled;
    const preview = document.getElementById('markdown-preview');
    if (!preview) return;
    if (state.isMarkdownPreviewEnabled) {
        preview.style.display = 'block';
        if (typeof window.marked === 'undefined' || typeof window.DOMPurify === 'undefined') {
            try {
                const [markedMod, purifyMod] = await Promise.all([
                    import('marked'),
                    import('dompurify')
                ]);
                window.marked = markedMod.marked;
                window.DOMPurify = purifyMod.default || purifyMod;
            } catch (e) {
                console.error("Failed to load markdown dependencies", e);
            }
        }
        if (state.renderMarkdownPreview) state.renderMarkdownPreview();
    } else {
        preview.style.display = 'none';
    }
    updateCheckmarks();
}



export function setupSettingsMenu() {
    const settingsBtn = document.getElementById('btn-settings');
    const settingsMenu = document.getElementById('settings-menu');
    if (!settingsBtn || !settingsMenu) return;

    // Toggle settings menu visibility
    settingsBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (settingsMenu.style.display === 'block') {
            settingsMenu.style.display = 'none';
        } else {
            positionMainMenu(settingsBtn, settingsMenu);
            updateCheckmarks();
        }
    });

    document.addEventListener('click', (e) => {
        // Close menu if clicking outside
        if (!settingsBtn.contains(e.target) && !settingsMenu.contains(e.target)) {
            settingsMenu.style.display = 'none';
        }
    });

    // Submenu hover dynamic boundary positioning
    const hasSubmenuItems = settingsMenu.querySelectorAll('.menu-item.has-submenu');
    hasSubmenuItems.forEach(item => {
        const submenu = item.querySelector('.submenu-palette');
        if (!submenu) return;

        item.addEventListener('mouseenter', () => {
            item.classList.add('open');
            positionSubmenu(item, submenu);
        });

        item.addEventListener('mouseleave', () => {
            item.classList.remove('open');
            submenu.style.display = 'none';
        });
    });

    // Preferences toggles
    document.getElementById('menu-toggle-autosave').addEventListener('click', (e) => {
        e.stopPropagation();
        toggleAutoSave();
    });

    document.getElementById('menu-toggle-wordwrap').addEventListener('click', (e) => {
        e.stopPropagation();
        toggleWordWrap();
    });

    document.getElementById('menu-toggle-markdown').addEventListener('click', (e) => {
        e.stopPropagation();
        toggleMarkdownPreview();
    });



    // Default New Tab type selector
    document.getElementById('menu-default-txt').addEventListener('click', (e) => {
        e.stopPropagation();
        state.defaultNewFileType = 'txt';
        localStorage.setItem('lightpad-default-new-file-type', 'txt');
        updateCheckmarks();
        settingsMenu.style.display = 'none';
        showStatus('Default new file type set to Plain Text (.txt)');
    });

    document.getElementById('menu-default-doc').addEventListener('click', (e) => {
        e.stopPropagation();
        state.defaultNewFileType = 'doc';
        localStorage.setItem('lightpad-default-new-file-type', 'doc');
        updateCheckmarks();
        settingsMenu.style.display = 'none';
        showStatus('Default new file type set to Rich Text Document (.doc)');
    });

    // --- Workspace Sessions Submenu bindings ---
    document.getElementById('menu-session-save').addEventListener('click', async (e) => {
        e.stopPropagation();
        settingsMenu.style.display = 'none';
        await saveExplicitSession();
    });

    document.getElementById('menu-session-load').addEventListener('click', async (e) => {
        e.stopPropagation();
        settingsMenu.style.display = 'none';
        await loadExplicitSession();
    });

    document.getElementById('menu-session-set-default').addEventListener('click', async (e) => {
        e.stopPropagation();
        settingsMenu.style.display = 'none';
        const { saveSession } = await import('./session.js');
        const { updateTitle } = await import('./status-bar.js');
        if (!state.activeSessionPath && state.isPrimaryInstance) return showStatus('Already using Default Session');
        state.isPrimaryInstance = true;
        state.activeSessionPath = null;
        saveSession();
        updateTitle();
        showStatus('Current tabs set to Default Session');
    });

    document.getElementById('menu-session-load-default').addEventListener('click', async (e) => {
        e.stopPropagation();
        settingsMenu.style.display = 'none';
        const { loadSession } = await import('./session.js');
        const { updateTitle } = await import('./status-bar.js');
        const { closeMultipleTabs } = await import('./editor-manager.js');
        const { askConfirmUI } = await import('./overlays.js');
        
        if (state.tabs.length > 0) {
            let answer = await askConfirmUI('Close current tabs before reverting to Default Session?', true);
            if (answer === 'yes') await closeMultipleTabs(state.tabs);
            else if (answer === 'cancel') return;
        }
        state.activeSessionPath = null;
        state.isPrimaryInstance = true;
        loadSession();
        updateTitle();
        showStatus('Loaded Default Session');
    });

    // --- Text Tools & Formatting Submenu bindings ---
    const bindFormat = (id, transformFn) => {
        const el = document.getElementById(id);
        if (el) {
            el.addEventListener('click', (e) => {
                e.stopPropagation();
                settingsMenu.style.display = 'none';
                modifyEditorSelection(transformFn);
            });
        }
    };

    bindFormat('menu-format-upper', t => t.toUpperCase());
    bindFormat('menu-format-lower', t => t.toLowerCase());
    bindFormat('menu-format-title', t => t.split(/(?<=\s|-|_)/).map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(''));
    bindFormat('menu-format-sort', t => t.split('\n').sort().join('\n'));
    bindFormat('menu-format-reverse', t => t.split('').reverse().join(''));
    bindFormat('menu-format-remove-empty', t => t.split('\n').filter(l => l.trim().length > 0).join('\n'));
    bindFormat('menu-format-remove-duplicates', t => Array.from(new Set(t.split('\n'))).join('\n'));
    bindFormat('menu-format-trim', t => t.split('\n').map(l => l.trim()).join('\n'));
    bindFormat('menu-format-duplicate', t => t + '\n' + t);

    // JSON Formatting & Minifying
    const handleJsonAction = (id, command, browserFallbackFn) => {
        document.getElementById(id)?.addEventListener('click', async (e) => {
            e.stopPropagation();
            settingsMenu.style.display = 'none';
            const { invoke } = await import('./tauri-bridge.js');
            if (window.__TAURI__) {
                await modifyEditorSelectionAsync(async t => { try { return await invoke(command, { text: t }); } catch(err) { showStatus('Invalid JSON'); return t; } });
            } else {
                modifyEditorSelection(t => { try { return browserFallbackFn(t); } catch(err){ showStatus('Invalid JSON'); return t; } });
            }
        });
    };

    handleJsonAction('menu-format-json-format', 'format_json', t => JSON.stringify(JSON.parse(t), null, 2));
    handleJsonAction('menu-format-json-minify', 'minify_json', t => JSON.stringify(JSON.parse(t)));

    // Base64 and URL
    bindFormat('menu-format-base64-enc', t => { try { return btoa(t); } catch(err){ showStatus('Failed to encode'); return t; } });
    bindFormat('menu-format-base64-dec', t => { try { return atob(t); } catch(err){ showStatus('Invalid Base64'); return t; } });
    bindFormat('menu-format-url-enc', t => { try { return encodeURIComponent(t); } catch(err){ return t; } });
    bindFormat('menu-format-url-dec', t => { try { return decodeURIComponent(t); } catch(err){ showStatus('Invalid URL string'); return t; } });

    // Initial state check
    updateCheckmarks();
}
