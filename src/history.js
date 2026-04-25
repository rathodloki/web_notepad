import { state } from './state.js';

export function loadFileHistory() {
    const historyJson = localStorage.getItem('lightpad-history');
    if (historyJson) {
        try {
            state.fileHistory = JSON.parse(historyJson);
        } catch (e) {
            state.fileHistory = [];
        }
    }
}

export function saveFileHistory() {
    localStorage.setItem('lightpad-history', JSON.stringify(state.fileHistory));
}

export function addToFileHistory(path) {
    if (!path) return;
    state.fileHistory = state.fileHistory.filter(p => p !== path);
    state.fileHistory.unshift(path);
    if (state.fileHistory.length > 50) {
        state.fileHistory = state.fileHistory.slice(0, 50);
    }
    saveFileHistory();
}

export function removeFromFileHistory(path) {
    state.fileHistory = state.fileHistory.filter(p => p !== path);
    saveFileHistory();
}
