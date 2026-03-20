use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use tauri::{Emitter, State};

// State to hold the Appium process
pub struct AppiumState(pub Mutex<Option<Child>>);

#[derive(serde::Serialize, Clone)]
pub struct AppiumStatus {
    running: bool,
    pid: Option<u32>,
}

#[tauri::command]
pub fn get_appium_status(
    state: State<'_, AppiumState>,
    host: Option<String>,
    port: Option<u32>,
) -> AppiumStatus {
    let mut child_guard = match state.0.lock() {
        Ok(guard) => guard,
        Err(_) => {
            // If poisoned, we assume it's not running or in bad state.
            // Ideally we should log this.
            return AppiumStatus {
                running: false,
                pid: None,
            };
        }
    };
    let (internal_running, internal_pid) = if let Some(child) = &mut *child_guard {
        // limit: try_wait() returns Ok(Some(_)) if exited, Ok(None) if running
        match child.try_wait() {
            Ok(Some(_)) => {
                // It has exited
                *child_guard = None; // Clean up
                (false, None)
            }
            Ok(None) => {
                // Still running
                (true, Some(child.id()))
            }
            Err(_) => {
                *child_guard = None;
                (false, None)
            }
        }
    } else {
        (false, None)
    };

    let port_open = if let (Some(h), Some(p)) = (host, port) {
        let check_host = if h == "0.0.0.0" { "127.0.0.1" } else { &h };
        let addr = format!("{}:{}", check_host, p);
        if let Ok(addrs) = std::net::ToSocketAddrs::to_socket_addrs(&addr) {
            addrs.into_iter().any(|a| {
                std::net::TcpStream::connect_timeout(&a, std::time::Duration::from_millis(500)).is_ok()
            })
        } else {
            false
        }
    } else {
        false
    };

    if port_open {
        AppiumStatus {
            running: true,
            pid: internal_pid,
        }
    } else {
        AppiumStatus {
            running: internal_running,
            pid: internal_pid,
        }
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
        if let Some(mut child) = child_guard.take() { // take() replaces with None immediately
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
