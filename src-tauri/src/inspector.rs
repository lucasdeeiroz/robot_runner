use crate::cmd_utils::new_tokio_command;
use base64::{engine::general_purpose, Engine as _};
use tauri::command;
use std::sync::Mutex;
use once_cell::sync::Lazy;

struct WebCaptureCache {
    url: String,           // Actual URL from browser
    requested_url: String, // URL the frontend asked for
    screenshot: String,
    xml: String,
    timestamp: std::time::Instant,
}

static CAPTURE_CACHE: Lazy<Mutex<Option<WebCaptureCache>>> = Lazy::new(|| Mutex::new(None));

fn is_web_device(device_id: &str) -> bool {
    let id = device_id.to_lowercase();
    id == "chrome"
        || id == "edge"
        || id == "firefox"
        || id == "headless-chrome"
        || id == "headless-firefox"
        || id.contains("browser")
        || id.contains("web")
}

fn normalize_url(url: &str) -> String {
    let mut u = url.trim().to_lowercase();
    if u.starts_with("https://") {
        u = u["https://".len()..].to_string();
    } else if u.starts_with("http://") {
        u = u["http://".len()..].to_string();
    }
    if u.starts_with("www.") {
        u = u["www.".len()..].to_string();
    }
    if u.ends_with('/') {
        u.pop();
    }
    u
}

async fn perform_web_capture(url: &str, browser: &str) -> Result<(String, String), String> {
    // 1. Check cache first
    {
        let cache_lock = CAPTURE_CACHE.lock().unwrap();
        if let Some(ref cache) = *cache_lock {
            // Hit cache ONLY if requested URL matches AND browser URL matches AND it's recent
            if cache.requested_url == url && cache.timestamp.elapsed() < std::time::Duration::from_millis(1500) {
                return Ok((cache.screenshot.clone(), cache.xml.clone()));
            }
        }
    }

    // 2. Perform fresh capture using scripts/web_capture.cjs
    let mut script_path = std::path::PathBuf::from("scripts/web_capture.cjs");
    if !script_path.exists() {
        // Try parent directory
        let parent_path = std::path::PathBuf::from("../scripts/web_capture.cjs");
        if parent_path.exists() {
            script_path = parent_path;
        } else {
            // Let's walk up from the current directory to find it
            if let Ok(current) = std::env::current_dir() {
                let mut p = current.clone();
                let mut found = false;
                for _ in 0..4 {
                    let test_path = p.join("scripts/web_capture.cjs");
                    if test_path.exists() {
                        script_path = test_path;
                        found = true;
                        break;
                    }
                    if !p.pop() {
                        break;
                    }
                }
                if !found {
                    return Err(format!(
                        "Could not find scripts/web_capture.cjs. Current dir: {:?}",
                        current
                     ));
                }
            } else {
                return Err("Failed to get current directory to locate web_capture.cjs".to_string());
            }
        }
    }

    let mut force_navigate = "false";
    {
        let cache_lock = CAPTURE_CACHE.lock().unwrap();
        if let Some(ref cache) = *cache_lock {
            // Force navigation ONLY if the requested URL is DIFFERENT from the last one requested.
            // If browser URL changed naturally, requested_url will still match the previous one,
            // so we won't force it back.
            if normalize_url(url) != normalize_url(&cache.requested_url) {
                force_navigate = "true";
            }
        } else {
            // No cache yet, first navigation
            force_navigate = "true";
        }
    }

    let mut cmd = new_tokio_command("node");
    cmd.arg(script_path.to_string_lossy().to_string());
    cmd.arg(url);
    cmd.arg(browser);
    cmd.arg(force_navigate);

    let output = cmd.output().await
        .map_err(|e| format!("Failed to run web_capture.cjs: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Web capture script failed: {}", stderr));
    }

    let stdout_str = String::from_utf8_lossy(&output.stdout);
    
    // Parse output JSON
    #[derive(serde::Deserialize)]
    struct CaptureResult {
        screenshot: Option<String>,
        xml: Option<String>,
        url: Option<String>,
        error: Option<String>,
    }

    let result: CaptureResult = serde_json::from_str(&stdout_str)
        .map_err(|e| format!("Failed to parse web capture output JSON: {}. Raw output: {}", e, stdout_str))?;

    if let Some(err) = result.error {
        return Err(format!("Browser capture error: {}", err));
    }

    let screenshot = result.screenshot.ok_or_else(|| "Missing screenshot in web capture output".to_string())?;
    let xml = result.xml.ok_or_else(|| "Missing xml in web capture output".to_string())?;
    let actual_url = result.url.unwrap_or_else(|| url.to_string());

    // 3. Update cache
    {
        let mut cache_lock = CAPTURE_CACHE.lock().unwrap();
        *cache_lock = Some(WebCaptureCache {
            url: actual_url,
            requested_url: url.to_string(),
            screenshot: screenshot.clone(),
            xml: xml.clone(),
            timestamp: std::time::Instant::now(),
        });
    }

    Ok((screenshot, xml))
}


#[command]
pub async fn get_screenshot(device_id: String, web_url: Option<String>) -> Result<String, String> {
    if is_web_device(&device_id) {
        let url = web_url.unwrap_or_else(|| "https://google.com".to_string());
        let (screenshot, _) = perform_web_capture(&url, &device_id).await?;
        return Ok(screenshot);
    }

    // 1. Run adb exec-out screencap -p
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

    Ok(b64)
}

