use std::fs;
use std::path::{Path, PathBuf};
use serde::{Serialize, Deserialize};
use tauri::command;
use regex::Regex;
use std::process::Command;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct TestLog {
    path: String,
    suite_name: String,
    status: String,
    device_udid: Option<String>,
    device_model: Option<String>,
    android_version: Option<String>,
    timestamp: String,
    duration: String,
    xml_path: String,
    log_html_path: String,
}

#[command]
pub fn get_test_tests_history(custom_path: Option<String>, refresh: Option<bool>) -> Result<Vec<TestLog>, String> {
    // Assumption: logs are in "../test_results" relative to the app execution
    // Or we can assume a fixed path. For now, let's look at the project root "test_results".
    
    let mut candidates = vec![
        PathBuf::from("../test_results"),
        PathBuf::from("test_results"),
    ];

    if let Some(path) = custom_path {
        if !path.is_empty() {
            // Prepend custom path to check it first
            candidates.insert(0, PathBuf::from(path));
        }
    }

    // Identify the primary log directory (first valid one) to store cache
    let primary_dir = candidates.iter().find(|p| p.exists() && p.is_dir());
    let cache_file = primary_dir.map(|p| p.join("history_cache.json"));
    
    let force_refresh = refresh.unwrap_or(false);

    // Cache State
    let mut cache_map: std::collections::HashMap<String, TestLog> = std::collections::HashMap::new();
    let mut cache_mtime = std::time::SystemTime::UNIX_EPOCH;

    // Always try to load cache first to build the map, even if force_refresh is true?
    // Actually if force_refresh is true, we might want to re-parse everything regardless of mtime.
    // But the user asked for "only new metadata", effectively "incremental update".
    // So "Refresh" button should probably behave as "Scan for changes".
    // True "Force Rebuild" might be a separate concern, but for now assuming "Refresh" = "Incremental Update".

    if let Some(ref cache_path) = cache_file {
        if cache_path.exists() {
            if let Ok(metadata) = fs::metadata(cache_path) {
                if let Ok(modified) = metadata.modified() {
                    cache_mtime = modified;
                }
            }

            println!("Loading logs from cache: {:?}", cache_path);
            if let Ok(content) = fs::read_to_string(cache_path) {
                if let Ok(cached_logs) = serde_json::from_str::<Vec<TestLog>>(&content) {
                    for log in cached_logs {
                        // Use xml_path as unique key
                        cache_map.insert(log.xml_path.clone(), log);
                    }
                } else {
                    println!("Failed to parse cache, falling back to full scan.");
                }
            }
        }
    }
    
    // If forcing complete re-parse (ignoring timestamps), we could clear cache_map here.
    // But "refresh" usually means "check for new stuff".
    if force_refresh {
         // Maybe user WANTS to re-parse modified files even if timestamp logic fails? 
         // For now, let's trust mtime. If force_refresh is true, we still use cache if file unmodified.
         // If we strictly want to invalid cache, we would reset cache_mtime to UNIX_EPOCH.
         // Let's assume standard incremental behavior.
    }

    let mut logs = Vec::new();
    let mut seen_paths = std::collections::HashSet::new(); // Avoid duplicates if configured path is same as default

    for base_path in candidates {
        // Resolve absolute path
        let abs_base = base_path.canonicalize().unwrap_or(base_path.clone());
        let abs_path_str = abs_base.to_string_lossy().to_string();

        if seen_paths.contains(&abs_path_str) {
            continue;
        }
        seen_paths.insert(abs_path_str);

        println!("Scanning logs in: {:?}", abs_base);
        
        if base_path.exists() && base_path.is_dir() {
            // Walkdir manual recursive
            let walker = walkdir::WalkDir::new(&base_path).min_depth(1).max_depth(5).follow_links(true);
            for entry in walker.into_iter().filter_map(|e| e.ok()) {
                let fname = entry.file_name().to_string_lossy();
                if fname.starts_with("output") && fname.ends_with(".xml") {
                    let xml_path = entry.path();
                    let xml_path_str = xml_path.to_string_lossy().to_string();
                    let parent = xml_path.parent().unwrap_or(Path::new(""));

                    // Check mtime
                    let mut use_cache = false;
                    if let Some(cached_log) = cache_map.get(&xml_path_str) {
                         if let Ok(meta) = fs::metadata(xml_path) {
                             if let Ok(modified) = meta.modified() {
                                 // If XML file is OLDER than cache file, assume it hasn't changed since cache was written.
                                 // Adding a small buffer or just strict comparison.
                                 // If modified <= cache_mtime: reuse
                                 if modified <= cache_mtime {
                                     use_cache = true;
                                     logs.push(cached_log.clone());
                                 }
                             }
                         }
                    }

                    if !use_cache {
                        // Parse
                        // println!("Parsing new/modified log: {:?}", xml_path);
                        if let Some(log) = parse_log_entry(&parent, &xml_path) {
                            logs.push(log);
                        }
                    }
                }
            }
        }
    }

    // Sort by timestamp desc
    logs.sort_by(|a, b| b.timestamp.cmp(&a.timestamp));

    // 2. Save new cache (Atomically if possible, but standard write is fine)
    if let Some(ref cache_path) = cache_file {
        if let Ok(json) = serde_json::to_string_pretty(&logs) {
            let _ = fs::write(cache_path, json);
            println!("Saved logs cache to: {:?}", cache_path);
        }
    }

    Ok(logs)
}

