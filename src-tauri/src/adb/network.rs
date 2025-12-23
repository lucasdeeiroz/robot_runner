use std::process::Command;
// use crate::adb::check_adb_path; // Removed

#[tauri::command]
pub async fn get_device_ip(serial: String) -> Result<String, String> {
    let adb_path = "adb";

    // Strategy 1: ip route (reliable on most modern Androids)
    let mut cmd_route = Command::new(&adb_path);
    cmd_route.args(&["-s", &serial, "shell", "ip", "route"]);
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        cmd_route.creation_flags(0x08000000);
    }
    let output = cmd_route.output().map_err(|e| e.to_string())?;

    if output.status.success() {
        let stdout = String::from_utf8_lossy(&output.stdout);
        // Look for line containing "wlan0" and extract the src IP
        // Example output: "192.168.1.0/24 dev wlan0 proto kernel scope link src 192.168.1.5"
        for line in stdout.lines() {
            if line.contains("wlan0") && line.contains("src") {
                let parts: Vec<&str> = line.split_whitespace().collect();
                if let Some(pos) = parts.iter().position(|&x| x == "src") {
                    if let Some(ip) = parts.get(pos + 1) {
                        return Ok(ip.to_string());
                    }
                }
            }
        }
    }

    // Strategy 2: ifconfig (older devices)
    let mut cmd_ifconfig = Command::new(&adb_path);
    cmd_ifconfig.args(&["-s", &serial, "shell", "ifconfig", "wlan0"]);
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        cmd_ifconfig.creation_flags(0x08000000);
    }
    let output_ifconfig = cmd_ifconfig.output().map_err(|e| e.to_string())?;

    if output_ifconfig.status.success() {
        let stdout = String::from_utf8_lossy(&output_ifconfig.stdout);
        // Example: "inet addr:192.168.1.5 ..."
        if let Some(start) = stdout.find("inet addr:") {
            let rest = &stdout[start + 10..];
            if let Some(end) = rest.find(' ') {
                return Ok(rest[0..end].to_string());
            }
        }
    }

    Err("Could not detect device IP via ADB".to_string())
}
