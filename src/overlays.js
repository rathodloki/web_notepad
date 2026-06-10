import { state } from './state.js';
import { getFilename, escapeHtml } from './utils.js';
import { renderTabs } from './tabs-ui.js';
import { showStatus, updateCursorStatus, updateLanguageStatus } from './status-bar.js';
import { saveSessionDebounced } from './session.js';
import { getLanguageExtension, applyLanguageExtensionToState, setLanguageExtension } from './editor.js';
import { EditorView } from "@codemirror/view";
import { supportedLanguages } from './languages.js';

function getTabContentText(tab) {
    if (tab.id === state.activeTabId) {
        if (state.editorView && !tab.isDoc) {
            return state.editorView.state.doc.toString();
        }
        if (state.quillView && tab.isDoc) {
            return state.quillView.getText();
        }
    }
    if (tab.state) {
        return tab.state.doc.toString();
    }
    return tab.savedContent || '';
}

function isFormattingEnabled(tab) {
    if (!tab) return false;
    if (tab.isDoc) return true;
    const path = (tab.path || '').toLowerCase();
    const title = (tab.title || '').toLowerCase();
    const manual = (tab.manualLanguage || '').toLowerCase();
    const auto = (tab.autoLanguage || '').toLowerCase();
    
    return path.endsWith('.md') || path.endsWith('.markdown') ||
           title.endsWith('.md') || title.endsWith('.markdown') ||
           manual === 'md' || manual === 'markdown' ||
           auto === 'md' || auto === 'markdown';
}

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

function closeQuickOpen() {
    const modal = document.getElementById('quick-open-modal');
    if (modal) modal.style.display = 'none';
    if (state.editorView) state.editorView.focus();
}

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

function queryFuzzySearch(items, query, getPrimary, getSecondary, mapItem) {
    if (!query) {
        return items.map(item => ({ ...mapItem(item), score: 0 }));
    }
    return items
        .map(item => {
            const mapped = mapItem(item);
            const primary = getPrimary(item).toLowerCase();
            const secondary = getSecondary(item).toLowerCase();
            let score = -1;
            if (primary.includes(query)) score = 10;
            else if (secondary.includes(query)) score = 5;
            return { ...mapped, score };
        })
        .filter(item => item.score > 0)
        .sort((a, b) => b.score - a.score);
}

function renderFuzzyList(resultsContainer, matches, query, getName, getSecondaryInfo, emptyText, onClick, onHover) {
    resultsContainer.innerHTML = '';
    if (matches.length === 0) {
        const emptyState = document.createElement('div');
        emptyState.className = 'quick-open-empty';
        emptyState.textContent = emptyText;
        resultsContainer.appendChild(emptyState);
        return;
    }

    matches.forEach((match, index) => {
        const itemEl = document.createElement('div');
        itemEl.className = `quick-open-item ${index === 0 ? 'selected' : ''}`;

        const nameEl = document.createElement('div');
        nameEl.className = 'quick-open-filename';

        const nameText = getName(match);
        if (query && nameText.toLowerCase().includes(query)) {
            const startIdx = nameText.toLowerCase().indexOf(query);
            const before = nameText.substring(0, startIdx);
            const hl = nameText.substring(startIdx, startIdx + query.length);
            const after = nameText.substring(startIdx + query.length);
            nameEl.innerHTML = `${escapeHtml(before)}<span class="q-match">${escapeHtml(hl)}</span>${escapeHtml(after)}`;
        } else {
            nameEl.textContent = nameText;
        }

        itemEl.appendChild(nameEl);

        if (getSecondaryInfo) {
            const secondaryText = getSecondaryInfo(match);
            if (secondaryText) {
                const pathEl = document.createElement('div');
                pathEl.className = 'quick-open-path';
                pathEl.textContent = secondaryText;
                itemEl.appendChild(pathEl);
            }
        }

        itemEl.addEventListener('click', () => onClick(match));
        itemEl.addEventListener('mouseenter', () => onHover(index));

        resultsContainer.appendChild(itemEl);
    });
}

