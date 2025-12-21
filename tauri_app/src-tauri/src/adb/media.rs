use std::process::Command;
use std::fs::File;
use std::io::Write;
use std::thread;
use std::time::Duration;

#[tauri::command]
pub async fn save_screenshot(device: String, path: String) -> Result<String, String> {
    // execute adb exec-out screencap -p
    let output = Command::new("adb")
        .args(&["-s", &device, "exec-out", "screencap", "-p"])
        .output()
        .map_err(|e| format!("Failed to run adb: {}", e))?;

    if !output.status.success() {
        return Err(format!("ADB Screenshot failed: {}", String::from_utf8_lossy(&output.stderr)));
    }

    // Write buffer to file
    let mut file = File::create(&path).map_err(|e| format!("Failed to create file: {}", e))?;
    file.write_all(&output.stdout).map_err(|e| format!("Failed to write to file: {}", e))?;

    Ok(path)
}

#[tauri::command]
pub async fn start_screen_recording(device: String) -> Result<String, String> {
    // Start screenrecord in background
    // We use /sdcard/robot_runner_rec.mp4 as a temp file
    // "screenrecord" typically runs until 3 mins or SIGINT.
    
    // We spawn it detached.
    // Note: On Windows, pure spawn might leave a console window?
    // We'll use the same trick as Scrcpy or creation flags if needed.
    
    let mut cmd = Command::new("adb");
    cmd.args(&["-s", &device, "shell", "screenrecord", "--verbose", "/sdcard/robot_runner_rec.mp4"]);
    
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
    }

    cmd.spawn().map_err(|e| format!("Failed to start recording: {}", e))?;

    Ok("Recording started".to_string())
}

#[tauri::command]
pub async fn stop_screen_recording(device: String, local_path: String) -> Result<String, String> {
    // 1. Send SIGINT (2) to screenrecord to make it finalize the MP4
    // We use 'pkill -2 -l screenrecord' (matches name exactly? no -l is signal list? pkill -2 -f screenrecord?)
    // 'killall -2 screenrecord' is common.
    
    let kill_output = Command::new("adb")
        .args(&["-s", &device, "shell", "pkill", "-2", "screenrecord"])
        .output()
        .map_err(|e| format!("Failed to run pkill: {}", e))?;
        
    // If pkill fails (e.g. old android), try killall
    if !kill_output.status.success() {
         let _ = Command::new("adb")
            .args(&["-s", &device, "shell", "killall", "-2", "screenrecord"])
            .output();
    }

    // 2. Wait a bit for file to finalize
    thread::sleep(Duration::from_secs(2));

    // 3. Pull the file
    let pull_output = Command::new("adb")
        .args(&["-s", &device, "pull", "/sdcard/robot_runner_rec.mp4", &local_path])
        .output()
        .map_err(|e| format!("Failed to pull video: {}", e))?;

    if !pull_output.status.success() {
        return Err(format!("Failed to pull video: {}", String::from_utf8_lossy(&pull_output.stderr)));
    }

    // 4. Delete temp file
    let _ = Command::new("adb")
        .args(&["-s", &device, "shell", "rm", "/sdcard/robot_runner_rec.mp4"])
        .output();

    Ok(local_path)
}
