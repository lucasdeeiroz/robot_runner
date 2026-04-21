use serde::{Deserialize, Serialize};
use crate::cmd_utils::new_tokio_command;

#[derive(Debug, Serialize, Deserialize)]
pub struct Device {
    pub udid: String,
    pub model: String,
    pub state: String, // "device", "offline", "unauthorized"
    pub product: String,
    pub transport_id: String,
    pub android_version: Option<String>,
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
        return Err(AppError::AdbError(String::from_utf8_lossy(&output.stderr).to_string()));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut devices = Vec::new();

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
            // Get model
            let mut model_cmd = new_tokio_command("adb");
            model_cmd.args(&["-s", &udid, "shell", "getprop", "ro.product.model"]);
            let model_output = model_cmd.output().await;

            let model = match model_output {
                Ok(out) => String::from_utf8_lossy(&out.stdout).trim().to_string(),
                Err(_) => "Unknown".to_string(),
            };

            // Get Android Version
            let mut ver_cmd = new_tokio_command("adb");
            ver_cmd.args(&["-s", &udid, "shell", "getprop", "ro.build.version.release"]);
            let ver_output = ver_cmd.output().await;

            let android_version = match ver_output {
                Ok(out) => String::from_utf8_lossy(&out.stdout).trim().to_string(),
                Err(_) => "Unknown".to_string(),
            };

            devices.push(Device {
                udid,
                model,
                state,
                product: "".to_string(),
                transport_id: "".to_string(),
                android_version: Some(android_version),
            });
        } else {
            devices.push(Device {
                udid,
                model: "Unknown".to_string(),
                state,
                product: "".to_string(),
                transport_id: "".to_string(),
                android_version: None,
            });
        }
    }

    Ok(devices)
}
