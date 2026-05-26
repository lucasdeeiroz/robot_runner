use crate::cmd_utils::{new_std_command, get_adb_program};
use crate::errors::{AppError, AppResult};
use nosleep::{NoSleep, NoSleepType};
use regex::Regex;
use serde::Serialize;
use std::sync::Mutex;
use tauri::{command, State, AppHandle};
use walkdir::WalkDir;

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
    pub gemini_code: String,
}

#[command]
pub async fn get_system_versions(
    app: AppHandle,
    check_automator: bool,
    framework: Option<String>,
    check_ngrok: bool,
) -> SystemVersions {
    let adb_program = get_adb_program(&app);
    let adb_raw = get_version(&adb_program, &["--version"]);
    let adb = extract_version(&adb_raw, r"Android Debug Bridge version ([\d\.]+)");

    let mut versions = SystemVersions {
        adb: adb.unwrap_or_else(|| "Not Found".to_string()),
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
        ..Default::default()
    };

    // Scrcpy
    let scrcpy_raw = get_version("scrcpy", &["--version"]);
    versions.scrcpy = extract_version(&scrcpy_raw, r"scrcpy ([\d\.]+)").unwrap_or_else(|| "Not Found".to_string());

    // Basic tools that should always be checked in automator mode
    if check_automator {
        // Node
        let node_raw = get_version("node", &["--version"]);
        versions.node = node_raw.trim().replace("v", "");
        if versions.node.is_empty() { versions.node = "Not Found".to_string(); }

        // Java
        let java_raw = get_version("java", &["-version"]);
        versions.java = extract_version(&java_raw, r#"(?:version|openjdk version) "([\d\._]+)""#).unwrap_or_else(|| "Not Found".to_string());

        // Python
        let python_raw = get_version("python", &["--version"]);
        versions.python = extract_version(&python_raw, r"Python ([\d\.]+)").unwrap_or_else(|| "Not Found".to_string());
    }

    if check_automator {
        if let Some(f) = framework {
            if f == "robot" {
                let robot_raw = get_version("python", &["-m", "robot", "--version"]);
                versions.robot = extract_version(&robot_raw, r"Robot Framework ([\d\.]+)").unwrap_or_else(|| "Not Found".to_string());
                
                let appium_lib_raw = get_pip_version("robotframework-appiumlibrary");
                versions.appium_lib = appium_lib_raw;
            } else if f == "appium" {
                let maven_raw = get_version("mvn", &["--version"]);
                versions.maven = extract_version(&maven_raw, r"Apache Maven ([\d\.]+)").unwrap_or_else(|| "Not Found".to_string());
            } else if f == "maestro" {
                let maestro_raw = get_version("maestro", &["--version"]);
                versions.maestro = maestro_raw.trim().to_string();
                if versions.maestro.is_empty() { versions.maestro = "Not Found".to_string(); }
            }

            // Appium is used by both robot and appium frameworks
            if f == "robot" || f == "appium" {
                let appium_raw = get_version("appium", &["--version"]);
                let appium_ver = appium_raw.trim().to_string();
                versions.appium = if appium_ver.is_empty() { "Not Found".to_string() } else { appium_ver };

                if versions.appium != "Not Found" {
                    versions.uiautomator2 = get_appium_driver_version("uiautomator2");
                } else {
                    versions.uiautomator2 = "Not Found".to_string();
                }
            }
        }
    }

    if check_ngrok {
        let ngrok_raw = get_version("ngrok", &["--version"]);
        versions.ngrok = extract_version(&ngrok_raw, r"ngrok version ([\d\.]+)").unwrap_or_else(|| "Not Found".to_string());
    }

    // AI CLI tools
    let claude_raw = get_version("claude", &["--version"]);
    versions.claude_code = if !claude_raw.is_empty() { claude_raw.trim().to_string() } else { "Not Found".to_string() };

    let gemini_raw = get_version("gemini", &["--version"]);
    versions.gemini_code = if !gemini_raw.is_empty() { gemini_raw.trim().to_string() } else { "Not Found".to_string() };

    versions
}

fn get_version(cmd_name: &str, args: &[&str]) -> String {
    let mut cmd = new_std_command(cmd_name);
    cmd.args(args);
    let output = cmd.output();
    match output {
        Ok(o) => {
            let stdout = String::from_utf8_lossy(&o.stdout).to_string();
            let stderr = String::from_utf8_lossy(&o.stderr).to_string();
            if stdout.is_empty() { stderr } else { stdout }
        }
        Err(_) => String::new(),
    }
}

fn extract_version(text: &str, pattern: &str) -> Option<String> {
    let re = Regex::new(pattern).ok()?;
    re.captures(text).map(|cap| cap[1].to_string())
}

fn get_pip_version(package: &str) -> String {
    let mut cmd = new_std_command("python");
    cmd.args(&["-m", "pip", "show", package]);
    let output = cmd.output();
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

fn get_appium_driver_version(driver: &str) -> String {
    let raw = get_version("appium", &["driver", "list", "--installed"]);
    if raw.is_empty() {
        return "Not Found".to_string();
    }

    for line in raw.lines() {
        let trimmed = line.trim();
        if trimmed.starts_with(driver) || (trimmed.contains(driver) && trimmed.contains("[")) {
            // Look for version in brackets or after @
            // Example: uiautomator2 [2.29.4]
            let re = Regex::new(r"\[([^\]]+)\]").ok();
            if let Some(r) = re {
                if let Some(cap) = r.captures(trimmed) {
                    return cap[1].trim().to_string();
                }
            }
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
pub async fn sync_workspace_permissions(paths: Vec<String>) -> AppResult<()> {
    #[cfg(not(target_os = "windows"))]
    {
        use crate::cmd_utils::new_tokio_command;
        for path in paths {
            let mut cmd = new_tokio_command("chmod");
            cmd.args(["-R", "755", path.as_str()]);
            let _ = cmd.output().await;
        }
    }
    Ok(())
}
