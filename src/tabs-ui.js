import { state } from './state.js';
import { getFilename } from './utils.js';

const tabBar = document.getElementById('tab-bar');
let draggedTabId = null;
let draggedTabEl = null;

export function updateScrollShadows() {
    const leftShadow = document.querySelector('.tab-scroll-shadow-left');
    const rightShadow = document.querySelector('.tab-scroll-shadow-right');
    if (!leftShadow || !rightShadow || !tabBar) return;

    const { scrollLeft, scrollWidth, clientWidth } = tabBar;

    if (scrollLeft > 0) leftShadow.classList.add('show');
    else leftShadow.classList.remove('show');

    if (Math.ceil(scrollLeft + clientWidth) < scrollWidth) rightShadow.classList.add('show');
    else rightShadow.classList.remove('show');
}

window.addEventListener('resize', updateScrollShadows);

export function renderTabs() {
    if (!tabBar) return;
    tabBar.innerHTML = '';

    state.tabs.forEach((tab, index) => {
        let classes = ['tab'];
        if (tab.id === state.activeTabId) classes.push('active');
        if (tab.isTodo) classes.push('is-todo');
        if (tab.isDoc) classes.push('is-doc');
        if (tab.isGame) classes.push('is-game');

        const tabEl = document.createElement('div');
        tabEl.className = classes.join(' ');
        tabEl.dataset.id = tab.id;

        const dot = document.createElement('div');
        dot.className = `tab-dot ${tab.isUnsaved ? 'unsaved' : ''}`;

        const titleSpan = document.createElement('span');
        titleSpan.textContent = getFilename(tab.path) || tab.title;
        titleSpan.className = 'tab-title';

        const closeBtn = document.createElement('span');
        closeBtn.className = 'tab-close';
        closeBtn.innerHTML = '<svg viewBox="0 0 10 10" width="10" height="10"><path d="M1.5,1.5 L8.5,8.5 M8.5,1.5 L1.5,8.5" stroke="currentColor" stroke-width="1.2"/></svg>';

        tabEl.appendChild(dot);
        tabEl.appendChild(titleSpan);
        tabEl.appendChild(closeBtn);

        let isDraggingTab = false;

        tabEl.addEventListener('click', async (e) => {
            if (e.target.closest('.tab-close') || isDraggingTab) return;
            const { switchTab } = await import('./editor-manager.js');
            switchTab(tab.id);
        });

        tabEl.addEventListener('auxclick', async (e) => {
            if (e.button === 1) {
                e.preventDefault();
                e.stopPropagation();
                const { closeTab } = await import('./editor-manager.js');
                closeTab(tab.id);
            }
        });

        closeBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const { closeTab } = await import('./editor-manager.js');
            closeTab(tab.id);
        });

        tabEl.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            state.contextMenuTargetId = tab.id;
            const menu = document.getElementById('tab-context-menu');
            if (menu) {
                menu.style.display = 'flex';
                // Reset positions to measure layout correctly
                menu.style.left = '0px';
                menu.style.top = '0px';

                const menuRect = menu.getBoundingClientRect();
                let left = e.clientX;
                let top = e.clientY;

                if (left + menuRect.width > window.innerWidth) {
                    left = window.innerWidth - menuRect.width - 10;
                }
                if (top + menuRect.height > window.innerHeight) {
                    top = window.innerHeight - menuRect.height - 10;
                }

                menu.style.left = `${left}px`;
                menu.style.top = `${top}px`;
            }
        });

        // DRAG AND DROP
        let startX = 0;
        tabEl.addEventListener('pointerdown', (e) => {
            if (e.target.closest('.tab-close') || e.button !== 0) return;
            e.currentTarget.setPointerCapture(e.pointerId);
            draggedTabId = tab.id;
            draggedTabEl = e.currentTarget;
            startX = e.clientX;
            isDraggingTab = false;
        });

        tabEl.addEventListener('pointermove', (e) => {
            if (!draggedTabId || draggedTabId !== tab.id || !draggedTabEl) return;
            const dragOffsetX = e.clientX - startX;
            if (Math.abs(dragOffsetX) > 5) {
                isDraggingTab = true;
                draggedTabEl.classList.add('tab-dragging');
            }
            if (!isDraggingTab) return;

            draggedTabEl.style.transform = `translateX(${dragOffsetX}px)`;
            draggedTabEl.style.zIndex = '1000';
            draggedTabEl.style.position = 'relative';

            const elements = document.elementsFromPoint(e.clientX, e.clientY);
            const dropTarget = elements.find(el => el.classList.contains('tab') && el !== draggedTabEl);

            document.querySelectorAll('.tab').forEach(t => t.classList.remove('tab-drag-over-left', 'tab-drag-over-right'));

            if (dropTarget) {
                const targetRect = dropTarget.getBoundingClientRect();
                const isRightHalf = e.clientX > targetRect.left + (targetRect.width / 2);
                if (isRightHalf) dropTarget.classList.add('tab-drag-over-right');
                else dropTarget.classList.add('tab-drag-over-left');
            }
        });

        tabEl.addEventListener('pointerup', (e) => {
            if (!draggedTabEl) return;
            draggedTabEl.classList.remove('tab-dragging');
            draggedTabEl.style.transform = '';
            draggedTabEl.style.zIndex = '';
            draggedTabEl.style.position = '';
            draggedTabEl.releasePointerCapture(e.pointerId);

            const leftTarget = document.querySelector('.tab.tab-drag-over-left');
            const rightTarget = document.querySelector('.tab.tab-drag-over-right');
            const dropTarget = leftTarget || rightTarget;

            document.querySelectorAll('.tab').forEach(t => t.classList.remove('tab-drag-over-left', 'tab-drag-over-right'));

            if (isDraggingTab && dropTarget) {
                const dropIdx = Array.from(tabBar.children).indexOf(dropTarget);
                if (dropIdx !== -1) {
                    const targetId = state.tabs[dropIdx].id;
                    const fromIdx = state.tabs.findIndex(t => t.id === draggedTabId);
                    const toIdx = state.tabs.findIndex(t => t.id === targetId);

                    if (fromIdx !== -1 && toIdx !== -1 && fromIdx !== toIdx) {
                        const isRightHalf = !!rightTarget;
                        let insertBefore = isRightHalf ? toIdx + 1 : toIdx;
                        const [movedTab] = state.tabs.splice(fromIdx, 1);
                        const adjustedIndex = insertBefore > fromIdx ? insertBefore - 1 : insertBefore;
                        state.tabs.splice(adjustedIndex, 0, movedTab);
                        renderTabs();
                    }
                }
            }

            draggedTabId = null;
            draggedTabEl = null;
            setTimeout(() => { isDraggingTab = false; }, 50);
            import('./session.js').then(m => m.saveSessionDebounced());
        });

        tabEl.addEventListener('pointercancel', (e) => {
            if (draggedTabEl) {
                draggedTabEl.classList.remove('tab-dragging');
                draggedTabEl.style.transform = '';
                draggedTabEl.style.zIndex = '';
                draggedTabEl.style.position = '';
                draggedTabEl.releasePointerCapture(e.pointerId);
            }
            document.querySelectorAll('.tab').forEach(t => t.classList.remove('tab-drag-over-left', 'tab-drag-over-right'));
            draggedTabId = null;
            draggedTabEl = null;
        });

        tabBar.appendChild(tabEl);
    });

    if (draggedTabId) {
        draggedTabEl = document.querySelector(`[data-id="${draggedTabId}"]`);
    }

    if (!tabBar.dataset.scrollListenerAdded) {
        tabBar.addEventListener('scroll', updateScrollShadows);
        tabBar.dataset.scrollListenerAdded = 'true';
    }

    const activeTabEl = tabBar.querySelector('.tab.active');
    if (activeTabEl) {
        setTimeout(() => {
            const barRect = tabBar.getBoundingClientRect();
            const tabRect = activeTabEl.getBoundingClientRect();
            if (tabRect.left < barRect.left) tabBar.scrollBy({ left: tabRect.left - barRect.left - 20, behavior: 'smooth' });
            else if (tabRect.right > barRect.right) tabBar.scrollBy({ left: tabRect.right - barRect.right + 20, behavior: 'smooth' });
        }, 10);
    }
    requestAnimationFrame(updateScrollShadows);
}

