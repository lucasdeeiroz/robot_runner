use chrono;
use std::collections::HashMap;
use std::io::{BufRead, BufReader};
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use std::thread;
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager, State};

pub struct TestState(pub Mutex<HashMap<String, Child>>);

#[tauri::command]
pub async fn stop_test(state: State<'_, TestState>, run_id: String) -> Result<String, String> {
    let mut procs = state.0.lock().map_err(|e| e.to_string())?;

    if let Some(child) = procs.get_mut(&run_id) {
        let pid = child.id();

        #[cfg(target_os = "windows")]
        {
            use std::os::windows::process::CommandExt;
            let _ = Command::new("taskkill")
                .args(&["/F", "/T", "/PID", &pid.to_string()])
                .creation_flags(0x08000000)
                .output();
        }

        #[cfg(not(target_os = "windows"))]
        {
            let _ = Command::new("kill")
                .args(&["-9", &pid.to_string()])
                .output();
        }
        
        // Final fallback
        let _ = child.kill(); 
        return Ok(format!("Test {} stopped", run_id));
    }
    Err(format!("Test {} not running", run_id))
}

pub fn shutdown_all_tests(state: &State<'_, TestState>) {
    let mut procs = match state.0.lock() {
        Ok(g) => g,
        Err(e) => {
            eprintln!("Failed to lock TestState mutex: {}", e);
            return;
        }
    };

    for (run_id, child) in procs.iter_mut() {
        let pid = child.id();
        println!("Shutting down robot test {} (PID: {})", run_id, pid);

        #[cfg(target_os = "windows")]
        {
            use std::os::windows::process::CommandExt;
            let _ = Command::new("taskkill")
                .args(&["/F", "/T", "/PID", &pid.to_string()])
                .creation_flags(0x08000000)
                .output();
        }

        #[cfg(not(target_os = "windows"))]
        {
            let _ = Command::new("kill")
                .args(&["-9", &pid.to_string()])
                .output();
        }
        
        let _ = child.kill();
    }
    procs.clear();
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
pub fn run_robot_test(
    app: AppHandle,
    state: State<'_, TestState>,
    run_id: String,
    test_path: Option<String>,
    output_dir: String,
    device: Option<String>,
    arguments_file: Option<String>,
    timestamp_outputs: Option<bool>,
    device_model: Option<String>,
    android_version: Option<String>,
    working_dir: Option<String>,
    rerun_failed_from: Option<String>, // Added this
) -> Result<String, String> {
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


    // Rerunning logic: Must appear before any Datasource (which might come from -A)
    if let Some(xml_path) = &rerun_failed_from {
        if !xml_path.is_empty() {
            args.push("--rerunfailed");
            args.push(xml_path);
            args.push("--output");
            args.push("output_rerun.xml");
        }
    }

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
        test_path
            .clone()
            .unwrap_or_default()
            .replace("\\", "\\\\")
            .replace("\"", "\\\""),
        chrono::Local::now().to_rfc3339(),
        meta_model.replace("\\", "\\\\").replace("\"", "\\\""),
        meta_version.replace("\\", "\\\\").replace("\"", "\\\"")
    );

    // Create dir if not exists
    let _ = std::fs::create_dir_all(&abs_output_dir);
    let _ = std::fs::write(metadata_path, metadata_json);

    let mut cmd = Command::new("python");
    cmd.env("PYTHONIOENCODING", "utf-8");
    cmd.env("PYTHONUTF8", "1");
    cmd.arg("-m").arg("robot");
    cmd.args(&args);
    
    spawn_and_monitor(app, state, run_id, cmd, working_dir)
}

#[tauri::command]
pub fn run_maestro_test(
    app: AppHandle,
    state: State<'_, TestState>,
    run_id: String,
    test_path: String,
    output_dir: String,
    device: Option<String>,
    maestro_args: Option<String>,
    working_dir: Option<String>,
    timestamp_outputs: Option<bool>,
) -> Result<String, String> {
    let abs_output_dir = std::fs::canonicalize(&output_dir)
        .map(|p| p.to_string_lossy().to_string().replace(r"\\?\", ""))
        .unwrap_or_else(|_| output_dir.clone());

    let _ = std::fs::create_dir_all(&abs_output_dir);

    // Determine report filename
    let mut report_filename = "output-maestro.xml".to_string();
    if let Some(true) = timestamp_outputs {
        let timestamp = chrono::Local::now().format("%Y%m%d-%H%M%S").to_string();
        report_filename = format!("output-maestro-{}.xml", timestamp);
    }
    
    // Metadata
    let metadata_path = std::path::Path::new(&abs_output_dir).join("metadata.json");
    let metadata_json = format!(
        r#"{{
            "run_id": "{}",
            "framework": "maestro",
            "test_path": "{}",
            "timestamp": "{}"
        }}"#,
        run_id,
        test_path.replace("\\", "\\\\").replace("\"", "\\\""),
        chrono::Local::now().to_rfc3339()
    );
    let _ = std::fs::write(metadata_path, metadata_json);

    let mut cmd_args = vec![];
    
    // maestro [args] test [path] --udid [udid] --output [report_path]
    if let Some(args) = maestro_args {
        if !args.is_empty() {
            for arg in args.split_whitespace() {
                 cmd_args.push(arg.to_string());
            }
        }
    }

    cmd_args.push("test".to_string());
    cmd_args.push(test_path);

    if let Some(d) = device {
        cmd_args.push("--udid".to_string());
        cmd_args.push(d);
    }

    // Add report output
    let report_path = std::path::Path::new(&abs_output_dir).join(report_filename);
    cmd_args.push("--format".to_string());
    cmd_args.push("junit".to_string());
    cmd_args.push("--output".to_string());
    cmd_args.push(report_path.to_string_lossy().to_string());

    let mut cmd;
    #[cfg(target_os = "windows")]
    {
        // Use shell on Windows to resolve maestro.cmd/ps1
        cmd = Command::new("cmd");
        cmd.arg("/C").arg("maestro");
        for arg in cmd_args {
            cmd.arg(arg);
        }
    }
    
    #[cfg(not(target_os = "windows"))]
    {
        cmd = Command::new("maestro");
        cmd.args(cmd_args);
    }

    cmd.env("JAVA_TOOL_OPTIONS", "-Dfile.encoding=UTF-8");

    spawn_and_monitor(app, state, run_id, cmd, working_dir)
}

