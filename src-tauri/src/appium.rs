use std::process::{Command, Child, Stdio};
use std::sync::Mutex;
use tauri::{State, Emitter};

// State to hold the Appium process
pub struct AppiumState(pub Mutex<Option<Child>>);

#[derive(serde::Serialize, Clone)]
pub struct AppiumStatus {
    running: bool,
    pid: Option<u32>,
}

#[tauri::command]
pub fn get_appium_status(state: State<'_, AppiumState>) -> AppiumStatus {
    let mut child_guard = state.0.lock().unwrap();
    if let Some(child) = &mut *child_guard {
        // limit: try_wait() returns Ok(Some(_)) if exited, Ok(None) if running
        match child.try_wait() {
            Ok(Some(_)) => {
                // It has exited
                *child_guard = None; // Clean up
                AppiumStatus { running: false, pid: None }
            }
            Ok(None) => {
                // Still running
                AppiumStatus { running: true, pid: Some(child.id()) }
            }
            Err(_) => {
                 *child_guard = None;
                 AppiumStatus { running: false, pid: None }
            }
        }
    } else {
        AppiumStatus { running: false, pid: None }
    }
}

#[tauri::command]
pub fn start_appium_server(
    state: State<'_, AppiumState>,
    host: String,
    port: u32,
    args: String, // Extra args string
    app_handle: tauri::AppHandle
) -> Result<String, String> {
    let mut child_guard = state.0.lock().unwrap();
    
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

            // Spawn threads to read output and emit events
            if let Some(out) = stdout {
                let handle = app_handle.clone();
                std::thread::spawn(move || {
                    use std::io::{BufRead, BufReader};
                    let reader = BufReader::new(out);
                    for line in reader.lines() {
                        if let Ok(l) = line {
                            let _ = handle.emit("appium-output", l);
                        }
                    }
                });
            }
            if let Some(err) = stderr {
                let handle = app_handle.clone();
                std::thread::spawn(move || {
                    use std::io::{BufRead, BufReader};
                    let reader = BufReader::new(err);
                    for line in reader.lines() {
                        if let Ok(l) = line {
                            let _ = handle.emit("appium-output", l); // Unified event or separate 'appium-error'?
                        }
                    }
                });
            }

            Ok("Appium started".to_string())
        }
        Err(e) => Err(format!("Failed to start appium: {}", e))
    }
}

#[tauri::command]
pub fn stop_appium_server(state: State<'_, AppiumState>) -> Result<String, String> {
    let mut child_guard = state.0.lock().unwrap();
    if let Some(mut child) = child_guard.take() {
        // Handle Windows Process Tree Killing
        #[cfg(target_os = "windows")]
        {
            use std::os::windows::process::CommandExt; // Import CommandExt here
            let pid = child.id();
            let _ = Command::new("taskkill")
                .args(&["/F", "/T", "/PID", &pid.to_string()])
                .creation_flags(0x08000000) // CREATE_NO_WINDOW
                .output();
                
            // We still call child.kill() / wait just to be sure Rust knows it's gone
            let _ = child.kill();
        }

        #[cfg(not(target_os = "windows"))]
        {
             let _ = child.kill();
        }
        
        let _ = child.wait(); // Prevent zombie process
        
        Ok("Appium stopped".to_string())
    } else {
        Ok("Appium was not running".to_string())
    }
}
