import { state } from './state.js';
import { getFilename, escapeHtml } from './utils.js';
import { switchTab, createNewTab } from './editor-manager.js';
import { renderTabs } from './tabs-ui.js';
import { showStatus, updateCursorStatus } from './status-bar.js';
import { saveSessionDebounced } from './session.js';
import { getLanguageExtension, applyLanguageExtensionToState, setLanguageExtension } from './editor.js';
import { openFileFromHistory, openDroppedPaths } from './file-io.js';
import { EditorView } from "@codemirror/view";

export function askConfirmUI(message, multiple = false, showCancel = false) {
    return new Promise((resolve) => {
        const modal = document.getElementById('discard-modal');
        const msg = document.getElementById('discard-modal-message');
        const btnYes = document.getElementById('modal-btn-yes');
        const btnNo = document.getElementById('modal-btn-no');
        const btnYTA = document.getElementById('modal-btn-yestoall');
        const btnNTA = document.getElementById('modal-btn-notoall');
        const btnCancel = document.getElementById('modal-btn-cancel');

        msg.textContent = message;
        btnYTA.style.display = multiple ? 'inline-block' : 'none';
        if (btnNTA) btnNTA.style.display = multiple ? 'inline-block' : 'none';
        if (btnCancel) btnCancel.style.display = showCancel ? 'inline-block' : 'none';
        modal.style.display = 'flex';

        const handleYes = () => { cleanup(); resolve('yes'); };
        const handleNo = () => { cleanup(); resolve('no'); };
        const handleYTA = () => { cleanup(); resolve('all'); };
        const handleNTA = () => { cleanup(); resolve('no_all'); };
        const handleCancel = () => { cleanup(); resolve('cancel'); };

        const cleanup = () => {
            modal.style.display = 'none';
            btnYes.removeEventListener('click', handleYes);
            btnNo.removeEventListener('click', handleNo);
            btnYTA.removeEventListener('click', handleYTA);
            if (btnNTA) btnNTA.removeEventListener('click', handleNTA);
            if (btnCancel) btnCancel.removeEventListener('click', handleCancel);
        };

        btnYes.addEventListener('click', handleYes);
        btnNo.addEventListener('click', handleNo);
        btnYTA.addEventListener('click', handleYTA);
        if (btnNTA) btnNTA.addEventListener('click', handleNTA);
        if (btnCancel) btnCancel.addEventListener('click', handleCancel);

        // Auto-focus the Yes button for fluid keyboard usage
        setTimeout(() => btnYes.focus(), 10);
    });
}

export function askLinkUI(defaultText = '', defaultUrl = '') {
    return new Promise((resolve) => {
        const modal = document.getElementById('link-modal');
        const inputUrl = document.getElementById('link-modal-url');
        const inputText = document.getElementById('link-modal-text');
        const btnInsert = document.getElementById('link-modal-insert');
        const btnCancel = document.getElementById('link-modal-cancel');

        inputText.value = defaultText;
        inputUrl.value = defaultUrl;
        modal.style.display = 'flex';

        const cleanup = () => {
            modal.style.display = 'none';
            btnInsert.removeEventListener('click', handleInsert);
            btnCancel.removeEventListener('click', handleCancel);
            inputUrl.removeEventListener('keydown', handleKey);
            inputText.removeEventListener('keydown', handleKey);
        };

        const handleInsert = () => {
            cleanup();
            if (!inputUrl.value.trim() && !defaultUrl) { resolve(null); return; }
            resolve({ url: inputUrl.value.trim(), text: inputText.value.trim() });
        };
        const handleCancel = () => { cleanup(); resolve(null); };

        const handleKey = (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                handleInsert();
            } else if (e.key === 'Escape') {
                e.preventDefault();
                handleCancel();
            }
        };

        btnInsert.addEventListener('click', handleInsert);
        btnCancel.addEventListener('click', handleCancel);
        inputUrl.addEventListener('keydown', handleKey);
        inputText.addEventListener('keydown', handleKey);

        setTimeout(() => {
            if (defaultText && !defaultUrl) inputUrl.focus();
            else inputText.focus();
        }, 10);
    });
}

/* -------------------------------------------------------------------------- */
/* Quick Open Palette Logic                                                   */
/* -------------------------------------------------------------------------- */