fn parse_log_entry(folder_path: &Path, xml_path: &Path) -> Option<TestLog> {
    let content = fs::read_to_string(xml_path).ok()?;
    let abs_folder_path = folder_path.canonicalize().unwrap_or(folder_path.to_path_buf());
    
    // Attempt to read metadata.json
    let metadata_path = folder_path.join("metadata.json");
    let mut device_udid = None;
    let mut meta_timestamp = None;
    let mut device_model = None;
    let mut android_version = None;

    if metadata_path.exists() {
        if let Ok(meta_content) = fs::read_to_string(&metadata_path) {
             let re_dev = Regex::new(r#""device_udid"\s*:\s*"([^"]+)""#).ok();
             if let Some(re) = re_dev {
               if let Some(caps) = re.captures(&meta_content) {
                   device_udid = caps.get(1).map(|m| m.as_str().to_string());
               }
             }
             let re_ts = Regex::new(r#""timestamp"\s*:\s*"([^"]+)""#).ok();
             if let Some(re) = re_ts {
               if let Some(caps) = re.captures(&meta_content) {
                   meta_timestamp = caps.get(1).map(|m| m.as_str().to_string());
               }
             }
             let re_model = Regex::new(r#""device_model"\s*:\s*"([^"]+)""#).ok();
             if let Some(re) = re_model {
               if let Some(caps) = re.captures(&meta_content) {
                   device_model = caps.get(1).map(|m| m.as_str().to_string());
               }
             }
             let re_ver = Regex::new(r#""android_version"\s*:\s*"([^"]+)""#).ok();
             if let Some(re) = re_ver {
               if let Some(caps) = re.captures(&meta_content) {
                   android_version = caps.get(1).map(|m| m.as_str().to_string());
               }
             }
        }
    }

    // Attempt to parse folder structure: .../A{ver}_{model}_{udid}/{Suite}
    // "folder_path" is usually the {Suite} or {RunID} folder.
    // Check parent folder name
    if let Some(parent) = folder_path.parent() {
        if let Some(name) = parent.file_name().and_then(|n| n.to_str()) {
            if name.starts_with('A') {
                // Try parse: A11_Pixel4_xyz
                let parts: Vec<&str> = name.split('_').collect();
                if parts.len() >= 3 {
                    if android_version.is_none() {
                        android_version = Some(parts[0][1..].to_string());
                    }
                    if device_model.is_none() {
                        device_model = Some(parts[1].to_string());
                    }
                    if device_udid.is_none() {
                        device_udid = Some(parts[2].to_string());
                    }
                }
            }
        }
    }

    // Regex to find suite name
    let re_suite = Regex::new(r#"<suite.*name="([^"]+)""#).ok()?;
    let suite_name = re_suite.captures(&content)
        .map(|c| c.get(1).map_or("Unknown", |m| m.as_str()))
        .unwrap_or("Unknown")
        .to_string();

    // Regex to find status
    let re_stat = Regex::new(r#"<stat pass="(\d+)" fail="(\d+)".*>All Tests</stat>"#).ok()?;
    let (pass, fail) = if let Some(caps) = re_stat.captures(&content) {
        (
            caps[1].parse::<i32>().unwrap_or(0),
            caps[2].parse::<i32>().unwrap_or(0)
        )
    } else {
        (0, 0)
    };
    
    let status = if fail > 0 { "FAIL" } else { "PASS" }.to_string();

    // Timestamp logic: Prefer metadata, fall back to XML
    let timestamp = if let Some(ts) = meta_timestamp {
        ts
    } else {
        let re_time = Regex::new(r#"generated="([^"]+)""#).ok()?;
        re_time.captures(&content)
            .map(|c| c.get(1).map_or("", |m| m.as_str()))
            .unwrap_or("")
            .to_string()
    };

    let log_html_path = abs_folder_path.join("log.html").to_string_lossy().to_string();

    Some(TestLog {
        path: abs_folder_path.to_string_lossy().to_string(), 
        xml_path: xml_path.to_string_lossy().to_string(),
        suite_name,
        status,
        device_udid,
        device_model,
        android_version,
        timestamp,
        duration: format!("{} P / {} F", pass, fail),
        log_html_path
    })
}

#[command]
pub fn open_log_folder(path: String) -> Result<(), String> {
    println!("Opening folder: {}", path);
    
    #[cfg(target_os = "windows")]
    {
        Command::new("explorer")
            .arg(path)
            .spawn()
            .map_err(|e| format!("Failed to open explorer: {}", e))?;
    }
    #[cfg(target_os = "macos")]
    {
        Command::new("open")
            .arg(path)
            .spawn()
            .map_err(|e| format!("Failed to open finder: {}", e))?;
    }
    #[cfg(target_os = "linux")]
    {
        Command::new("xdg-open")
            .arg(path)
            .spawn()
            .map_err(|e| format!("Failed to open xdg-open: {}", e))?;
    }
    Ok(())
}

#[command]
pub fn open_path(path: String) -> Result<(), String> {
    println!("Opening path: {}", path);
    
    #[cfg(target_os = "windows")]
    {
        let clean_path = path.replace("/", "\\");
        Command::new("explorer")
            .arg(clean_path)
            .spawn()
            .map_err(|e| format!("Failed to open explorer: {}", e))?;
    }
    #[cfg(target_os = "macos")]
    {
        Command::new("open")
            .arg(path)
            .spawn()
            .map_err(|e| format!("Failed to open finder: {}", e))?;
    }
    #[cfg(target_os = "linux")]
    {
        Command::new("xdg-open")
            .arg(path)
            .spawn()
            .map_err(|e| format!("Failed to open xdg-open: {}", e))?;
    }
    Ok(())
}
