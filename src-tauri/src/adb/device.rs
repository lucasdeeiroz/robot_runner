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
    pub storage_total: Option<u64>,
    pub storage_used: Option<u64>,
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
        let trimmed_line = line.trim();
        if trimmed_line.is_empty() || trimmed_line.starts_with("List of devices") || trimmed_line.starts_with('*') || trimmed_line.starts_with("adb server") {
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
                        storage_total: None,
                        storage_used: None,
                    }
                }));
                continue;
            }

            let app_clone = app.clone();
            device_tasks.push(tokio::spawn(async move {
                let program = get_adb_program(&app_clone);
                let mut cmd = new_tokio_command(&program);
                let script = "getprop ro.product.model; echo '---SEP---'; getprop ro.build.version.release; echo '---SEP---'; dumpsys battery; echo '---SEP---'; cat /proc/meminfo || dumpsys meminfo; echo '---SEP---'; df -k /data";
                cmd.args(&["-s", &udid, "shell", script]);
                
                let output = cmd.output().await;
                let stdout = if let Ok(o) = output {
                    String::from_utf8_lossy(&o.stdout).to_string()
                } else {
                    String::new()
                };

                let parts: Vec<&str> = stdout.split("---SEP---").collect();

                let model = parts.get(0).map(|s| s.trim().to_string()).filter(|s| !s.is_empty()).unwrap_or_else(|| "Unknown".to_string());
                let android_version = parts.get(1).map(|s| s.trim().to_string()).filter(|s| !s.is_empty());
                
                let battery_level = parts.get(2)
                    .and_then(|s| parse_battery_info(s))
                    .map(|(lvl, _, _, _)| lvl);

                let (ram_total, ram_used) = parts.get(3)
                    .map(|s| parse_mem_info(s).unwrap_or((0, 0)))
                    .unwrap_or((0, 0));

                let (storage_total, storage_used) = parts.get(4)
                    .map(|s| {
                        let mut found = None;
                        let mut is_first_line = true;
                        for line in s.lines() {
                            if line.trim().is_empty() { continue; }
                            if is_first_line { is_first_line = false; continue; }
                            let p: Vec<&str> = line.split_whitespace().collect();
                            if p.len() >= 3 {
                                if let (Ok(t), Ok(u)) = (p[1].parse::<u64>(), p[2].parse::<u64>()) {
                                    found = Some((t, u));
                                    break;
                                }
                            }
                        }
                        found.unwrap_or((0, 0))
                    })
                    .unwrap_or((0, 0));

                Device {
                    udid,
                    model,
                    state,
                    android_version,
                    battery_level,
                    ram_total: if ram_total > 0 { Some(ram_total) } else { None },
                    ram_used: if ram_used > 0 { Some(ram_used) } else { None },
                    storage_total: if storage_total > 0 { Some(storage_total) } else { None },
                    storage_used: if storage_used > 0 { Some(storage_used) } else { None },
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
