use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use tauri::{Emitter, Manager};

const IMAGE_EXTS: &[&str] = &[
    "jpg", "jpeg", "png", "gif", "webp", "heic", "heif", "avif", "bmp", "tiff", "tif",
];
const VIDEO_EXTS: &[&str] = &["mp4", "mov", "avi", "mkv", "webm", "m4v", "3gp", "wmv"];

fn extension_of(name: &str) -> String {
    name.rsplit('.').next().unwrap_or("").to_lowercase()
}

fn is_image(name: &str) -> bool {
    IMAGE_EXTS.contains(&extension_of(name).as_str())
}

fn is_video(name: &str) -> bool {
    VIDEO_EXTS.contains(&extension_of(name).as_str())
}

#[derive(Serialize, Deserialize, Clone)]
struct FileEntry {
    name: String,
    path: String,
    #[serde(rename = "type")]
    kind: String,
}

#[tauri::command]
async fn list_files(folder_path: String) -> Result<Vec<FileEntry>, String> {
    let read = fs::read_dir(&folder_path).map_err(|e| format!("read_dir failed: {e}"))?;
    let mut files: Vec<FileEntry> = read
        .filter_map(|entry| entry.ok())
        .filter(|entry| entry.file_type().map(|t| t.is_file()).unwrap_or(false))
        .filter_map(|entry| {
            let name = entry.file_name().to_string_lossy().into_owned();
            if !is_image(&name) && !is_video(&name) {
                return None;
            }
            let path = entry.path().to_string_lossy().into_owned();
            let kind = if is_video(&name) { "video" } else { "image" }.to_string();
            Some(FileEntry { name, path, kind })
        })
        .collect();
    files.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    Ok(files)
}

#[tauri::command]
async fn move_file(
    src_path: String,
    folder_path: String,
    subdir: String,
    file_name: String,
) -> Result<(), String> {
    let dest_dir = PathBuf::from(&folder_path).join(&subdir);
    fs::create_dir_all(&dest_dir).map_err(|e| format!("mkdir failed: {e}"))?;
    let dest = dest_dir.join(&file_name);
    fs::rename(&src_path, &dest).map_err(|e| format!("move failed: {e}"))?;
    Ok(())
}

#[tauri::command]
async fn rename_file(file_path: String, new_name: String) -> Result<(), String> {
    let src = PathBuf::from(&file_path);
    let parent = src
        .parent()
        .ok_or_else(|| "file has no parent directory".to_string())?;
    let dest = parent.join(&new_name);
    fs::rename(&src, &dest).map_err(|e| format!("rename failed: {e}"))?;
    Ok(())
}

#[tauri::command]
fn get_platform() -> String {
    if cfg!(target_os = "macos") {
        "darwin".into()
    } else if cfg!(target_os = "windows") {
        "win32".into()
    } else if cfg!(target_os = "linux") {
        "linux".into()
    } else {
        "unknown".into()
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut builder = tauri::Builder::default();

    // Single instance + deep-link forwarding (desktop only)
    #[cfg(desktop)]
    {
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
            // A second instance was launched — likely with the OAuth callback URL as argv.
            // Forward to the existing window and focus it.
            if let Some(url) = argv.iter().find(|a| a.starts_with("com.swipik.app://")) {
                let _ = app.emit("auth-callback", url.clone());
            }
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.set_focus();
            }
        }));
    }

    builder
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            #[cfg(desktop)]
            {
                use tauri_plugin_deep_link::DeepLinkExt;
                let handle = app.handle().clone();
                app.deep_link().on_open_url(move |event| {
                    if let Some(url) = event.urls().first() {
                        let _ = handle.emit("auth-callback", url.to_string());
                    }
                });
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            list_files,
            move_file,
            rename_file,
            get_platform,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
