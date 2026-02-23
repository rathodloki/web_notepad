import { ViewPlugin, Decoration, WidgetType, EditorView } from "@codemirror/view";
import { EditorState, RangeSetBuilder } from "@codemirror/state";

// -------------------------------------------------------------
// Interactive Document Editor Core
// -------------------------------------------------------------

// We will expand these widgets later to support full Rich Text blocks
class DocHeadingWidget extends WidgetType {
    constructor(level, text) {
        super();
        this.level = level;
        this.text = text;
    }

    eq(other) {
        return other.level === this.level && other.text === this.text;
    }

    toDOM() {
        const h = document.createElement(`h${this.level}`);
        h.textContent = this.text;
        h.className = `cm-doc-h${this.level}`;
        return h;
    }
}

// -------------------------------------------------------------
// Editor Plugins
// -------------------------------------------------------------

export const docKeymap = [];

// Manages the Floating Toolbar position based on text selection
export const docToolbarPlugin = ViewPlugin.fromClass(class {
    toolbar;
    constructor(view) {
        this.toolbar = document.getElementById('doc-toolbar');
    }

    update(update) {
        if (!this.toolbar) return;

        if (update.selectionSet || update.viewportChanged || update.docChanged) {
            const { main } = update.state.selection;
            if (main.empty) {
                this.toolbar.style.display = 'none';
            } else {
                const coords = update.view.coordsAtPos(main.from);
                if (coords) {
                    this.toolbar.style.display = 'flex';
                    this.toolbar.style.left = `${coords.left}px`;
                    this.toolbar.style.top = `${coords.top - 8}px`; // slightly above cursor
                }
            }
        }
    }
});

// -------------------------------------------------------------
// Media & Smart Link Processing
// -------------------------------------------------------------

async function handleMediaFiles(files, view, insertPos) {
    if (!insertPos || !window.__TAURI__) return;

    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (file.type.startsWith('image/')) {
            try {
                // Generate unique filename
                const ext = file.name.split('.').pop() || 'png';
                const filename = `media_${Date.now()}_${Math.floor(Math.random() * 1000)}.${ext}`;

                // Read strictly as ArrayBuffer for Tauri
                const buffer = await file.arrayBuffer();
                const uint8Array = new Uint8Array(buffer);

                // Save locally via Tauri
                const { appDataDir, join } = window.__TAURI__.path;
                const { writeBinaryFile, createDir, exists } = window.__TAURI__.fs;

                const appDataPath = await appDataDir();
                const mediaDir = await join(appDataPath, 'LightPadMedia');

                if (!(await exists(mediaDir))) {
                    await createDir(mediaDir, { recursive: true });
                }

                const filePath = await join(mediaDir, filename);
                await writeBinaryFile(filePath, uint8Array);

                // Inject the standard Markdown image syntax
                const mdImage = `\n![Image](${filePath})\n`;

                view.dispatch({
                    changes: { from: insertPos, to: insertPos, insert: mdImage }
                });
            } catch (err) {
                console.error("Failed to process dropped image", err);
            }
        }
    }
}

export const docDropPastePlugin = EditorView.domEventHandlers({
    drop(e, view) {
        if (e.dataTransfer && e.dataTransfer.files.length > 0) {
            handleMediaFiles(e.dataTransfer.files, view, view.posAtCoords({ x: e.clientX, y: e.clientY }));
            return true;
        }
        return false;
    },
    paste(e, view) {
        if (e.clipboardData && e.clipboardData.files.length > 0) {
            handleMediaFiles(e.clipboardData.files, view, view.state.selection.main.head);
            return true;
        }
        return false;
    }
});

class ImageWidget extends WidgetType {
    constructor(src) {
        super();
        this.src = src;
    }

    eq(other) { return other.src === this.src; }

    toDOM() {
        const wrap = document.createElement("div");
        wrap.className = "cm-doc-image-wrap";

        const img = document.createElement("img");
        if (window.__TAURI__ && !this.src.startsWith('http') && !this.src.startsWith('data:')) {
            img.src = window.__TAURI__.tauri.convertFileSrc(this.src);
        } else {
            img.src = this.src;
        }

        img.className = "cm-doc-image";
        wrap.appendChild(img);
        return wrap;
    }

    ignoreEvent() { return true; }
}

