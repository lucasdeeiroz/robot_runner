use tauri::{AppHandle, Manager};
use crate::adb::AdbState;
use regex::Regex;

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

/// Expands environment variables in a path string (e.g., %VAR% or $VAR).
pub fn expand_env_vars(path: &str) -> String {
    let mut expanded = String::from(path);

    // Expand Windows-style %VAR%
    let re_win = Regex::new(r"%([^%]+)%").unwrap();
    expanded = re_win.replace_all(&expanded, |caps: &regex::Captures| {
        std::env::var(&caps[1]).unwrap_or_else(|_| caps[0].to_string())
    }).into_owned();

    // Expand Unix-style $VAR or ${VAR}
    let re_unix = Regex::new(r"\$\{?([a-zA-Z_][a-zA-Z0-9_]*)\}?").unwrap();
    expanded = re_unix.replace_all(&expanded, |caps: &regex::Captures| {
        std::env::var(&caps[1]).unwrap_or_else(|_| caps[0].to_string())
    }).into_owned();

    // Fix path separators for Windows if there are mixed slashes
    #[cfg(target_os = "windows")]
    {
        expanded = expanded.replace("/", "\\");
    }

    expanded
}

/// Gets the current ADB program name or path from state.
pub fn get_adb_program(app: &AppHandle) -> String {
    let state = app.state::<AdbState>();
    let custom_path = state.custom_path.lock().unwrap();
    if let Some(path) = &*custom_path {
        let expanded_path = expand_env_vars(path);
        let path_path = std::path::Path::new(&expanded_path);
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
        return expanded_path;
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
