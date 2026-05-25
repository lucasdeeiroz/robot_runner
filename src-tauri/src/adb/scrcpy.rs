use crate::cmd_utils::{new_tokio_command, get_adb_program};
use tauri::AppHandle;

#[tauri::command]
pub async fn open_scrcpy(app: AppHandle, device: String, args: Option<String>) -> Result<(), String> {
    let adb_program = get_adb_program(&app);

    #[cfg(target_os = "windows")]
    {
        // On Windows, use `start` command to fully detach the process.
        let mut cmd = new_tokio_command("cmd");
        cmd.args(&["/C", "start", "/B", "", "scrcpy"]);
        cmd.arg("-s").arg(&device);

        if let Some(arg_str) = args {
            for arg in arg_str.split_whitespace() {
                cmd.arg(arg);
            }
        }

        // Set ADB environment variable so scrcpy uses the correct binary
        cmd.env("ADB", &adb_program);

        cmd.spawn()
            .map_err(|e| format!("Failed to launch scrcpy via cmd: {}", e))?;

        Ok(())
    }

    #[cfg(not(target_os = "windows"))]
    {
        let mut cmd = tokio::process::Command::new("scrcpy");
        cmd.arg("-s").arg(device);
        if let Some(arg_str) = args {
            for arg in arg_str.split_whitespace() {
                cmd.arg(arg);
            }
        }
        cmd.env("ADB", &adb_program);
        cmd.stdin(std::process::Stdio::null())
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null());
        cmd.spawn()
            .map_err(|e| format!("Failed to start scrcpy: {}", e))?;
        Ok(())
    }
}