export const docImageHighlighter = ViewPlugin.fromClass(class {
    decorations;

    constructor(view) { this.decorations = this.buildDecorations(view); }

    update(update) {
        if (update.docChanged || update.viewportChanged) {
            this.decorations = this.buildDecorations(update.view);
        }
    }

    buildDecorations(view) {
        let builder = [];
        for (let { from, to } of view.visibleRanges) {
            let pos = from;
            while (pos <= to) {
                let line = view.state.doc.lineAt(pos);
                let text = line.text;
                let match;

                const imgRegex = /!\[.*?\]\((.*?)\)/g;
                while ((match = imgRegex.exec(text)) !== null) {
                    const src = match[1];
                    const startRawIdx = line.from + match.index;
                    const endRawIdx = startRawIdx + match[0].length;

                    builder.push(Decoration.replace({
                        widget: new ImageWidget(src),
                        inclusive: false
                    }).range(startRawIdx, endRawIdx));
                }

                pos = line.to + 1;
            }
        }
        return Decoration.set(builder, true);
    }
}, { decorations: v => v.decorations });

// -------------------------------------------------------------
// Smart Link Bookmarks
// -------------------------------------------------------------

const linkCache = new Map();

class BookmarkWidget extends WidgetType {
    constructor(url) {
        super();
        this.url = url;
    }

    eq(other) { return other.url === this.url; }

    toDOM() {
        const wrap = document.createElement("div");
        wrap.className = "cm-doc-bookmark-wrap";

        wrap.innerHTML = `
            <div class="bookmark-card loading">
                <div class="bookmark-info">
                    <div class="bookmark-title">Loading preview...</div>
                    <div class="bookmark-url-text">${this.url}</div>
                </div>
            </div>
        `;

        if (linkCache.has(this.url)) {
            this.renderCard(wrap, linkCache.get(this.url));
        } else {
            fetch(`https://api.microlink.io/?url=${encodeURIComponent(this.url)}`)
                .then(res => res.json())
                .then(data => {
                    linkCache.set(this.url, data);
                    this.renderCard(wrap, data);
                })
                .catch(() => {
                    wrap.innerHTML = `<a href="${this.url}" target="_blank" class="cm-doc-raw-link">${this.url}</a>`;
                });
        }

        return wrap;
    }

    renderCard(wrap, data) {
        if (!data.data || !data.data.title) {
            wrap.innerHTML = `<a href="${this.url}" target="_blank" class="cm-doc-raw-link">${this.url}</a>`;
            return;
        }
        const { title, description, image, logo } = data.data;

        wrap.innerHTML = `
            <a href="${this.url}" target="_blank" class="bookmark-card">
                <div class="bookmark-info">
                    <div class="bookmark-title">${title || this.url}</div>
                    <div class="bookmark-desc">${description || ''}</div>
                    <div class="bookmark-footer">
                        ${logo?.url ? `<img src="${logo.url}" class="bookmark-favicon">` : ''}
                        <span class="bookmark-url-text">${this.url}</span>
                    </div>
                </div>
                ${image?.url ? `<div class="bookmark-image"><img src="${image.url}"></div>` : ''}
            </a>
        `;
    }

    ignoreEvent() { return false; }
}

export const docBookmarkHighlighter = ViewPlugin.fromClass(class {
    decorations;

    constructor(view) { this.decorations = this.buildDecorations(view); }

    update(update) {
        if (update.docChanged || update.viewportChanged) {
            this.decorations = this.buildDecorations(update.view);
        }
    }

    buildDecorations(view) {
        let builder = [];
        for (let { from, to } of view.visibleRanges) {
            let pos = from;
            while (pos <= to) {
                let line = view.state.doc.lineAt(pos);
                let text = line.text.trim();

                // If entire line is exactly one URL
                if (/^https?:\/\/[^\s]+$/.test(text)) {
                    // Extract exact match to prevent edge cases with spaces
                    const match = text.match(/^(https?:\/\/[^\s]+)$/);
                    if (match) {
                        const url = match[1];
                        const offset = line.text.indexOf(url);
                        builder.push(Decoration.replace({
                            widget: new BookmarkWidget(url),
                            inclusive: false
                        }).range(line.from + offset, line.from + offset + url.length));
                    }
                }

                pos = line.to + 1;
            }
        }
        return Decoration.set(builder, true);
    }
}, { decorations: v => v.decorations });

export function activateDocMode() {
    return [
        docToolbarPlugin,
        docDropPastePlugin,
        docImageHighlighter,
        docBookmarkHighlighter
    ];
}
