use std::sync::{Arc, Mutex};
use tauri::{State, Emitter, AppHandle, Manager};
use tokio::io::{AsyncBufReadExt, BufReader as TokioBufReader, AsyncWriteExt};
use tokio::process::Child;
use std::process::Stdio;
use crate::cmd_utils::new_tokio_command;
use crate::errors::{AppError, AppResult};

// State to hold the Appium process
pub struct AppiumState(pub Arc<Mutex<Option<Child>>>);

#[derive(serde::Serialize, Clone)]
pub struct AppiumStatus {
    running: bool,
    pid: Option<u32>,
}

#[tauri::command]
pub async fn get_appium_status(
    state: State<'_, AppiumState>,
    host: Option<String>,
    port: Option<u32>,
    base_path: Option<String>,
    is_test_running: Option<bool>,
) -> AppResult<AppiumStatus> {
    let (internal_running, internal_pid) = {
        let mut child_guard = match state.0.lock() {
            Ok(guard) => guard,
            Err(_) => {
                return Ok(AppiumStatus {
                    running: false,
                    pid: None,
                });
            }
        };
        if let Some(child) = &mut *child_guard {
            match child.try_wait() {
                Ok(Some(_)) => {
                    *child_guard = None; // Clean up
                    (false, None)
                }
                Ok(None) => (true, child.id()),
                Err(_) => {
                    *child_guard = None;
                    (false, None)
                }
            }
        } else {
            (false, None)
        }
    };

    // Guard: skip network check if test is already running to avoid ADB contention
    let is_ready = if is_test_running.unwrap_or(false) {
        false 
    } else if let (Some(h), Some(p)) = (host, port) {
        check_appium_ready(&h, p, base_path.as_deref().unwrap_or("")).await
    } else {
        false
    };

    if is_ready {
        Ok(AppiumStatus {
            running: true,
            pid: internal_pid,
        })
    } else {
        Ok(AppiumStatus {
            running: internal_running,
            pid: internal_pid,
        })
    }
}

async fn check_appium_ready(host: &str, port: u32, base_path: &str) -> bool {
    let check_host = if host == "0.0.0.0" { "127.0.0.1" } else { host };

    // Normalize base path for URL construction
    let mut path = base_path.trim().to_string();
    if !path.starts_with('/') && !path.is_empty() {
        path = format!("/{}", path);
    }
    if path.ends_with('/') {
        path.pop();
    }

    let url = format!("http://{}:{}{}/status", check_host, port, path);

    let client = match reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(2))
        .connect_timeout(std::time::Duration::from_secs(1))
        .build()
    {
        Ok(c) => c,
        Err(_) => return false,
    };

    match client.get(&url).send().await {
        Ok(resp) => {
            if !resp.status().is_success() {
                return false;
            }
            // Parse JSON to verify { "value": { "ready": true } }
            match resp.json::<serde_json::Value>().await {
                Ok(json) => {
                    json.get("value")
                        .and_then(|v| v.get("ready"))
                        .and_then(|r| r.as_bool())
                        .unwrap_or(false)
                }
                Err(_) => false,
            }
        }
        Err(_) => false,
    }
}

