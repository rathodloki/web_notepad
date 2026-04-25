export function getFilename(path) {
    if (!path) return 'Untitled';
    return path.split('\\').pop().split('/').pop();
}

export function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}
