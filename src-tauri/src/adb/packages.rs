use crate::cmd_utils::{new_tokio_command, get_adb_program, format_adb_error};
use tauri::AppHandle;
use tauri::command;

#[derive(serde::Serialize)]
pub struct PackageInfo {
    name: String,
    path: String,
    version: String,
    is_system: bool,
    is_disabled: bool,
}

#[command]
pub async fn get_installed_packages(app: AppHandle, device: String) -> Result<Vec<PackageInfo>, String> {
    // 1. Get All Packages with Path (-f)
    let output_all = run_adb(
        &app,
        device.clone(),
        vec!["shell", "pm", "list", "packages", "-f"],
    )
    .await?;

    // 2. Get Disabled Packages (-d)
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

    // 3. Get version names via dumpsys
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
            // Format: /path/to/apk=com.package.name
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
                    path,
                    version,
                    is_system,
                    is_disabled,
                });
            }
        }
    }

    // Sort by name
    packages.sort_by(|a, b| a.name.cmp(&b.name));

    Ok(packages)
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
