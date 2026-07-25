use crate::cmd_utils::{new_tokio_command, get_adb_program, format_adb_error};
use tauri::AppHandle;
use tauri::command;

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub struct PackageInfo {
    pub name: String,
    pub label: Option<String>,
    pub path: String,
    pub version: String,
    pub is_system: bool,
    pub is_disabled: bool,
    pub icon: Option<String>,
}

#[command]
pub async fn get_installed_packages(app: AppHandle, device: String) -> Result<Vec<PackageInfo>, String> {
    // 1. Ensure ADB port forwarding is active for target device
    let _ = crate::companion::start_companion_forward(app.clone(), device.clone(), Some(9876), Some(9876)).await;

    // 2. Try Companion Hybrid Bridge First (<20ms) with retry and generous timeout
    let comp_url = "http://127.0.0.1:9876/apps".to_string();
    if let Ok(client) = reqwest::Client::builder().timeout(std::time::Duration::from_millis(2500)).build() {
        for attempt in 0..2 {
            if let Ok(resp) = client.get(&comp_url).send().await {
                if resp.status().is_success() {
                    if let Ok(val) = resp.json::<serde_json::Value>().await {
                        if val.get("status").and_then(|s| s.as_str()) == Some("ok") {
                            if let Some(apps_arr) = val.get("apps").and_then(|a| a.as_array()) {
                                let mut packages: Vec<PackageInfo> = Vec::new();
                                for a in apps_arr {
                                    let name = a.get("name").and_then(|v| v.as_str()).unwrap_or("").to_string();
                                    if name.is_empty() { continue; }
                                    let label = a.get("label").and_then(|v| v.as_str()).map(|s| s.to_string());
                                    let path = a.get("path").and_then(|v| v.as_str()).unwrap_or("").to_string();
                                    let version = a.get("version").and_then(|v| v.as_str()).unwrap_or("").to_string();
                                    let is_system = a.get("is_system").and_then(|v| v.as_bool()).unwrap_or(false);
                                    let is_disabled = a.get("is_disabled").and_then(|v| v.as_bool()).unwrap_or(false);
                                    let icon = a.get("icon").and_then(|v| v.as_str()).map(|s| s.to_string());

                                    packages.push(PackageInfo {
                                        name,
                                        label,
                                        path,
                                        version,
                                        is_system,
                                        is_disabled,
                                        icon,
                                    });
                                }
                                packages.sort_by(|a, b| {
                                    let label_a = a.label.as_deref().unwrap_or(&a.name);
                                    let label_b = b.label.as_deref().unwrap_or(&b.name);
                                    label_a.cmp(label_b)
                                });
                                return Ok(packages);
                            }
                        }
                    }
                }
            }
            if attempt == 0 {
                tokio::time::sleep(std::time::Duration::from_millis(150)).await;
            }
        }
    }

    // 2. ADB Fallback if Companion is absent or unavailable
    let output_all = run_adb(
        &app,
        device.clone(),
        vec!["shell", "pm", "list", "packages", "-f"],
    )
    .await?;

    let output_disabled = run_adb(
        &app,
        device.clone(),
        vec!["shell", "pm", "list", "packages", "-d"],
    )
    .await
    .unwrap_or_default();
    let disabled_set: std::collections::HashSet<String> = output_disabled
        .lines()
        .filter_map(|line| line.strip_prefix("package:").map(|s| s.trim().to_string()))
        .collect();

    let output_dumpsys = run_adb(
        &app,
        device.clone(),
        vec!["shell", "dumpsys", "package", "packages"],
    )
    .await
    .unwrap_or_default();

    let mut version_map = std::collections::HashMap::new();
    let mut current_pkg = String::new();
    for line in output_dumpsys.lines() {
        let trimmed = line.trim();
        if trimmed.starts_with("Package [") && trimmed.contains(']') {
            if let (Some(start), Some(end)) = (trimmed.find('['), trimmed.find(']')) {
                current_pkg = trimmed[start + 1..end].to_string();
            }
        } else if trimmed.starts_with("versionName=") {
            if let Some(version) = trimmed.strip_prefix("versionName=") {
                if !current_pkg.is_empty() {
                    version_map.insert(current_pkg.clone(), version.to_string());
                    current_pkg.clear();
                }
            }
        }
    }

    let mut packages = Vec::new();

    for line in output_all.lines() {
        if let Some(record) = line.strip_prefix("package:") {
            if let Some((path, name)) = record.rsplit_once('=') {
                let name = name.trim().to_string();
                let path = path.trim().to_string();

                let is_system = path.starts_with("/system")
                    || path.starts_with("/product")
                    || path.starts_with("/vendor")
                    || path.starts_with("/apex");
                let is_disabled = disabled_set.contains(&name);
                let version = version_map.get(&name).cloned().unwrap_or_else(|| String::new());

                packages.push(PackageInfo {
                    name,
                    label: None,
                    path,
                    version,
                    is_system,
                    is_disabled,
                    icon: None,
                });
            }
        }
    }

    packages.sort_by(|a, b| a.name.cmp(&b.name));

    Ok(packages)
}

