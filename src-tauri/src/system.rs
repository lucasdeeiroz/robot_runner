use crate::cmd_utils::{new_tokio_command, get_adb_program};
use crate::errors::{AppError, AppResult};
use nosleep::{NoSleep, NoSleepType};
use regex::Regex;
use std::sync::Mutex;
use tauri::{command, State, AppHandle};
use walkdir::WalkDir;

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

#[command]
pub async fn get_folder_size(path: String) -> AppResult<u64> {
    let expanded = crate::cmd_utils::expand_env_vars(&path);
    tokio::task::spawn_blocking(move || {
        let mut total_size = 0;
        for entry in WalkDir::new(expanded).into_iter().filter_map(|e| e.ok()) {
            if entry.file_type().is_file() {
                total_size += entry.metadata().map(|m| m.len()).unwrap_or(0);
            }
        }
        total_size
    })
    .await
    .map_err(|e| AppError::StringError(e.to_string()))
}

const NOT_FOUND: &str = "Not Found";

/// Resolves the installed version of a single host tool.
/// The frontend calls this once per tool in parallel so each feature can be enabled
/// as soon as its own dependency is identified, instead of waiting for the slowest tool.
#[command]
pub async fn get_tool_version(app: AppHandle, tool: String) -> AppResult<String> {
    let version = match tool.as_str() {
        "adb" => {
            let raw = get_version(&get_adb_program(&app), &["--version"]).await;
            format_adb_version(&raw)
        }
        "scrcpy" => extract_or_not_found(&get_version("scrcpy", &["--version"]).await, r"scrcpy ([\d\.]+)"),
        "node" => {
            let v = get_version("node", &["--version"]).await.trim().replace('v', "");
            non_empty_or_not_found(v)
        }
        "java" => extract_or_not_found(&get_version("java", &["-version"]).await, r#"(?:version|openjdk version) "([\d\._]+)""#),
        "python" => extract_or_not_found(&get_version("python", &["--version"]).await, r"Python ([\d\.]+)"),
        "robot" => extract_or_not_found(&get_version("python", &["-m", "robot", "--version"]).await, r"Robot Framework ([\d\.]+)"),
        "appium_lib" => get_pip_version("robotframework-appiumlibrary").await,
        "maven" => extract_or_not_found(&get_version("mvn", &["--version"]).await, r"Apache Maven ([\d\.]+)"),
        "maestro" => non_empty_or_not_found(get_version("maestro", &["--version"]).await.trim().to_string()),
        "appium" => non_empty_or_not_found(get_version("appium", &["--version"]).await.trim().to_string()),
        // Returns "Not Found" on its own when the appium CLI is missing (empty output).
        "uiautomator2" => get_appium_driver_version("uiautomator2").await,
        "ngrok" => extract_or_not_found(&get_version("ngrok", &["--version"]).await, r"ngrok version ([\d\.]+)"),
        "claude_code" => non_empty_or_not_found(get_version("claude", &["--version"]).await.trim().to_string()),
        "antigravity" => non_empty_or_not_found(get_version("agy", &["--version"]).await.trim().to_string()),
        other => return Err(AppError::StringError(format!("Unknown tool: {}", other))),
    };
    Ok(version)
}

fn format_adb_version(adb_raw: &str) -> String {
    let adb_bridge = extract_version(adb_raw, r"Android Debug Bridge version ([\d\.]+)");
    let adb_sdk = extract_version(adb_raw, r"Version ([\w\.\-]+)");

    match (adb_bridge, adb_sdk) {
        (Some(bridge), Some(sdk)) => format!("{} ({})", bridge, sdk),
        (Some(bridge), None) => bridge,
        (None, _) => {
            if adb_raw.contains("Command not allowed") || adb_raw.to_lowercase().contains("error") || !adb_raw.trim().is_empty() {
                "Custom Binary".to_string()
            } else {
                NOT_FOUND.to_string()
            }
        }
    }
}

fn extract_or_not_found(raw: &str, pattern: &str) -> String {
    extract_version(raw, pattern).unwrap_or_else(|| NOT_FOUND.to_string())
}

fn non_empty_or_not_found(value: String) -> String {
    if value.is_empty() { NOT_FOUND.to_string() } else { value }
}

async fn get_version(cmd_name: &str, args: &[&str]) -> String {
    let mut cmd = new_tokio_command(cmd_name);
    cmd.args(args);
    match cmd.output().await {
        Ok(o) => {
            let stdout = String::from_utf8_lossy(&o.stdout).to_string();
            let stderr = String::from_utf8_lossy(&o.stderr).to_string();
            if stdout.is_empty() { stderr } else { stdout }
        }
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
            #[cfg(target_os = "windows")]
            {
                let mut cmd_fallback = tokio::process::Command::new("cmd");
                cmd_fallback.arg("/C");
                cmd_fallback.arg(cmd_name);
                cmd_fallback.args(args);
                cmd_fallback.as_std_mut().creation_flags(0x08000000); // CREATE_NO_WINDOW
                if let Ok(o) = cmd_fallback.output().await {
                    let stdout = String::from_utf8_lossy(&o.stdout).to_string();
                    let stderr = String::from_utf8_lossy(&o.stderr).to_string();
                    if stdout.is_empty() { stderr } else { stdout }
                } else {
                    String::new()
                }
            }
            #[cfg(not(target_os = "windows"))]
            {
                String::new()
            }
        }
        Err(_) => String::new(),
    }
}

