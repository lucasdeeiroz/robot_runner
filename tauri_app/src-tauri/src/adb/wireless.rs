use tauri::command;
use std::process::Command;

#[command]
pub fn adb_connect(ip: String, port: String) -> Result<String, String> {
    let target = format!("{}:{}", ip, port);
    println!("ADB Connecting to {}", target);
    
    let output = Command::new("adb")
        .args(&["connect", &target])
        .output()
        .map_err(|e| format!("Failed to execute adb: {}", e))?;
        
    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();
    
    // ADB connect often returns 0 even on failure to connect, but prints "unable to connect"
    if !output.status.success() || stdout.contains("unable to connect") || stdout.contains("failed to connect") {
        return Err(format!("Connection failed: {} {}", stdout, stderr));
    }
    
    Ok(stdout)
}

#[command]
pub fn adb_pair(ip: String, port: String, code: String) -> Result<String, String> {
    let target = format!("{}:{}", ip, port);
    println!("ADB Pairing with {} using code {}", target, code);
    
    let output = Command::new("adb")
        .args(&["pair", &target, &code])
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
    let target = format!("{}:{}", ip, port);
    let output = Command::new("adb")
        .args(&["disconnect", &target])
        .output()
        .map_err(|e| format!("Failed to execute adb: {}", e))?;
        
    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    Ok(stdout)
}
