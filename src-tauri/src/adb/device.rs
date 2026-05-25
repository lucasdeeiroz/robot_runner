use crate::cmd_utils::{new_tokio_command, get_adb_program};
use serde::{Deserialize, Serialize};
use tauri::AppHandle;
use crate::adb::stats::{parse_battery_info, parse_mem_info};

#[derive(Debug, Serialize, Deserialize)]
pub struct Device {
    pub udid: String,
    pub model: String,
    pub state: String, // "device", "offline", "unauthorized"
    pub android_version: Option<String>,
    pub battery_level: Option<u8>,
    pub ram_total: Option<u64>,
    pub ram_used: Option<u64>,
}

#[tauri::command]
pub async fn get_connected_devices(app: AppHandle) -> Result<Vec<Device>, String> {
    let program = get_adb_program(&app);
    let mut cmd = new_tokio_command(&program);
    cmd.arg("devices");

    let output = cmd
        .output()
        .await
        .map_err(|e| format!("Failed to run {}: {}", program, e))?;

    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut device_tasks = Vec::new();

    for line in stdout.lines() {
        if line.is_empty() || line.starts_with("List of devices") {
            continue;
        }

        let parts: Vec<&str> = line.split_whitespace().collect();
        if parts.len() >= 2 {
            let udid = parts[0].to_string();
            let state = parts[1].to_string();

            if state != "device" {
                device_tasks.push(tokio::spawn(async move {
                    Device {
                        udid,
                        model: "Unknown".to_string(),
                        state,
                        android_version: None,
                        battery_level: None,
                        ram_total: None,
                        ram_used: None,
                    }
                }));
                continue;
            }

            let app_clone = app.clone();
            device_tasks.push(tokio::spawn(async move {
                let program = get_adb_program(&app_clone);
                
                // Get model
                let model = {
                    let mut cmd = new_tokio_command(&program);
                    cmd.args(&["-s", &udid, "shell", "getprop", "ro.product.model"]);
                    let output = cmd.output().await;
                    if let Ok(o) = output {
                        String::from_utf8_lossy(&o.stdout).trim().to_string()
                    } else {
                        "Unknown".to_string()
                    }
                };

                // Get Android version
                let version = {
                    let mut cmd = new_tokio_command(&program);
                    cmd.args(&["-s", &udid, "shell", "getprop", "ro.build.version.release"]);
                    let output = cmd.output().await;
                    if let Ok(o) = output {
                        Some(String::from_utf8_lossy(&o.stdout).trim().to_string())
                    } else {
                        None
                    }
                };

                // Get Battery
                let battery = {
                    let mut cmd = new_tokio_command(&program);
                    cmd.args(&["-s", &udid, "shell", "dumpsys", "battery"]);
                    let output = cmd.output().await;
                    if let Ok(o) = output {
                        parse_battery_info(&String::from_utf8_lossy(&o.stdout)).map(|(lvl, _)| lvl)
                    } else {
                        None
                    }
                };

                // Get RAM
                let (ram_t, ram_u) = {
                    let mut cmd = new_tokio_command(&program);
                    cmd.args(&["-s", &udid, "shell", "cat", "/proc/meminfo"]);
                    let output = cmd.output().await;
                    if let Ok(o) = output {
                        parse_mem_info(&String::from_utf8_lossy(&o.stdout)).unwrap_or((0, 0))
                    } else {
                        (0, 0)
                    }
                };

                Device {
                    udid,
                    model,
                    state,
                    android_version: version,
                    battery_level: battery,
                    ram_total: if ram_t > 0 { Some(ram_t) } else { None },
                    ram_used: if ram_u > 0 { Some(ram_u) } else { None },
                }
            }));
        }
    }

    let mut devices = Vec::new();
    for task in device_tasks {
        if let Ok(device) = task.await {
            devices.push(device);
        }
    }

    Ok(devices)
}
