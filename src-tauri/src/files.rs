use std::fs;

use serde::{Deserialize, Serialize};
use tauri::command;

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct FileEntry {
    name: String,
    path: String,
    is_dir: bool,
}

#[command]
pub fn list_directory(path: Option<String>) -> Result<Vec<FileEntry>, String> {
    let target_path = if let Some(p) = path {
        if p.is_empty() {
            ".".to_string()
        } else {
            p
        }
    } else {
        ".".to_string()
    };

    let read_dir = fs::read_dir(&target_path).map_err(|e| e.to_string())?;
    let mut entries = Vec::new();

    for entry in read_dir {
        let entry = entry.map_err(|e| e.to_string())?;
        let path_buf = entry.path();
        let metadata = fs::metadata(&path_buf).map_err(|e| e.to_string())?;

        // Skip hidden files/dirs (starting with dot)
        let name = entry.file_name().to_string_lossy().to_string();
        if name.starts_with('.') {
            continue;
        }

        entries.push(FileEntry {
            name,
            path: path_buf.to_string_lossy().to_string(),
            is_dir: metadata.is_dir(),
        });
    }

    // Sort: Dirs first, then files
    entries.sort_by(|a, b| {
        if a.is_dir && !b.is_dir {
            std::cmp::Ordering::Less
        } else if !a.is_dir && b.is_dir {
            std::cmp::Ordering::Greater
        } else {
            a.name.to_lowercase().cmp(&b.name.to_lowercase())
        }
    });

    Ok(entries)
}

#[command]
pub fn save_file(path: String, content: String, append: bool) -> Result<(), String> {
    use std::io::Write;

    let mut file = if append {
        fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(&path)
            .map_err(|e| e.to_string())?
    } else {
        fs::File::create(&path).map_err(|e| e.to_string())?
    };

    file.write_all(content.as_bytes())
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[command]
pub fn read_file(path: String) -> Result<String, String> {
    fs::read_to_string(&path).map_err(|e| e.to_string())
}

#[command]
pub fn save_image(path: String, content: Vec<u8>) -> Result<(), String> {
    use std::io::Write;
    let mut file = fs::File::create(&path).map_err(|e| e.to_string())?;
    file.write_all(&content).map_err(|e| e.to_string())?;
    Ok(())
}
