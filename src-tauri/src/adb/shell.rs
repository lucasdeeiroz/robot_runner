use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use tauri::{command, AppHandle, Emitter, State};
use tokio::io::{AsyncBufReadExt, BufReader as TokioBufReader};
use tokio::process::{Child, Command};
use std::process::Stdio;

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
pub async fn get_adb_version() -> Result<String, String> {
    let mut cmd = Command::new("adb");
    cmd.arg("version");
    #[cfg(target_os = "windows")]
    cmd.creation_flags(0x08000000);

    let output = cmd
        .output()
        .await
        .map_err(|e| format!("Failed to execute adb: {}", e))?;

    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).to_string())
    } else {
        Err(String::from_utf8_lossy(&output.stderr).to_string())
    }
}

#[command]
pub async fn run_adb_command(device: String, args: Vec<String>) -> Result<String, String> {
    let mut cmd = Command::new("adb");
    cmd.arg("-s").arg(&device).args(&args);

    #[cfg(target_os = "windows")]
    cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW

    let output = cmd
        .output()
        .await
        .map_err(|e| format!("Failed to execute adb: {}", e))?;

    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
    } else {
        Err(String::from_utf8_lossy(&output.stderr).trim().to_string())
    }
}

#[command]
pub async fn start_adb_command(
    app: AppHandle,
    state: State<'_, ShellState>,
    id: String,
    device: String,
    command: String,
) -> Result<(), String> {
    // Split command string into args - Note: Ideally use Vec<String> from frontend
    let args: Vec<&str> = command.split_whitespace().collect();

    let mut cmd = Command::new("adb");
    cmd.arg("-s").arg(&device).args(&args);

    cmd.stdout(Stdio::piped());
    cmd.stderr(Stdio::piped());

    #[cfg(target_os = "windows")]
    cmd.creation_flags(0x08000000);

    let mut child = cmd.spawn().map_err(|e| e.to_string())?;
    let stdout = child.stdout.take().ok_or("Failed to open stdout")?;

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

    state.running_commands.lock().map_err(|e| e.to_string())?.insert(id, child);
    Ok(())
}

#[command]
pub async fn stop_adb_command(state: State<'_, ShellState>, id: String) -> Result<(), String> {
    let child = {
        let mut commands = state.running_commands.lock().map_err(|e| e.to_string())?;
        commands.remove(&id)
    };

    if let Some(mut c) = child {
        let _ = c.kill().await;
        Ok(())
    } else {
        Err("Command not found".to_string())
    }
}

#[command]
pub async fn restart_adb_server() -> Result<String, String> {
    // Kill
    let mut kill_cmd = Command::new("adb");
    kill_cmd.arg("kill-server");
    #[cfg(target_os = "windows")]
    kill_cmd.creation_flags(0x08000000);

    let kill_output = kill_cmd
        .output()
        .await
        .map_err(|e| format!("Failed to kill server: {}", e))?;

    // Start
    let mut start_cmd = Command::new("adb");
    start_cmd.arg("start-server");
    #[cfg(target_os = "windows")]
    start_cmd.creation_flags(0x08000000);

    let start_output = start_cmd
        .output()
        .await
        .map_err(|e| format!("Failed to start server: {}", e))?;

    Ok(format!(
        "Server Restarted.\nKill: {}\nStart: {}",
        String::from_utf8_lossy(&kill_output.stdout),
        String::from_utf8_lossy(&start_output.stdout)
    ))
}

#[command]
pub async fn is_adb_server_running() -> bool {
    #[cfg(target_os = "windows")]
    {
        let mut cmd = Command::new("tasklist");
        cmd.args(&["/FI", "IMAGENAME eq adb.exe", "/NH"]);
        cmd.creation_flags(0x08000000);
        let output = cmd.output().await;

        if let Ok(o) = output {
            let s = String::from_utf8_lossy(&o.stdout);
            return s.contains("adb.exe");
        }
    }

    #[cfg(not(target_os = "windows"))]
    {
        let output = Command::new("pgrep").arg("adb").output().await;
        if let Ok(o) = output {
            return o.status.success();
        }
    }

    false
}

#[command]
pub async fn kill_adb_server() -> Result<String, String> {
    let mut cmd = Command::new("adb");
    cmd.arg("kill-server");
    #[cfg(target_os = "windows")]
    cmd.creation_flags(0x08000000);

    let output = cmd.output().await.map_err(|e| e.to_string())?;
    Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
}

#[command]
pub async fn start_adb_server() -> Result<String, String> {
    let mut cmd = Command::new("adb");
    cmd.arg("start-server");
    #[cfg(target_os = "windows")]
    cmd.creation_flags(0x08000000);

    let output = cmd.output().await.map_err(|e| e.to_string())?;
    Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
}
