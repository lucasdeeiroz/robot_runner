use tauri::command;
use std::process::Command;
use base64::{Engine as _, engine::general_purpose};

#[command]
pub async fn get_screenshot(device_id: String) -> Result<String, String> {
    // 1. Run adb exec-out screencap -p
    // Usage of exec-out is better for binary data transfer without shell mangling
    let mut cmd = Command::new("adb");
    cmd.args(&["-s", &device_id, "exec-out", "screencap", "-p"]);
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000);
    }
    let output = cmd.output().map_err(|e| format!("Failed to execute adb screencap: {}", e))?;

    if !output.status.success() {
        return Err(format!(
            "ADB screencap failed: {}",
            String::from_utf8_lossy(&output.stderr)
        ));
    }

    // 2. Encode to Base64
    let b64 = general_purpose::STANDARD.encode(&output.stdout);
    
    // Return base64 string (client can prefix with data:image/png;base64,)
    Ok(b64)
}

#[command]
pub async fn get_xml_dump(device_id: String) -> Result<String, String> {
    // 1. Run uiautomator dump
    // We strictly use /data/local/tmp to avoid permission issues
    let mut cmd = Command::new("adb");
    cmd.args(&["-s", &device_id, "shell", "uiautomator", "dump", "/data/local/tmp/window_dump.xml"]);
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000);
    }
    let dump_cmd = cmd.output().map_err(|e| format!("Failed to execute uiautomator dump: {}", e))?;

    if !dump_cmd.status.success() {
        // Some devices print "UI hierchary dumped to..." in stdout even on success, 
        // but if exit code is non-zero, it's a real error.
        // NOTE: uiautomator dump sometimes is flaky or screen is busy.
        return Err(format!(
            "uiautomator dump failed: {}",
            String::from_utf8_lossy(&dump_cmd.stderr)
        ));
    }

    // 2. Cat the file
    let mut cmd_cat = Command::new("adb");
    cmd_cat.args(&["-s", &device_id, "shell", "cat", "/data/local/tmp/window_dump.xml"]);
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        cmd_cat.creation_flags(0x08000000);
    }
    let cat_cmd = cmd_cat.output().map_err(|e| format!("Failed to cat window_dump.xml: {}", e))?;

    if !cat_cmd.status.success() {
        return Err(format!(
            "Failed to read dump file: {}",
            String::from_utf8_lossy(&cat_cmd.stderr)
        ));
    }

    // 3. Return XML string
    let xml_content = String::from_utf8_lossy(&cat_cmd.stdout).to_string();
    Ok(xml_content)
}
