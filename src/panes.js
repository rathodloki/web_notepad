/**
 * panes.js – Simplified single-pane state management for LightPad
 */

export let tabs = [];
export let activeTabId = null;

// ─── Accessors ────────────────────────────────────────────────────────────────

export function getAllTabs() {
    return tabs;
}

export function findTab(tabId) {
    return tabs.find(t => t.id === tabId) || null;
}

// ─── Mutations ────────────────────────────────────────────────────────────────

export function registerTab(tab) {
    if (!tabs.some(t => t.id === tab.id)) {
        tabs.push(tab);
    }
    activeTabId = tab.id;
}

export function setActiveTab(tabId) {
    activeTabId = tabId;
}

export function unregisterTab(tabId) {
    const idx = tabs.findIndex(t => t.id === tabId);
    if (idx === -1) return false;

    tabs.splice(idx, 1);

    if (activeTabId === tabId) {
        activeTabId = tabs[Math.max(0, idx - 1)]?.id ?? tabs[0]?.id ?? null;
    }
    return true;
}

/** Serialize for session storage */
export function serializeTabs() {
    return tabs.map(t => ({
        id: t.id,
        path: t.path,
        title: t.title,
        isUnsaved: t.isUnsaved,
        isTodo: t.isTodo,
        isDoc: t.isDoc,
        content: null // Content is handled in script.js to grab from CodeMirror
    }));
}

/** 
 * Helper to reorder tabs during drag and drop
 */
export function moveTabToIndex(tabId, targetIndex) {
    const fromIdx = tabs.findIndex(t => t.id === tabId);
    if (fromIdx === -1 || fromIdx === targetIndex || fromIdx + 1 === targetIndex) return;

    const [movedTab] = tabs.splice(fromIdx, 1);
    // If we're moving it to an index after where it currently is, the array shifted left
    const adjustedIndex = targetIndex > fromIdx ? targetIndex - 1 : targetIndex;
    tabs.splice(adjustedIndex, 0, movedTab);
}
