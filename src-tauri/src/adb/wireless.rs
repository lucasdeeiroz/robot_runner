use crate::cmd_utils::{new_tokio_command, get_adb_program};
use tauri::AppHandle;

#[tauri::command]
pub async fn adb_connect(app: AppHandle, target: String) -> Result<String, String> {
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
        Err(String::from_utf8_lossy(&output.stderr).to_string())
    }
}

#[tauri::command]
pub async fn adb_pair(app: AppHandle, target: String, code: String) -> Result<String, String> {
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
        Err(String::from_utf8_lossy(&output.stderr).to_string())
    }
}

#[tauri::command]
pub async fn adb_disconnect(app: AppHandle, target: String) -> Result<String, String> {
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
        Err(String::from_utf8_lossy(&output.stderr).to_string())
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
        Err(String::from_utf8_lossy(&output.stderr).to_string())
    }
}
