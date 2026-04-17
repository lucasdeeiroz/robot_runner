use std::sync::Mutex;
use std::process::Stdio;
use std::process::Command;
use tauri::{State, Emitter};

// State to hold the Appium process
pub struct AppiumState(pub Mutex<Option<std::process::Child>>);

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
) -> Result<AppiumStatus, String> {
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
                Ok(None) => (true, Some(child.id())),
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
pub fn start_appium_server(
    state: State<'_, AppiumState>,
    host: String,
    port: u32,
    base_path: String,
    args: String, // Extra args string
    app_handle: tauri::AppHandle,
) -> Result<String, String> {
    let mut child_guard = state.0.lock().map_err(|e| e.to_string())?;

    // Check if already running
    if let Some(child) = &mut *child_guard {
        if let Ok(None) = child.try_wait() {
            return Err("Appium is already running".to_string());
        }
    }

    // Determine executable (windows vs unix)
    #[cfg(target_os = "windows")]
    let cmd = "appium.cmd";
    #[cfg(not(target_os = "windows"))]
    let cmd = "appium";

    let mut command = Command::new(cmd);

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
        // Simple splitting by space - simplistic for now, might need shell-words crate for quotes
        for arg in args.split_whitespace() {
            command.arg(arg);
        }
    }

    // Configure stdout/stderr
    command.stdout(Stdio::piped());
    command.stderr(Stdio::piped());

    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        command.creation_flags(CREATE_NO_WINDOW);
    }

    match command.spawn() {
        Ok(mut child) => {
            let stdout = child.stdout.take();
            let stderr = child.stderr.take();

            // Store the child
            *child_guard = Some(child);

            // Log file path
            let mut log_path_opt = None;
            use tauri::Manager;
            if let Ok(app_data_dir) = app_handle.path().app_data_dir() {
                let log_file_path = app_data_dir.join("appium.log");
                let _ = std::fs::create_dir_all(&app_data_dir);
                let _ = std::fs::write(&log_file_path, ""); // Clear previous log
                log_path_opt = Some(log_file_path);
            }

            // Spawn threads to read output and emit events
            if let Some(out) = stdout {
                let handle = app_handle.clone();
                let log_path = log_path_opt.clone();
                std::thread::spawn(move || {
                    use std::io::{BufRead, BufReader, Write};
                    let reader = BufReader::new(out);
                    let mut file = if let Some(p) = &log_path {
                        std::fs::OpenOptions::new().create(true).append(true).open(p).ok()
                    } else {
                        None
                    };
                    for line in reader.lines() {
                        if let Ok(l) = line {
                            let _ = handle.emit("appium-output", &l);
                            if let Some(f) = &mut file {
                                let _ = writeln!(f, "{}", l);
                            }
                        }
                    }
                });
            }
            if let Some(err) = stderr {
                let handle = app_handle.clone();
                let log_path = log_path_opt.clone();
                std::thread::spawn(move || {
                    use std::io::{BufRead, BufReader, Write};
                    let reader = BufReader::new(err);
                    let mut file = if let Some(p) = &log_path {
                        std::fs::OpenOptions::new().create(true).append(true).open(p).ok()
                    } else {
                        None
                    };
                    for line in reader.lines() {
                        if let Ok(l) = line {
                            let _ = handle.emit("appium-output", &l);
                            if let Some(f) = &mut file {
                                let _ = writeln!(f, "{}", l);
                            }
                        }
                    }
                });
            }

            Ok("Appium started".to_string())
        }
        Err(e) => Err(format!("Failed to spawn Appium process: {}. Ensure Appium is installed and available in PATH.", e)),
    }
}

pub fn shutdown_appium(state: &AppiumState) {
    if let Ok(mut child_guard) = state.0.lock() {
        if let Some(mut child) = (*child_guard).take() { // take() replaces with None immediately
             // Handle Windows Process Tree Killing
            #[cfg(target_os = "windows")]
            {
                use std::os::windows::process::CommandExt;
                let pid = child.id();
                let _ = Command::new("taskkill")
                    .args(&["/F", "/T", "/PID", &pid.to_string()])
                    .creation_flags(0x08000000) // CREATE_NO_WINDOW
                    .output();
            }
            let _ = child.kill();
            let _ = child.wait(); // prevent zombie
        }
    }
}

#[tauri::command]
pub fn stop_appium_server(state: State<'_, AppiumState>) -> Result<String, String> {
    shutdown_appium(&state);
    Ok("Appium server stopped".to_string())
}

#[tauri::command]
pub fn open_appium_log_terminal(app_handle: tauri::AppHandle) -> Result<(), String> {
    use tauri::Manager;
    let log_path = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| format!("Could not get app data dir: {}", e))?
        .join("appium.log");

    if !log_path.exists() {
        return Err("appium.log file does not exist. Appium might not have been started internally.".to_string());
    }

    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NEW_CONSOLE: u32 = 0x00000010;
        let p_str = log_path.to_string_lossy().to_string();
        let cmd_args = format!("Get-Content -Path '{}' -Wait -Tail 100", p_str);
        match Command::new("powershell")
            .arg("-NoExit")
            .arg("-Command")
            .arg(cmd_args)
            .creation_flags(CREATE_NEW_CONSOLE)
            .spawn()
        {
            Ok(_) => Ok(()),
            Err(e) => Err(format!("Failed to open terminal: {}", e)),
        }
    }
    #[cfg(not(target_os = "windows"))]
    {
        // Simple fallback for unix
        let p_str = log_path.to_string_lossy().to_string();
        match Command::new("x-terminal-emulator")
            .arg("-e")
            .arg("tail")
            .arg("-f")
            .arg(&p_str)
            .spawn()
        {
            Ok(_) => Ok(()),
            Err(e) => Err(format!("Failed to open terminal: {}", e)),
        }
    }
}

#[tauri::command]
pub fn start_appium_in_terminal(
    host: String,
    port: u32,
    base_path: String,
    args: String, 
) -> Result<String, String> {
    #[cfg(target_os = "windows")]
    let cmd = "appium.cmd";
    #[cfg(not(target_os = "windows"))]
    let cmd = "appium";

    let mut command_line = format!("{} --address {} --port {}", cmd, host, port);

    let trimmed_base = base_path.trim();
    if !trimmed_base.is_empty() && trimmed_base != "/" {
        let final_base = if trimmed_base.starts_with('/') {
            trimmed_base.to_string()
        } else {
            format!("/{}", trimmed_base)
        };
        command_line.push_str(&format!(" --base-path {}", final_base));
    }

    if !args.trim().is_empty() {
        command_line.push_str(&format!(" {}", args));
    }

    #[cfg(target_os = "windows")]
    {
        match Command::new("cmd")
            .arg("/c")
            .arg("start")
            .arg("cmd")
            .arg("/k")
            .arg(&command_line)
            .spawn()
        {
            Ok(_) => Ok("Appium started in new terminal".to_string()),
            Err(e) => Err(format!("Failed to start terminal: {}", e)),
        }
    }
    #[cfg(not(target_os = "windows"))]
    {
        match Command::new("x-terminal-emulator")
            .arg("-e")
            .arg("bash")
            .arg("-c")
            .arg(format!("{}; exec bash", command_line))
            .spawn()
        {
            Ok(_) => Ok("Appium started in new terminal".to_string()),
            Err(e) => Err(format!("Failed to start terminal: {}", e)),
        }
    }
}
