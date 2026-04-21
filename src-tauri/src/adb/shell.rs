use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use tauri::{command, AppHandle, Emitter, State};
use tokio::io::{AsyncBufReadExt, BufReader as TokioBufReader};
use tokio::process::Child;
use std::process::Stdio;
use crate::cmd_utils::new_tokio_command;
use crate::errors::{AppError, AppResult};

pub struct ShellState {
    pub running_commands: Arc<Mutex<HashMap<String, Child>>>,
}

impl Default for ShellState {
    fn default() -> Self {
        Self {
            running_commands: Arc::new(Mutex::new(HashMap::new())),
        }
    }
}

#[command]
pub async fn get_adb_version() -> AppResult<String> {
    let output = execute_adb_with_recovery(None, vec!["version".to_string()]).await?;

    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).to_string())
    } else {
        Err(AppError::AdbError(String::from_utf8_lossy(&output.stderr).to_string()))
    }
}

async fn execute_adb_with_recovery(device: Option<&str>, args: Vec<String>) -> AppResult<std::process::Output> {
    let mut cmd = new_tokio_command("adb");
    if let Some(d) = device {
        cmd.arg("-s").arg(d);
    }
    cmd.args(&args);

    let output = cmd
        .output()
        .await
        .map_err(|e| AppError::AdbError(format!("Failed to execute adb: {}", e)))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        // Common connection error patterns
        if stderr.contains("daemon not running") 
            || stderr.contains("cannot connect to daemon") 
            || stderr.contains("error: device not found") 
            || stderr.contains("adb: error: failed to get feature set")
        {
            // Attempt restart
            let _ = restart_adb_server_internal().await;
            
            // Retry once
            let mut retry_cmd = new_tokio_command("adb");
            if let Some(d) = device {
                retry_cmd.arg("-s").arg(d);
            }
            retry_cmd.args(&args);
            return retry_cmd
                .output()
                .await
                .map_err(|e| AppError::AdbError(format!("Failed to execute adb after restart: {}", e)));
        }
    }
    Ok(output)
}

#[command]
pub async fn run_adb_command(device: String, args: Vec<String>) -> AppResult<String> {
    let output = execute_adb_with_recovery(Some(&device), args).await?;

    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
    } else {
        Err(AppError::AdbError(String::from_utf8_lossy(&output.stderr).trim().to_string()))
    }
}

#[command]
pub async fn start_adb_command(
    app: AppHandle,
    state: State<'_, ShellState>,
    id: String,
    device: String,
    command: String,
) -> AppResult<()> {
    // Split command string into args - Note: Ideally use Vec<String> from frontend
    let args: Vec<&str> = command.split_whitespace().collect();

    let mut cmd = new_tokio_command("adb");
    cmd.arg("-s").arg(&device).args(&args);

    cmd.stdout(Stdio::piped());
    cmd.stderr(Stdio::piped());

    let mut child = cmd.spawn().map_err(|e| AppError::AdbError(e.to_string()))?;
    let stdout = child.stdout.take().ok_or_else(|| AppError::AdbError("Failed to open stdout".to_string()))?;

    let id_clone = id.clone();
    let app_clone = app.clone();

    // stdout task
    tokio::spawn(async move {
        let mut reader = TokioBufReader::new(stdout).lines();
        while let Ok(Some(line)) = reader.next_line().await {
            let _ = app_clone.emit(&format!("cmd-output-{}", id_clone), line);
        }
        let _ = app_clone.emit(&format!("cmd-close-{}", id_clone), "Process finished");
    });

    state.running_commands.lock().map_err(|e| AppError::StringError(e.to_string()))?.insert(id, child);
    Ok(())
}

#[command]
pub async fn stop_adb_command(state: State<'_, ShellState>, id: String) -> AppResult<()> {
    let child = {
        let mut commands = state.running_commands.lock().map_err(|e| AppError::StringError(e.to_string()))?;
        commands.remove(&id)
    };

    if let Some(mut c) = child {
        let _ = c.kill().await;
        Ok(())
    } else {
        Err(AppError::AdbError("Command not found".to_string()))
    }
}

async fn restart_adb_server_internal() -> AppResult<String> {
    // Kill
    let mut kill_cmd = new_tokio_command("adb");
    kill_cmd.arg("kill-server");

    let kill_output = kill_cmd
        .output()
        .await
        .map_err(|e| AppError::AdbError(format!("Failed to kill server: {}", e)))?;

    // Start
    let mut start_cmd = new_tokio_command("adb");
    start_cmd.arg("start-server");

    let start_output = start_cmd
        .output()
        .await
        .map_err(|e| AppError::AdbError(format!("Failed to start server: {}", e)))?;

    Ok(format!(
        "Server Restarted.\nKill: {}\nStart: {}",
        String::from_utf8_lossy(&kill_output.stdout),
        String::from_utf8_lossy(&start_output.stdout)
    ))
}

#[command]
pub async fn restart_adb_server() -> AppResult<String> {
    restart_adb_server_internal().await
}

#[command]
pub async fn is_adb_server_running() -> bool {
    #[cfg(target_os = "windows")]
    {
        let mut cmd = new_tokio_command("tasklist");
        cmd.args(&["/FI", "IMAGENAME eq adb.exe", "/NH"]);
        let output = cmd.output().await;

        if let Ok(o) = output {
            let s = String::from_utf8_lossy(&o.stdout);
            return s.contains("adb.exe");
        }
    }

    #[cfg(not(target_os = "windows"))]
    {
        let output = new_tokio_command("pgrep").arg("adb").output().await;
        if let Ok(o) = output {
            return o.status.success();
        }
    }

    false
}

#[command]
pub async fn kill_adb_server() -> AppResult<String> {
    let mut cmd = new_tokio_command("adb");
    cmd.arg("kill-server");

    let output = cmd.output().await.map_err(|e| AppError::AdbError(e.to_string()))?;
    Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
}

#[command]
pub async fn start_adb_server() -> AppResult<String> {
    let mut cmd = new_tokio_command("adb");
    cmd.arg("start-server");

    let output = cmd.output().await.map_err(|e| AppError::AdbError(e.to_string()))?;
    Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
}
