use crate::cmd_utils::{new_tokio_command, get_adb_program};
use crate::errors::{AppError, AppResult};
use std::collections::HashMap;
use std::process::Stdio;
use std::sync::{Arc, Mutex};
use tauri::{command, AppHandle, Emitter, State, Manager};
use tokio::io::{AsyncBufReadExt, BufReader as TokioBufReader};
use tokio::process::Child;
use crate::adb::AdbState;

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
pub async fn update_custom_adb_path(app: AppHandle, path: String) -> AppResult<()> {
    let state = app.state::<AdbState>();
    let mut custom_path = state.custom_path.lock().map_err(|e| AppError::StringError(e.to_string()))?;
    if path.trim().is_empty() {
        *custom_path = None;
    } else {
        *custom_path = Some(path);
    }
    Ok(())
}

#[command]
pub async fn get_adb_version(app: AppHandle) -> AppResult<String> {
    let output = execute_adb_with_recovery(&app, None, vec!["version".to_string()]).await?;

    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).to_string())
    } else {
        Err(AppError::AdbError(
            String::from_utf8_lossy(&output.stderr).to_string(),
        ))
    }
}

pub async fn execute_adb_with_recovery(
    app: &AppHandle,
    device: Option<&str>,
    args: Vec<String>,
) -> AppResult<std::process::Output> {
    let program = get_adb_program(app);
    let mut cmd = new_tokio_command(&program);
    if let Some(d) = device {
        cmd.arg("-s").arg(d);
    }
    cmd.args(&args);

    let output = cmd
        .output()
        .await
        .map_err(|e| AppError::AdbError(format!("Failed to execute {}: {}", program, e)))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        if stderr.contains("daemon not running")
            || stderr.contains("cannot connect to daemon")
            || stderr.contains("error: device not found")
            || stderr.contains("adb: error: failed to get feature set")
        {
            let _ = restart_adb_server_internal(app).await;

            let mut retry_cmd = new_tokio_command(&program);
            if let Some(d) = device {
                retry_cmd.arg("-s").arg(d);
            }
            retry_cmd.args(&args);
            return retry_cmd.output().await.map_err(|e| {
                AppError::AdbError(format!("Failed to execute {} after restart: {}", program, e))
            });
        }
    }
    Ok(output)
}

#[command]
pub async fn run_adb_command(app: AppHandle, device: String, args: Vec<String>) -> AppResult<String> {
    let output = execute_adb_with_recovery(&app, Some(&device), args).await?;

    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
    } else {
        Err(AppError::AdbError(
            String::from_utf8_lossy(&output.stderr).trim().to_string(),
        ))
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
    let args: Vec<&str> = command.split_whitespace().collect();

    let program = get_adb_program(&app);
    let mut cmd = new_tokio_command(&program);
    cmd.arg("-s").arg(&device).args(&args);

    cmd.stdout(Stdio::piped());
    cmd.stderr(Stdio::piped());

    let mut child = cmd.spawn().map_err(|e| AppError::AdbError(e.to_string()))?;
    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| AppError::AdbError("Failed to open stdout".to_string()))?;

    let id_clone = id.clone();
    let app_clone = app.clone();

    tokio::spawn(async move {
        let mut reader = TokioBufReader::new(stdout).lines();
        while let Ok(Some(line)) = reader.next_line().await {
            let _ = app_clone.emit(&format!("cmd-output-{}", id_clone), line);
        }
        let _ = app_clone.emit(&format!("cmd-close-{}", id_clone), "Process finished");
    });

    state
        .running_commands
        .lock()
        .map_err(|e| AppError::StringError(e.to_string()))?
        .insert(id, child);
    Ok(())
}

#[command]
pub async fn stop_adb_command(state: State<'_, ShellState>, id: String) -> AppResult<()> {
    let child = {
        let mut commands = state
            .running_commands
            .lock()
            .map_err(|e| AppError::StringError(e.to_string()))?;
        commands.remove(&id)
    };

    if let Some(mut c) = child {
        let _ = c.kill().await;
        Ok(())
    } else {
        Err(AppError::AdbError("Command not found".to_string()))
    }
}

async fn restart_adb_server_internal(app: &AppHandle) -> AppResult<String> {
    let program = get_adb_program(app);
    
    let mut kill_cmd = new_tokio_command(&program);
    kill_cmd.arg("kill-server");
    let _ = kill_cmd.output().await;

    let mut start_cmd = new_tokio_command(&program);
    start_cmd.arg("start-server");

    let start_output = start_cmd
        .output()
        .await
        .map_err(|e| AppError::AdbError(format!("Failed to start server: {}", e)))?;

    Ok(format!(
        "Server Restarted.\nStart: {}",
        String::from_utf8_lossy(&start_output.stdout)
    ))
}

#[command]
pub async fn restart_adb_server(app: AppHandle) -> AppResult<String> {
    restart_adb_server_internal(&app).await
}