fn extract_version(text: &str, pattern: &str) -> Option<String> {
    let re = Regex::new(pattern).ok()?;
    re.captures(text).map(|cap| cap[1].to_string())
}

async fn get_pip_version(package: &str) -> String {
    let mut cmd = new_tokio_command("python");
    cmd.args(&["-m", "pip", "show", package]);
    let output = cmd.output().await;
    if let Ok(o) = output {
        let s = String::from_utf8_lossy(&o.stdout);
        for line in s.lines() {
            if line.starts_with("Version:") {
                return line.replace("Version:", "").trim().to_string();
            }
        }
    }
    "Not Found".to_string()
}

async fn get_appium_driver_version(driver: &str) -> String {
    let raw = get_version("appium", &["driver", "list", "--installed"]).await;
    if raw.is_empty() {
        return "Not Found".to_string();
    }

    // Regex to strip ANSI escape codes and their malformed remnants (e.g., [39m or 33m)
    let ansi_re = Regex::new(r"[\u{001b}\x1b]\[[0-9;]*[a-zA-Z]").unwrap();
    let remnant_re = Regex::new(r"\[?[0-9;]+[a-zA-Z]").unwrap();

    for line in raw.lines() {
        let cleaned_ansi = ansi_re.replace_all(line, "");
        let cleaned = remnant_re.replace_all(&cleaned_ansi, "");
        let trimmed = cleaned.trim();
        if trimmed.starts_with(driver) || trimmed.contains(driver) {
            // Check if there is an `@` symbol followed by the version (e.g. uiautomator2@7.5.2)
            if let Some(idx) = trimmed.find(&format!("{}@", driver)) {
                let after_at = &trimmed[idx + driver.len() + 1..];
                // Split by space or brackets to isolate the version string
                let version = after_at.split(|c: char| c.is_ascii_whitespace() || c == '[' || c == ']')
                                      .next()
                                      .unwrap_or("")
                                      .trim();
                if !version.is_empty() {
                    return version.to_string();
                }
            }

            // Fallback: Look for version in brackets containing digits (e.g. uiautomator2 [2.29.4])
            // Do NOT match [installed (npm)]
            let re = Regex::new(r"\[([\d\.]+)\]").ok();
            if let Some(r) = re {
                if let Some(cap) = r.captures(trimmed) {
                    return cap[1].trim().to_string();
                }
            }

            // Fallback for general @ version
            if trimmed.contains("@") {
                return trimmed.split("@").last().unwrap_or("Installed").trim().to_string();
            }

            return "Installed".to_string();
        }
    }
    "Not Found".to_string()
}

pub struct WakelockState(pub Mutex<Option<NoSleep>>);

#[command]
pub fn toggle_wakelock(state: State<'_, WakelockState>, enabled: bool) -> Result<bool, String> {
    let mut nosleep_lock = state.0.lock().map_err(|e| e.to_string())?;
    
    if enabled {
        if nosleep_lock.is_none() {
            let mut ns = NoSleep::new().map_err(|e| e.to_string())?;
            ns.start(NoSleepType::PreventUserIdleDisplaySleep).map_err(|e| e.to_string())?;
            *nosleep_lock = Some(ns);
        }
        Ok(true)
    } else {
        if let Some(ns) = nosleep_lock.take() {
            let _ = ns.stop();
        }
        Ok(false)
    }
}

#[command]
pub async fn sync_workspace_permissions(_paths: Vec<String>) -> AppResult<()> {
    #[cfg(not(target_os = "windows"))]
    {
        use crate::cmd_utils::new_tokio_command;
        for path in _paths {
            let mut cmd = new_tokio_command("chmod");
            cmd.args(["-R", "755", path.as_str()]);
            let _ = cmd.output().await;
        }
    }
    Ok(())
}