function updateActiveTabUI() {
    const activeTab = state.tabs.find(t => t.id === state.activeTabId);
    if (activeTab) {
        document.body.classList.remove('theme-doc', 'theme-todo', 'theme-text', 'theme-game');
        if (activeTab.isDoc) document.body.classList.add('theme-doc');
        else if (activeTab.isTodo) document.body.classList.add('theme-todo');
        else if (activeTab.isGame) document.body.classList.add('theme-game');
        else document.body.classList.add('theme-text');
    }

    import('./settings-manager.js').then(m => m.updateCheckmarks());

    const tabEls = tabBar.querySelectorAll('.tab');
    tabEls.forEach(el => {
        if (el.dataset.id === state.activeTabId) {
            el.classList.add('active');
            const barRect = tabBar.getBoundingClientRect();
            const tabRect = el.getBoundingClientRect();
            if (tabRect.left < barRect.left) tabBar.scrollBy({ left: tabRect.left - barRect.left - 20, behavior: 'instant' });
            else if (tabRect.right > barRect.right) tabBar.scrollBy({ left: tabRect.right - barRect.right + 20, behavior: 'instant' });
        } else {
            el.classList.remove('active');
        }
    });

    requestAnimationFrame(updateScrollShadows);
}

/**
 * Handles all UI activation for a tab: container visibility, editor/quill swap, status bar.
 * Extracted from editor-manager.js to reduce God Node coupling.
 */