#[command]
pub async fn is_adb_server_running(app: AppHandle) -> bool {
    let program = get_adb_program(&app);
    let bin_name = if program == "adb" {
        "adb"
    } else {
        program.split(|c| c == '/' || c == '\\').last().unwrap_or("adb")
    };

    #[cfg(target_os = "windows")]
    {
        let check_name = if bin_name.to_lowercase().ends_with(".exe") {
            bin_name.to_lowercase()
        } else {
            format!("{}.exe", bin_name.to_lowercase())
        };

        let mut cmd = new_tokio_command("tasklist");
        cmd.args(&["/FI", &format!("IMAGENAME eq {}", check_name), "/NH"]);
        let output = cmd.output().await;

        if let Ok(o) = output {
            let s = String::from_utf8_lossy(&o.stdout).to_lowercase();
            return s.contains(&check_name);
        }
    }

    #[cfg(not(target_os = "windows"))]
    {
        let output = new_tokio_command("pgrep").arg(bin_name).output().await;
        if let Ok(o) = output {
            return o.status.success();
        }
    }

    false
}

#[command]
pub async fn kill_adb_server(app: AppHandle) -> AppResult<String> {
    let program = get_adb_program(&app);
    let mut cmd = new_tokio_command(&program);
    cmd.arg("kill-server");

    let output = cmd
        .output()
        .await
        .map_err(|e| AppError::AdbError(e.to_string()))?;
    Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
}

#[command]
pub async fn start_adb_server(app: AppHandle) -> AppResult<String> {
    let program = get_adb_program(&app);
    let mut cmd = new_tokio_command(&program);
    cmd.arg("start-server");

    let output = cmd
        .output()
        .await
        .map_err(|e| AppError::AdbError(e.to_string()))?;
    Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
}

// SECURE ADB COMMANDS
#[command]
pub async fn adb_input_tap(app: AppHandle, device: String, x: i32, y: i32) -> AppResult<()> {
    run_adb_shell_args_internal(
        &app,
        &device,
        vec!["input".to_string(), "tap".to_string(), x.to_string(), y.to_string()],
    )
    .await?;
    Ok(())
}

#[command]
pub async fn adb_input_swipe(app: AppHandle, device: String, x1: i32, y1: i32, x2: i32, y2: i32, ms: i32) -> AppResult<()> {
    run_adb_shell_args_internal(
        &app,
        &device,
        vec![
            "input".to_string(),
            "swipe".to_string(),
            x1.to_string(),
            y1.to_string(),
            x2.to_string(),
            y2.to_string(),
            ms.to_string(),
        ],
    )
    .await?;
    Ok(())
}

#[command]
pub async fn adb_input_keyevent(app: AppHandle, device: String, keycode: String) -> AppResult<()> {
    run_adb_shell_args_internal(
        &app,
        &device,
        vec!["input".to_string(), "keyevent".to_string(), keycode],
    )
    .await?;
    Ok(())
}

#[command]
pub async fn adb_input_text(app: AppHandle, device: String, text: String) -> AppResult<()> {
    run_adb_shell_args_internal(
        &app,
        &device,
        vec!["input".to_string(), "text".to_string(), text],
    )
    .await?;
    Ok(())
}

#[command]
pub async fn adb_settings_put(app: AppHandle, device: String, namespace: String, key: String, value: String) -> AppResult<()> {
    run_adb_shell_args_internal(
        &app,
        &device,
        vec!["settings".to_string(), "put".to_string(), namespace, key, value],
    )
    .await?;
    Ok(())
}

#[command]
pub async fn adb_settings_get(app: AppHandle, device: String, namespace: String, key: String) -> AppResult<String> {
    run_adb_shell_args_internal(
        &app,
        &device,
        vec!["settings".to_string(), "get".to_string(), namespace, key],
    )
    .await
}

#[command]
pub async fn get_notifications(app: AppHandle, device: String) -> AppResult<String> {
    run_adb_shell_args_internal(
        &app,
        &device,
        vec!["dumpsys".to_string(), "notification".to_string(), "--noredact".to_string()],
    )
    .await
}

#[command]
pub async fn get_events(app: AppHandle, device: String) -> AppResult<String> {
    run_adb_shell_args_internal(
        &app,
        &device,
        vec!["getevent".to_string(), "-l".to_string()],
    )
    .await
}

async fn run_adb_shell_args_internal(
    app: &AppHandle,
    device: &str,
    command_args: Vec<String>,
) -> AppResult<String> {
    let program = get_adb_program(app);
    let mut cmd = new_tokio_command(&program);
    cmd.arg("-s").arg(device).arg("shell").args(command_args);

    let output = cmd.output().await.map_err(|e| AppError::AdbError(e.to_string()))?;
    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
    } else {
        Err(AppError::AdbError(String::from_utf8_lossy(&output.stderr).trim().to_string()))
    }
}
