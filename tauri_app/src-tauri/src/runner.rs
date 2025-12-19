use tauri::{AppHandle, Emitter, State, Manager};
use std::process::{Command, Stdio, Child};
use std::io::{BufRead, BufReader};
use std::thread;
use std::sync::Mutex;
use std::time::Duration;

pub struct TestState(pub Mutex<Option<Child>>);

#[tauri::command]
pub fn stop_robot_test(state: State<'_, TestState>) -> Result<String, String> {
    let mut child_guard = state.0.lock().map_err(|e| e.to_string())?;
    
    if let Some(child) = child_guard.as_mut() {
        child.kill().map_err(|e| format!("Failed to kill process: {}", e))?;
        return Ok("Test stopped".to_string());
    }
    Err("No test running".to_string())
}

#[tauri::command]
pub fn run_robot_test(app: AppHandle, state: State<'_, TestState>, test_path: String, output_dir: String, device: Option<String>) -> Result<String, String> {
    // Resolve absolute path for output_dir to ensure clean logs
    let abs_output_dir = std::fs::canonicalize(&output_dir)
        .map(|p| {
            let s = p.to_string_lossy().to_string();
            // Remove Windows UNC prefix if present
            if s.starts_with(r"\\?\") {
                s[4..].to_string()
            } else {
                s
            }
        })
        .unwrap_or_else(|_| output_dir.clone());

    let mut args = vec!["-d", &abs_output_dir, "--console", "verbose"];
    
    let device_arg; // Extend lifetime
    if let Some(d) = &device {
        device_arg = format!("udid:{}", d);
        args.push("-v");
        args.push(&device_arg);
    }
    
    args.push(&test_path);

    let mut child = Command::new("robot")
        .args(&args)
        .env("PYTHONIOENCODING", "utf-8")
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to start robot: {}. Make sure 'robot' is requested in PATH.", e))?;

    let stdout = child.stdout.take().ok_or("Failed to open stdout")?;
    let stderr = child.stderr.take().ok_or("Failed to open stderr")?;

    // Streaming threads (std out/err)
    // We can just let them run until EOF (when child closes pipes)
    let app_handle = app.clone();
    thread::spawn(move || {
        let mut reader = BufReader::new(stdout);
        let mut buf = Vec::new();
        while let Ok(n) = reader.read_until(b'\n', &mut buf) {
            if n == 0 { break; }
            let line = String::from_utf8_lossy(&buf).to_string();
            let _ = app_handle.emit("test-output", line.trim_end());
            buf.clear();
        }
    });

    let app_handle_err = app.clone();
    thread::spawn(move || {
        let mut reader = BufReader::new(stderr);
        let mut buf = Vec::new();
        while let Ok(n) = reader.read_until(b'\n', &mut buf) {
            if n == 0 { break; }
            let line = String::from_utf8_lossy(&buf).to_string();
            let _ = app_handle_err.emit("test-output", format!("STDERR: {}", line.trim_end()));
            buf.clear();
        }
    });

    // Store child in state
    {
        let mut guard = state.0.lock().map_err(|e| e.to_string())?;
        if guard.is_some() {
             return Err("A test is already running".to_string());
        }
        *guard = Some(child);
    }

    // Monitoring thread
    // using Arc to share state with thread
    let app_handle_finish = app.clone();
    // We cannot pass 'state' (State wrapper) to thread directly easily??
    // Actually State wraps an Arc/reference to the managed state.
    // But State itself is not Send if it holds a reference? 
    // State<T> implements Clone, but it's bound to the lifetime of the request?
    // In Tauri v2, State is usually Clone and Send?
    // Wait, State<'r, T> has lifetime. I can't move it to a thread.
    // I need to clone the INNER Arc/Data if possible.
    // Actually, I can use app.state::<TestState>() inside the thread?
    // YES. `app` is AppHandle, can retrieve state.
    
    thread::spawn(move || {
        loop {
            thread::sleep(Duration::from_millis(500));
            
            let state = app_handle_finish.state::<TestState>();
            let mut guard: std::sync::MutexGuard<Option<Child>> = match state.0.lock() {
                Ok(g) => g,
                Err(_) => break, // Poisoned
            };

            if let Some(child) = guard.as_mut() {
                match child.try_wait() {
                    Ok(Some(status)) => {
                        let _ = app_handle_finish.emit("test-finished", format!("Exit Code: {}", status));
                        *guard = None; // clear
                        break;
                    },
                    Ok(None) => {
                        // Still running
                    },
                    Err(e) => {
                         let _ = app_handle_finish.emit("test-finished", format!("Error checking status: {}", e));
                         *guard = None;
                         break;
                    }
                }
            } else {
                // Should not happen if we set it above, unless stopped externally and cleared?
                // If None, it means it was stopped?
                // But stop logic does not clear it?
                // The loop should handle it.
                // If stop command kills it, try_wait will eventually return exit status (even if killed).
                // Or maybe kill doesn't wait.
                // If stopped, we should probably verify.
                break;
            }
        }
    });

    Ok("Started".to_string())
}
