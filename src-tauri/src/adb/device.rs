use serde::{Deserialize, Serialize};
use std::process::Command;

#[derive(Debug, Serialize, Deserialize)]
pub struct Device {
    pub udid: String,
    pub model: String,
    pub state: String, // "device", "offline", "unauthorized"
    pub product: String,
    pub transport_id: String,
    pub android_version: Option<String>,
}

#[tauri::command]
pub fn get_connected_devices() -> Result<Vec<Device>, String> {
    let mut cmd = Command::new("adb");
    cmd.args(&["devices", "-l"]);
    
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000); 
    }

    let output = cmd.output()
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
            // Get model
            let mut model_cmd = Command::new("adb");
            model_cmd.args(&["-s", &udid, "shell", "getprop", "ro.product.model"]);
            #[cfg(target_os = "windows")]
            {
                use std::os::windows::process::CommandExt;
                model_cmd.creation_flags(0x08000000);
            }
            let model_output = model_cmd.output();

            let model = match model_output {
                Ok(out) => String::from_utf8_lossy(&out.stdout).trim().to_string(),
                Err(_) => "Unknown".to_string(),
            };

            // Get Android Version
            let mut ver_cmd = Command::new("adb");
            ver_cmd.args(&["-s", &udid, "shell", "getprop", "ro.build.version.release"]);
            #[cfg(target_os = "windows")]
            {
                use std::os::windows::process::CommandExt;
                ver_cmd.creation_flags(0x08000000);
            }
            let ver_output = ver_cmd.output();

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
