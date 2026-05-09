// window-manager.js — Tauri window size/position persistence and titlebar buttons
import { saveSession } from './session.js';

/**
 * Set up window size/position restore, save interval, and titlebar buttons.
 * Call once from DOMContentLoaded when running inside Tauri.
 * @param {object} appWindow - The Tauri appWindow instance
 */
export function setupWindowManager(appWindow) {
    if (!appWindow) return;

    // Version display
    if (window.__TAURI__.app) {
        window.__TAURI__.app.getVersion().then(v => {
            const el = document.getElementById('status-version');
            if (el) el.textContent = 'v' + v;
        }).catch(() => {});
    }

    // Window size/position restore
    requestAnimationFrame(() => {
        setTimeout(async () => {
            const { LogicalSize, PhysicalSize, PhysicalPosition } = window.__TAURI__.window;
            await appWindow.setMinSize(new LogicalSize(400, 300));
            try {
                const stateStr = localStorage.getItem('lightpad-window');
                if (stateStr) {
                    const ws = JSON.parse(stateStr);
                    if (ws.width >= 400 && ws.height >= 300) await appWindow.setSize(new PhysicalSize(ws.width, ws.height));
                    else await appWindow.setSize(new LogicalSize(900, 650));
                    if (ws.x !== undefined && ws.y !== undefined) await appWindow.setPosition(new PhysicalPosition(ws.x, ws.y));
                    else await appWindow.center();
                    if (ws.maximized) await appWindow.maximize();
                } else { await appWindow.setSize(new LogicalSize(900, 650)); await appWindow.center(); }
            } catch (e) { await appWindow.setSize(new LogicalSize(900, 650)); await appWindow.center(); }
            appWindow.show();

            // Periodic window state save
            setInterval(async () => {
                if (!appWindow) return;
                try {
                    const isMax = await appWindow.isMaximized();
                    if (!isMax) {
                        const size = await appWindow.outerSize();
                        const pos = await appWindow.outerPosition();
                        if (size.width >= 400 && size.height >= 300) {
                            localStorage.setItem('lightpad-window', JSON.stringify({ width: size.width, height: size.height, x: pos.x, y: pos.y, maximized: false }));
                        }
                    } else {
                        const saved = JSON.parse(localStorage.getItem('lightpad-window') || '{}');
                        saved.maximized = true;
                        localStorage.setItem('lightpad-window', JSON.stringify(saved));
                    }
                } catch (e) {}
            }, 1000);
        }, 50);
    });

    // Titlebar buttons
    document.getElementById('titlebar-minimize').addEventListener('click', () => appWindow.minimize());
    document.getElementById('titlebar-maximize').addEventListener('click', () => appWindow.toggleMaximize());
    document.getElementById('titlebar-close').addEventListener('click', async () => { saveSession(); appWindow.close(); });

    // Save session before page unload
    window.addEventListener('beforeunload', () => saveSession());
}