#[tauri::command]
pub fn run_appium_test(
    app: AppHandle,
    state: State<'_, TestState>,
    run_id: String,
    project_path: String,
    output_dir: String,
    appium_java_args: Option<String>,
) -> Result<String, String> {
    let abs_project_path = std::fs::canonicalize(&project_path)
        .map(|p| p.to_string_lossy().to_string().replace(r"\\?\", ""))
        .unwrap_or_else(|_| project_path.clone());

    let abs_output_dir = std::fs::canonicalize(&output_dir)
        .map(|p| p.to_string_lossy().to_string().replace(r"\\?\", ""))
        .unwrap_or_else(|_| output_dir.clone());

    let _ = std::fs::create_dir_all(&abs_output_dir);

    // Metadata
    let metadata_path = std::path::Path::new(&abs_output_dir).join("metadata.json");
    let metadata_json = format!(
        r#"{{
            "run_id": "{}",
            "framework": "appium",
            "timestamp": "{}"
        }}"#,
        run_id,
        chrono::Local::now().to_rfc3339()
    );
    let _ = std::fs::write(metadata_path, metadata_json);

    let mut cmd;
    #[cfg(target_os = "windows")]
    {
        cmd = Command::new("cmd");
        cmd.arg("/C").arg("mvn");
    }
    #[cfg(not(target_os = "windows"))]
    {
        cmd = Command::new("mvn");
    }

    if let Some(args) = appium_java_args {
        if !args.is_empty() {
             for arg in args.split_whitespace() {
                 cmd.arg(arg);
             }
        } else {
             cmd.arg("test");
        }
    } else {
        cmd.arg("test");
    }

    cmd.env("JAVA_TOOL_OPTIONS", "-Dfile.encoding=UTF-8");

    spawn_and_monitor(app, state, run_id, cmd, Some(abs_project_path))
}

fn spawn_and_monitor(
    app: AppHandle,
    state: State<'_, TestState>,
    run_id: String,
    mut cmd: Command,
    working_dir: Option<String>,
) -> Result<String, String> {
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
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to spawn process: {}", e))?;

    let stdout = child.stdout.take().ok_or("Failed to open stdout")?;
    let stderr = child.stderr.take().ok_or("Failed to open stderr")?;

    // Streaming threads
    let app_handle = app.clone();
    let rid = run_id.clone();
    thread::spawn(move || {
        let mut reader = BufReader::new(stdout);
        let mut buf = Vec::new();
        while let Ok(n) = reader.read_until(b'\n', &mut buf) {
            if n == 0 {
                break;
            }
            let line = String::from_utf8_lossy(&buf).to_string();
            let _ = app_handle.emit(
                "test-output",
                TestOutput {
                    run_id: rid.clone(),
                    message: line.trim_end().to_string(),
                },
            );
            buf.clear();
        }
    });

    let app_handle_err = app.clone();
    let rid_err = run_id.clone();
    thread::spawn(move || {
        let mut reader = BufReader::new(stderr);
        let mut buf = Vec::new();
        while let Ok(n) = reader.read_until(b'\n', &mut buf) {
            if n == 0 {
                break;
            }
            let line = String::from_utf8_lossy(&buf).to_string();
            let _ = app_handle_err.emit(
                "test-output",
                TestOutput {
                    run_id: rid_err.clone(),
                    message: format!("STDERR: {}", line.trim_end()),
                },
            );
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
                    }
                    Ok(None) => {} // Still running
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
                drop(procs);

                let _ = app_handle_finish.emit(
                    "test-finished",
                    TestFinished {
                        run_id: rid_monitor,
                        status: status_msg,
                    },
                );
                break;
            }
        }
    });

    Ok("Started".to_string())
}