#[command]
pub async fn get_compressed_screenshot(device_id: String, max_width: Option<u32>, max_height: Option<u32>, web_url: Option<String>) -> Result<String, String> {
    use crate::image_utils;

    if is_web_device(&device_id) {
        let url = web_url.unwrap_or_else(|| "https://google.com".to_string());
        let (screenshot, _) = perform_web_capture(&url, &device_id).await?;
        
        // Decode base64 PNG screenshot to binary to resize and compress it
        let img_bytes = general_purpose::STANDARD.decode(&screenshot)
            .map_err(|e| format!("Failed to decode base64 screenshot: {}", e))?;

        let w = max_width.unwrap_or(800);
        let h = max_height.unwrap_or(800);
        
        return image_utils::compress_and_resize_image(img_bytes, w, h, 80)
            .map_err(|e| format!("Image processing failed: {}", e));
    }

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

    let w = max_width.unwrap_or(800);
    let h = max_height.unwrap_or(800);
    
    image_utils::compress_and_resize_image(output.stdout, w, h, 80)
        .map_err(|e| format!("Image processing failed: {}", e))
}

#[command]
pub async fn get_xml_dump(device_id: String, web_url: Option<String>) -> Result<String, String> {
    if is_web_device(&device_id) {
        let url = web_url.unwrap_or_else(|| "https://google.com".to_string());
        let (_, xml) = perform_web_capture(&url, &device_id).await?;
        return Ok(xml);
    }

    // 1. Run uiautomator dump (with retries)
    let mut attempts = 0;
    let max_attempts = 4;

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
                        .args(&[
                            "-s",
                            &device_id,
                            "shell",
                            "rm",
                            "/data/local/tmp/window_dump.xml",
                        ])
                        .output()
                        .await;
                    let _ = new_tokio_command("adb")
                        .args(&["-s", &device_id, "shell", "pkill", "uiautomator"])
                        .output()
                        .await;

                    // Also try to stop appium server if it's hanging
                    let _ = new_tokio_command("adb")
                        .args(&[
                            "-s",
                            &device_id,
                            "shell",
                            "am",
                            "force-stop",
                            "io.appium.uiautomator2.server",
                        ])
                        .output()
                        .await;
                    let _ = new_tokio_command("adb")
                        .args(&[
                            "-s",
                            &device_id,
                            "shell",
                            "am",
                            "force-stop",
                            "io.appium.uiautomator2.server.test",
                        ])
                        .output()
                        .await;
                }
            }
            Err(e) => {
                eprintln!(
                    "Failed to execute adb command (attempt {}/{}): {}",
                    attempts, max_attempts, e
                );
                if attempts >= max_attempts {
                    return Err(format!("Failed to execute uiautomator dump command: {}", e));
                }
            }
        }

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

    let xml_content = String::from_utf8_lossy(&cat_cmd.stdout).to_string();
    Ok(xml_content)
}

#[command]
pub async fn send_web_input(action_type: String, x: i32, y: i32, end_x: Option<i32>, end_y: Option<i32>, web_url: Option<String>) -> Result<(), String> {
    let mut script_path = std::path::PathBuf::from("scripts/web_interaction.cjs");
    if !script_path.exists() {
        let parent_path = std::path::PathBuf::from("../scripts/web_interaction.cjs");
        if parent_path.exists() {
            script_path = parent_path;
        } else {
            if let Ok(current) = std::env::current_dir() {
                let mut p = current.clone();
                let mut found = false;
                for _ in 0..4 {
                    let test_path = p.join("scripts/web_interaction.cjs");
                    if test_path.exists() {
                        script_path = test_path;
                        found = true;
                        break;
                    }
                    if !p.pop() {
                        break;
                    }
                }
                if !found {
                    return Err("Could not find scripts/web_interaction.cjs".to_string());
                }
            } else {
                return Err("Failed to get current directory to locate web_interaction.cjs".to_string());
            }
        }
    }

    let mut cmd = new_tokio_command("node");
    cmd.arg(script_path.to_string_lossy().to_string());
    cmd.arg(action_type);
    cmd.arg(x.to_string());
    cmd.arg(y.to_string());
    if let Some(ex) = end_x {
        cmd.arg(ex.to_string());
    } else {
        cmd.arg("0");
    }
    if let Some(ey) = end_y {
        cmd.arg(ey.to_string());
    } else {
        cmd.arg("0");
    }
    if let Some(url) = web_url {
        cmd.arg(url);
    }

    let output = cmd.output().await
        .map_err(|e| format!("Failed to run web_interaction.cjs: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Web interaction script failed: {}", stderr));
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_perform_web_capture_resolves_path() {
        // Try perform_web_capture with a simple website (Google)
        // This will verify that scripts/web_capture.cjs is found, loaded, and runs without error.
        // We use "headless-chrome" for tests.
        let result = perform_web_capture("https://google.com", "headless-chrome").await;
        
        // Assert that we don't get a "Could not find scripts/web_capture.cjs" or "Failed to run" error
        assert!(result.is_ok(), "Web capture failed: {:?}", result.err());
        
        let (screenshot, xml) = result.unwrap();
        assert!(!screenshot.is_empty(), "Screenshot should not be empty");
        assert!(!xml.is_empty(), "XML dump should not be empty");
        assert!(xml.contains("hierarchy"), "XML dump should be a valid hierarchy");
    }
}


