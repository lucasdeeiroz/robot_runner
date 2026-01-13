use std::process::Command;
use tauri::command;

#[command]
pub fn adb_connect(ip: String, port: String) -> Result<String, String> {
    let target = format!("{}:{}", ip, port);
    // println!("ADB Connecting to {}", target);

    let mut cmd = Command::new("adb");
    cmd.args(&["connect", &target]);
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000);
    }
    let output = cmd
        .output()
        .map_err(|e| format!("Failed to execute adb: {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();

    // ADB connect often returns 0 even on failure to connect, but prints "unable to connect"
    if !output.status.success()
        || stdout.contains("unable to connect")
        || stdout.contains("failed to connect")
        || stdout.contains("cannot connect to")
    {
        return Err(format!("Connection failed: {} {}", stdout, stderr));
    }

    Ok(stdout)
}

#[command]
pub fn adb_pair(ip: String, port: String, code: String) -> Result<String, String> {
    let target = format!("{}:{}", ip, port);
    // println!("ADB Pairing with {} using code {}", target, code);

    let mut cmd = Command::new("adb");
    cmd.args(&["pair", &target, &code]);
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000);
    }
    let output = cmd
        .output()
        .map_err(|e| format!("Failed to execute adb: {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();

    if !output.status.success() {
        return Err(format!("Pairing failed: {} {}", stdout, stderr));
    }

    Ok(stdout)
}

#[command]
pub fn adb_disconnect(ip: String, port: String) -> Result<String, String> {
    let mut cmd = Command::new("adb");
    let target = format!("{}:{}", ip, port);
    cmd.args(&["disconnect", &target]);

    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000);
    }
    let output = cmd
        .output()
        .map_err(|e| format!("Failed to execute adb: {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    Ok(stdout)
}

#[command]
pub fn adb_disconnect_all() -> Result<String, String> {
    let mut cmd = Command::new("adb");
    cmd.arg("disconnect");

    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000);
    }
    let output = cmd
        .output()
        .map_err(|e| format!("Failed to execute adb: {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();

    if !output.status.success() {
        return Err(format!("Disconnect All failed: {} {}", stdout, stderr));
    }

    Ok(stdout)
}