let quickOpenSelectedIndex = -1;
let currentQuickOpenMatches = [];

export function toggleQuickOpen() {
    const modal = document.getElementById('quick-open-modal');
    const input = document.getElementById('quick-open-input');
    if (!modal || !input) return;

    if (modal.style.display === 'flex') {
        closeQuickOpen();
    } else {
        modal.style.display = 'flex';
        input.value = '';
        renderQuickOpenResults();
        setTimeout(() => input.focus(), 10);
    }
}

export function closeQuickOpen() {
    window.closeQuickOpen();
}

// Attach close to window so it can be called from file-io
window.closeQuickOpen = () => {
    const modal = document.getElementById('quick-open-modal');
    if (modal) modal.style.display = 'none';
    if (state.editorView) state.editorView.focus();
};

function updateQuickOpenSelection() {
    const results = document.getElementById('quick-open-results');
    if (!results) return;

    const items = results.querySelectorAll('.quick-open-item');
    items.forEach((item, index) => {
        if (index === quickOpenSelectedIndex) {
            item.classList.add('selected');
            item.scrollIntoView({ block: 'nearest' });
        } else {
            item.classList.remove('selected');
        }
    });
}

function renderQuickOpenResults() {
    const input = document.getElementById('quick-open-input');
    const results = document.getElementById('quick-open-results');
    if (!input || !results) return;

    const query = input.value.toLowerCase();

    // Fuzzy search: filter history based on substrings
    if (!query) {
        currentQuickOpenMatches = state.fileHistory.map(path => ({ path, score: 0 }));
    } else {
        currentQuickOpenMatches = state.fileHistory
            .map(path => {
                const filename = getFilename(path).toLowerCase();
                const lowerPath = path.toLowerCase();
                let score = -1;
                if (filename.includes(query)) score = 10;
                else if (lowerPath.includes(query)) score = 5;
                return { path, score, originalName: getFilename(path) };
            })
            .filter(item => item.score > 0)
            .sort((a, b) => b.score - a.score);
    }

    results.innerHTML = '';
    quickOpenSelectedIndex = currentQuickOpenMatches.length > 0 ? 0 : -1;

    if (currentQuickOpenMatches.length === 0) {
        const emptyState = document.createElement('div');
        emptyState.className = 'quick-open-empty';
        emptyState.textContent = 'No matching files found.';
        results.appendChild(emptyState);
        return;
    }

    currentQuickOpenMatches.forEach((match, index) => {
        const itemEl = document.createElement('div');
        itemEl.className = `quick-open-item ${index === 0 ? 'selected' : ''}`;

        const nameEl = document.createElement('div');
        nameEl.className = 'quick-open-filename';

        if (query && match.originalName.toLowerCase().includes(query)) {
            const startIdx = match.originalName.toLowerCase().indexOf(query);
            const before = match.originalName.substring(0, startIdx);
            const hl = match.originalName.substring(startIdx, startIdx + query.length);
            const after = match.originalName.substring(startIdx + query.length);
            nameEl.innerHTML = `${escapeHtml(before)}<span class="q-match">${escapeHtml(hl)}</span>${escapeHtml(after)}`;
        } else {
            nameEl.textContent = match.originalName || getFilename(match.path);
        }

        const pathEl = document.createElement('div');
        pathEl.className = 'quick-open-path';
        pathEl.textContent = match.path;

        itemEl.appendChild(nameEl);
        itemEl.appendChild(pathEl);

        itemEl.addEventListener('click', async () => {
            await openFileFromHistory(match.path);
        });

        itemEl.addEventListener('mouseenter', () => {
            quickOpenSelectedIndex = index;
            updateQuickOpenSelection();
        });

        results.appendChild(itemEl);
    });
}

/* -------------------------------------------------------------------------- */
/* Language Selection Palette Logic                                           */
/* -------------------------------------------------------------------------- */

let languageSelectedIndex = -1;
let currentLanguageMatches = [];
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

export function toggleLanguageOpen() {
    const modal = document.getElementById('language-modal');
    const input = document.getElementById('language-input');
    if (!modal || !input) return;

    if (modal.style.display === 'flex') {
        closeLanguageOpen();
    } else {
        modal.style.display = 'flex';
        input.value = '';
        renderLanguageResults();
        setTimeout(() => input.focus(), 10);
    }
}

