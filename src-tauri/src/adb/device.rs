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
    pub battery_temp: Option<f32>,
    pub is_charging: Option<bool>,
    pub wifi_ip: Option<String>,
    pub ram_total: Option<u64>,
    pub ram_used: Option<u64>,
    pub storage_total: Option<u64>,
    pub storage_used: Option<u64>,
    pub is_companion_installed: Option<bool>,
    pub is_companion_active: Option<bool>,
    pub companion_port: Option<u16>,
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
                        battery_temp: None,
                        is_charging: None,
                        wifi_ip: None,
                        ram_total: None,
                        ram_used: None,
                        storage_total: None,
                        storage_used: None,
                        is_companion_installed: None,
                        is_companion_active: None,
                        companion_port: None,
                    }
                }));
                continue;
            }

            let app_clone = app.clone();
            device_tasks.push(tokio::spawn(async move {
                let program = get_adb_program(&app_clone);
                let mut cmd = new_tokio_command(&program);
                let script = "getprop ro.product.model; echo '---SEP---'; getprop ro.build.version.release; echo '---SEP---'; dumpsys battery; echo '---SEP---'; cat /proc/meminfo || dumpsys meminfo; echo '---SEP---'; df -k /data; echo '---SEP---'; pm list packages com.lucasdeeiroz.robotrunner";
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
                
                let mut battery_level = parts.get(2)
                    .and_then(|s| parse_battery_info(s))
                    .map(|(lvl, _, _, _)| lvl);

                let (mut ram_total, mut ram_used) = parts.get(3)
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

                let is_companion_installed = parts.get(5).map(|s| s.contains("com.lucasdeeiroz.robotrunner"));
                let companion_port = if is_companion_installed == Some(true) { Some(9876) } else { None };

                let mut is_companion_active = None;
                let mut battery_temp = None;
                let mut is_charging = None;
                let mut wifi_ip = if udid.contains(':') { Some(udid.split(':').next().unwrap_or("").to_string()) } else { None };

                // Try Companion HTTP bridge for live telemetry (<10ms)
                if is_companion_installed == Some(true) {
                    let _ = crate::companion::start_companion_forward(app_clone.clone(), udid.clone(), Some(9876), Some(9876)).await;
                    let comp_url = "http://127.0.0.1:9876/device/info".to_string();
                    if let Ok(client) = reqwest::Client::builder().timeout(std::time::Duration::from_millis(1500)).build() {
                        if let Ok(resp) = client.get(&comp_url).send().await {
                            if resp.status().is_success() {
                                if let Ok(val) = resp.json::<serde_json::Value>().await {
                                    if val.get("status").and_then(|s| s.as_str()) == Some("ok") {
                                        is_companion_active = Some(true);
                                        if let Some(b) = val.get("battery_level").and_then(|v| v.as_i64()) {
                                            if b >= 0 { battery_level = Some(b as u8); }
                                        }
                                        if let Some(t) = val.get("battery_temp").and_then(|v| v.as_f64()) {
                                            if t > 0.0 { battery_temp = Some(t as f32); }
                                        }
                                        if let Some(c) = val.get("is_charging").and_then(|v| v.as_bool()) {
                                            is_charging = Some(c);
                                        }
                                        if let Some(ip) = val.get("wifi_ip").and_then(|v| v.as_str()) {
                                            if !ip.is_empty() { wifi_ip = Some(ip.to_string()); }
                                        }
                                        if let (Some(tot_mb), Some(avail_mb)) = (val.get("total_ram_mb").and_then(|v| v.as_i64()), val.get("avail_ram_mb").and_then(|v| v.as_i64())) {
                                            if tot_mb > 0 {
                                                ram_total = (tot_mb * 1024 * 1024) as u64;
                                                ram_used = ((tot_mb.saturating_sub(avail_mb)) * 1024 * 1024) as u64;
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                    if is_companion_active.is_none() {
                        is_companion_active = Some(false);
                    }
                }

                Device {
                    udid,
                    model,
                    state,
                    android_version,
                    battery_level,
                    battery_temp,
                    is_charging,
                    wifi_ip,
                    ram_total: if ram_total > 0 { Some(ram_total) } else { None },
                    ram_used: if ram_used > 0 { Some(ram_used) } else { None },
                    storage_total: if storage_total > 0 { Some(storage_total) } else { None },
                    storage_used: if storage_used > 0 { Some(storage_used) } else { None },
                    is_companion_installed,
                    is_companion_active,
                    companion_port,
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

#[derive(Debug, Serialize, Deserialize)]
pub struct FleetDeviceHealth {
    pub udid: String,
    pub model: String,
    pub is_companion_active: bool,
    pub battery_level: i32,
    pub battery_temp: f32,
    pub is_charging: bool,
    pub wifi_ip: String,
    pub ram_total_mb: i32,
    pub ram_avail_mb: i32,
    pub android_version: String,
}

#[tauri::command]
pub async fn adb_pair_device(app: AppHandle, ip: String, port: String, code: String) -> Result<String, String> {
    let program = get_adb_program(&app);
    let target = format!("{}:{}", ip.trim(), port.trim());
    let mut cmd = new_tokio_command(&program);
    cmd.args(["pair", &target, code.trim()]);

    let output = cmd
        .output()
        .await
        .map_err(|e| format!("Failed to run adb pair: {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();

    if output.status.success() || stdout.contains("Successfully paired") {
        let mut conn_cmd = new_tokio_command(&program);
        conn_cmd.args(["connect", &target]);
        let _ = conn_cmd.output().await;

        Ok(format!("Successfully paired and connected to {}", target))
    } else {
        Err(format!("Pairing failed: {} {}", stdout, stderr))
    }
}

#[tauri::command]
pub async fn get_fleet_health(app: AppHandle) -> Result<Vec<FleetDeviceHealth>, String> {
    let devices = get_connected_devices(app.clone()).await?;
    let mut health_list = Vec::new();

    for dev in devices {
        let udid = dev.udid.clone();
        let model = dev.model.clone();

        let mut is_companion_active = false;
        let mut battery_level = dev.battery_level.map(|b| b as i32).unwrap_or(-1);
        let mut battery_temp = 0.0f32;
        let mut is_charging = false;
        let mut wifi_ip = if dev.udid.contains(':') { dev.udid.split(':').next().unwrap_or("").to_string() } else { String::new() };
        let mut ram_total_mb = dev.ram_total.map(|r| (r / (1024 * 1024)) as i32).unwrap_or(0);
        let mut ram_avail_mb = dev.ram_used.zip(dev.ram_total).map(|(u, t)| ((t.saturating_sub(u)) / (1024 * 1024)) as i32).unwrap_or(0);
        let mut android_version = dev.android_version.unwrap_or_default();

        let _ = crate::companion::start_companion_forward(app.clone(), udid.clone(), Some(9876), Some(9876)).await;
        let comp_url = "http://127.0.0.1:9876/device/info".to_string();
        if let Ok(client) = reqwest::Client::builder().timeout(std::time::Duration::from_millis(1500)).build() {
            if let Ok(resp) = client.get(&comp_url).send().await {
                if resp.status().is_success() {
                    if let Ok(val) = resp.json::<serde_json::Value>().await {
                        if val.get("status").and_then(|s| s.as_str()) == Some("ok") {
                            is_companion_active = true;
                            if let Some(b) = val.get("battery_level").and_then(|v| v.as_i64()) { battery_level = b as i32; }
                            if let Some(t) = val.get("battery_temp").and_then(|v| v.as_f64()) { battery_temp = t as f32; }
                            if let Some(c) = val.get("is_charging").and_then(|v| v.as_bool()) { is_charging = c; }
                            if let Some(ip) = val.get("wifi_ip").and_then(|v| v.as_str()) { if !ip.is_empty() { wifi_ip = ip.to_string(); } }
                            if let Some(tot) = val.get("total_ram_mb").and_then(|v| v.as_i64()) { ram_total_mb = tot as i32; }
                            if let Some(avail) = val.get("avail_ram_mb").and_then(|v| v.as_i64()) { ram_avail_mb = avail as i32; }
                            if let Some(ver) = val.get("android_version").and_then(|v| v.as_str()) { android_version = ver.to_string(); }
                        }
                    }
                }
            }
        }

        health_list.push(FleetDeviceHealth {
            udid,
            model,
            is_companion_active,
            battery_level,
            battery_temp,
            is_charging,
            wifi_ip,
            ram_total_mb,
            ram_avail_mb,
            android_version,
        });
    }

    Ok(health_list)
}

#[tauri::command]
pub async fn get_host_local_ip() -> Result<String, String> {
    let socket = std::net::UdpSocket::bind("0.0.0.0:0").map_err(|e| e.to_string())?;
    socket.connect("8.8.8.8:80").map_err(|e| e.to_string())?;
    let local_ip = socket.local_addr().map_err(|e| e.to_string())?.ip().to_string();
    Ok(local_ip)
}