#[command]
pub async fn get_app_icon(app: AppHandle, device: String, package: String) -> Result<String, String> {
    let _ = crate::companion::start_companion_forward(app.clone(), device.clone(), Some(9876), Some(9876)).await;
    let comp_url = format!("http://127.0.0.1:9876/app/icon?package={}", package);
    if let Ok(client) = reqwest::Client::builder().timeout(std::time::Duration::from_millis(2000)).build() {
        if let Ok(resp) = client.get(&comp_url).send().await {
            if resp.status().is_success() {
                if let Ok(val) = resp.json::<serde_json::Value>().await {
                    if val.get("status").and_then(|s| s.as_str()) == Some("ok") {
                        if let Some(icon) = val.get("icon").and_then(|v| v.as_str()) {
                            return Ok(icon.to_string());
                        }
                    }
                }
            }
        }
    }
    Err("App icon not available".to_string())
}

#[command]
pub async fn uninstall_package(app: AppHandle, device: String, package: String) -> Result<String, String> {
    run_adb(&app, device, vec!["uninstall", &package]).await
}

#[command]
pub async fn enable_package(app: AppHandle, device: String, package: String) -> Result<String, String> {
    run_adb(&app, device, vec!["shell", "pm", "enable", &package]).await
}

#[command]
pub async fn disable_package(app: AppHandle, device: String, package: String) -> Result<String, String> {
    run_adb(
        &app,
        device,
        vec!["shell", "pm", "disable-user", "--user", "0", &package],
    )
    .await
}

#[command]
pub async fn clear_package(app: AppHandle, device: String, package: String) -> Result<String, String> {
    run_adb(&app, device, vec!["shell", "pm", "clear", &package]).await
}

#[command]
pub async fn install_package(
    app: AppHandle,
    device: String,
    path: String,
    downgrade: Option<bool>,
    grant_permissions: Option<bool>,
    allow_test: Option<bool>,
    install_sdcard: Option<bool>,
) -> Result<String, String> {
    let mut args = vec!["install", "-r"];
    if downgrade.unwrap_or(false) {
        args.push("-d");
    }
    if grant_permissions.unwrap_or(false) {
        args.push("-g");
    }
    if allow_test.unwrap_or(false) {
        args.push("-t");
    }
    if install_sdcard.unwrap_or(false) {
        args.push("-s");
    }
    args.push(&path);
    run_adb(&app, device, args).await
}

#[command]
pub async fn get_focused_package(app: AppHandle, device: String) -> Result<String, String> {
    // Try dumpsys window first (most reliable for current focus)
    if let Ok(output) = run_adb(&app, device.clone(), vec!["shell", "dumpsys", "window"]).await {
        for line in output.lines() {
            if line.contains("mCurrentFocus") || line.contains("mFocusedApp") {
                let parts: Vec<&str> = line.split_whitespace().collect();
                for part in parts {
                    if part.contains("/") {
                        let clean = part.replace("}", "").replace("{", "");
                        if let Some(slash_idx) = clean.find('/') {
                            if slash_idx > 0 {
                                return Ok(clean[..slash_idx].to_string());
                            }
                        }
                    }
                }
            }
        }
    }

    // Fallback: dumpsys activity top
    let output = run_adb(&app, device, vec!["shell", "dumpsys", "activity", "top"]).await?;

    for line in output.lines() {
        if line.contains("TASK:") || line.contains("topApp=ActivityRecord") || line.contains("ACTIVITY ") {
            let parts: Vec<&str> = line.split_whitespace().collect();
            for part in parts {
                if part.contains("/") {
                    let clean = part.replace("}", "").replace("{", "");
                    if let Some(slash_idx) = clean.find('/') {
                        if slash_idx > 0 && slash_idx < clean.len() - 1 {
                             return Ok(clean[..slash_idx].to_string());
                        }
                    }
                }
            }
        }
    }

    Err("Could not detect focused package".to_string())
}

#[command]
pub async fn launch_package(app: AppHandle, device: String, package: String) -> Result<String, String> {
    run_adb(
        &app,
        device,
        vec![
            "shell",
            "monkey",
            "-p",
            &package,
            "-c",
            "android.intent.category.LAUNCHER",
            "1",
        ],
    )
    .await
}

#[command]
pub async fn force_stop_package(app: AppHandle, device: String, package: String) -> Result<String, String> {
    run_adb(&app, device, vec!["shell", "am", "force-stop", &package]).await
}

#[command]
pub async fn set_stay_on(app: AppHandle, device: String, enabled: bool) -> Result<String, String> {
    let mode = if enabled { "3" } else { "0" }; // 3 is AC+USB, 0 is Off
    run_adb(&app, device, vec!["shell", "settings", "put", "system", "stay_on_while_plugged_in", mode]).await
}

#[command]
pub async fn pull_apk(app: AppHandle, device: String, path: String, destination: String) -> Result<String, String> {
    run_adb(&app, device, vec!["pull", &path, &destination]).await
}

// Internal Helper
async fn run_adb(app: &AppHandle, device: String, args: Vec<&str>) -> Result<String, String> {
    let program = get_adb_program(app);
    let mut command = new_tokio_command(&program);

    if !device.is_empty() {
        command.arg("-s").arg(&device);
    }

    command.args(&args);

    let output = command
        .output()
        .await
        .map_err(|e| format!("Failed to execute {}: {}", program, e))?;

    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).to_string())
    } else {
        Err(format_adb_error(&output))
    }
}