export function closeLanguageOpen() {
    const modal = document.getElementById('language-modal');
    if (modal) modal.style.display = 'none';
    if (state.editorView) state.editorView.focus();
}

async function setManualLanguage(ext) {
    closeLanguageOpen();
    if (!state.activeTabId) return;
    const tab = state.tabs.find(t => t.id === state.activeTabId);
    if (!tab || tab.isDoc) return;

    tab.manualLanguage = ext;

    let content = '';
    if (state.editorView) {
        content = state.editorView.state.doc.toString();
    } else {
        content = tab.state.doc.toString();
    }

    const extensions = await getLanguageExtension(tab.path, content, ext);
    tab.state = applyLanguageExtensionToState(tab.state, extensions);

    if (state.editorView) {
        setLanguageExtension(state.editorView, extensions);
    }

    saveSessionDebounced();
    updateCursorStatus(state.editorView);
}

function updateLanguageSelection() {
    const results = document.getElementById('language-results');
    if (!results) return;

    const items = results.querySelectorAll('.quick-open-item');
    items.forEach((item, index) => {
        if (index === languageSelectedIndex) {
            item.classList.add('selected');
            item.scrollIntoView({ block: 'nearest' });
        } else {
            item.classList.remove('selected');
        }
    });
}

function renderLanguageResults() {
    const input = document.getElementById('language-input');
    const results = document.getElementById('language-results');
    if (!input || !results) return;

    const query = input.value.toLowerCase();

    if (!query) {
        currentLanguageMatches = supportedLanguages.map(l => ({ ...l, score: 0 }));
    } else {
        currentLanguageMatches = supportedLanguages
            .map(lang => {
                const name = lang.name.toLowerCase();
                let score = -1;
                if (name.includes(query)) score = 10;
                else if (lang.ext.includes(query)) score = 5;
                return { ...lang, score };
            })
            .filter(item => item.score > 0)
            .sort((a, b) => b.score - a.score);
    }

    results.innerHTML = '';
    languageSelectedIndex = currentLanguageMatches.length > 0 ? 0 : -1;

    if (currentLanguageMatches.length === 0) {
        const emptyState = document.createElement('div');
        emptyState.className = 'quick-open-empty';
        emptyState.textContent = 'No matching languages found.';
        results.appendChild(emptyState);
        return;
    }

    currentLanguageMatches.forEach((match, index) => {
        const itemEl = document.createElement('div');
        itemEl.className = `quick-open-item ${index === 0 ? 'selected' : ''}`;

        const nameEl = document.createElement('div');
        nameEl.className = 'quick-open-filename';

        if (query && match.name.toLowerCase().includes(query)) {
            const startIdx = match.name.toLowerCase().indexOf(query);
            const before = match.name.substring(0, startIdx);
            const hl = match.name.substring(startIdx, startIdx + query.length);
            const after = match.name.substring(startIdx + query.length);
            nameEl.innerHTML = `${escapeHtml(before)}<span class="q-match">${escapeHtml(hl)}</span>${escapeHtml(after)}`;
        } else {
            nameEl.textContent = match.name;
        }

        itemEl.appendChild(nameEl);

        itemEl.addEventListener('click', async () => {
            await setManualLanguage(match.ext);
        });

        itemEl.addEventListener('mouseenter', () => {
            languageSelectedIndex = index;
            updateLanguageSelection();
        });

        results.appendChild(itemEl);
    });
}

/* -------------------------------------------------------------------------- */
/* Global Search & Replace                                                    */
/* -------------------------------------------------------------------------- */

let globalSearchMatches = [];

export function toggleGlobalSearch() {
    const modal = document.getElementById('global-search-modal');
    const input = document.getElementById('global-search-input');
    if (!modal || !input) return;

    if (modal.style.display === 'flex') {
        closeGlobalSearch();
    } else {
        modal.style.display = 'flex';
        input.value = '';
        document.getElementById('global-replace-input').value = '';
        document.getElementById('global-search-results').innerHTML = '';
        globalSearchMatches = [];
        setTimeout(() => input.focus(), 10);
    }
}

