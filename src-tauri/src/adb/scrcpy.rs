use crate::cmd_utils::new_tokio_command;

#[tauri::command]
pub async fn open_scrcpy(device: String, args: Option<String>) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        // On Windows, use `start` command to fully detach the process.
        // This prevents the Tauri app from freezing due to handle inheritance or blocking I/O.
        // Syntax: cmd /C start "/B" "" scrcpy -s <device> [args]

        let mut cmd = new_tokio_command("cmd");
        cmd.args(&["/C", "start", "/B", "", "scrcpy"]);
        cmd.arg("-s").arg(&device);

        if let Some(arg_str) = args {
            for arg in arg_str.split_whitespace() {
                cmd.arg(arg);
            }
        }

        cmd.spawn()
            .map_err(|e| format!("Failed to launch scrcpy via cmd: {}", e))?;

        Ok(())
    }

    #[cfg(not(target_os = "windows"))]
    {
        // Unix/Mac implementation (keep existing direct spawn)
        let mut cmd = tokio::process::Command::new("scrcpy");
        cmd.arg("-s").arg(device);
        if let Some(arg_str) = args {
            for arg in arg_str.split_whitespace() {
                cmd.arg(arg);
            }
        }
        cmd.stdin(std::process::Stdio::null())
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null());
        cmd.spawn()
            .map_err(|e| format!("Failed to start scrcpy: {}", e))?;
        Ok(())
    }
}
