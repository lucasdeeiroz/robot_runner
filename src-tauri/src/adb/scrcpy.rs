use std::process::Command;
#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

#[tauri::command]
#[allow(dead_code)]
pub fn open_scrcpy(device: String, args: Option<String>) -> Result<(), String> {
    let mut cmd = Command::new("scrcpy");

    #[cfg(target_os = "windows")]
    cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW for the detach, but scrcpy is a GUI app.
    // Actually scrcpy opens its own window. If we hide console, scrcpy window should still show.

    cmd.arg("-s").arg(device);

    if let Some(arg_str) = args {
        // Simple splitting by space. For complex args, might need better parsing.
        for arg in arg_str.split_whitespace() {
            cmd.arg(arg);
        }
    }

    // Detached process
    cmd.spawn()
        .map_err(|e| format!("Failed to start scrcpy: {}. check if it's in PATH.", e))?;

    Ok(())
}
