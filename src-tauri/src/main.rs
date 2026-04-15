#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]

#[tauri::command]
fn get_file_modified(path: String) -> Result<u64, String> {
    std::fs::metadata(&path)
        .and_then(|m| m.modified())
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e)))
        .map(|d| d.as_secs())
        .map_err(|e| e.to_string())
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![get_file_modified])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
