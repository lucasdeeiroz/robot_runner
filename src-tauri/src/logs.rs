use regex::Regex;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use tauri::command;

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
    pass_count: i32,
    fail_count: i32,
    xml_path: String,
    log_html_path: String,
    mtime: u64, // Unix timestamp of output.xml
}

#[command]
pub fn get_test_history(
    custom_path: Option<String>,
    refresh: Option<bool>,
) -> Result<Vec<TestLog>, String> {
    let mut candidates = Vec::new();

    if let Some(path) = custom_path {
        if !path.is_empty() {
             candidates.push(PathBuf::from(path));
        }
    }


    if candidates.is_empty() {
        candidates.push(PathBuf::from("../test_results"));
        candidates.push(PathBuf::from("test_results"));
    }

    // Identify the primary log directory (first valid one) to store cache
    let primary_dir = candidates.iter().find(|p| p.exists() && p.is_dir());
    let cache_file = primary_dir.map(|p| p.join("history_cache.json"));

    let force_refresh = refresh.unwrap_or(false);

    // Cache State
    let mut cache_map: std::collections::HashMap<String, TestLog> =
        std::collections::HashMap::new();

    if let Some(ref cache_path) = cache_file {
        if cache_path.exists() {
            if let Ok(file) = fs::File::open(cache_path) {
                let reader = std::io::BufReader::new(file);
                if let Ok(cached_logs) = serde_json::from_reader::<_, Vec<TestLog>>(reader) {
                    for log in cached_logs {
                        // Use xml_path as unique key
                        cache_map.insert(log.xml_path.clone(), log);
                    }
                }
            }
        }
    }

    if force_refresh {
    }

    let mut seen_paths = std::collections::HashSet::new();

    let mut xml_files = Vec::new();

    for base_path in candidates {
        let abs_base = base_path.canonicalize().unwrap_or(base_path.clone());
        let abs_path_str = abs_base.to_string_lossy().to_string();

        if seen_paths.contains(&abs_path_str) {
            continue;
        }
        seen_paths.insert(abs_path_str);

        if base_path.exists() && base_path.is_dir() {
            let walker = walkdir::WalkDir::new(&base_path)
                .min_depth(1)
                .max_depth(5)
                .follow_links(true);
            
            for entry in walker.into_iter().filter_map(|e| e.ok()) {
                let fname = entry.file_name().to_string_lossy();
                if fname.starts_with("output") && fname.ends_with(".xml") {
                    xml_files.push(entry.path().to_path_buf());
                }
            }
        }
    }

    use rayon::prelude::*;

    // Parallel processing with Rayon
    let processed_logs: Vec<TestLog> = xml_files
        .into_par_iter()
        .filter_map(|xml_path| {
            let xml_path_str = xml_path.to_string_lossy().to_string();
            let parent = xml_path.parent().unwrap_or(Path::new(""));

            // Get current mtime
            let current_mtime = fs::metadata(&xml_path)
                .and_then(|m| m.modified())
                .map(|m| m.duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_secs())
                .unwrap_or(0);

            // Check cache by XML path and EXACT mtime
            if !force_refresh {
                if let Some(cached_log) = cache_map.get(&xml_path_str) {
                    if cached_log.mtime == current_mtime {
                        return Some(cached_log.clone());
                    }
                }
            }

            // Parse if not in cache or changed
            parse_log_entry(parent, &xml_path, current_mtime)
        })
        .collect();

    let mut logs: Vec<TestLog> = processed_logs;

    // Check if anything changed compared to cache to avoid redundant writes
    let mut changed = false;
    if logs.len() != cache_map.len() {
        changed = true;
    } else {
        for log in &logs {
            if let Some(cached) = cache_map.get(&log.xml_path) {
                if cached.mtime != log.mtime {
                    changed = true;
                    break;
                }
            } else {
                changed = true;
                break;
            }
        }
    }

    // Sort by timestamp desc
    logs.sort_by(|a, b| b.timestamp.cmp(&a.timestamp));

    // Save cache only if changed
    if changed {
        if let Some(ref cache_path) = cache_file {
            if let Ok(file) = fs::File::create(cache_path) {
                let writer = std::io::BufWriter::new(file);
                let _ = serde_json::to_writer(writer, &logs);
            }
        }
    }

    Ok(logs)
}

