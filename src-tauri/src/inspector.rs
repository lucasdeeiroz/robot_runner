use crate::cmd_utils::new_tokio_command;
use base64::{engine::general_purpose, Engine as _};
use tauri::{command, Manager};
use std::sync::Mutex;
use once_cell::sync::Lazy;

struct WebCaptureCache {
    requested_url: String,
    screenshot: String,
    xml: String,
    timestamp: std::time::Instant,
}

static CAPTURE_CACHE: Lazy<Mutex<Option<WebCaptureCache>>> = Lazy::new(|| Mutex::new(None));

struct WebRecordingState {
    child: tokio::process::Child,
    frames_dir: std::path::PathBuf,
    stop_file: std::path::PathBuf,
}

static WEB_RECORDING_STATE: Lazy<Mutex<Option<WebRecordingState>>> = Lazy::new(|| Mutex::new(None));

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

fn find_script(name: &str, app_handle: Option<&tauri::AppHandle>) -> Result<std::path::PathBuf, String> {
    if let Some(handle) = app_handle {
        if let Ok(resource_dir) = handle.path().resource_dir() {
            let resource_candidate = resource_dir.join("scripts").join(name);
            if resource_candidate.exists() {
                return Ok(resource_candidate);
            }
            let fallback_resource_candidate = resource_dir.join(name);
            if fallback_resource_candidate.exists() {
                return Ok(fallback_resource_candidate);
            }
        }
    }

    let direct = std::path::PathBuf::from(format!("scripts/{}", name));
    if direct.exists() {
        return Ok(direct);
    }
    let parent = std::path::PathBuf::from(format!("../scripts/{}", name));
    if parent.exists() {
        return Ok(parent);
    }
    Err(format!("Could not find scripts/{}", name))
}

async fn perform_web_capture(url: &str, browser: &str, app_handle: Option<&tauri::AppHandle>) -> Result<(String, String), String> {
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
    let script_path = find_script("web_capture.cjs", app_handle)?;

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
        error: Option<String>,
    }

    let result: CaptureResult = serde_json::from_str(&stdout_str)
        .map_err(|e| format!("Failed to parse web capture output JSON: {}. Raw output: {}", e, stdout_str))?;

    if let Some(err) = result.error {
        return Err(format!("Browser capture error: {}", err));
    }

    let screenshot = result.screenshot.ok_or_else(|| "Missing screenshot in web capture output".to_string())?;
    let xml = result.xml.ok_or_else(|| "Missing xml in web capture output".to_string())?;

    // 3. Update cache
    {
        let mut cache_lock = CAPTURE_CACHE.lock().unwrap();
        *cache_lock = Some(WebCaptureCache {
            requested_url: url.to_string(),
            screenshot: screenshot.clone(),
            xml: xml.clone(),
            timestamp: std::time::Instant::now(),
        });
    }

    Ok((screenshot, xml))
}


