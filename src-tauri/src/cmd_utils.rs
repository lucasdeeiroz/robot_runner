use tauri::{AppHandle, Manager};
use crate::adb::AdbState;

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

/// Gets the current ADB program name or path from state.
pub fn get_adb_program(app: &AppHandle) -> String {
    let state = app.state::<AdbState>();
    let custom_path = state.custom_path.lock().unwrap();
    if let Some(path) = &*custom_path {
        let path_path = std::path::Path::new(path);
        if path_path.is_dir() {
            #[cfg(target_os = "windows")]
            {
                return path_path.join("adb.exe").to_string_lossy().to_string();
            }
            #[cfg(not(target_os = "windows"))]
            {
                return path_path.join("adb").to_string_lossy().to_string();
            }
        }
        return path.clone();
    }
    "adb".to_string()
}

/// Creates a new synchronous std::process::Command with suppression of console windows on Windows.
pub fn new_std_command(program: &str) -> std::process::Command {
    let mut cmd = std::process::Command::new(program);
    #[cfg(target_os = "windows")]
    {
        cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
    }
    cmd
}

/// Creates a new asynchronous tokio::process::Command with suppression of console windows on Windows.
pub fn new_tokio_command(program: &str) -> tokio::process::Command {
    let mut cmd = tokio::process::Command::new(program);
    #[cfg(target_os = "windows")]
    {
        cmd.as_std_mut().creation_flags(0x08000000); // CREATE_NO_WINDOW
    }
    cmd
}

/// Formats an adb process failure output, falling back to stdout and then exit code if stderr is empty.
pub fn format_adb_error(output: &std::process::Output) -> String {
    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
    if !stderr.is_empty() {
        stderr
    } else {
        let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
        if !stdout.is_empty() {
            stdout
        } else {
            format!("Process exited with status code: {}", output.status.code().unwrap_or(-1))
        }
    }
}
