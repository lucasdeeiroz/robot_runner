use chrono::TimeZone;
use once_cell::sync::Lazy;
use regex::Regex;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use tauri::command;

// Pre-compiled regexes (compiled once per app lifecycle)
static RE_FW: Lazy<Regex> = Lazy::new(|| Regex::new(r#""framework"\s*:\s*"([^"]+)""#).unwrap());
static RE_DEV: Lazy<Regex> = Lazy::new(|| Regex::new(r#""device_udid"\s*:\s*"([^"]+)""#).unwrap());
static RE_TS: Lazy<Regex> = Lazy::new(|| Regex::new(r#""timestamp"\s*:\s*"([^"]+)""#).unwrap());
static RE_MODEL: Lazy<Regex> =
    Lazy::new(|| Regex::new(r#""device_model"\s*:\s*"([^"]+)""#).unwrap());
static RE_VER: Lazy<Regex> =
    Lazy::new(|| Regex::new(r#""android_version"\s*:\s*"([^"]+)""#).unwrap());
static RE_SUITE: Lazy<Regex> = Lazy::new(|| Regex::new(r#"<suite.*name="([^"]+)""#).unwrap());
static RE_STAT: Lazy<Regex> =
    Lazy::new(|| Regex::new(r#"<stat pass="(\d+)" fail="(\d+)".*>All Tests</stat>"#).unwrap());
static RE_TIME: Lazy<Regex> =
    Lazy::new(|| Regex::new(r#"(?:generated|starttime|timestamp)=["']([^"']+)["']"#).unwrap());
static RE_ROBOT_GENERATED: Lazy<Regex> =
    Lazy::new(|| Regex::new(r#"<robot [^>]*generated=["']([^"']+)["']"#).unwrap());
static RE_ROBOT_SUITE_START: Lazy<Regex> =
    Lazy::new(|| Regex::new(r#"<suite [^>]*starttime=["']([^"']+)["']"#).unwrap());
static RE_ELAPSED: Lazy<Regex> =
    Lazy::new(|| Regex::new(r#"<status\s+[^>]*elapsed="([^"]+)""#).unwrap());
static RE_STATUS_TIME: Lazy<Regex> =
    Lazy::new(|| Regex::new(r#"<status\s+[^>]*starttime="([^"]+)"\s+endtime="([^"]+)""#).unwrap());
static RE_SUITE_XML: Lazy<Regex> =
    Lazy::new(|| Regex::new(r#"<testsuite\s+[^>]*name="([^"]+)""#).unwrap());
static RE_TIME_XML: Lazy<Regex> = Lazy::new(|| Regex::new(r#"time="([^"]+)""#).unwrap());
static RE_TS_XML: Lazy<Regex> = Lazy::new(|| Regex::new(r#"timestamp="([^"]+)""#).unwrap());
static RE_TEST_FAIL: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r#"<test\s+[^>]*name="([^"]+)"[^>]*>[\s\S]*?<status\s+[^>]*status="FAIL""#).unwrap()
});
static RE_FILENAME_TS: Lazy<Regex> = Lazy::new(|| Regex::new(r"(\d{8}-\d{6})").unwrap());

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct TestLog {
    run_id: Option<String>,
    logs_path: Option<String>,
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
    #[serde(default)]
    ai_summary: Option<String>,
    #[serde(default)]
    failed_tests: Vec<String>,
}

#[command]
pub async fn get_test_history(
    custom_path: Option<String>,
    refresh: Option<bool>,
) -> Result<Vec<TestLog>, String> {
    // Offload to blocking thread pool to prevent IPC thread starvation
    tokio::task::spawn_blocking(move || get_test_history_blocking(custom_path, refresh))
        .await
        .map_err(|e| format!("Task join error: {}", e))?
}

fn get_test_history_blocking(
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
                        // Use normalized path as key
                        cache_map.insert(normalize_path_str(&log.xml_path), log);
                    }
                }
            }
        }
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

    // Parallel processing with Rayon (uses lazy regexes — no redundant compilation)
    let processed_logs: Vec<TestLog> = xml_files
        .into_par_iter()
        .filter_map(|xml_path| {
            let xml_path_str = xml_path.to_string_lossy().to_string();
            let parent = xml_path.parent().unwrap_or(Path::new(""));

            let current_mtime = fs::metadata(&xml_path)
                .and_then(|m| m.modified())
                .map(|m| {
                    m.duration_since(std::time::UNIX_EPOCH)
                        .unwrap_or_default()
                        .as_secs()
                })
                .unwrap_or(0);

            // Check cache by XML path and EXACT mtime
            if !force_refresh {
                let normalized_path = normalize_path_str(&xml_path_str);
                if let Some(cached_log) = cache_map.get(&normalized_path) {
                    if cached_log.mtime == current_mtime {
                        return Some(cached_log.clone());
                    }
                }
            }

            parse_log_entry(parent, &xml_path, current_mtime)
        })
        .collect();

    let mut logs: Vec<TestLog> = processed_logs;

    // Check if cache needs updating
    let mut changed = false;
    if logs.len() != cache_map.len() {
        changed = true;
    } else {
        for log in &logs {
            if let Some(cached) = cache_map.get(&normalize_path_str(&log.xml_path)) {
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

    // Save cache in background thread (fire-and-forget — don't block return)
    if changed {
        if let Some(cache_path) = cache_file {
            let logs_clone = logs.clone();
            std::thread::spawn(move || {
                if let Ok(file) = fs::File::create(&cache_path) {
                    let writer = std::io::BufWriter::new(file);
                    let _ = serde_json::to_writer(writer, &logs_clone);
                }
            });
        }
    }

    Ok(logs)
}

fn parse_log_entry(folder_path: &Path, xml_path: &Path, mtime: u64) -> Option<TestLog> {
    let content = read_optimized_log(xml_path).ok()?;
    let abs_folder_path = folder_path
        .canonicalize()
        .unwrap_or(folder_path.to_path_buf());

    // Read metadata.json (uses pre-compiled regexes)
    let metadata_path = folder_path.join("metadata.json");
    let mut run_id = None;
    let mut logs_path = None;
    let mut device_udid = None;
    let mut meta_timestamp = None;
    let mut device_model = None;
    let mut android_version = None;
    let mut framework = "robot".to_string();

    if metadata_path.exists() {
        if let Ok(meta_content) = fs::read_to_string(&metadata_path) {
            // New regex for run_id and logs_path
            let re_run = Regex::new(r#""run_id"\s*:\s*"([^"]+)""#).unwrap();
            let re_lp = Regex::new(r#""logs_path"\s*:\s*"([^"]+)""#).unwrap();

            if let Some(caps) = re_run.captures(&meta_content) {
                run_id = caps.get(1).map(|m| m.as_str().to_string());
            }
            if let Some(caps) = re_lp.captures(&meta_content) {
                logs_path = caps.get(1).map(|m| m.as_str().to_string());
            }
            if let Some(caps) = RE_FW.captures(&meta_content) {
                framework = caps
                    .get(1)
                    .map(|m| m.as_str().to_string())
                    .unwrap_or("robot".to_string());
            }
            if let Some(caps) = RE_DEV.captures(&meta_content) {
                device_udid = caps.get(1).map(|m| m.as_str().to_string());
            }
            if let Some(caps) = RE_TS.captures(&meta_content) {
                meta_timestamp = caps.get(1).map(|m| m.as_str().to_string());
            }
            if let Some(caps) = RE_MODEL.captures(&meta_content) {
                device_model = caps.get(1).map(|m| m.as_str().to_string());
            }
            if let Some(caps) = RE_VER.captures(&meta_content) {
                android_version = caps.get(1).map(|m| m.as_str().to_string());
            }
        }
    }

    // Parse folder structure: .../A{ver}_{model}_{udid}/{Suite}
    if let Some(parent) = folder_path.parent() {
        if let Some(name) = parent.file_name().and_then(|n| n.to_str()) {
            if name.starts_with('A') {
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
        let suite_name = RE_SUITE
            .captures(&content)
            .map(|c| c.get(1).map_or("Unknown", |m| m.as_str()))
            .unwrap_or("Unknown")
            .to_string();

        let (pass, fail) = if let Some(caps) = RE_STAT.captures(&content) {
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

        let timestamp = if let Some(ts) = meta_timestamp {
            normalize_robot_timestamp(&ts)
        } else {
            let extracted = RE_ROBOT_GENERATED
                .captures(&content)
                .or_else(|| RE_ROBOT_SUITE_START.captures(&content))
                .or_else(|| RE_TIME.captures(&content))
                .map(|c| c.get(1).map_or("", |m| m.as_str()))
                .unwrap_or("");

            if !extracted.is_empty() {
                normalize_robot_timestamp(extracted)
            } else {
                // Try to extract date from filename if it follows output-YYYYMMDD-HHMMSS pattern
                let file_name = xml_path.file_name().and_then(|n| n.to_str()).unwrap_or("");
                if let Some(filename_ts) = extract_timestamp_from_filename(file_name) {
                    normalize_robot_timestamp(&filename_ts)
                } else {
                    // Fallback to file mtime if XML doesn't have the generated attribute
                    chrono::DateTime::<chrono::Local>::from(
                        std::time::UNIX_EPOCH + std::time::Duration::from_secs(mtime),
                    )
                    .to_rfc3339()
                }
            }
        };

        // Extract duration from root suite status
        let mut duration_str = "Unknown".to_string();

        // Try v5/v6 'elapsed' attribute
        let mut last_elapsed = None;
        for caps in RE_ELAPSED.captures_iter(&content) {
            last_elapsed = Some(caps[1].to_string());
        }

        if let Some(elapsed_secs) = last_elapsed {
            if let Ok(secs) = elapsed_secs.parse::<f64>() {
                duration_str = format_seconds(secs);
            }
        } else {
            // Fallback to v3/v4 'starttime'/'endtime'
            let mut last_s = None;
            let mut last_e = None;
            for caps in RE_STATUS_TIME.captures_iter(&content) {
                last_s = Some(caps[1].to_string());
                last_e = Some(caps[2].to_string());
            }
            if let (Some(s), Some(e)) = (last_s, last_e) {
                duration_str = format_duration(&s, &e);
            }
        }

        let log_html_path = abs_folder_path
            .join("log.html")
            .to_string_lossy()
            .to_string();

        let mut failed_tests = Vec::new();
        if fail > 0 {
            for caps in RE_TEST_FAIL.captures_iter(&content) {
                if let Some(name) = caps.get(1) {
                    failed_tests.push(name.as_str().to_string());
                }
            }
        }

        return Some(TestLog {
            run_id,
            logs_path,
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
            ai_summary: None,
            failed_tests,
        });
    }

    // Generic fallback for Maven/Maestro
    let mut suite_name = folder_path
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or("Unknown".to_string());

    if let Some(caps) = RE_SUITE_XML.captures(&content) {
        suite_name = caps
            .get(1)
            .map(|m| m.as_str().to_string())
            .unwrap_or(suite_name);
    }

    let mut xml_duration = None;
    if let Some(caps) = RE_TIME_XML.captures(&content) {
        xml_duration = caps.get(1).map(|m| format!("{}s", m.as_str()));
    }

    let mut xml_timestamp = None;
    if let Some(caps) = RE_TS_XML.captures(&content) {
        xml_timestamp = caps.get(1).map(|m| m.as_str().to_string());
    }

    let timestamp = xml_timestamp
        .map(|ts| {
            // Attempt to normalize if it looks like Robot format, otherwise keep as is
            if ts.len() >= 8
                && ts
                    .chars()
                    .all(|c| c.is_numeric() || c == ' ' || c == ':' || c == '.')
            {
                normalize_robot_timestamp(&ts)
            } else {
                ts
            }
        })
        .or(meta_timestamp)
        .unwrap_or_else(|| {
            chrono::DateTime::<chrono::Local>::from(
                std::time::UNIX_EPOCH + std::time::Duration::from_secs(mtime),
            )
            .to_rfc3339()
        });

    let is_fail = (content.contains("failures=\"") && !content.contains("failures=\"0\""))
        || (content.contains("errors=\"") && !content.contains("errors=\"0\""))
        || content.contains("status=\"FAILED\"");

    let status_str = if is_fail { "FAIL" } else { "PASS" };
    let pass_count = if !is_fail { 1 } else { 0 };
    let fail_count = if is_fail { 1 } else { 0 };

    Some(TestLog {
        run_id,
        logs_path,
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
        log_html_path: xml_path.to_string_lossy().to_string(),
        mtime,
        ai_summary: None,
        failed_tests: Vec::new(),
    })
}

#[command]
pub async fn save_test_summary(
    xml_path: String,
    summary: String,
    custom_path: Option<String>,
) -> Result<(), String> {
    tokio::task::spawn_blocking(move || {
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

        // Determine the cache file location based on where historical logs are actually stored
        let primary_dir = candidates.iter().find(|p| p.exists() && p.is_dir());
        let cache_path = match primary_dir.map(|p| p.join("history_cache.json")) {
            Some(p) => p,
            None => return Err("Could not find test results directory to save cache".to_string()),
        };

        if !cache_path.exists() {
            return Err(
                "History cache file does not exist. Please refresh history first.".to_string(),
            );
        }

        let file = fs::File::open(&cache_path).map_err(|e| e.to_string())?;
        let reader = std::io::BufReader::new(file);
        let mut logs: Vec<TestLog> = serde_json::from_reader(reader).map_err(|e| e.to_string())?;

        let mut found = false;

        // Normalize the targeted xml_path for comparison
        let normalized_target = normalize_path_str(&xml_path);

        for log in &mut logs {
            let normalized_log_path = normalize_path_str(&log.xml_path);
            if normalized_log_path == normalized_target {
                log.ai_summary = Some(summary.clone());
                found = true;
                break;
            }
        }

        if found {
            let file = fs::File::create(&cache_path).map_err(|e| e.to_string())?;
            let writer = std::io::BufWriter::new(file);
            serde_json::to_writer(writer, &logs).map_err(|e| e.to_string())?;
            Ok(())
        } else {
            Err("Could not find matching test record in history cache".to_string())
        }
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?
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

/// Converts Robot Framework's "YYYYMMDD HH:MM:SS.mmm" to ISO 8601
fn normalize_robot_timestamp(ts: &str) -> String {
    // Already in ISO 8601? (Rough check: 2024-04-25T...)
    if ts.contains('T') && ts.contains('-') && ts.len() >= 19 {
        return ts.to_string();
    }

    // Handle "YYYYMMDD-HHMMSS" (filename format) vs "YYYYMMDD HH:MM:SS.mmm" (XML format)
    let cleaned_ts = if ts.contains('-') && !ts.contains(':') && ts.len() >= 15 {
        // Convert 20260425-140852 to 20260425 14:08:52.000
        format!(
            "{} {}:{}:{}.000",
            &ts[0..8],
            &ts[9..11],
            &ts[11..13],
            &ts[13..15]
        )
    } else {
        ts.to_string()
    };

    let fmt = "%Y%m%d %H:%M:%S%.3f";
    match chrono::NaiveDateTime::parse_from_str(&cleaned_ts, fmt) {
        Ok(dt) => {
            // Assume local time as Robot logs usually are
            let local_dt = chrono::Local.from_local_datetime(&dt).earliest();
            match local_dt {
                Some(ldt) => ldt.to_rfc3339(),
                None => {
                    // Fallback to simple string manipulation if timezone conversion fails
                    if cleaned_ts.len() >= 15
                        && cleaned_ts
                            .chars()
                            .all(|c| c.is_numeric() || c == ' ' || c == ':' || c == '.')
                    {
                        format!(
                            "{}-{}-{}T{}:{}:{}",
                            &cleaned_ts[0..4],
                            &cleaned_ts[4..6],
                            &cleaned_ts[6..8],
                            &cleaned_ts[9..11],
                            &cleaned_ts[11..13],
                            &cleaned_ts[13..15]
                        )
                    } else {
                        cleaned_ts.to_string()
                    }
                }
            }
        }
        Err(_) => {
            // Final attempt: maybe it's just "YYYY-MM-DD HH:MM:SS"
            let fmt2 = "%Y-%m-%d %H:%M:%S";
            if let Ok(dt) = chrono::NaiveDateTime::parse_from_str(&cleaned_ts, fmt2) {
                if let Some(ldt) = chrono::Local.from_local_datetime(&dt).earliest() {
                    return ldt.to_rfc3339();
                }
            }
            cleaned_ts.to_string()
        }
    }
}

/// Attempts to extract YYYYMMDD-HHMMSS from filenames like output-20260425-140852.xml
fn extract_timestamp_from_filename(filename: &str) -> Option<String> {
    // Look for YYYYMMDD-HHMMSS pattern (15 chars)
    RE_FILENAME_TS
        .captures(filename)
        .and_then(|caps| caps.get(1))
        .map(|m| m.as_str().to_string())
}

fn normalize_path_str(path: &str) -> String {
    path.replace("\\", "/").to_lowercase()
}

fn format_duration(start: &str, end: &str) -> String {
    let fmt = "%Y%m%d %H:%M:%S%.3f";
    let start_dt = chrono::NaiveDateTime::parse_from_str(start, fmt);
    let end_dt = chrono::NaiveDateTime::parse_from_str(end, fmt);

    if let (Ok(s), Ok(e)) = (start_dt, end_dt) {
        let duration = e.signed_duration_since(s);
        let ms = duration.num_milliseconds();
        if ms < 0 {
            return "0s".to_string();
        }

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
    use std::fs::File;
    use std::io::{Read, Seek, SeekFrom};

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