export function closeGlobalSearch() {
    const modal = document.getElementById('global-search-modal');
    if (modal) modal.style.display = 'none';
    if (state.editorView) state.editorView.focus();
}

function performGlobalSearch() {
    const query = document.getElementById('global-search-input').value;
    const matchCase = document.getElementById('global-search-case').checked;
    const resultsContainer = document.getElementById('global-search-results');

    globalSearchMatches = [];
    resultsContainer.innerHTML = '';

    if (!query) return;

    state.tabs.forEach(tab => {
        let content = '';
        if (tab.id === state.activeTabId && state.editorView && !tab.isDoc) {
            content = state.editorView.state.doc.toString();
        } else if (tab.id === state.activeTabId && state.quillView && tab.isDoc) {
            content = state.quillView.getText();
        } else if (tab.state) {
            content = tab.state.doc.toString();
        } else {
            content = tab.savedContent || '';
        }

        const lines = content.split('\n');
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const searchLine = matchCase ? line : line.toLowerCase();
            const searchQuery = matchCase ? query : query.toLowerCase();

            const col = searchLine.indexOf(searchQuery);
            if (col !== -1) {
                globalSearchMatches.push({
                    tabId: tab.id,
                    filename: getFilename(tab.path) || tab.title,
                    line: i + 1,
                    col: col + 1,
                    text: line.trim() || '...',
                    fullLineText: line
                });
            }
        }
    });

    renderGlobalSearchResults();
}