export function activateTabUI(tab) {
    const editorContainer = document.getElementById('editor-container');
    const quillWrapper = document.getElementById('quill-wrapper');
    const emptyState = document.getElementById('empty-state');
    const editorWrapper = document.getElementById('editor-wrapper');

    if (tab.isGame) {
        if (editorWrapper) editorWrapper.style.display = 'none';
        if (emptyState) {
            emptyState.style.display = 'flex';
            import('./game.js').then(m => m.initGame());
        }

        const mdPreview = document.getElementById('markdown-preview');
        if (mdPreview) mdPreview.style.display = 'none';
        state.isMarkdownPreviewEnabled = false;

        updateActiveTabUI();

        // Status updates
        import('./status-bar.js').then(m => {
            m.updateTitle();
            m.updateLanguageStatus();
            const statusCursor = document.getElementById('status-cursor');
            if (statusCursor) statusCursor.textContent = '';
        });
        return;
    }

    if (emptyState) emptyState.style.display = 'none';
    if (editorWrapper) editorWrapper.style.display = 'flex';

    if (tab.isDoc) {
        editorContainer.style.display = 'none';
        quillWrapper.style.display = 'flex';

        if (!state.quillView) {
            import('./quill-init.js').then(m => m.initializeQuill());
        }

        if (state.quillView) {
            const fallback = tab.savedContent !== undefined && tab.savedContent !== null ? tab.savedContent : '';
            state.quillView.root.innerHTML = fallback;
            setTimeout(() => {
                state.quillView.focus();
                import('./quill-init.js').then(m => m.applyDocZoom());
            }, 50);
        }
    } else {
        editorContainer.style.display = 'flex';
        quillWrapper.style.display = 'none';

        if (state.editorView) {
            state.editorView.setState(tab.state);
        } else {
            import('./editor.js').then(m => {
                state.editorView = m.createEditorView(tab.state, editorContainer);
                state.editorView.focus();
            });
        }
        if (state.editorView) state.editorView.focus();
    }

    updateActiveTabUI();
    
    // Status updates
    import('./status-bar.js').then(m => {
        m.updateTitle();
        m.updateCursorStatus();
        m.updateLanguageStatus();
    });
}

/**
 * Deactivates the UI when no tab is active: hides editors, shows empty state.
 */
export function deactivateTabUI() {
    const quillWrapper = document.getElementById('quill-wrapper');
    const emptyState = document.getElementById('empty-state');
    const editorWrapper = document.getElementById('editor-wrapper');

    if (state.editorView) {
        state.editorView.destroy();
        state.editorView = null;
    }
    if (state.quillView) {
        quillWrapper.style.display = 'none';
    }
    if (editorWrapper) editorWrapper.style.display = 'none';
    if (emptyState) {
        emptyState.style.display = 'flex';
        import('./game.js').then(m => m.initGame());
    }

    const mdPreview = document.getElementById('markdown-preview');
    if (mdPreview) mdPreview.style.display = 'none';
    state.isMarkdownPreviewEnabled = false;

    updateActiveTabUI();
    
    import('./status-bar.js').then(m => {
        m.updateTitle();
        m.updateLanguageStatus();
        const statusCursor = document.getElementById('status-cursor');
        if (statusCursor) statusCursor.textContent = '';
    });
}
