use base64::{engine::general_purpose, Engine as _};
use tauri::command;
use crate::cmd_utils::new_tokio_command;

#[command]
pub async fn get_screenshot(device_id: String) -> Result<String, String> {
    // 1. Run adb exec-out screencap -p
    // Usage of exec-out is better for binary data transfer without shell mangling
    let mut cmd = new_tokio_command("adb");
    cmd.args(&["-s", &device_id, "exec-out", "screencap", "-p"]);

    let output = cmd
        .output()
        .await
        .map_err(|e| format!("Failed to execute adb screencap: {}", e))?;

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
    // 1. Run uiautomator dump (with retries)
    let mut attempts = 0;
    let max_attempts = 4; // Increased to 4 to allow comprehensive cleanup
    
    loop {
        attempts += 1;
        
        let mut cmd = new_tokio_command("adb");
        cmd.args(&[
            "-s",
            &device_id,
            "shell",
            "uiautomator",
            "dump",
            "/data/local/tmp/window_dump.xml",
        ]);
        
        match cmd.output().await {
            Ok(output) => {
                if output.status.success() {
                    break;
                } else {
                    let stderr = String::from_utf8_lossy(&output.stderr);
                    let stdout = String::from_utf8_lossy(&output.stdout);
                    
                    if attempts >= max_attempts {
                        return Err(format!("uiautomator dump failed: {} {}", stderr, stdout));
                    }

                    // cleanup before retry
                    let _ = new_tokio_command("adb")
                        .args(&["-s", &device_id, "shell", "rm", "/data/local/tmp/window_dump.xml"])
                        .output()
                        .await;
                    let _ = new_tokio_command("adb")
                        .args(&["-s", &device_id, "shell", "pkill", "uiautomator"])
                        .output()
                        .await;
                    
                    // Also try to stop appium server if it's hanging
                    let _ = new_tokio_command("adb")
                        .args(&["-s", &device_id, "shell", "am", "force-stop", "io.appium.uiautomator2.server"])
                        .output()
                        .await;
                    let _ = new_tokio_command("adb")
                        .args(&["-s", &device_id, "shell", "am", "force-stop", "io.appium.uiautomator2.server.test"])
                        .output()
                        .await;
                }
            }
            Err(e) => {
                eprintln!("Failed to execute adb command (attempt {}/{}): {}", attempts, max_attempts, e);
                if attempts >= max_attempts {
                    return Err(format!("Failed to execute uiautomator dump command: {}", e));
                }
            }
        }
        
        // Wait a bit before retry using tokio sleep for async functions
        tokio::time::sleep(std::time::Duration::from_millis(1500)).await;
    }

    // 2. Cat the file
    let mut cmd_cat = new_tokio_command("adb");
    cmd_cat.args(&[
        "-s",
        &device_id,
        "shell",
        "cat",
        "/data/local/tmp/window_dump.xml",
    ]);
    
    let cat_cmd = cmd_cat
        .output()
        .await
        .map_err(|e| format!("Failed to cat window_dump.xml: {}", e))?;

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
