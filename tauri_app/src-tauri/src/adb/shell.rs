use std::process::Command;
use tauri::command;

pub struct ShellManager;

impl ShellManager {
    pub fn new() -> Self {
        Self
    }
}

#[command]
pub fn get_adb_version() -> Result<String, String> {
    let output = Command::new("adb")
        .arg("version")
        .output()
        .map_err(|e| format!("Failed to execute adb: {}", e))?;

    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).to_string())
    } else {
        Err(String::from_utf8_lossy(&output.stderr).to_string())
    }
}
