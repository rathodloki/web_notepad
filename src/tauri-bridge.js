// tauri-bridge.js
let invoke, appWindow, readTextFile, writeTextFile, openDialog, saveDialog;

if (window.__TAURI__) {
    invoke = window.__TAURI__.tauri ? window.__TAURI__.tauri.invoke : window.__TAURI__.invoke;
    appWindow = window.__TAURI__.window ? window.__TAURI__.window.appWindow : null;
    readTextFile = window.__TAURI__.fs ? window.__TAURI__.fs.readTextFile : null;
    writeTextFile = window.__TAURI__.fs ? window.__TAURI__.fs.writeTextFile : null;
    openDialog = window.__TAURI__.dialog ? window.__TAURI__.dialog.open : null;
    saveDialog = window.__TAURI__.dialog ? window.__TAURI__.dialog.save : null;
} else {
    console.warn('Running outside Tauri. Native features will be disabled.');
}

export { invoke, appWindow, readTextFile, writeTextFile, openDialog, saveDialog };
