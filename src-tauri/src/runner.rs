use tauri::{AppHandle, Emitter, State, Manager};
use std::process::{Command, Stdio, Child};
use std::io::{BufRead, BufReader};
use std::thread;
use std::sync::Mutex;
use std::time::Duration;
use std::collections::HashMap;
use chrono;

pub struct TestState(pub Mutex<HashMap<String, Child>>);

#[tauri::command]
pub fn stop_robot_test(state: State<'_, TestState>, run_id: String) -> Result<String, String> {
    let mut procs = state.0.lock().map_err(|e| e.to_string())?;
    
    if let Some(mut child) = procs.remove(&run_id) {
         // Handle Windows Process Tree Killing
        #[cfg(target_os = "windows")]
        {
            use std::os::windows::process::CommandExt;
            let pid = child.id();
            let _ = Command::new("taskkill")
                .args(&["/F", "/T", "/PID", &pid.to_string()])
                .creation_flags(0x08000000) // CREATE_NO_WINDOW
                .output();
                
            let _ = child.kill();
        }

        #[cfg(not(target_os = "windows"))]
        {
             let _ = child.kill();
        }

        let _ = child.wait();
        return Ok(format!("Test {} stopped", run_id));
    }
    Err(format!("Test {} not running", run_id))
}

#[derive(serde::Serialize, Clone)]
struct TestOutput {
    run_id: String,
    message: String,
}

#[derive(serde::Serialize, Clone)]
struct TestFinished {
    run_id: String,
    status: String,
}

#[tauri::command]
pub fn run_robot_test(app: AppHandle, state: State<'_, TestState>, run_id: String, test_path: Option<String>, output_dir: String, device: Option<String>, arguments_file: Option<String>, timestamp_outputs: Option<bool>, device_model: Option<String>, android_version: Option<String>, working_dir: Option<String>) -> Result<String, String> {
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

    if let Some(true) = timestamp_outputs {
        args.push("--timestampoutputs");
    }

    let device_arg; 
    if let Some(d) = &device {
        device_arg = format!("udid:{}", d);
        args.push("-v");
        args.push(&device_arg);
    }
    
    if let Some(arg_file) = &arguments_file {
        args.push("-A");
        args.push(arg_file);
    }
    
    // Only add test_path if it is provided
    if let Some(tp) = &test_path {
        if !tp.is_empty() {
            args.push(tp);
        }
    }

    // Write metadata.json for history
    let metadata_path = std::path::Path::new(&abs_output_dir).join("metadata.json");
    let meta_device = device.clone().unwrap_or("Local/Unknown".to_string());
    let meta_model = device_model.unwrap_or_default();
    let meta_version = android_version.unwrap_or_default();
    
    // Simple JSON construction format!
    let metadata_json = format!(
        r#"{{
            "run_id": "{}",
            "device_udid": "{}",
            "test_path": "{}",
            "timestamp": "{}",
            "device_model": "{}",
            "android_version": "{}"
        }}"#, 
        run_id, 
        meta_device.replace("\\", "\\\\").replace("\"", "\\\""), 
        test_path.clone().unwrap_or_default().replace("\\", "\\\\").replace("\"", "\\\""),
        chrono::Local::now().to_rfc3339(),
        meta_model.replace("\\", "\\\\").replace("\"", "\\\""),
        meta_version.replace("\\", "\\\\").replace("\"", "\\\"")
    );

    // Create dir if not exists (Robot does it, but we do it before Robot)
    let _ = std::fs::create_dir_all(&abs_output_dir);
    let _ = std::fs::write(metadata_path, metadata_json);

    let mut cmd = Command::new("robot"); // Keeping generic "robot" relies on PATH.
    cmd.args(&args);

    if let Some(wd) = working_dir {
        if !wd.is_empty() {
            cmd.current_dir(wd);
        }
    }

    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
    }

    let mut child = cmd
        .env("PYTHONIOENCODING", "utf-8")
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to start robot: {}. Make sure 'robot' is requested in PATH.", e))?;

    let stdout = child.stdout.take().ok_or("Failed to open stdout")?;
    let stderr = child.stderr.take().ok_or("Failed to open stderr")?;

    // Streaming threads
    let app_handle = app.clone();
    let rid = run_id.clone();
    thread::spawn(move || {
        let mut reader = BufReader::new(stdout);
        let mut buf = Vec::new();
        while let Ok(n) = reader.read_until(b'\n', &mut buf) {
            if n == 0 { break; }
            let line = String::from_utf8_lossy(&buf).to_string();
            let _ = app_handle.emit("test-output", TestOutput { 
                run_id: rid.clone(), 
                message: line.trim_end().to_string() 
            });
            buf.clear();
        }
    });

    let app_handle_err = app.clone();
    let rid_err = run_id.clone();
    thread::spawn(move || {
        let mut reader = BufReader::new(stderr);
        let mut buf = Vec::new();
        while let Ok(n) = reader.read_until(b'\n', &mut buf) {
            if n == 0 { break; }
            let line = String::from_utf8_lossy(&buf).to_string();
            let _ = app_handle_err.emit("test-output", TestOutput { 
                run_id: rid_err.clone(), 
                message: format!("STDERR: {}", line.trim_end()) 
            });
            buf.clear();
        }
    });

    // Store child in state
    {
        let mut procs = state.0.lock().map_err(|e| e.to_string())?;
        if procs.contains_key(&run_id) {
             return Err(format!("Run ID {} already exists", run_id));
        }
        procs.insert(run_id.clone(), child);
    }

    // Monitoring thread
    let app_handle_finish = app.clone();
    let rid_monitor = run_id.clone();
    
    thread::spawn(move || {
        loop {
            thread::sleep(Duration::from_millis(500));
            
            let state = app_handle_finish.state::<TestState>();
            let mut procs: std::sync::MutexGuard<HashMap<String, Child>> = match state.0.lock() {
                Ok(g) => g,
                Err(_) => break, 
            };

            // Check if process exists and is running
            let mut finished = false;
            let mut status_msg = String::new();

            if let Some(child) = procs.get_mut(&rid_monitor) {
                match child.try_wait() {
                    Ok(Some(status)) => {
                        finished = true;
                        status_msg = format!("Exit Code: {}", status);
                    },
                    Ok(None) => {}, // Still running
                    Err(e) => {
                        finished = true;
                        status_msg = format!("Error checking status: {}", e);
                    }
                }
            } else {
                // Removed from map (stopped externally)
                break;
            }

            if finished {
                // Remove from map
                procs.remove(&rid_monitor);
                // Drop lock before emitting? No, try_wait is fast.
                drop(procs); 

                let _ = app_handle_finish.emit("test-finished", TestFinished { 
                    run_id: rid_monitor, 
                    status: status_msg 
                });
                break;
            }
        }
    });

    Ok("Started".to_string())
}
