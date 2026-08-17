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

#[command]
pub fn get_portable_settings() -> AppResult<Option<String>> {
    let cwd_path = std::path::Path::new("settings.json");
    if cwd_path.exists() {
        if let Ok(content) = fs::read_to_string(cwd_path) {
            return Ok(Some(content));
        }
    }

    if let Ok(exe_path) = std::env::current_exe() {
        if let Some(exe_dir) = exe_path.parent() {
            let exe_settings_path = exe_dir.join("settings.json");
            if exe_settings_path.exists() {
                if let Ok(content) = fs::read_to_string(exe_settings_path) {
                    return Ok(Some(content));
                }
            }
        }
    }

    Ok(None)
}

#[command]
pub fn save_portable_settings(content: String) -> AppResult<bool> {
    let cwd_path = std::path::Path::new("settings.json");
    if cwd_path.exists() {
        fs::write(cwd_path, &content).map_err(|e| AppError::FileSystemError(e.to_string()))?;
        return Ok(true);
    }

    if let Ok(exe_path) = std::env::current_exe() {
        if let Some(exe_dir) = exe_path.parent() {
            let exe_settings_path = exe_dir.join("settings.json");
            if exe_settings_path.exists() {
                fs::write(exe_settings_path, &content).map_err(|e| AppError::FileSystemError(e.to_string()))?;
                return Ok(true);
            }
        }
    }

    Ok(false)
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct ReportFileInfo {
    pub name: String,
    pub path: String,
    pub size_bytes: u64,
    pub modified_timestamp: u64,
    pub title: Option<String>,
    pub result: Option<String>,
    pub analyst: Option<String>,
    pub comments: Option<String>,
}

fn resolve_reports_dir() -> std::path::PathBuf {
    // 1. Check if exe directory has a reports folder or is portable/installed root
    if let Ok(exe_path) = std::env::current_exe() {
        if let Some(exe_dir) = exe_path.parent() {
            let reports_dir = exe_dir.join("reports");
            if reports_dir.exists() || exe_dir.join("settings.json").exists() {
                let _ = fs::create_dir_all(&reports_dir);
                return reports_dir;
            }
        }
    }

    // 2. Check current working directory
    let cwd_reports = std::path::Path::new("reports");
    if cwd_reports.exists() {
        let _ = fs::create_dir_all(cwd_reports);
        if let Ok(abs) = cwd_reports.canonicalize() {
            return abs;
        }
        return cwd_reports.to_path_buf();
    }

    // 3. Fallback to exe directory / reports or current_dir / reports
    if let Ok(exe_path) = std::env::current_exe() {
        if let Some(exe_dir) = exe_path.parent() {
            let reports_dir = exe_dir.join("reports");
            let _ = fs::create_dir_all(&reports_dir);
            return reports_dir;
        }
    }

    let default_dir = std::path::PathBuf::from("reports");
    let _ = fs::create_dir_all(&default_dir);
    default_dir
}

#[command]
pub fn get_reports_dir() -> AppResult<String> {
    let dir = resolve_reports_dir();
    Ok(dir.to_string_lossy().to_string())
}

#[command]
pub fn save_app_report(filename: String, content: String) -> AppResult<String> {
    let reports_dir = resolve_reports_dir();
    fs::create_dir_all(&reports_dir).map_err(|e| AppError::FileSystemError(e.to_string()))?;

    // Sanitize filename to avoid invalid path characters
    let safe_name = filename.replace(|c: char| !c.is_alphanumeric() && c != '_' && c != '-' && c != '.', "_");
    let file_path = reports_dir.join(&safe_name);

    fs::write(&file_path, &content).map_err(|e| AppError::FileSystemError(e.to_string()))?;
    Ok(file_path.to_string_lossy().to_string())
}

#[command]
pub fn list_app_reports() -> AppResult<Vec<ReportFileInfo>> {
    let reports_dir = resolve_reports_dir();
    if !reports_dir.exists() {
        return Ok(Vec::new());
    }

    let read_dir = fs::read_dir(&reports_dir).map_err(|e| AppError::FileSystemError(e.to_string()))?;
    let mut reports = Vec::new();

    for entry in read_dir.flatten() {
        let path = entry.path();
        if path.is_file() && path.extension().and_then(|e| e.to_str()) == Some("html") {
            let metadata = fs::metadata(&path).map_err(|e| AppError::FileSystemError(e.to_string()))?;
            let size_bytes = metadata.len();
            let modified_timestamp = metadata
                .modified()
                .ok()
                .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                .map(|d| d.as_millis() as u64)
                .unwrap_or(0);

            let name = entry.file_name().to_string_lossy().to_string();

            // Peek metadata from html if present
            let mut title = None;
            let mut result = None;
            let mut analyst = None;
            let mut comments = None;

            if let Ok(content_snippet) = fs::read_to_string(&path) {
                if let Some(start) = content_snippet.find("<title>") {
                    if let Some(end) = content_snippet[start + 7..].find("</title>") {
                        title = Some(content_snippet[start + 7..start + 7 + end].trim().to_string());
                    }
                }

                // Extract meta tags: report-result, report-analyst, report-comments
                let find_meta = |meta_name: &str| -> Option<String> {
                    let pattern = format!("name=\"{}\" content=\"", meta_name);
                    if let Some(start) = content_snippet.find(&pattern) {
                        let val_start = start + pattern.len();
                        if let Some(end) = content_snippet[val_start..].find('"') {
                            return Some(content_snippet[val_start..val_start + end].to_string());
                        }
                    }
                    None
                };

                result = find_meta("report-result");
                analyst = find_meta("report-analyst");
                comments = find_meta("report-comments");
            }

            reports.push(ReportFileInfo {
                name,
                path: path.to_string_lossy().to_string(),
                size_bytes,
                modified_timestamp,
                title,
                result,
                analyst,
                comments,
            });
        }
    }

    // Sort newest first
    reports.sort_by(|a, b| b.modified_timestamp.cmp(&a.modified_timestamp));
    Ok(reports)
}

#[command]
pub fn delete_app_report(path: String) -> AppResult<()> {
    let path_buf = std::path::PathBuf::from(&path);
    if path_buf.exists() && path_buf.is_file() {
        fs::remove_file(path_buf).map_err(|e| AppError::FileSystemError(e.to_string()))?;
    }
    Ok(())
}