#[tauri::command]
pub async fn start_appium_server(
    state: State<'_, AppiumState>,
    host: String,
    port: u32,
    base_path: String,
    args: String, // Extra args string
    app_handle: AppHandle,
) -> AppResult<String> {
    let mut child_guard = state.0.lock().map_err(|e| AppError::ProcessError(e.to_string()))?;

    // Check if already running
    if let Some(child) = &mut *child_guard {
        if matches!(child.try_wait(), Ok(None)) {
            return Err(AppError::ProcessError("Appium is already running".to_string()));
        }
    }

    // Determine executable (windows vs unix)
    #[cfg(target_os = "windows")]
    let cmd = "appium.cmd";
    #[cfg(not(target_os = "windows"))]
    let cmd = "appium";

    let mut command = new_tokio_command(cmd);

    // Add Host and Port
    command.arg("--address").arg(&host);
    command.arg("--port").arg(&port.to_string());
    
    // Robust base path handling
    let trimmed_base = base_path.trim();
    if !trimmed_base.is_empty() && trimmed_base != "/" {
        let final_base = if trimmed_base.starts_with('/') {
            trimmed_base.to_string()
        } else {
            format!("/{}", trimmed_base)
        };
        command.arg("--base-path").arg(final_base);
    }

    // Add extra args
    if !args.trim().is_empty() {
        for arg in args.split_whitespace() {
            command.arg(arg);
        }
    }

    // Configure stdout/stderr
    command.stdout(Stdio::piped());
    command.stderr(Stdio::piped());

    match command.spawn() {
        Ok(mut child) => {
            let stdout = child.stdout.take();
            let stderr = child.stderr.take();

            // Store the child
            *child_guard = Some(child);

            // Log file path
            let mut log_path_opt = None;
            if let Ok(app_data_dir) = app_handle.path().app_data_dir() {
                let log_file_path = app_data_dir.join("appium.log");
                let _ = std::fs::create_dir_all(&app_data_dir);
                let _ = std::fs::write(&log_file_path, ""); // Clear previous log
                log_path_opt = Some(log_file_path);
            }

            // Spawn tasks to read output and emit events
            if let Some(out) = stdout {
                let handle = app_handle.clone();
                let log_path = log_path_opt.clone();
                tokio::spawn(async move {
                    let mut reader = TokioBufReader::new(out).lines();
                    let mut file = if let Some(p) = &log_path {
                        tokio::fs::OpenOptions::new().create(true).append(true).open(p).await.ok()
                    } else {
                        None
                    };
                    while let Ok(Some(line)) = reader.next_line().await {
                        let _ = handle.emit("appium-output", &line);
                        if let Some(f) = &mut file {
                            let _ = f.write_all(format!("{}\n", line).as_bytes()).await;
                        }
                    }
                });
            }
            if let Some(err) = stderr {
                let handle = app_handle.clone();
                let log_path = log_path_opt.clone();
                tokio::spawn(async move {
                    let mut reader = TokioBufReader::new(err).lines();
                    let mut file = if let Some(p) = &log_path {
                        tokio::fs::OpenOptions::new().create(true).append(true).open(p).await.ok()
                    } else {
                        None
                    };
                    while let Ok(Some(line)) = reader.next_line().await {
                        let _ = handle.emit("appium-output", &line);
                        if let Some(f) = &mut file {
                            let _ = f.write_all(format!("{}\n", line).as_bytes()).await;
                        }
                    }
                });
            }

            Ok("Appium started".to_string())
        }
        Err(e) => Err(AppError::ProcessError(format!("Failed to spawn Appium process: {}. Ensure Appium is installed and available in PATH.", e))),
    }
}

pub async fn shutdown_appium(state: &AppiumState) {
    shutdown_appium_with_inner(&state.0).await;
}

pub async fn shutdown_appium_with_inner(inner: &Arc<Mutex<Option<Child>>>) {
    let child = {
        if let Ok(mut guard) = inner.lock() {
            guard.take()
        } else {
            None
        }
    };

    if let Some(mut c) = child {
        let _ = c.kill().await;
        let _ = c.wait().await;
    }
}

#[tauri::command]
pub async fn stop_appium_server(
    state: State<'_, AppiumState>,
    host: Option<String>,
    port: Option<u32>,
) -> AppResult<String> {
    // 1. Try to kill the internal process handle first
    shutdown_appium(&state).await;

    // 2. If host and port are provided, try to kill any process listening on that port
    // This handles cases where Appium was started in a new terminal or as an orphan
    if let (Some(h), Some(p)) = (host, port) {
        kill_process_by_port(&h, p).await?;
    }

    Ok("Appium server stopped".to_string())
}

async fn kill_process_by_port(_host: &str, port: u32) -> AppResult<()> {
    #[cfg(target_os = "windows")]
    {
        // Use netstat to find the PID
        let output = std::process::Command::new("cmd")
            .args(&["/c", &format!("netstat -ano | findstr :{}", port)])
            .output()
            .map_err(|e| AppError::ProcessError(format!("Failed to run netstat: {}", e)))?;

        let stdout = String::from_utf8_lossy(&output.stdout);
        for line in stdout.lines() {
            // Typical line: TCP    0.0.0.0:4723           0.0.0.0:0              LISTENING       1234
            let parts: Vec<&str> = line.split_whitespace().collect();
            if parts.len() >= 5 && parts[1].ends_with(&format!(":{}", port)) && parts[3] == "LISTENING" {
                if let Ok(pid) = parts[4].parse::<u32>() {
                    // Kill the process and its children
                    let _ = std::process::Command::new("taskkill")
                        .args(&["/F", "/T", "/PID", &pid.to_string()])
                        .output();
                }
            }
        }
    }

    #[cfg(not(target_os = "windows"))]
    {
        // Use lsof to find and kill the process
        let _ = std::process::Command::new("sh")
            .arg("-c")
            .arg(format!("lsof -ti :{} | xargs kill -9", port))
            .output();
    }

    Ok(())
}