function renderQuickOpenResults() {
    const input = document.getElementById('quick-open-input');
    const results = document.getElementById('quick-open-results');
    if (!input || !results) return;

    const query = input.value.toLowerCase();

    currentQuickOpenMatches = queryFuzzySearch(
        state.fileHistory,
        query,
        path => getFilename(path),
        path => path,
        path => ({ path, originalName: getFilename(path) })
    );

    quickOpenSelectedIndex = currentQuickOpenMatches.length > 0 ? 0 : -1;

    renderFuzzyList(
        results,
        currentQuickOpenMatches,
        query,
        match => match.originalName || getFilename(match.path),
        match => match.path,
        'No matching files found.',
        async (match) => {
            const { openFileFromHistory } = await import('./file-io.js');
            await openFileFromHistory(match.path);
        },
        (index) => {
            quickOpenSelectedIndex = index;
            updateQuickOpenSelection();
        }
    );
}

/* -------------------------------------------------------------------------- */
/* Language Selection Palette Logic                                           */
/* -------------------------------------------------------------------------- */

let languageSelectedIndex = -1;
let currentLanguageMatches = [];

function toggleLanguageOpen() {
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

function closeLanguageOpen() {
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
    updateLanguageStatus();
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

    currentLanguageMatches = queryFuzzySearch(
        supportedLanguages,
        query,
        lang => lang.name,
        lang => lang.ext,
        lang => lang
    );

    languageSelectedIndex = currentLanguageMatches.length > 0 ? 0 : -1;

    renderFuzzyList(
        results,
        currentLanguageMatches,
        query,
        match => match.name,
        null,
        'No matching languages found.',
        async (match) => {
            await setManualLanguage(match.ext);
        },
        (index) => {
            languageSelectedIndex = index;
            updateLanguageSelection();
        }
    );
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

function closeGlobalSearch() {
    const modal = document.getElementById('global-search-modal');
    if (modal) modal.style.display = 'none';
    if (state.editorView) state.editorView.focus();
}

async function performGlobalSearch() {
    const query = document.getElementById('global-search-input').value;
    const matchCase = document.getElementById('global-search-case').checked;
    const resultsContainer = document.getElementById('global-search-results');

    globalSearchMatches = [];
    resultsContainer.innerHTML = '';

    if (!query) return;

    if (window.__TAURI__) {
        try {
            const { invoke } = window.__TAURI__.tauri;
            
            const tabsData = state.tabs.map(tab => {
                return {
                    id: String(tab.id),
                    filename: getFilename(tab.path) || tab.title || 'Untitled',
                    content: getTabContentText(tab)
                };
            });
            
            globalSearchMatches = await invoke('global_search', { query, matchCase, tabs: tabsData });
            renderGlobalSearchResults();
            return;
        } catch (e) {
            console.error('Rust global search failed, falling back to JS:', e);
        }
    }

    state.tabs.forEach(tab => {
        const content = getTabContentText(tab);

        const lines = content.split('\n');
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const searchLine = matchCase ? line : line.toLowerCase();
            const searchQuery = matchCase ? query : query.toLowerCase();

            const col = searchLine.indexOf(searchQuery);
            if (col !== -1) {
                globalSearchMatches.push({
                    tabId: String(tab.id),
                    filename: getFilename(tab.path) || tab.title || 'Untitled',
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

let renderQueue = [];
let renderQueueIndex = 0;

function renderGlobalSearchResults() {
    const resultsContainer = document.getElementById('global-search-results');
    const query = document.getElementById('global-search-input').value;
    resultsContainer.innerHTML = '';
    renderQueue = [];
    renderQueueIndex = 0;
    resultsContainer.onscroll = null;

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
    const isCapped = globalSearchMatches.length >= 10000;
    countEl.textContent = `${isCapped ? '10000+' : globalSearchMatches.length} result${globalSearchMatches.length !== 1 ? 's' : ''} in ${Object.keys(grouped).length} file${Object.keys(grouped).length !== 1 ? 's' : ''}`;
    resultsContainer.appendChild(countEl);

    Object.keys(grouped).forEach(tabId => {
        const group = grouped[tabId];
        renderQueue.push({ type: 'header', filename: group.filename, count: group.matches.length });
        group.matches.forEach(match => {
            renderQueue.push({ type: 'item', match, query });
        });
    });

    renderNextChunk();

    resultsContainer.onscroll = () => {
        if (resultsContainer.scrollTop + resultsContainer.clientHeight >= resultsContainer.scrollHeight - 50) {
            renderNextChunk();
        }
    };
}

function renderNextChunk() {
    const resultsContainer = document.getElementById('global-search-results');
    let itemsRenderedThisChunk = 0;

    const oldWarning = resultsContainer.querySelector('.gs-chunk-warning');
    if (oldWarning) oldWarning.remove();

    while (renderQueueIndex < renderQueue.length && itemsRenderedThisChunk < 100) {
        const qItem = renderQueue[renderQueueIndex];
        
        if (qItem.type === 'header') {
            const fileHeader = document.createElement('div');
            fileHeader.className = 'gs-file-header';
            fileHeader.innerHTML = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg><span>${escapeHtml(qItem.filename)}</span><span class="gs-file-count">${qItem.count}</span>`;
            resultsContainer.appendChild(fileHeader);
        } else {
            const match = qItem.match;
            const query = qItem.query;
            
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

            item.addEventListener('click', async () => {
                const searchLen = query.length;
                const { switchTab } = await import('./editor-manager.js');
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
            itemsRenderedThisChunk++;
        }
        renderQueueIndex++;
    }

    if (renderQueueIndex < renderQueue.length) {
        const warning = document.createElement('div');
        warning.className = 'gs-empty gs-chunk-warning';
        warning.style.color = 'var(--text-muted)';
        warning.textContent = `Scroll down to load more...`;
        resultsContainer.appendChild(warning);
    } else if (globalSearchMatches.length >= 10000) {
        const warning = document.createElement('div');
        warning.className = 'gs-empty gs-chunk-warning';
        warning.style.color = 'var(--text-muted)';
        warning.textContent = `Max limit of 10000 results reached.`;
        resultsContainer.appendChild(warning);
    }
}

function performGlobalReplaceAll() {
    const query = document.getElementById('global-search-input').value;
    const replaceWith = document.getElementById('global-replace-input').value;
    const matchCase = document.getElementById('global-search-case').checked;

    if (!query) return;

    let totalReplaced = 0;

    state.tabs.forEach(tab => {
        const content = getTabContentText(tab);

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
/* Floating Selection Toolbar                                                 */
/* -------------------------------------------------------------------------- */

function setupSelectionToolbar() {
    const toolbar = document.getElementById('floating-selection-toolbar');
    if (!toolbar) return;

    let hideTimer = null;

    function hideToolbar() {
        toolbar.classList.remove('visible');
        hideTimer = setTimeout(() => {
            toolbar.style.display = 'none';
        }, 160);
    }

    function showToolbar(x, y) {
        clearTimeout(hideTimer);
        toolbar.style.display = 'flex';
        toolbar.style.left = `${x}px`;
        toolbar.style.top = `${y}px`;
        // Force reflow for animation
        toolbar.offsetHeight;
        toolbar.classList.add('visible');
    }

    function getSelectionRect() {
        const sel = window.getSelection();
        if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return null;
        const range = sel.getRangeAt(0);
        const rect = range.getBoundingClientRect();
        if (rect.width === 0 && rect.height === 0) return null;
        return rect;
    }

    function positionToolbar() {
        const activeTab = state.tabs.find(t => t.id === state.activeTabId);
        if (!isFormattingEnabled(activeTab)) { hideToolbar(); return; }

        const rect = getSelectionRect();
        if (!rect) { hideToolbar(); return; }

        // Only show if selection is inside editor-container or quill-editor
        const editorContainer = document.getElementById('editor-container');
        const quillEditor = document.getElementById('quill-editor');
        const sel = window.getSelection();
        const anchorNode = sel?.anchorNode;
        if (!anchorNode) { hideToolbar(); return; }

        const inCm = editorContainer && editorContainer.contains(anchorNode);
        const inQuill = quillEditor && quillEditor.contains(anchorNode);
        if (!inCm && !inQuill) { hideToolbar(); return; }

        const toolbarWidth = toolbar.offsetWidth || 200;
        let x = rect.left + (rect.width / 2) - (toolbarWidth / 2);
        let y = rect.top - 44;

        // Keep in viewport
        x = Math.max(8, Math.min(x, window.innerWidth - toolbarWidth - 8));
        if (y < 8) y = rect.bottom + 8;

        showToolbar(x, y);
    }

    // Listen for selection changes
    document.addEventListener('selectionchange', () => {
        clearTimeout(hideTimer);
        const sel = window.getSelection();
        if (!sel || sel.isCollapsed || !sel.toString().trim()) {
            hideToolbar();
            return;
        }

        const activeTab = state.tabs.find(t => t.id === state.activeTabId);
        if (!isFormattingEnabled(activeTab)) {
            hideToolbar();
            return;
        }

        // Delay slightly to wait for selection to stabilize
        setTimeout(positionToolbar, 50);
    });

    // Prevent toolbar from stealing focus and killing selection
    toolbar.addEventListener('mousedown', (e) => {
        e.preventDefault();
    });

    // Button actions
    toolbar.querySelectorAll('.sel-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const action = btn.dataset.action;
            const activeTab = state.tabs.find(t => t.id === state.activeTabId);

            if (activeTab?.isDoc && state.quillView) {
                // Quill rich text formatting
                const range = state.quillView.getSelection();
                if (!range || range.length === 0) return;
                switch (action) {
                    case 'bold':
                        state.quillView.format('bold', !state.quillView.getFormat(range).bold);
                        break;
                    case 'italic':
                        state.quillView.format('italic', !state.quillView.getFormat(range).italic);
                        break;
                    case 'link': {
                        const quillToolbar = state.quillView.getModule('toolbar');
                        quillToolbar.handlers.link.call(quillToolbar, true);
                        break;
                    }
                    case 'code':
                        state.quillView.format('code', !state.quillView.getFormat(range).code);
                        break;
                    case 'color':
                        state.quillView.format('background', state.quillView.getFormat(range).background ? false : '#3b82f633');
                        break;
                }
            } else if (state.editorView) {
                // CodeMirror markdown wrapping
                const { from, to } = state.editorView.state.selection.main;
                if (from === to) return;
                const selectedText = state.editorView.state.sliceDoc(from, to);
                let wrapped = selectedText;
                switch (action) {
                    case 'bold':   wrapped = `**${selectedText}**`; break;
                    case 'italic': wrapped = `*${selectedText}*`; break;
                    case 'link':   wrapped = `[${selectedText}](url)`; break;
                    case 'code':   wrapped = `\`${selectedText}\``; break;
                    case 'color':  wrapped = `==${selectedText}==`; break;
                }
                state.editorView.dispatch({
                    changes: { from, to, insert: wrapped }
                });
                state.editorView.focus();
            }
            hideToolbar();
        });
    });
}

/* -------------------------------------------------------------------------- */
/* Setup Event Listeners                                                      */
/* -------------------------------------------------------------------------- */

export function setupOverlays() {
    window.closeQuickOpen = closeQuickOpen;
    window.closeGlobalSearch = closeGlobalSearch;
    window.closeLanguageOpen = closeLanguageOpen;
    // Background clicks for all modals
    const modalIds = [
        'discard-modal',
        'link-modal',
        'quick-open-modal',
        'language-modal',
        'global-search-modal',
        'open-url-modal'
    ];
    modalIds.forEach(id => {
        const modal = document.getElementById(id);
        if (modal) {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    if (id === 'discard-modal') document.getElementById('modal-btn-cancel')?.click();
                    else if (id === 'link-modal') document.getElementById('link-modal-cancel')?.click();
                    else if (id === 'quick-open-modal') closeQuickOpen();
                    else if (id === 'language-modal') closeLanguageOpen();
                    else if (id === 'global-search-modal') closeGlobalSearch();
                    else if (id === 'open-url-modal') document.getElementById('btn-cancel-url')?.click();
                }
            });
        }
    });

    // Quick Open
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
    const searchInput = document.getElementById('global-search-input');
    if (searchInput) {
        let debounceTimer;
        searchInput.addEventListener('input', () => {
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(performGlobalSearch, 300);
        });
        searchInput.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') closeGlobalSearch();
            if (e.key === 'Enter') {
                e.preventDefault();
                clearTimeout(debounceTimer);
                performGlobalSearch();
            }
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                const firstResult = document.querySelector('#global-search-results .gs-result-item');
                if (firstResult) {
                    firstResult.classList.add('kb-active');
                    firstResult.focus();
                }
            }
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

    // Floating selection toolbar
    setupSelectionToolbar();
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
                const { openDroppedPaths } = await import('./file-io.js');
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
            const { createNewTab } = await import('./editor-manager.js');
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

/**
 * Handles unified popup/menu keyboard navigation.
 * Extracted from main.js to reduce God Node coupling.
 */
export function handleGlobalKeyboard(e) {
    // 1) Context menus & dropdown menus (ArrowUp/Down, Enter, Escape)
    const openMenu = document.querySelector('.context-menu[style*="display: block"]');
    if (openMenu) {
        const items = Array.from(openMenu.querySelectorAll('.menu-item:not(.divider)'));
        if (items.length === 0) return;
        const activeItem = openMenu.querySelector('.menu-item.kb-active');
        let ci = activeItem ? items.indexOf(activeItem) : -1;

        if (e.key === 'Escape') {
            e.preventDefault();
            openMenu.style.display = 'none';
            items.forEach(el => el.classList.remove('kb-active'));
            return;
        }
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            items.forEach(el => el.classList.remove('kb-active'));
            const ni = ci + 1 >= items.length ? 0 : ci + 1;
            items[ni].classList.add('kb-active');
            items[ni].scrollIntoView({ block: 'nearest' });
            return;
        }
        if (e.key === 'ArrowUp') {
            e.preventDefault();
            items.forEach(el => el.classList.remove('kb-active'));
            const ni = ci - 1 < 0 ? items.length - 1 : ci - 1;
            items[ni].classList.add('kb-active');
            items[ni].scrollIntoView({ block: 'nearest' });
            return;
        }
        if (e.key === 'Enter' && ci !== -1) {
            e.preventDefault();
            items[ci].click();
            openMenu.style.display = 'none';
            items.forEach(el => el.classList.remove('kb-active'));
            return;
        }
        return; 
    }

    // 2) Modal overlays
    const modals = [
        'discard-modal',
        'link-modal',
        'quick-open-modal',
        'language-modal',
        'global-search-modal',
        'open-url-modal'
    ];
    const activeModal = modals.map(id => document.getElementById(id)).find(el => el && el.style.display !== 'none');
    if (activeModal) {
        if (e.key === 'Escape') {
            if (activeModal.id === 'discard-modal') document.getElementById('modal-btn-cancel')?.click();
            else if (activeModal.id === 'link-modal') document.getElementById('link-modal-cancel')?.click();
            else if (activeModal.id === 'quick-open-modal') closeQuickOpen();
            else if (activeModal.id === 'language-modal') closeLanguageOpen();
            else if (activeModal.id === 'global-search-modal') closeGlobalSearch();
            else if (activeModal.id === 'open-url-modal') document.getElementById('btn-cancel-url')?.click();
            return;
        }

        if (activeModal.id === 'discard-modal' || activeModal.id === 'link-modal' || activeModal.id === 'open-url-modal') {
            const focusables = Array.from(activeModal.querySelectorAll('button, input'))
                .filter(el => window.getComputedStyle(el).display !== 'none');

            if (e.key === 'Enter') {
                if (document.activeElement && document.activeElement.tagName === 'INPUT') {
                    const primaryBtn = activeModal.querySelector('.modal-btn.primary') || activeModal.querySelector('#modal-btn-yes');
                    if (primaryBtn) {
                        e.preventDefault();
                        primaryBtn.click();
                        return;
                    }
                }
            }

            if (focusables.length > 0) {
                const fi = focusables.indexOf(document.activeElement);
                if (e.key === 'ArrowRight' || (e.key === 'Tab' && !e.shiftKey)) {
                    e.preventDefault();
                    const ni = fi + 1 >= focusables.length ? 0 : fi + 1;
                    focusables[ni].focus();
                    return;
                }
                if (e.key === 'ArrowLeft' || (e.key === 'Tab' && e.shiftKey)) {
                    e.preventDefault();
                    const ni = fi - 1 < 0 ? focusables.length - 1 : fi - 1;
                    focusables[ni].focus();
                    return;
                }
            }
        }

        if (activeModal.id === 'global-search-modal') {
            const resultsContainer = document.getElementById('global-search-results');
            if (resultsContainer && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
                const resultItems = Array.from(resultsContainer.querySelectorAll('.gs-result-item'));
                if (resultItems.length > 0) {
                    const activeResult = resultsContainer.querySelector('.gs-result-item.kb-active');
                    let ri = activeResult ? resultItems.indexOf(activeResult) : -1;
                    resultItems.forEach(el => el.classList.remove('kb-active'));
                    if (e.key === 'ArrowDown') {
                        e.preventDefault();
                        ri = ri + 1 >= resultItems.length ? 0 : ri + 1;
                    } else {
                        e.preventDefault();
                        ri = ri - 1 < 0 ? resultItems.length - 1 : ri - 1;
                    }
                    resultItems[ri].classList.add('kb-active');
                    resultItems[ri].scrollIntoView({ block: 'nearest' });
                    return;
                }
            }
            if (e.key === 'Enter') {
                const activeResult = document.querySelector('#global-search-results .gs-result-item.kb-active');
                if (activeResult) { e.preventDefault(); activeResult.click(); return; }
            }
        }
    }
}
