use std::fs;

use crate::errors::{AppError, AppResult};
use serde::{Deserialize, Serialize};
use tauri::command;
use crate::cmd_utils::expand_env_vars;

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct FileEntry {
    name: String,
    path: String,
    is_dir: bool,
}

#[command]
pub fn list_directory(path: Option<String>) -> AppResult<Vec<FileEntry>> {
    let target_path = if let Some(p) = path {
        if p.is_empty() {
            ".".to_string()
        } else {
            expand_env_vars(&p)
        }
    } else {
        ".".to_string()
    };

    let read_dir =
        fs::read_dir(&target_path).map_err(|e| AppError::FileSystemError(e.to_string()))?;
    let mut entries = Vec::new();

    for entry in read_dir {
        let entry = entry.map_err(|e| AppError::FileSystemError(e.to_string()))?;
        let path_buf = entry.path();
        let metadata =
            fs::metadata(&path_buf).map_err(|e| AppError::FileSystemError(e.to_string()))?;

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
pub fn list_directory_recursive(path: String) -> AppResult<Vec<FileEntry>> {
    let expanded_path = expand_env_vars(&path);
    let mut entries = Vec::new();
    let mut stack = vec![std::path::PathBuf::from(&expanded_path)];

    while let Some(current_dir) = stack.pop() {
        if let Ok(read_dir) = fs::read_dir(&current_dir) {
            for entry in read_dir.flatten() {
                let path_buf = entry.path();
                if let Ok(metadata) = fs::metadata(&path_buf) {
                    let name = entry.file_name().to_string_lossy().to_string();
                    if name.starts_with('.') {
                        continue;
                    }

                    if metadata.is_dir() {
                        stack.push(path_buf.clone());
                    }

                    // Use relative path for name to show folder structure
                    let relative_name = if let Ok(rel) = path_buf.strip_prefix(&expanded_path) {
                        rel.to_string_lossy().to_string().replace("\\", "/")
                    } else {
                        name.clone()
                    };

                    entries.push(FileEntry {
                        name: relative_name,
                        path: path_buf.to_string_lossy().to_string(),
                        is_dir: metadata.is_dir(),
                    });
                }
            }
        }
    }

    Ok(entries)
}


#[command]
pub fn save_file(path: String, content: String, append: bool) -> AppResult<()> {
    use std::io::Write;
    
    let expanded_path = expand_env_vars(&path);

    let mut file = if append {
        fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(&expanded_path)
            .map_err(|e| AppError::FileSystemError(e.to_string()))?
    } else {
        fs::File::create(&expanded_path).map_err(|e| AppError::FileSystemError(e.to_string()))?
    };

    file.write_all(content.as_bytes())
        .map_err(|e| AppError::FileSystemError(e.to_string()))?;
    Ok(())
}

#[command]
pub fn read_file(path: String) -> AppResult<String> {
    let expanded_path = expand_env_vars(&path);
    fs::read_to_string(&expanded_path).map_err(|e| AppError::FileSystemError(e.to_string()))
}

pub fn read_file_tail_internal(path: &str, max_bytes: u64) -> AppResult<String> {
    use std::io::{Read, Seek, SeekFrom};
    let mut file = fs::File::open(path).map_err(|e| AppError::FileSystemError(e.to_string()))?;
    let metadata = file
        .metadata()
        .map_err(|e| AppError::FileSystemError(e.to_string()))?;
    let size = metadata.len();

    let start = if size > max_bytes {
        size - max_bytes
    } else {
        0
    };
    file.seek(SeekFrom::Start(start))
        .map_err(|e| AppError::FileSystemError(e.to_string()))?;

    let mut buffer = Vec::with_capacity(std::cmp::min(size, max_bytes) as usize);
    file.read_to_end(&mut buffer)
        .map_err(|e| AppError::FileSystemError(e.to_string()))?;

    // Safety: use lossy conversion to handle cases where we split a multi-byte character
    Ok(String::from_utf8_lossy(&buffer).to_string())
}

#[command]
pub fn read_file_tail(path: String, max_bytes: u64) -> AppResult<String> {
    let expanded_path = expand_env_vars(&path);
    read_file_tail_internal(&expanded_path, max_bytes)
}

#[command]
pub fn read_image_base64(path: String) -> AppResult<String> {
    use base64::{engine::general_purpose, Engine as _};
    let expanded_path = expand_env_vars(&path);
    let bytes = fs::read(&expanded_path).map_err(|e| AppError::FileSystemError(e.to_string()))?;
    let b64 = general_purpose::STANDARD.encode(bytes);
    Ok(b64)
}

#[command]
pub fn read_compressed_image_base64(path: String, max_width: Option<u32>, max_height: Option<u32>) -> AppResult<String> {
    use crate::image_utils;
    let expanded_path = expand_env_vars(&path);
    let w = max_width.unwrap_or(800);
    let h = max_height.unwrap_or(800);
    image_utils::compress_image_path(&expanded_path, w, h, 80)
}

#[command]
pub fn save_image(path: String, content: Vec<u8>) -> AppResult<()> {
    use std::io::Write;
    let expanded_path = expand_env_vars(&path);
    let mut file = fs::File::create(&expanded_path).map_err(|e| AppError::FileSystemError(e.to_string()))?;
    file.write_all(&content)
        .map_err(|e| AppError::FileSystemError(e.to_string()))?;
    Ok(())
}
#[command]
pub fn resolve_test_path(root: String, name: String) -> AppResult<Option<String>> {
    fn find_file_bounded(
        root: &std::path::Path,
        target_name: &str,
    ) -> Option<std::path::PathBuf> {
        const MAX_DEPTH: usize = 32;
        const MAX_ENTRIES: usize = 10_000;

        let target_lower = target_name.to_lowercase();
        let mut visited_entries = 0usize;
        let mut stack = vec![(root.to_path_buf(), 0usize)];

        while let Some((dir, depth)) = stack.pop() {
            if depth > MAX_DEPTH {
                continue;
            }

            let entries = match fs::read_dir(&dir) {
                Ok(entries) => entries,
                Err(_) => continue,
            };

            for entry in entries.flatten() {
                visited_entries += 1;
                if visited_entries > MAX_ENTRIES {
                    return None;
                }

                let path = entry.path();
                let metadata = match fs::symlink_metadata(&path) {
                    Ok(metadata) => metadata,
                    Err(_) => continue,
                };
                let file_type = metadata.file_type();

                // Do not follow symlinks to avoid cycles and unexpected traversal.
                if file_type.is_symlink() {
                    continue;
                }

                if file_type.is_dir() {
                    if depth < MAX_DEPTH {
                        stack.push((path, depth + 1));
                    }
                } else if let Some(file_name) = path.file_name().and_then(|s| s.to_str()) {
                    let file_name_lower = file_name.to_lowercase();
                    if file_name_lower == target_lower
                        || path
                            .file_stem()
                            .and_then(|s| s.to_str())
                            .map(|s| s.to_lowercase())
                            == Some(target_lower.clone())
                    {
                        return Some(path);
                    }
                }
            }
        }

        None
    }

    if root.trim().is_empty() {
        return Err(AppError::StringError(
            "resolve_test_path: root path must not be empty".to_string(),
        ));
    }

    let expanded_root = expand_env_vars(&root);
    let root_path = std::path::Path::new(&expanded_root);

    if !root_path.exists() || !root_path.is_dir() {
        return Err(AppError::StringError(format!(
            "resolve_test_path: root '{}' does not exist or is not a directory",
            expanded_root
        )));
    }

    if let Some(found) = find_file_bounded(root_path, &name) {
        Ok(Some(found.to_string_lossy().to_string()))
    } else {
        Ok(None)
    }
}

#[command]
pub fn fs_exists(path: String) -> bool {
    std::path::Path::new(&expand_env_vars(&path)).exists()
}

#[command]
pub fn fs_mkdir(path: String) -> AppResult<()> {
    std::fs::create_dir_all(&expand_env_vars(&path)).map_err(|e| AppError::FileSystemError(e.to_string()))
}

#[command]
pub fn fs_write_text_file(path: String, content: String) -> AppResult<()> {
    let expanded = expand_env_vars(&path);
    if let Some(parent) = std::path::Path::new(&expanded).parent() {
        if !parent.exists() {
            std::fs::create_dir_all(parent).map_err(|e| AppError::FileSystemError(e.to_string()))?;
        }
    }
    std::fs::write(&expanded, content).map_err(|e| AppError::FileSystemError(e.to_string()))
}

#[command]
pub fn fs_read_text_file(path: String) -> AppResult<String> {
    std::fs::read_to_string(&expand_env_vars(&path)).map_err(|e| AppError::FileSystemError(e.to_string()))
}

#[command]
pub fn fs_remove_file(path: String) -> AppResult<()> {
    std::fs::remove_file(&expand_env_vars(&path)).map_err(|e| AppError::FileSystemError(e.to_string()))
}

#[command]
pub fn fs_read_dir_names(path: String) -> AppResult<Vec<String>> {
    let read_dir = std::fs::read_dir(&expand_env_vars(&path)).map_err(|e| AppError::FileSystemError(e.to_string()))?;
    let mut names = Vec::new();
    for entry in read_dir {
        if let Ok(entry) = entry {
            if let Some(name) = entry.file_name().to_str() {
                names.push(name.to_string());
            }
        }
    }
    Ok(names)
}
