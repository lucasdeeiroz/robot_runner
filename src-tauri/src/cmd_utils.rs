use tauri::{AppHandle, Manager};
use crate::adb::AdbState;

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

/// Gets the current ADB program name or path from state.
pub fn get_adb_program(app: &AppHandle) -> String {
    let state = app.state::<AdbState>();
    let custom_path = state.custom_path.lock().unwrap();
    custom_path.clone().unwrap_or_else(|| "adb".to_string())
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
