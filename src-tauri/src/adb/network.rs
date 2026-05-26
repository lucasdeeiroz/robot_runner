use crate::cmd_utils::{new_tokio_command, get_adb_program};
use tauri::AppHandle;

#[tauri::command]
pub async fn get_device_ip(app: AppHandle, device: String) -> Result<String, String> {
    let program = get_adb_program(&app);
    // Method 1: ip addr show wlan0
    let mut cmd1 = new_tokio_command(&program);
    cmd1.args(&["-s", &device, "shell", "ip", "addr", "show", "wlan0"]);
    
    if let Ok(output) = cmd1.output().await {
        let stdout = String::from_utf8_lossy(&output.stdout);
        for line in stdout.lines() {
            if line.contains("inet ") {
                let parts: Vec<&str> = line.split_whitespace().collect();
                if parts.len() >= 2 {
                    if let Some(ip) = parts[1].split('/').next() {
                        return Ok(ip.to_string());
                    }
                }
            }
        }
    }

    // Method 2: getprop dhcp.wlan0.ipaddress
    let mut cmd2 = new_tokio_command(&program);
    cmd2.args(&["-s", &device, "shell", "getprop", "dhcp.wlan0.ipaddress"]);
    if let Ok(output) = cmd2.output().await {
        let ip = String::from_utf8_lossy(&output.stdout).trim().to_string();
        if !ip.is_empty() {
            return Ok(ip);
        }
    }

    // Method 3: ifconfig wlan0
    let mut cmd3 = new_tokio_command(&program);
    cmd3.args(&["-s", &device, "shell", "ifconfig", "wlan0"]);
    if let Ok(output) = cmd3.output().await {
        let stdout = String::from_utf8_lossy(&output.stdout);
        for line in stdout.lines() {
            if line.contains("inet addr:") {
                let parts: Vec<&str> = line.split(':').collect();
                if parts.len() >= 2 {
                    let ip = parts[1].split_whitespace().next().unwrap_or("");
                    if !ip.is_empty() {
                        return Ok(ip.to_string());
                    }
                }
            }
        }
    }

    Err("Could not find device IP address".to_string())
}
