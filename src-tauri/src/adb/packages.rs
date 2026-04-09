use tauri::command;
use std::process::Command;

#[derive(serde::Serialize)]
pub struct PackageInfo {
    name: String,
    path: String,
    is_system: bool,
    is_disabled: bool,
}

#[command]
pub fn get_installed_packages(device: String) -> Result<Vec<PackageInfo>, String> {
    // 1. Get All Packages with Path (-f)
    let output_all = run_adb(device.clone(), vec!["shell", "pm", "list", "packages", "-f"])?;
    
    // 2. Get Disabled Packages (-d)
    let output_disabled = run_adb(device.clone(), vec!["shell", "pm", "list", "packages", "-d"]).unwrap_or_default();
    let disabled_set: std::collections::HashSet<String> = output_disabled
        .lines()
        .filter_map(|line| line.strip_prefix("package:").map(|s| s.trim().to_string()))
        .collect();

    let mut packages = Vec::new();

    for line in output_all.lines() {
        if let Some(record) = line.strip_prefix("package:") {
            // Format: /path/to/apk=com.package.name
            if let Some((path, name)) = record.rsplit_once('=') {
                let name = name.trim().to_string();
                let path = path.trim().to_string();
                
                let is_system = path.starts_with("/system") || path.starts_with("/product") || path.starts_with("/vendor") || path.starts_with("/apex");
                let is_disabled = disabled_set.contains(&name);

                packages.push(PackageInfo {
                    name,
                    path,
                    is_system,
                    is_disabled
                });
            }
        }
    }

    // Sort by name
    packages.sort_by(|a, b| a.name.cmp(&b.name));

    Ok(packages)
}

#[command]
pub fn uninstall_package(device: String, package: String) -> Result<String, String> {
    run_adb(device, vec!["uninstall", &package])
}

#[command]
pub fn enable_package(device: String, package: String) -> Result<String, String> {
    // pm enable <pkg>
    run_adb(device, vec!["shell", "pm", "enable", &package])
}

#[command]
pub fn disable_package(device: String, package: String) -> Result<String, String> {
    // pm disable-user --user 0 <pkg>
    run_adb(device, vec!["shell", "pm", "disable-user", "--user", "0", &package])
}

#[command]
pub fn clear_package(device: String, package: String) -> Result<String, String> {
    run_adb(device, vec!["shell", "pm", "clear", &package])
}

#[command]
pub async fn install_package(device: String, path: String) -> Result<String, String> {
    // adb install -r <path>
    run_adb(device, vec!["install", "-r", &path])
}

#[command]
pub fn get_focused_package(device: String) -> Result<String, String> {
    // Extract package from dumpsys window
    // Format usually: mCurrentFocus=Window{... com.package.name/com.package.name.Activity}
    let output = run_adb(device, vec!["shell", "dumpsys", "window"])?;
    
    if let Some(pos) = output.find("u0 ") {
        let rest = &output[pos + 3..];
        if let Some(slash_pos) = rest.find('/') {
            return Ok(rest[..slash_pos].trim().to_string());
        }
    }
    
    // Fallback search if u0 is not present or format differs
    for line in output.lines() {
        if line.contains("mCurrentFocus") || line.contains("mFocusedApp") {
            if let Some(start) = line.find('{') {
                if let Some(end) = line.find('}') {
                    let content = &line[start+1..end];
                    let parts: Vec<&str> = content.split_whitespace().collect();
                    if let Some(pkg_activity) = parts.last() {
                        if let Some((pkg, _)) = pkg_activity.split_once('/') {
                            return Ok(pkg.to_string());
                        }
                    }
                }
            }
        }
    }

    Err("Could not detect focused package".to_string())
}

#[command]
pub fn launch_package(device: String, package: String) -> Result<String, String> {
    run_adb(device, vec!["shell", "monkey", "-p", &package, "-c", "android.intent.category.LAUNCHER", "1"])
}

#[command]
pub fn set_stay_on(device: String, enabled: bool) -> Result<String, String> {
    let mode = if enabled { "true" } else { "false" };
    run_adb(device, vec!["shell", "svc", "power", "stayon", mode])
}

// Internal Helper
fn run_adb(device: String, args: Vec<&str>) -> Result<String, String> {
    #[cfg(target_os = "windows")]
    let cmd = "adb"; // Rely on PATH for now or improve later
    #[cfg(not(target_os = "windows"))]
    let cmd = "adb";

    let mut command = Command::new(cmd);
    
    // Select device
    if !device.is_empty() {
        command.arg("-s").arg(&device);
    }

    command.args(&args);

    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        command.creation_flags(CREATE_NO_WINDOW);
    }

    let output = command.output().map_err(|e| format!("Failed to execute adb: {}", e))?;

    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).to_string())
    } else {
        Err(String::from_utf8_lossy(&output.stderr).to_string())
    }
}
