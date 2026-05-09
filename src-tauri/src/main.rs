#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]

use serde::{Deserialize, Serialize};
#[derive(Deserialize)]
pub struct TabContent {
    pub id: String,
    pub filename: String,
    pub content: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchResult {
    pub tab_id: String,
    pub filename: String,
    pub line: usize,
    pub col: usize,
    pub text: String,
    pub full_line_text: String,
}

#[tauri::command]
async fn global_search(query: String, match_case: bool, tabs: Vec<TabContent>) -> Result<Vec<SearchResult>, String> {
    let mut results = Vec::new();
    let max_results = 10000;
    let search_query = if match_case { query.clone() } else { query.to_lowercase() };
    
    for tab in tabs {
        // If content is huge, processing line-by-line is fast in Rust
        for (i, line) in tab.content.lines().enumerate() {
            let search_line = if match_case {
                line.to_string()
            } else {
                line.to_lowercase()
            };
            
            if let Some(col) = search_line.find(&search_query) {
                // If the line is entirely whitespace or empty, fallback to '...'
                let trimmed = line.trim();
                let text = if trimmed.is_empty() { "...".to_string() } else { trimmed.to_string() };
                
                results.push(SearchResult {
                    tab_id: tab.id.clone(),
                    filename: tab.filename.clone(),
                    line: i + 1,
                    col: col + 1,
                    text,
                    full_line_text: line.to_string(),
                });

                if results.len() >= max_results {
                    return Ok(results);
                }
            }
        }
    }
    
    Ok(results)
}

#[tauri::command]
async fn get_file_modified(path: String) -> Result<u64, String> {
    std::fs::metadata(&path)
        .and_then(|m| m.modified())
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e)))
        .map(|d| d.as_secs())
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn format_json(text: String) -> Result<String, String> {
    let parsed: serde_json::Value = serde_json::from_str(&text).map_err(|e| e.to_string())?;
    serde_json::to_string_pretty(&parsed).map_err(|e| e.to_string())
}

#[tauri::command]
async fn minify_json(text: String) -> Result<String, String> {
    let parsed: serde_json::Value = serde_json::from_str(&text).map_err(|e| e.to_string())?;
    serde_json::to_string(&parsed).map_err(|e| e.to_string())
}

#[tauri::command]
async fn fetch_url(url: String) -> Result<String, String> {
    reqwest::get(&url)
        .await
        .map_err(|e| e.to_string())?
        .text()
        .await
        .map_err(|e| e.to_string())
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![get_file_modified, format_json, minify_json, global_search, fetch_url])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
