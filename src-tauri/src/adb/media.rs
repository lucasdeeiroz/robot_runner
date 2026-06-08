use crate::cmd_utils::{new_tokio_command, get_adb_program};
use std::fs::File;
use std::io::Write;
use tokio::time::{sleep, Duration};
use tauri::AppHandle;

#[tauri::command]
pub async fn save_screenshot(app: AppHandle, device: String, path: String) -> Result<String, String> {
    let program = get_adb_program(&app);
    // execute adb exec-out screencap -p
    let mut cmd = new_tokio_command(&program);
    cmd.args(&["-s", &device, "exec-out", "screencap", "-p"]);

    let output = cmd
        .output()
        .await
        .map_err(|e| format!("Failed to run {}: {}", program, e))?;

    let bytes = if !output.status.success() || output.stdout.is_empty() {
        let remote_path = "/data/local/tmp/screencap_fallback.png";
        
        let mut cmd_cap = new_tokio_command(&program);
        cmd_cap.args(&["-s", &device, "shell", "screencap", "-p", remote_path]);
        let output_cap = cmd_cap.output().await
            .map_err(|e| format!("Failed to execute fallback screencap on device: {}", e))?;
        
        if !output_cap.status.success() {
            return Err(format!(
                "Fallback screencap failed on device: {}",
                String::from_utf8_lossy(&output_cap.stderr)
            ));
        }

        let mut cmd_pull = new_tokio_command(&program);
        cmd_pull.args(&["-s", &device, "pull", remote_path, &path]);
        let output_pull = cmd_pull.output().await
            .map_err(|e| format!("Failed to pull fallback screenshot: {}", e))?;

        let mut cmd_rm = new_tokio_command(&program);
        cmd_rm.args(&["-s", &device, "shell", "rm", remote_path]);
        let _ = cmd_rm.output().await;

        if !output_pull.status.success() {
            return Err(format!(
                "Failed to pull screenshot from device: {}",
                String::from_utf8_lossy(&output_pull.stderr)
            ));
        }

        return Ok(path);
    } else {
        output.stdout
    };

    // Write buffer to file
    let mut file = File::create(&path).map_err(|e| format!("Failed to create file: {}", e))?;
    file.write_all(&bytes)
        .map_err(|e| format!("Failed to write to file: {}", e))?;

    Ok(path)
}

#[tauri::command]
pub async fn start_screen_recording(app: AppHandle, device: String) -> Result<String, String> {
    let program = get_adb_program(&app);
    let mut cmd = new_tokio_command(&program);
    cmd.args(&[
        "-s",
        &device,
        "shell",
        "screenrecord",
        "--verbose",
        "/sdcard/robot_runner_rec.mp4",
    ]);
    cmd.stdout(std::process::Stdio::piped());
    cmd.stderr(std::process::Stdio::piped());

    let mut child = cmd.spawn()
        .map_err(|e| format!("Failed to start recording: {}", e))?;

    // Wait a short duration to see if the process exits early (indicating failure)
    sleep(Duration::from_millis(500)).await;

    match child.try_wait() {
        Ok(Some(status)) => {
            // Process exited immediately, which means it failed (e.g., screenrecord not supported/allowed)
            let output = child.wait_with_output().await
                .map_err(|e| format!("Process exited immediately but couldn't get output: {}", e))?;
            
            let err_msg = String::from_utf8_lossy(&output.stderr);
            let out_msg = String::from_utf8_lossy(&output.stdout);
            let combined = format!("{}{}", out_msg, err_msg);
            let cleaned = combined.trim();

            if cleaned.is_empty() {
                return Err(format!("Screen recording process exited immediately with status {}", status));
            } else {
                return Err(format!("Screen recording failed to start: {}", cleaned));
            }
        }
        Ok(None) => {
            // Process is still running, which means it likely started successfully.
            // Consume stdout and stderr in background tasks to prevent blocking when buffers fill up.
            let stdout = child.stdout.take();
            let stderr = child.stderr.take();
            if let Some(mut out) = stdout {
                tokio::spawn(async move {
                    use tokio::io::AsyncReadExt;
                    let mut buf = [0; 1024];
                    while let Ok(n) = out.read(&mut buf).await {
                        if n == 0 { break; }
                    }
                });
            }
            if let Some(mut err) = stderr {
                tokio::spawn(async move {
                    use tokio::io::AsyncReadExt;
                    let mut buf = [0; 1024];
                    while let Ok(n) = err.read(&mut buf).await {
                        if n == 0 { break; }
                    }
                });
            }
        }
        Err(e) => {
            return Err(format!("Failed to query child status: {}", e));
        }
    }

    Ok("Recording started".to_string())
}

#[tauri::command]
pub async fn stop_screen_recording(app: AppHandle, device: String, local_path: String) -> Result<String, String> {
    let program = get_adb_program(&app);
    
    // 1. Send SIGINT (2) to screenrecord to make it finalize the MP4
    let mut cmd_kill = new_tokio_command(&program);
    cmd_kill.args(&["-s", &device, "shell", "pkill", "-2", "screenrecord"]);

    let kill_output = cmd_kill
        .output()
        .await
        .map_err(|e| format!("Failed to run pkill: {}", e))?;

    // If pkill fails (e.g. old android), try killall
    if !kill_output.status.success() {
        let mut cmd_killall = new_tokio_command(&program);
        cmd_killall.args(&["-s", &device, "shell", "killall", "-2", "screenrecord"]);
        let _ = cmd_killall.output().await;
    }

    // 2. Wait a bit for file to finalize
    sleep(Duration::from_secs(2)).await;

    // 3. Pull the file
    let mut cmd_pull = new_tokio_command(&program);
    cmd_pull.args(&[
        "-s",
        &device,
        "pull",
        "/sdcard/robot_runner_rec.mp4",
        &local_path,
    ]);

    let pull_output = cmd_pull
        .output()
        .await
        .map_err(|e| format!("Failed to pull video: {}", e))?;

    if !pull_output.status.success() {
        return Err(format!(
            "Failed to pull video: {}",
            String::from_utf8_lossy(&pull_output.stderr)
        ));
    }

    // 4. Delete temp file
    let mut cmd_rm = new_tokio_command(&program);
    cmd_rm.args(&["-s", &device, "shell", "rm", "/sdcard/robot_runner_rec.mp4"]);
    let _ = cmd_rm.output().await;

    Ok(local_path)
}