#[tauri::command]
pub fn open_appium_log_terminal(app_handle: AppHandle) -> AppResult<()> {
    let log_path = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| AppError::FileSystemError(format!("Could not get app data dir: {}", e)))?
        .join("appium.log");

    if !log_path.exists() {
        return Err(AppError::FileSystemError("appium.log file does not exist. Appium might not have been started internally.".to_string()));
    }

    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NEW_CONSOLE: u32 = 0x00000010;
        let p_str = log_path.to_string_lossy().to_string();
        // Use double quotes for PowerShell path escaping
        let cmd_args = format!("Get-Content -Path \"{}\" -Wait -Tail 100", p_str);
        match std::process::Command::new("powershell")
            .arg("-NoExit")
            .arg("-Command")
            .arg(cmd_args)
            .creation_flags(CREATE_NEW_CONSOLE)
            .spawn()
        {
            Ok(_) => Ok(()),
            Err(e) => Err(AppError::ProcessError(format!("Failed to open terminal: {}", e))),
        }
    }
    #[cfg(not(target_os = "windows"))]
    {
        // Simple fallback for unix
        let p_str = log_path.to_string_lossy().to_string();
        match std::process::Command::new("x-terminal-emulator")
            .arg("-e")
            .arg("tail")
            .arg("-f")
            .arg(&p_str)
            .spawn()
        {
            Ok(_) => Ok(()),
            Err(e) => Err(AppError::ProcessError(format!("Failed to open terminal: {}", e))),
        }
    }
}

#[tauri::command]
pub fn start_appium_in_terminal(
    host: String,
    port: u32,
    base_path: String,
    args: String, 
) -> AppResult<String> {
    #[cfg(target_os = "windows")]
    let cmd = "appium.cmd";
    #[cfg(not(target_os = "windows"))]
    let cmd = "appium";

    #[cfg(target_os = "windows")]
    {
        // Build arguments vector safely
        let mut full_args = vec!["/c".to_string(), "start".to_string(), "cmd".to_string(), "/k".to_string()];
        
        let mut appium_cmd = format!("{} --address {} --port {}", cmd, host, port);
        let trimmed_base = base_path.trim();
        if !trimmed_base.is_empty() && trimmed_base != "/" {
            let final_base = if trimmed_base.starts_with('/') {
                trimmed_base.to_string()
            } else {
                format!("/{}", trimmed_base)
            };
            appium_cmd.push_str(&format!(" --base-path {}", final_base));
        }
        
        // Add extra args safely by splitting them for the terminal execution
        if !args.trim().is_empty() {
            appium_cmd.push_str(&format!(" {}", args));
        }

        full_args.push(appium_cmd);

        match std::process::Command::new("cmd")
            .args(&full_args)
            .spawn()
        {
            Ok(_) => Ok("Appium started in new terminal".to_string()),
            Err(e) => Err(AppError::ProcessError(format!("Failed to start terminal: {}", e))),
        }
    }
    #[cfg(not(target_os = "windows"))]
    {
        let mut appium_cmd = format!("{} --address {} --port {}", cmd, host, port);
        let trimmed_base = base_path.trim();
        if !trimmed_base.is_empty() && trimmed_base != "/" {
            let final_base = if trimmed_base.starts_with('/') {
                trimmed_base.to_string()
            } else {
                format!("/{}", trimmed_base)
            };
            appium_cmd.push_str(&format!(" --base-path {}", final_base));
        }
        if !args.trim().is_empty() {
             appium_cmd.push_str(&format!(" {}", args));
        }

        match std::process::Command::new("x-terminal-emulator")
            .arg("-e")
            .arg("bash")
            .arg("-c")
            .arg(format!("{}; exec bash", appium_cmd))
            .spawn()
        {
            Ok(_) => Ok("Appium started in new terminal".to_string()),
            Err(e) => Err(AppError::ProcessError(format!("Failed to start terminal: {}", e))),
        }
    }
}
