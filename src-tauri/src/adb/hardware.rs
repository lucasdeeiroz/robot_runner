use tauri::{command, AppHandle};
use crate::errors::AppResult;
use crate::adb::shell::execute_adb_with_recovery;

#[command]
pub async fn adb_hardware_battery_set(app: AppHandle, device: String, level: i32) -> AppResult<()> {
    let _output = execute_adb_with_recovery(
        &app,
        Some(&device),
        vec!["shell".to_string(), "dumpsys".to_string(), "battery".to_string(), "set".to_string(), "level".to_string(), level.to_string()]
    ).await?;
    Ok(())
}

#[command]
pub async fn adb_hardware_battery_reset(app: AppHandle, device: String) -> AppResult<()> {
    let _output = execute_adb_with_recovery(
        &app,
        Some(&device),
        vec!["shell".to_string(), "dumpsys".to_string(), "battery".to_string(), "reset".to_string()]
    ).await?;
    Ok(())
}

#[command]
pub async fn adb_hardware_battery_unplug(app: AppHandle, device: String) -> AppResult<()> {
    let _output = execute_adb_with_recovery(
        &app,
        Some(&device),
        vec!["shell".to_string(), "dumpsys".to_string(), "battery".to_string(), "unplug".to_string()]
    ).await?;
    Ok(())
}

#[command]
pub async fn adb_hardware_network_wifi(app: AppHandle, device: String, enable: bool) -> AppResult<()> {
    let action = if enable { "enable" } else { "disable" };
    let _output = execute_adb_with_recovery(
        &app,
        Some(&device),
        vec!["shell".to_string(), "svc".to_string(), "wifi".to_string(), action.to_string()]
    ).await?;
    Ok(())
}

#[command]
pub async fn adb_hardware_network_data(app: AppHandle, device: String, enable: bool) -> AppResult<()> {
    let action = if enable { "enable" } else { "disable" };
    let _output = execute_adb_with_recovery(
        &app,
        Some(&device),
        vec!["shell".to_string(), "svc".to_string(), "data".to_string(), action.to_string()]
    ).await?;
    Ok(())
}

#[command]
pub async fn adb_hardware_airplane_mode(app: AppHandle, device: String, enable: bool) -> AppResult<()> {
    let val = if enable { "1" } else { "0" };
    let _output = execute_adb_with_recovery(
        &app,
        Some(&device),
        vec!["shell".to_string(), "settings".to_string(), "put".to_string(), "global".to_string(), "airplane_mode_on".to_string(), val.to_string()]
    ).await?;
    
    // Broadcast the intent to notify apps
    let intent_val = if enable { "true" } else { "false" };
    let _output_broadcast = execute_adb_with_recovery(
        &app,
        Some(&device),
        vec!["shell".to_string(), "am".to_string(), "broadcast".to_string(), "-a".to_string(), "android.intent.action.AIRPLANE_MODE".to_string(), "--ez".to_string(), "state".to_string(), intent_val.to_string()]
    ).await?;
    Ok(())
}

#[command]
pub async fn adb_hardware_send_broadcast(app: AppHandle, device: String, action: String, extras: Vec<String>) -> AppResult<()> {
    let mut args = vec!["shell".to_string(), "am".to_string(), "broadcast".to_string(), "-a".to_string(), action];
    for extra in extras {
        args.push(extra);
    }
    let _output = execute_adb_with_recovery(
        &app,
        Some(&device),
        args
    ).await?;
    Ok(())
}
