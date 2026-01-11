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
            // But sometimes just com.package.name if -f fails? No, -f should give path.
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
