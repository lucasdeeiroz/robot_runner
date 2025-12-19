use serde::{Deserialize, Serialize};
use std::process::Command;

#[derive(Debug, Serialize, Deserialize)]
pub struct Device {
    pub udid: String,
    pub model: String,
    pub state: String, // "device", "offline", "unauthorized"
    pub product: String,
    pub transport_id: String,
}

#[tauri::command]
pub fn get_connected_devices() -> Result<Vec<Device>, String> {
    let output = Command::new("adb")
        .args(&["devices", "-l"])
        .output()
        .map_err(|e| format!("Failed to execute adb: {}", e))?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
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
            // Get model and other details
            let model_output = Command::new("adb")
                .args(&["-s", &udid, "shell", "getprop ro.product.model"])
                .output();

            let model = match model_output {
                Ok(out) => String::from_utf8_lossy(&out.stdout).trim().to_string(),
                Err(_) => "Unknown".to_string(),
            };

             devices.push(Device {
                udid,
                model,
                state,
                product: "".to_string(), // Placeholder, not always needed
                transport_id: "".to_string(),
            });
        } else {
             devices.push(Device {
                udid,
                model: "Unknown".to_string(),
                state,
                product: "".to_string(),
                transport_id: "".to_string(),
            });
        }
    }

    Ok(devices)
}
