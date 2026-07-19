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

#[command]
pub async fn adb_hardware_dnd(app: AppHandle, device: String, enable: bool) -> AppResult<()> {
    let _output = execute_adb_with_recovery(
        &app,
        Some(&device),
        vec!["shell".to_string(), "cmd".to_string(), "notification".to_string(), "set_dnd".to_string(), if enable { "on".to_string() } else { "off".to_string() }]
    ).await?;
    let _output_zen = execute_adb_with_recovery(
        &app,
        Some(&device),
        vec!["shell".to_string(), "settings".to_string(), "put".to_string(), "global".to_string(), "zen_mode".to_string(), if enable { "2".to_string() } else { "0".to_string() }]
    ).await?;
    Ok(())
}

#[command]
pub async fn adb_hardware_dark_mode(app: AppHandle, device: String, enable: bool) -> AppResult<()> {
    let val = if enable { "yes" } else { "no" };
    let _output = execute_adb_with_recovery(
        &app,
        Some(&device),
        vec!["shell".to_string(), "cmd".to_string(), "uimode".to_string(), "night".to_string(), val.to_string()]
    ).await?;
    Ok(())
}

#[command]
pub async fn adb_hardware_screen_rotation(app: AppHandle, device: String, auto_rotate: bool, rotation: i32) -> AppResult<()> {
    let accel_val = if auto_rotate { "1" } else { "0" };
    let _output_accel = execute_adb_with_recovery(
        &app,
        Some(&device),
        vec!["shell".to_string(), "settings".to_string(), "put".to_string(), "system".to_string(), "accelerometer_rotation".to_string(), accel_val.to_string()]
    ).await?;
    
    if !auto_rotate {
        let _output_rot = execute_adb_with_recovery(
            &app,
            Some(&device),
            vec!["shell".to_string(), "settings".to_string(), "put".to_string(), "system".to_string(), "user_rotation".to_string(), rotation.to_string()]
        ).await?;
    }
    
    Ok(())
}

#[command]
pub async fn adb_hardware_keep_awake(app: AppHandle, device: String, enable: bool) -> AppResult<()> {
    let val = if enable { "true" } else { "false" };
    let _output = execute_adb_with_recovery(
        &app,
        Some(&device),
        vec!["shell".to_string(), "svc".to_string(), "power".to_string(), "stayon".to_string(), val.to_string()]
    ).await?;
    Ok(())
}

#[command]
pub async fn adb_hardware_volume_mute(app: AppHandle, device: String, mute: bool) -> AppResult<()> {
    let vol_val = if mute { "0" } else { "10" };
    let _output = execute_adb_with_recovery(
        &app,
        Some(&device),
        vec!["shell".to_string(), "media".to_string(), "volume".to_string(), "--stream".to_string(), "3".to_string(), "--set".to_string(), vol_val.to_string()]
    ).await?;
    Ok(())
}

#[command]
pub async fn adb_hardware_deep_link(app: AppHandle, device: String, uri: String, package: String) -> AppResult<()> {
    let mut args = vec!["shell".to_string(), "am".to_string(), "start".to_string(), "-W".to_string(), "-a".to_string(), "android.intent.action.VIEW".to_string(), "-d".to_string(), uri];
    if !package.is_empty() {
        args.push(package);
    }
    let _output = execute_adb_with_recovery(
        &app,
        Some(&device),
        args
    ).await?;
    Ok(())
}

#[command]
pub async fn adb_hardware_permission(app: AppHandle, device: String, package: String, permission: String, grant: bool) -> AppResult<()> {
    let action = if grant { "grant" } else { "revoke" };
    let _output = execute_adb_with_recovery(
        &app,
        Some(&device),
        vec!["shell".to_string(), "pm".to_string(), action.to_string(), package, permission]
    ).await?;
    Ok(())
}

#[command]
pub async fn adb_hardware_locale(app: AppHandle, device: String, locale: String) -> AppResult<()> {
    let _output = execute_adb_with_recovery(
        &app,
        Some(&device),
        vec!["shell".to_string(), "setprop".to_string(), "persist.sys.locale".to_string(), locale.clone()]
    ).await?;
    
    let parts: Vec<&str> = locale.split('-').collect();
    if parts.len() == 2 {
        let _ = execute_adb_with_recovery(&app, Some(&device), vec!["shell".to_string(), "setprop".to_string(), "persist.sys.language".to_string(), parts[0].to_string()]).await;
        let _ = execute_adb_with_recovery(&app, Some(&device), vec!["shell".to_string(), "setprop".to_string(), "persist.sys.country".to_string(), parts[1].to_string()]).await;
    }

    Ok(())
}

