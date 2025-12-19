use std::fs;
use std::path::{Path, PathBuf};
use serde::{Serialize, Deserialize};
use tauri::command;
use regex::Regex;
use std::process::Command;
// use std::time::SystemTime;

#[derive(Debug, Serialize, Deserialize)]
pub struct TestLog {
    path: String,
    suite_name: String,
    status: String,
    timestamp: String,
    duration: String,
    xml_path: String,
    log_html_path: String,
}

#[command]
pub fn get_test_tests_history() -> Result<Vec<TestLog>, String> {
    // Assumption: logs are in "../test_results" relative to the app execution
    // Or we can assume a fixed path. For now, let's look at the project root "test_results".
    // Since we are in src-tauri, we probably want to look up.
    
    // In dev:  ../../test_results
    // In prod: ./test_results (near exe)
    
    // Let's search a few common places
    let candidates = vec![
        PathBuf::from("../test_results"),
        PathBuf::from("test_results"),
    ];

    let mut logs = Vec::new();

    for base_path in candidates {
        println!("Scanning logs in: {:?}", base_path.canonicalize().unwrap_or(base_path.clone()));
        
        if base_path.exists() && base_path.is_dir() {
            // 1. Check if the directory itself contains output.xml (Single run mode)
            let root_output = base_path.join("output.xml");
            if root_output.exists() {
                println!("Found root output.xml at {:?}", root_output);
                if let Some(log) = parse_log_entry(&base_path, &root_output) {
                    logs.push(log);
                }
            }

            // 2. Check subdirectories (History mode)
            if let Ok(entries) = fs::read_dir(&base_path) {
                for entry in entries.flatten() {
                    let path = entry.path();
                    if path.is_dir() {
                        let output_xml = path.join("output.xml");
                        if output_xml.exists() {
                            if let Some(log) = parse_log_entry(&path, &output_xml) {
                                logs.push(log);
                            }
                        }
                    }
                }
            }
        }
    }

    // Sort by timestamp desc (if we can parse it, otherwise by path name which usually has timestamp)
    logs.sort_by(|a, b| b.timestamp.cmp(&a.timestamp));

    Ok(logs)
}

fn parse_log_entry(folder_path: &Path, xml_path: &Path) -> Option<TestLog> {
    let content = fs::read_to_string(xml_path).ok()?;
    let abs_folder_path = folder_path.canonicalize().unwrap_or(folder_path.to_path_buf());
    
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

    // Timestamp
    let re_time = Regex::new(r#"generated="([^"]+)""#).ok()?;
    let timestamp = re_time.captures(&content)
        .map(|c| c.get(1).map_or("", |m| m.as_str()))
        .unwrap_or("")
        .to_string();

    let log_html_path = abs_folder_path.join("log.html").to_string_lossy().to_string();

    Some(TestLog {
        path: abs_folder_path.to_string_lossy().to_string(), // Send absolute path
        xml_path: xml_path.to_string_lossy().to_string(),
        suite_name,
        status,
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