function renderGlobalSearchResults() {
    const resultsContainer = document.getElementById('global-search-results');
    const query = document.getElementById('global-search-input').value;
    resultsContainer.innerHTML = '';

    if (globalSearchMatches.length === 0) {
        const noRes = document.createElement('div');
        noRes.className = 'gs-empty';
        noRes.textContent = 'No matches found in open tabs.';
        resultsContainer.appendChild(noRes);
        return;
    }

    const grouped = {};
    globalSearchMatches.forEach(match => {
        if (!grouped[match.tabId]) {
            grouped[match.tabId] = { filename: match.filename, matches: [] };
        }
        grouped[match.tabId].matches.push(match);
    });

    const countEl = document.createElement('div');
    countEl.className = 'gs-count';
    countEl.textContent = `${globalSearchMatches.length} result${globalSearchMatches.length !== 1 ? 's' : ''} in ${Object.keys(grouped).length} file${Object.keys(grouped).length !== 1 ? 's' : ''}`;
    resultsContainer.appendChild(countEl);

    Object.keys(grouped).forEach(tabId => {
        const group = grouped[tabId];
        const fileHeader = document.createElement('div');
        fileHeader.className = 'gs-file-header';
        fileHeader.innerHTML = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg><span>${group.filename}</span><span class="gs-file-count">${group.matches.length}</span>`;
        resultsContainer.appendChild(fileHeader);

        group.matches.forEach(match => {
            const item = document.createElement('div');
            item.className = 'gs-result-item';

            const lineNum = document.createElement('span');
            lineNum.className = 'gs-line-num';
            lineNum.textContent = match.line;

            const snippet = document.createElement('span');
            snippet.className = 'gs-snippet';

            const trimmedText = match.text;
            const matchCase = document.getElementById('global-search-case')?.checked;
            const searchText = matchCase ? trimmedText : trimmedText.toLowerCase();
            const searchQuery = matchCase ? query : query.toLowerCase();
            const matchIdx = searchText.indexOf(searchQuery);

            if (matchIdx !== -1) {
                const before = trimmedText.substring(0, matchIdx);
                const hl = trimmedText.substring(matchIdx, matchIdx + query.length);
                const after = trimmedText.substring(matchIdx + query.length);
                snippet.innerHTML = `${escapeHtml(before)}<span class="gs-highlight">${escapeHtml(hl)}</span>${escapeHtml(after)}`;
            } else {
                snippet.textContent = trimmedText;
            }

            item.appendChild(lineNum);
            item.appendChild(snippet);

            item.addEventListener('click', () => {
                const searchLen = query.length;
                switchTab(match.tabId);
                closeGlobalSearch();

                requestAnimationFrame(() => {
                    const tab = state.tabs.find(t => t.id === match.tabId);
                    if (state.editorView && tab && !tab.isDoc) {
                        try {
                            const lineInfo = state.editorView.state.doc.line(match.line);
                            const from = lineInfo.from + match.col - 1;
                            const to = from + searchLen;
                            state.editorView.dispatch({
                                selection: { anchor: from, head: to },
                                effects: EditorView.scrollIntoView(from, { y: "center" })
                            });
                            state.editorView.focus();
                        } catch (e) {
                            console.warn('Failed to navigate to search result', e);
                        }
                    }
                });
            });

            resultsContainer.appendChild(item);
        });
    });
}

function performGlobalReplaceAll() {
    const query = document.getElementById('global-search-input').value;
    const replaceWith = document.getElementById('global-replace-input').value;
    const matchCase = document.getElementById('global-search-case').checked;

    if (!query) return;

    let totalReplaced = 0;

    state.tabs.forEach(tab => {
        let content = '';
        if (tab.id === state.activeTabId && state.editorView && !tab.isDoc) {
            content = state.editorView.state.doc.toString();
        } else if (tab.id === state.activeTabId && state.quillView && tab.isDoc) {
            content = state.quillView.getText();
        } else if (tab.state) {
            content = tab.state.doc.toString();
        } else {
            content = tab.savedContent || '';
        }

        if (!content) return;

        let regexFlags = 'g';
        if (!matchCase) regexFlags += 'i';

        const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(escapedQuery, regexFlags);

        if (regex.test(content)) {
            const matchesCount = (content.match(regex) || []).length;
            totalReplaced += matchesCount;
            const newContent = content.replace(regex, replaceWith);

            if (tab.id === state.activeTabId && state.editorView && !tab.isDoc) {
                state.editorView.dispatch({
                    changes: { from: 0, to: state.editorView.state.doc.length, insert: newContent }
                });
            } else if (tab.id === state.activeTabId && state.quillView && tab.isDoc) {
                state.quillView.setText(newContent);
            } else if (tab.state) {
                tab.state = tab.state.update({
                    changes: { from: 0, to: tab.state.doc.length, insert: newContent }
                }).state;
            } else {
                tab.savedContent = newContent;
            }
            tab.isUnsaved = true;
            tab.needsRender = true;
        }
    });

    if (totalReplaced > 0) {
        showStatus(`Replaced ${totalReplaced} occurrence(s) left in open tabs.`);
        renderTabs();
        saveSessionDebounced();
        performGlobalSearch();
    } else {
        showStatus(`No occurrences found to replace.`);
    }
}

/* -------------------------------------------------------------------------- */
/* Setup Event Listeners                                                      */
/* -------------------------------------------------------------------------- */

export function setupOverlays() {
    // Quick Open
    const qModal = document.getElementById('quick-open-modal');
    if (qModal) {
        qModal.addEventListener('click', (e) => {
            if (e.target === qModal) closeQuickOpen();
        });
    }

    const qInput = document.getElementById('quick-open-input');
    if (qInput) {
        qInput.addEventListener('keydown', async (e) => {
            if (e.key === 'Escape') {
                closeQuickOpen();
            } else if (e.key === 'ArrowDown') {
                e.preventDefault();
                if (quickOpenSelectedIndex < currentQuickOpenMatches.length - 1) {
                    quickOpenSelectedIndex++;
                    updateQuickOpenSelection();
                }
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                if (quickOpenSelectedIndex > 0) {
                    quickOpenSelectedIndex--;
                    updateQuickOpenSelection();
                }
            } else if (e.key === 'Enter') {
                e.preventDefault();
                if (quickOpenSelectedIndex >= 0 && currentQuickOpenMatches[quickOpenSelectedIndex]) {
                    await openFileFromHistory(currentQuickOpenMatches[quickOpenSelectedIndex].path);
                }
            }
        });
        qInput.addEventListener('input', () => {
            renderQuickOpenResults();
        });
    }

    // Language Select
    const langModal = document.getElementById('language-modal');
    if (langModal) {
        langModal.addEventListener('click', (e) => {
            if (e.target === langModal) closeLanguageOpen();
        });
    }

    const langInput = document.getElementById('language-input');
    if (langInput) {
        langInput.addEventListener('keydown', async (e) => {
            if (e.key === 'Escape') {
                closeLanguageOpen();
            } else if (e.key === 'ArrowDown') {
                e.preventDefault();
                if (languageSelectedIndex < currentLanguageMatches.length - 1) {
                    languageSelectedIndex++;
                    updateLanguageSelection();
                }
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                if (languageSelectedIndex > 0) {
                    languageSelectedIndex--;
                    updateLanguageSelection();
                }
            } else if (e.key === 'Enter') {
                e.preventDefault();
                if (languageSelectedIndex >= 0 && currentLanguageMatches[languageSelectedIndex]) {
                    await setManualLanguage(currentLanguageMatches[languageSelectedIndex].ext);
                }
            }
        });
        langInput.addEventListener('input', () => {
            renderLanguageResults();
        });
    }

    const statusLang = document.getElementById('status-language');
    if (statusLang) {
        statusLang.addEventListener('click', toggleLanguageOpen);
    }

    // Global Search
    const searchModal = document.getElementById('global-search-modal');
    if (searchModal) {
        searchModal.addEventListener('click', (e) => {
            if (e.target === searchModal) closeGlobalSearch();
        });
    }

    const searchInput = document.getElementById('global-search-input');
    if (searchInput) {
        let debounceTimer;
        searchInput.addEventListener('input', () => {
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(performGlobalSearch, 300);
        });
        searchInput.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') closeGlobalSearch();
        });
    }

    const replaceInput = document.getElementById('global-replace-input');
    if (replaceInput) {
        replaceInput.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') closeGlobalSearch();
            if (e.key === 'Enter') performGlobalReplaceAll();
        });
    }

    const replaceBtn = document.getElementById('btn-global-replace-all');
    if (replaceBtn) replaceBtn.addEventListener('click', performGlobalReplaceAll);

    const matchCaseCB = document.getElementById('global-search-case');
    if (matchCaseCB) matchCaseCB.addEventListener('change', performGlobalSearch);

    const btnGlobalSearchIcon = document.getElementById('btn-global-search');
    if (btnGlobalSearchIcon) {
        btnGlobalSearchIcon.addEventListener('click', toggleGlobalSearch);
    }
}

export async function setupFileDrop() {
    const overlay = document.getElementById('file-drop-overlay');
    if (!overlay) return;

    if (window.__TAURI__) {
        const { listen } = window.__TAURI__.event;

        await listen('tauri://file-drop-hover', () => {
            overlay.style.display = 'flex';
            document.body.classList.add('is-dragging-file');
        });

        await listen('tauri://file-drop-cancelled', () => {
            overlay.style.display = 'none';
            document.body.classList.remove('is-dragging-file');
        });

        await listen('tauri://file-drop', async (event) => {
            overlay.style.display = 'none';
            document.body.classList.remove('is-dragging-file');
            const paths = event.payload;
            if (paths && paths.length > 0) {
                await openDroppedPaths(paths);
            }
        });
    } else {
        let dragDepth = 0;
        function isFileDrag(e) {
            return e.dataTransfer && e.dataTransfer.types &&
                Array.from(e.dataTransfer.types).includes('Files');
        }
        document.addEventListener('dragenter', (e) => {
            if (!isFileDrag(e)) return;
            e.preventDefault();
            dragDepth++;
            overlay.style.display = 'flex';
            document.body.classList.add('is-dragging-file');
        });
        document.addEventListener('dragleave', () => {
            dragDepth = Math.max(0, dragDepth - 1);
            if (dragDepth === 0) {
                overlay.style.display = 'none';
                document.body.classList.remove('is-dragging-file');
            }
        });
        document.addEventListener('dragover', (e) => {
            if (!isFileDrag(e)) return;
            e.preventDefault();
            e.dataTransfer.dropEffect = 'copy';
        });
        document.addEventListener('drop', async (e) => {
            e.preventDefault();
            dragDepth = 0;
            overlay.style.display = 'none';
            document.body.classList.remove('is-dragging-file');

            const files = Array.from(e.dataTransfer.files || []);
            for (const file of files) {
                try {
                    const content = await file.text();
                    await createNewTab(null, content);
                    showStatus(`Opened: ${file.name}`);
                } catch (err) {
                    showStatus(`Error opening: ${file.name}`);
                }
            }
        });
    }
}
