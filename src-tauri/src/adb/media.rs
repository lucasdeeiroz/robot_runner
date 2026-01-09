use std::fs::File;
use std::io::Write;
use std::process::Command;
use std::thread;
use std::time::Duration;

#[tauri::command]
pub async fn save_screenshot(device: String, path: String) -> Result<String, String> {
    // execute adb exec-out screencap -p
    let mut cmd = Command::new("adb");
    cmd.args(&["-s", &device, "exec-out", "screencap", "-p"]);
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000);
    }
    let output = cmd
        .output()
        .map_err(|e| format!("Failed to run adb: {}", e))?;

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
pub async fn start_screen_recording(device: String) -> Result<String, String> {
    // Start screenrecord in background
    // We use /sdcard/robot_runner_rec.mp4 as a temp file
    // "screenrecord" typically runs until 3 mins or SIGINT.

    let mut cmd = Command::new("adb");
    cmd.args(&[
        "-s",
        &device,
        "shell",
        "screenrecord",
        "--verbose",
        "/sdcard/robot_runner_rec.mp4",
    ]);

    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
    }

    cmd.spawn()
        .map_err(|e| format!("Failed to start recording: {}", e))?;

    Ok("Recording started".to_string())
}

#[tauri::command]
pub async fn stop_screen_recording(device: String, local_path: String) -> Result<String, String> {
    // 1. Send SIGINT (2) to screenrecord to make it finalize the MP4

    let mut cmd_kill = Command::new("adb");
    cmd_kill.args(&["-s", &device, "shell", "pkill", "-2", "screenrecord"]);
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        cmd_kill.creation_flags(0x08000000);
    }
    let kill_output = cmd_kill
        .output()
        .map_err(|e| format!("Failed to run pkill: {}", e))?;

    // If pkill fails (e.g. old android), try killall
    if !kill_output.status.success() {
        let mut cmd_killall = Command::new("adb");
        cmd_killall.args(&["-s", &device, "shell", "killall", "-2", "screenrecord"]);
        #[cfg(target_os = "windows")]
        {
            use std::os::windows::process::CommandExt;
            cmd_killall.creation_flags(0x08000000);
        }
        let _ = cmd_killall.output();
    }

    // 2. Wait a bit for file to finalize
    thread::sleep(Duration::from_secs(2));

    // 3. Pull the file
    let mut cmd_pull = Command::new("adb");
    cmd_pull.args(&[
        "-s",
        &device,
        "pull",
        "/sdcard/robot_runner_rec.mp4",
        &local_path,
    ]);
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        cmd_pull.creation_flags(0x08000000);
    }
    let pull_output = cmd_pull
        .output()
        .map_err(|e| format!("Failed to pull video: {}", e))?;

    if !pull_output.status.success() {
        return Err(format!(
            "Failed to pull video: {}",
            String::from_utf8_lossy(&pull_output.stderr)
        ));
    }

    // 4. Delete temp file
    let mut cmd_rm = Command::new("adb");
    cmd_rm.args(&["-s", &device, "shell", "rm", "/sdcard/robot_runner_rec.mp4"]);
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        cmd_rm.creation_flags(0x08000000);
    }
    let _ = cmd_rm.output();

    Ok(local_path)
}
