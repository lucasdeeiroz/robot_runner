use crate::cmd_utils::new_tokio_command;
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct Device {
    pub udid: String,
    pub model: String,
    pub state: String, // "device", "offline", "unauthorized"
    pub product: String,
    pub transport_id: String,
    pub android_version: Option<String>,
    pub battery_level: Option<u8>,
    pub ram_total: Option<u64>,
    pub ram_used: Option<u64>,
}

use crate::errors::{AppError, AppResult};

#[tauri::command]
pub async fn get_connected_devices() -> AppResult<Vec<Device>> {
    let mut cmd = new_tokio_command("adb");
    cmd.args(&["devices", "-l"]);

    let output = cmd
        .output()
        .await
        .map_err(|e| AppError::AdbError(format!("Failed to execute adb: {}", e)))?;

    if !output.status.success() {
        return Err(AppError::AdbError(
            String::from_utf8_lossy(&output.stderr).to_string(),
        ));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut device_tasks = Vec::new();

    for line in stdout.lines().skip(1) {
        if line.trim().is_empty() {
            continue;
        }

        let parts: Vec<&str> = line.split_whitespace().collect();
        if parts.len() < 2 {
            continue;
        }

        let udid = parts[0].to_string();
        let state = parts[1].to_string();

        if state == "device" {
            device_tasks.push(tokio::spawn(async move {
                let udid_clone = udid.clone();
                
                // Fetch model
                let model_task = tokio::spawn(async move {
                    let mut cmd = new_tokio_command("adb");
                    cmd.args(&["-s", &udid_clone, "shell", "getprop", "ro.product.model"]);
                    cmd.output().await
                });

                let udid_clone2 = udid.clone();
                // Fetch Android version
                let ver_task = tokio::spawn(async move {
                    let mut cmd = new_tokio_command("adb");
                    cmd.args(&["-s", &udid_clone2, "shell", "getprop", "ro.build.version.release"]);
                    cmd.output().await
                });

                let udid_clone3 = udid.clone();
                // Fetch Battery level
                let battery_task = tokio::spawn(async move {
                    let mut cmd = new_tokio_command("adb");
                    cmd.args(&["-s", &udid_clone3, "shell", "dumpsys", "battery"]);
                    cmd.output().await
                });

                let udid_clone4 = udid.clone();
                // Fetch Mem info
                let mem_task = tokio::spawn(async move {
                    let mut cmd = new_tokio_command("adb");
                    cmd.args(&["-s", &udid_clone4, "shell", "cat", "/proc/meminfo"]);
                    cmd.output().await
                });

                let model_res = model_task.await;
                let ver_res = ver_task.await;
                let bat_res = battery_task.await;
                let mem_res = mem_task.await;

                let model = model_res.ok()
                    .and_then(|r| r.ok())
                    .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string())
                    .unwrap_or_else(|| "Unknown".to_string());

                let android_version = ver_res.ok()
                    .and_then(|r| r.ok())
                    .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string());

                let battery_level = bat_res.ok()
                    .and_then(|r| r.ok())
                    .and_then(|o| {
                        let s = String::from_utf8_lossy(&o.stdout).to_string();
                        crate::adb::stats::parse_battery_info(&s)
                    })
                    .map(|(level, _)| level);

                let (ram_total, ram_used) = mem_res.ok()
                    .and_then(|r| r.ok())
                    .and_then(|o| {
                        let s = String::from_utf8_lossy(&o.stdout).to_string();
                        crate::adb::stats::parse_mem_info(&s)
                    })
                    .map(|(t, u)| (Some(t), Some(u)))
                    .unwrap_or((None, None));

                Device {
                    udid,
                    model,
                    state: "device".to_string(),
                    product: "".to_string(),
                    transport_id: "".to_string(),
                    android_version,
                    battery_level,
                    ram_total,
                    ram_used,
                }
            }));
        } else {
            device_tasks.push(tokio::spawn(async move {
                Device {
                    udid,
                    model: "Unknown".to_string(),
                    state,
                    product: "".to_string(),
                    transport_id: "".to_string(),
                    android_version: None,
                    battery_level: None,
                    ram_total: None,
                    ram_used: None,
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