#[command]
pub async fn get_screenshot(app_handle: tauri::AppHandle, device_id: String, web_url: Option<String>) -> Result<String, String> {
    if is_web_device(&device_id) {
        let url = web_url.unwrap_or_else(|| "https://google.com".to_string());
        let (screenshot, _) = perform_web_capture(&url, &device_id, Some(&app_handle)).await?;
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
pub async fn get_compressed_screenshot(app_handle: tauri::AppHandle, device_id: String, max_width: Option<u32>, max_height: Option<u32>, web_url: Option<String>) -> Result<String, String> {
    use crate::image_utils;

    if is_web_device(&device_id) {
        let url = web_url.unwrap_or_else(|| "https://google.com".to_string());
        let (screenshot, _) = perform_web_capture(&url, &device_id, Some(&app_handle)).await?;
        
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
pub async fn get_xml_dump(app_handle: tauri::AppHandle, device_id: String, web_url: Option<String>) -> Result<String, String> {
    if is_web_device(&device_id) {
        let url = web_url.unwrap_or_else(|| "https://google.com".to_string());
        let (_, xml) = perform_web_capture(&url, &device_id, Some(&app_handle)).await?;
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
pub async fn send_web_input(app_handle: tauri::AppHandle, action_type: String, x: i32, y: i32, end_x: Option<i32>, end_y: Option<i32>, web_url: Option<String>) -> Result<(), String> {
    // Invalidate the cache's timestamp to force a fresh capture on the next refresh,
    // but preserve the requested_url to avoid triggering a forced navigate back.
    {
        let mut cache_lock = CAPTURE_CACHE.lock().unwrap();
        if let Some(ref mut cache) = *cache_lock {
            cache.timestamp = std::time::Instant::now() - std::time::Duration::from_secs(60);
        }
    }

    let script_path = find_script("web_interaction.cjs", Some(&app_handle))?;

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

#[command]
pub async fn save_web_screenshot(app_handle: tauri::AppHandle, device_id: String, path: String) -> Result<(), String> {
    let url = {
        let cache = CAPTURE_CACHE.lock().unwrap();
        cache.as_ref()
            .map(|c| c.requested_url.clone())
            .unwrap_or_else(|| "https://google.com".to_string())
    };

    let (screenshot, _) = perform_web_capture(&url, &device_id, Some(&app_handle)).await?;

    let img_bytes = general_purpose::STANDARD.decode(&screenshot)
        .map_err(|e| format!("Failed to decode screenshot: {}", e))?;

    std::fs::write(&path, &img_bytes)
        .map_err(|e| format!("Failed to save screenshot: {}", e))?;

    Ok(())
}

#[command]
pub async fn start_web_recording(app_handle: tauri::AppHandle) -> Result<(), String> {
    {
        let guard = WEB_RECORDING_STATE.lock().unwrap();
        if guard.is_some() {
            return Err("Web recording is already in progress.".to_string());
        }
    }

    let script_path = find_script("web_record.cjs", Some(&app_handle))?;

    let timestamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis();
    let temp_base = std::env::temp_dir().join(format!("web_rec_{}", timestamp));
    std::fs::create_dir_all(&temp_base)
        .map_err(|e| format!("Failed to create temp dir: {}", e))?;

    let frames_dir = temp_base.join("frames");
    let stop_file = temp_base.join("stop.signal");
    std::fs::create_dir_all(&frames_dir)
        .map_err(|e| format!("Failed to create frames dir: {}", e))?;

    let child = new_tokio_command("node")
        .arg(script_path.to_string_lossy().as_ref())
        .arg(frames_dir.to_string_lossy().as_ref())
        .arg(stop_file.to_string_lossy().as_ref())
        .spawn()
        .map_err(|e| format!("Failed to start web recording: {}", e))?;

    let mut guard = WEB_RECORDING_STATE.lock().unwrap();
    *guard = Some(WebRecordingState { child, frames_dir, stop_file });

    Ok(())
}

#[command]
pub async fn stop_web_recording(output_path: String) -> Result<(), String> {
    let state = {
        let mut guard = WEB_RECORDING_STATE.lock().unwrap();
        guard.take()
    };

    let WebRecordingState { mut child, frames_dir, stop_file } =
        state.ok_or_else(|| "No web recording in progress.".to_string())?;

    // Signal the recording script to stop
    std::fs::write(&stop_file, b"stop")
        .map_err(|e| format!("Failed to write stop signal: {}", e))?;

    // Wait up to 15s for the script to finish writing frames and exit
    let _ = tokio::time::timeout(
        std::time::Duration::from_secs(15),
        child.wait()
    ).await;

    let _ = std::fs::remove_file(&stop_file);

    // Verify frames were captured
    let has_frames = std::fs::read_dir(&frames_dir)
        .map(|mut d| d.any(|e| e.map(|f| f.file_name().to_string_lossy().ends_with(".jpg")).unwrap_or(false)))
        .unwrap_or(false);

    if !has_frames {
        let _ = std::fs::remove_dir_all(&frames_dir);
        return Err("Recording produced no frames. Make sure the browser is open and accessible on port 9222.".to_string());
    }

    let frames_pattern = frames_dir.join("frame_%06d.jpg");

    let ffmpeg_output = new_tokio_command("ffmpeg")
        .args([
            "-y",
            "-framerate", "15",
            "-i", &frames_pattern.to_string_lossy(),
            "-c:v", "libx264",
            "-pix_fmt", "yuv420p",
            "-preset", "fast",
            "-crf", "23",
            &output_path,
        ])
        .output()
        .await
        .map_err(|_| "ffmpeg not found. Install ffmpeg (e.g. `winget install Gyan.FFmpeg`) to enable web video recording.".to_string())?;

    let _ = std::fs::remove_dir_all(&frames_dir);

    if !ffmpeg_output.status.success() {
        let stderr = String::from_utf8_lossy(&ffmpeg_output.stderr);
        let tail = &stderr[stderr.len().saturating_sub(600)..];
        return Err(format!("ffmpeg encoding failed: {}", tail));
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    #[ignore = "requires browser/CDP runtime and network access"]
    async fn test_perform_web_capture_resolves_path() {
        // Try perform_web_capture with a simple website (Google)
        // This will verify that scripts/web_capture.cjs is found, loaded, and runs without error.
        // We use "headless-chrome" for tests.
        let result = perform_web_capture("https://google.com", "headless-chrome", None).await;
        
        // Assert that we don't get a "Could not find scripts/web_capture.cjs" or "Failed to run" error
        assert!(result.is_ok(), "Web capture failed: {:?}", result.err());
        
        let (screenshot, xml) = result.unwrap();
        assert!(!screenshot.is_empty(), "Screenshot should not be empty");
        assert!(!xml.is_empty(), "XML dump should not be empty");
        assert!(xml.contains("hierarchy"), "XML dump should be a valid hierarchy");
    }
}
