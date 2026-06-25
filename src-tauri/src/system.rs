use crate::cmd_utils::{new_tokio_command, get_adb_program};
use crate::errors::{AppError, AppResult};
use nosleep::{NoSleep, NoSleepType};
use regex::Regex;
use serde::Serialize;
use std::sync::Mutex;
use tauri::{command, State, AppHandle};
use walkdir::WalkDir;

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

#[command]
pub async fn get_folder_size(path: String) -> AppResult<u64> {
    tokio::task::spawn_blocking(move || {
        let mut total_size = 0;
        for entry in WalkDir::new(path).into_iter().filter_map(|e| e.ok()) {
            if entry.file_type().is_file() {
                total_size += entry.metadata().map(|m| m.len()).unwrap_or(0);
            }
        }
        total_size
    })
    .await
    .map_err(|e| AppError::StringError(e.to_string()))
}

#[derive(Serialize, Default, Debug)]
pub struct SystemVersions {
    pub adb: String,
    pub node: String,
    pub appium: String,
    pub uiautomator2: String,
    pub python: String,
    pub robot: String,
    pub appium_lib: String,
    pub java: String,
    pub maven: String,
    pub maestro: String,
    pub scrcpy: String,
    pub ngrok: String,
    pub claude_code: String,
    pub antigravity: String,
}

#[command]
pub async fn get_system_versions(
    app: AppHandle,
    check_automator: bool,
    framework: Option<String>,
    check_ngrok: bool,
) -> SystemVersions {
    let adb_program = get_adb_program(&app);
    let f = framework.unwrap_or_default();

    let adb_fut = async { get_version(&adb_program, &["--version"]).await };
    let scrcpy_fut = async { get_version("scrcpy", &["--version"]).await };
    let node_fut = async { if check_automator { get_version("node", &["--version"]).await } else { String::new() } };
    let java_fut = async { if check_automator { get_version("java", &["-version"]).await } else { String::new() } };
    let python_fut = async { if check_automator { get_version("python", &["--version"]).await } else { String::new() } };
    
    let robot_fut = async { if check_automator && f == "robot" { get_version("python", &["-m", "robot", "--version"]).await } else { String::new() } };
    let appium_lib_fut = async { if check_automator && f == "robot" { get_pip_version("robotframework-appiumlibrary").await } else { "Not Found".to_string() } };
    
    let maven_fut = async { if check_automator && f == "appium" { get_version("mvn", &["--version"]).await } else { String::new() } };
    let maestro_fut = async { if check_automator && f == "maestro" { get_version("maestro", &["--version"]).await } else { String::new() } };
    
    let appium_fut = async { if check_automator && (f == "robot" || f == "appium") { get_version("appium", &["--version"]).await } else { String::new() } };
    let uiaut_fut = async { if check_automator && (f == "robot" || f == "appium") { get_appium_driver_version("uiautomator2").await } else { "Not Found".to_string() } };

    let ngrok_fut = async { if check_ngrok { get_version("ngrok", &["--version"]).await } else { String::new() } };
    let claude_fut = async { get_version("claude", &["--version"]).await };
    let agy_fut = async { get_version("agy", &["--version"]).await };

    let (
        adb_raw, scrcpy_raw, node_raw, java_raw, python_raw,
        robot_raw, appium_lib_raw, maven_raw, maestro_raw,
        appium_raw, uiautomator2, ngrok_raw, claude_raw, antigravity_raw
    ) = tokio::join!(
        adb_fut, scrcpy_fut, node_fut, java_fut, python_fut,
        robot_fut, appium_lib_fut, maven_fut, maestro_fut,
        appium_fut, uiaut_fut, ngrok_fut, claude_fut, agy_fut
    );

    let adb_bridge = extract_version(&adb_raw, r"Android Debug Bridge version ([\d\.]+)");
    let adb_sdk = extract_version(&adb_raw, r"Version ([\w\.\-]+)");

    let adb_display = match (adb_bridge, adb_sdk) {
        (Some(bridge), Some(sdk)) => format!("{} ({})", bridge, sdk),
        (Some(bridge), None) => bridge,
        (None, _) => {
            if adb_raw.contains("Command not allowed") || adb_raw.to_lowercase().contains("error") || !adb_raw.trim().is_empty() {
                "Custom Binary".to_string()
            } else {
                "Not Found".to_string()
            }
        }
    };

    let mut versions = SystemVersions {
        adb: adb_display,
        node: "Not Checked".to_string(),
        appium: "Not Checked".to_string(),
        uiautomator2: "Not Checked".to_string(),
        python: "Not Checked".to_string(),
        robot: "Not Checked".to_string(),
        appium_lib: "Not Checked".to_string(),
        java: "Not Checked".to_string(),
        maven: "Not Checked".to_string(),
        maestro: "Not Checked".to_string(),
        ngrok: "Not Checked".to_string(),
        claude_code: "Not Found".to_string(),
        antigravity: "Not Found".to_string(),
        scrcpy: "Not Found".to_string(),
    };

    versions.scrcpy = extract_version(&scrcpy_raw, r"scrcpy ([\d\.]+)").unwrap_or_else(|| "Not Found".to_string());

    if check_automator {
        versions.node = node_raw.trim().replace("v", "");
        if versions.node.is_empty() { versions.node = "Not Found".to_string(); }

        versions.java = extract_version(&java_raw, r#"(?:version|openjdk version) "([\d\._]+)""#).unwrap_or_else(|| "Not Found".to_string());
        versions.python = extract_version(&python_raw, r"Python ([\d\.]+)").unwrap_or_else(|| "Not Found".to_string());

        if f == "robot" {
            versions.robot = extract_version(&robot_raw, r"Robot Framework ([\d\.]+)").unwrap_or_else(|| "Not Found".to_string());
            versions.appium_lib = appium_lib_raw;
        } else if f == "appium" {
            versions.maven = extract_version(&maven_raw, r"Apache Maven ([\d\.]+)").unwrap_or_else(|| "Not Found".to_string());
        } else if f == "maestro" {
            versions.maestro = maestro_raw.trim().to_string();
            if versions.maestro.is_empty() { versions.maestro = "Not Found".to_string(); }
        }

        if f == "robot" || f == "appium" {
            let appium_ver = appium_raw.trim().to_string();
            versions.appium = if appium_ver.is_empty() { "Not Found".to_string() } else { appium_ver };
            if versions.appium != "Not Found" {
                versions.uiautomator2 = uiautomator2;
            } else {
                versions.uiautomator2 = "Not Found".to_string();
            }
        }
    }

    if check_ngrok {
        versions.ngrok = extract_version(&ngrok_raw, r"ngrok version ([\d\.]+)").unwrap_or_else(|| "Not Found".to_string());
    }

    versions.claude_code = if !claude_raw.is_empty() { claude_raw.trim().to_string() } else { "Not Found".to_string() };
    versions.antigravity = if !antigravity_raw.is_empty() { antigravity_raw.trim().to_string() } else { "Not Found".to_string() };

    versions
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