fn parse_log_entry(folder_path: &Path, xml_path: &Path, mtime: u64) -> Option<TestLog> {
    let content = read_optimized_log(xml_path).ok()?;
    let abs_folder_path = folder_path
        .canonicalize()
        .unwrap_or(folder_path.to_path_buf());

    // Attempt to read metadata.json
    let metadata_path = folder_path.join("metadata.json");
    let mut device_udid = None;
    let mut meta_timestamp = None;
    let mut device_model = None;
    let mut android_version = None;
    let mut framework = "robot".to_string();

    if metadata_path.exists() {
        if let Ok(meta_content) = fs::read_to_string(&metadata_path) {
            let re_fw = Regex::new(r#""framework"\s*:\s*"([^"]+)""#).ok();
            if let Some(re) = re_fw {
                if let Some(caps) = re.captures(&meta_content) {
                    framework = caps.get(1).map(|m| m.as_str().to_string()).unwrap_or("robot".to_string());
                }
            }
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

    if framework == "robot" {
        // Regex to find suite name
        let re_suite = Regex::new(r#"<suite.*name="([^"]+)""#).ok()?;
        let suite_name = re_suite
            .captures(&content)
            .map(|c| c.get(1).map_or("Unknown", |m| m.as_str()))
            .unwrap_or("Unknown")
            .to_string();

        // Regex to find status
        let re_stat = Regex::new(r#"<stat pass="(\d+)" fail="(\d+)".*>All Tests</stat>"#).ok()?;
        let (pass, fail) = if let Some(caps) = re_stat.captures(&content) {
            (
                caps[1].parse::<i32>().unwrap_or(0),
                caps[2].parse::<i32>().unwrap_or(0),
            )
        } else {
            (0, 0)
        };

        if pass == 0 && fail == 0 {
            return None;
        }

        let status = if fail > 0 { "FAIL" } else { "PASS" }.to_string();

        // Timestamp logic: Prefer metadata, fall back to XML
        let timestamp = if let Some(ts) = meta_timestamp {
            ts
        } else {
            let re_time = Regex::new(r#"generated="([^"]+)""#).ok()?;
            re_time
                .captures(&content)
                .map(|c| c.get(1).map_or("", |m| m.as_str()))
                .unwrap_or("")
                .to_string()
        };

        // Extract duration from root suite status (usually in the tail)
        let mut duration_str = "Unknown".to_string();
        
        // Try v5/v6 'elapsed' attribute first
        let re_elapsed = Regex::new(r#"<status\s+[^>]*elapsed="([^"]+)""#).ok();
        let mut last_elapsed = None;
        if let Some(re) = re_elapsed {
            for caps in re.captures_iter(&content) {
                last_elapsed = Some(caps[1].to_string());
            }
        }

        if let Some(elapsed_secs) = last_elapsed {
            if let Ok(secs) = elapsed_secs.parse::<f64>() {
                duration_str = format_seconds(secs);
            }
        } else {
            // Fallback to v3/v4 'starttime'/'endtime'
            let re_status = Regex::new(r#"<status\s+[^>]*starttime="([^"]+)"\s+endtime="([^"]+)""#).ok();
            if let Some(re) = re_status {
                let mut last_s = None;
                let mut last_e = None;
                for caps in re.captures_iter(&content) {
                    last_s = Some(caps[1].to_string());
                    last_e = Some(caps[2].to_string());
                }
                if let (Some(s), Some(e)) = (last_s, last_e) {
                    duration_str = format_duration(&s, &e);
                }
            }
        }

        let log_html_path = abs_folder_path
            .join("log.html")
            .to_string_lossy()
            .to_string();

        return Some(TestLog {
            path: abs_folder_path.to_string_lossy().to_string(),
            xml_path: xml_path.to_string_lossy().to_string(),
            suite_name,
            status,
            device_udid,
            device_model,
            android_version,
            timestamp,
            duration: duration_str,
            pass_count: pass,
            fail_count: fail,
            log_html_path,
            mtime,
        });
    }

    // Generic fallback for Maven/Maestro
    let mut suite_name = folder_path.file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or("Unknown".to_string());
    
    // Attempt to parse suite name from XML
    let re_suite_xml = Regex::new(r#"<testsuite\s+[^>]*name="([^"]+)""#).ok();
    if let Some(re) = re_suite_xml {
        if let Some(caps) = re.captures(&content) {
            suite_name = caps.get(1).map(|m| m.as_str().to_string()).unwrap_or(suite_name);
        }
    }

    // Attempt to parse duration
    let mut xml_duration = None;
    let re_time_xml = Regex::new(r#"time="([^"]+)""#).ok();
    if let Some(re) = re_time_xml {
        if let Some(caps) = re.captures(&content) {
            xml_duration = caps.get(1).map(|m| format!("{}s", m.as_str()));
        }
    }

    // Attempt to parse timestamp from XML (JUnit format)
    let mut xml_timestamp = None;
    let re_ts_xml = Regex::new(r#"timestamp="([^"]+)""#).ok();
    if let Some(re) = re_ts_xml {
        if let Some(caps) = re.captures(&content) {
            xml_timestamp = caps.get(1).map(|m| m.as_str().to_string());
        }
    }

    let timestamp = xml_timestamp.or(meta_timestamp).unwrap_or_else(|| {
        fs::metadata(xml_path).ok()
            .and_then(|m| m.modified().ok())
            .map(|m| chrono::DateTime::<chrono::Local>::from(m).to_rfc3339())
            .unwrap_or_default()
    });

    // Status check
    let is_fail = (content.contains("failures=\"") && !content.contains("failures=\"0\"")) ||
                 (content.contains("errors=\"") && !content.contains("errors=\"0\"")) ||
                 content.contains("status=\"FAILED\"");

    let status_str = if is_fail { "FAIL" } else { "PASS" };
    let pass_count = if !is_fail { 1 } else { 0 };
    let fail_count = if is_fail { 1 } else { 0 };

    Some(TestLog {
        path: abs_folder_path.to_string_lossy().to_string(),
        xml_path: xml_path.to_string_lossy().to_string(),
        suite_name: format!("[{}] {}", framework.to_uppercase(), suite_name),
        status: status_str.to_string(),
        device_udid,
        device_model,
        android_version,
        timestamp,
        duration: xml_duration.unwrap_or_else(|| "Framework Managed".to_string()),
        pass_count,
        fail_count,
        log_html_path: xml_path.to_string_lossy().to_string(), // Maestro report is the XML
        mtime,
    })
}

fn format_seconds(seconds: f64) -> String {
    let seconds = seconds.round() as u64;
    let minutes = seconds / 60;
    let hours = minutes / 60;
    
    if hours > 0 {
        format!("{}h {}m {}s", hours, minutes % 60, seconds % 60)
    } else if minutes > 0 {
        format!("{}m {}s", minutes, seconds % 60)
    } else {
        format!("{}s", seconds)
    }
}

fn format_duration(start: &str, end: &str) -> String {
    let fmt = "%Y%m%d %H:%M:%S%.3f";
    let start_dt = chrono::NaiveDateTime::parse_from_str(start, fmt);
    let end_dt = chrono::NaiveDateTime::parse_from_str(end, fmt);
    
    if let (Ok(s), Ok(e)) = (start_dt, end_dt) {
        let duration = e.signed_duration_since(s);
        let ms = duration.num_milliseconds();
        if ms < 0 { return "0s".to_string(); }
        
        let seconds = ms / 1000;
        let minutes = seconds / 60;
        let hours = minutes / 60;
        
        if hours > 0 {
            format!("{}h {}m {}s", hours, minutes % 60, seconds % 60)
        } else if minutes > 0 {
            format!("{}m {}s", minutes, seconds % 60)
        } else {
            format!("{}s", seconds)
        }
    } else {
        "0s".to_string()
    }
}

fn read_optimized_log(path: &Path) -> std::io::Result<String> {
    use std::io::{Read, Seek, SeekFrom};
    use std::fs::File;

    let mut file = File::open(path)?;
    let len = file.metadata()?.len();

    if len < 20000 {
        return fs::read_to_string(path);
    }

    // Read head
    let mut head_buf = vec![0; 10000];
    let _ = file.read(&mut head_buf);

    // Read tail
    let _ = file.seek(SeekFrom::End(-10000));
    let mut tail_buf = vec![0; 10000];
    let _ = file.read(&mut tail_buf);

    let head = String::from_utf8_lossy(&head_buf);
    let tail = String::from_utf8_lossy(&tail_buf);

    Ok(format!("{}\n...skipped...\n{}", head, tail))
}


#[command]
pub fn open_log_folder(path: String) -> Result<(), String> {
    open_path(path)
}

#[command]
pub fn open_path(path: String) -> Result<(), String> {
    // println!("Opening path: {}", path);

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
