use crate::cmd_utils::{new_tokio_command, get_adb_program, format_adb_error};
use tauri::AppHandle;

fn resolve_target(ip: Option<String>, port: Option<String>, target: Option<String>) -> Result<String, String> {
    if let Some(explicit) = target {
        let value = explicit.trim().to_string();
        if !value.is_empty() {
            return Ok(value);
        }
    }

    let ip = ip.unwrap_or_default().trim().to_string();
    let port = port.unwrap_or_default().trim().to_string();
    if ip.is_empty() || port.is_empty() {
        return Err("IP and port are required".to_string());
    }
    Ok(format!("{}:{}", ip, port))
}

#[tauri::command]
pub async fn adb_connect(
    app: AppHandle,
    ip: Option<String>,
    port: Option<String>,
    target: Option<String>,
) -> Result<String, String> {
    let target = resolve_target(ip, port, target)?;
    let program = get_adb_program(&app);
    let mut cmd = new_tokio_command(&program);
    cmd.args(&["connect", &target]);

    let output = cmd
        .output()
        .await
        .map_err(|e| format!("Failed to run adb: {}", e))?;

    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).to_string())
    } else {
        Err(format_adb_error(&output))
    }
}

#[tauri::command]
pub async fn adb_pair(
    app: AppHandle,
    ip: Option<String>,
    port: Option<String>,
    target: Option<String>,
    code: String,
) -> Result<String, String> {
    let target = resolve_target(ip, port, target)?;
    let program = get_adb_program(&app);
    let mut cmd = new_tokio_command(&program);
    cmd.args(&["pair", &target, &code]);

    let output = cmd
        .output()
        .await
        .map_err(|e| format!("Failed to run adb: {}", e))?;

    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).to_string())
    } else {
        Err(format_adb_error(&output))
    }
}

#[tauri::command]
pub async fn adb_disconnect(
    app: AppHandle,
    ip: Option<String>,
    port: Option<String>,
    target: Option<String>,
) -> Result<String, String> {
    let target = resolve_target(ip, port, target)?;
    let program = get_adb_program(&app);
    let mut cmd = new_tokio_command(&program);
    cmd.args(&["disconnect", &target]);

    let output = cmd
        .output()
        .await
        .map_err(|e| format!("Failed to run adb: {}", e))?;

    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).to_string())
    } else {
        Err(format_adb_error(&output))
    }
}

#[tauri::command]
pub async fn adb_disconnect_all(app: AppHandle) -> Result<String, String> {
    let program = get_adb_program(&app);
    let mut cmd = new_tokio_command(&program);
    cmd.arg("disconnect");

    let output = cmd
        .output()
        .await
        .map_err(|e| format!("Failed to run adb: {}", e))?;

    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).to_string())
    } else {
        Err(format_adb_error(&output))
    }
}
