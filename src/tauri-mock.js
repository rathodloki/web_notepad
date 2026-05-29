// tauri-mock.js — Test and Evaluation Mock Bridge for LightPad

(function () {
    // Only activate if we are running in standalone browser AND harness mode is enabled
    const hasHarnessParam = window.location.search.includes('harness=true');
    const hasHarnessLocal = localStorage.getItem('lightpad-harness') === 'true';

    if (!hasHarnessParam && !hasHarnessLocal) {
        return;
    }

    console.log('🚀 LightPad Test Harness Active: Mocking Tauri APIs');

    // Setup Virtual File System (VFS)
    const vfs = {
        'C:\\test\\notes.txt': 'Hello World from LightPad Harness!',
        'C:\\test\\todo.todo': '[] Task 1\n[x] Task 2',
        'C:\\test\\doc.doc': '<p>Rich Text from Harness</p>',
        'C:\\test\\code.js': "console.log('Hello from test harness');",
        'C:\\test\\save_target.txt': 'Original Content'
    };

    const mockModifiedTimes = {
        'C:\\test\\notes.txt': Date.now(),
        'C:\\test\\todo.todo': Date.now(),
        'C:\\test\\doc.doc': Date.now(),
        'C:\\test\\code.js': Date.now(),
        'C:\\test\\save_target.txt': Date.now()
    };

    const mockFetchedUrls = {
        'https://example.com/test-remote.js': "console.log('fetched from url!');",
        'https://raw.githubusercontent.com/test/notes.txt': 'Remote file content fetch works!'
    };

    const dialogPaths = {
        open: 'C:\\test\\notes.txt',
        save: 'C:\\test\\save_target.txt'
    };

    // Diagnostics Hook
    window.__lightpadHarness = {
        vfs,
        state: null, // Will be set by main.js
        dialogPaths,
        mockModifiedTimes,
        mockFetchedUrls,
        
        // Helper to quickly retrieve text/HTML content of the active editor
        getEditorContent() {
            if (!this.state) return null;
            const activeTab = this.state.tabs.find(t => t.id === this.state.activeTabId);
            if (!activeTab) return null;
            if (activeTab.isDoc) {
                return this.state.quillView ? this.state.quillView.root.innerHTML : '';
            } else {
                return this.state.editorView ? this.state.editorView.state.doc.toString() : '';
            }
        },

        // Helper to trigger key events programmatically
        triggerShortcut(key, modifiers = {}) {
            const event = new KeyboardEvent('keydown', {
                key: key,
                ctrlKey: !!modifiers.ctrl,
                metaKey: !!modifiers.meta,
                altKey: !!modifiers.alt,
                shiftKey: !!modifiers.shift,
                bubbles: true,
                cancelable: true
            });
            window.dispatchEvent(event);
        }
    };

    // Standard Tauri Size/Position classes
    class MockLogicalSize {
        constructor(width, height) {
            this.width = width;
            this.height = height;
        }
    }
    class MockPhysicalSize {
        constructor(width, height) {
            this.width = width;
            this.height = height;
        }
    }
    class MockPhysicalPosition {
        constructor(x, y) {
            this.x = x;
            this.y = y;
        }
    }

    // Mock appWindow implementation
    const appWindow = {
        setMinSize: async () => {},
        setSize: async () => {},
        setPosition: async () => {},
        center: async () => {},
        maximize: async () => {},
        show: async () => {},
        isMaximized: async () => false,
        outerSize: async () => ({ width: 900, height: 650 }),
        outerPosition: async () => ({ x: 100, y: 100 }),
        minimize: async () => console.log('[Mock AppWindow] Minimize clicked'),
        toggleMaximize: async () => console.log('[Mock AppWindow] Toggle Maximize clicked'),
        close: async () => console.log('[Mock AppWindow] Close clicked'),
        setTitle: async (title) => console.log(`[Mock AppWindow] Title set to: ${title}`),
        listen: async (event, callback) => {
            console.log(`[Mock AppWindow] Subscribed to event: ${event}`);
            return () => console.log(`[Mock AppWindow] Unsubscribed from event: ${event}`);
        }
    };

    // Construct window.__TAURI__
    window.__TAURI__ = {
        tauri: {
            invoke: async (cmd, args = {}) => {
                console.log(`[Mock Invoke] ${cmd}`, args);
                if (cmd === 'get_file_modified') {
                    const path = args.path;
                    return mockModifiedTimes[path] || Date.now();
                }
                if (cmd === 'fetch_url') {
                    const url = args.url;
                    if (mockFetchedUrls[url]) {
                        return mockFetchedUrls[url];
                    }
                    throw new Error(`404: Remote URL ${url} not in mock registry`);
                }
                // Handle basic window manager actions if passed as commands
                return null;
            }
        },
        // Fallback or modern interface
        invoke: async (cmd, args = {}) => {
            return window.__TAURI__.tauri.invoke(cmd, args);
        },
        app: {
            getVersion: async () => '1.0.23'
        },
        window: {
            appWindow,
            LogicalSize: MockLogicalSize,
            PhysicalSize: MockPhysicalSize,
            PhysicalPosition: MockPhysicalPosition
        },
        fs: {
            readTextFile: async (path) => {
                console.log(`[Mock ReadFile] ${path}`);
                if (path in vfs) {
                    return vfs[path];
                }
                throw new Error(`File not found in Virtual File System: ${path}`);
            },
            writeTextFile: async (path, contents) => {
                console.log(`[Mock WriteFile] ${path}`, contents);
                vfs[path] = contents;
                mockModifiedTimes[path] = Date.now();
                return null;
            }
        },
        dialog: {
            open: async (options = {}) => {
                console.log('[Mock Dialog Open]', options);
                return dialogPaths.open;
            },
            save: async (options = {}) => {
                console.log('[Mock Dialog Save]', options);
                return dialogPaths.save;
            }
        },
        event: {
            listen: async (event, callback) => {
                console.log(`[Mock Event] Subscribed to global event: ${event}`);
                return () => console.log(`[Mock Event] Unsubscribed from global event: ${event}`);
            }
        }
    };

    // Mock Audio & AudioContext for headless test environments to bypass browser autoplay/network limitations
    class MockAudio {
        constructor() {
            this.volume = 1;
            this.src = '';
            this.crossOrigin = '';
            this.preload = '';
            this.listeners = {};
        }
        addEventListener(event, callback) {
            if (!this.listeners[event]) this.listeners[event] = [];
            this.listeners[event].push(callback);
        }
        removeEventListener(event, callback) {
            if (!this.listeners[event]) return;
            this.listeners[event] = this.listeners[event].filter(cb => cb !== callback);
        }
        dispatchEvent(event, data) {
            if (this.listeners[event]) {
                this.listeners[event].forEach(cb => cb(data));
            }
        }
        play() {
            setTimeout(() => {
                this.dispatchEvent('canplay');
                this.dispatchEvent('playing');
            }, 10);
            return Promise.resolve();
        }
        pause() {
            setTimeout(() => {
                this.dispatchEvent('pause');
            }, 10);
        }
        load() {}
    }

    class MockAudioContext {
        constructor() {
            this.state = 'running';
            this.destination = {};
        }
        resume() {
            this.state = 'running';
            return Promise.resolve();
        }
        suspend() {
            this.state = 'suspended';
            return Promise.resolve();
        }
        createAnalyser() {
            return {
                fftSize: 256,
                frequencyBinCount: 128,
                getByteFrequencyData(array) {
                    for (let i = 0; i < array.length; i++) {
                        array[i] = Math.floor(Math.random() * 100);
                    }
                },
                connect() {}
            };
        }
        createMediaElementSource() {
            return {
                connect() {}
            };
        }
        close() {
            return Promise.resolve();
        }
    }

    window.Audio = MockAudio;
    window.AudioContext = MockAudioContext;
    window.webkitAudioContext = MockAudioContext;
})();
