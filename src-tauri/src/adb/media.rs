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

    if !output.status.success() {
        return Err(format!(
            "ADB Screenshot failed: {}",
            String::from_utf8_lossy(&output.stderr)
        ));
    }

    // Write buffer to file
    let mut file = File::create(&path).map_err(|e| format!("Failed to create file: {}", e))?;
    file.write_all(&output.stdout)
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

    cmd.spawn()
        .map_err(|e| format!("Failed to start recording: {}", e))?;

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
