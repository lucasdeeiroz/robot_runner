use chrono;
use serde::Serialize;
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::process::Stdio;
use tauri::{AppHandle, Emitter, State};
use tokio::io::AsyncBufReadExt;
use tokio::process::{Child, Command};

pub struct TestState(pub Arc<Mutex<HashMap<String, Child>>>);

#[tauri::command]
pub async fn stop_test(state: State<'_, TestState>, run_id: String) -> Result<String, String> {
    let child = {
        let mut procs = state.0.lock().map_err(|e| e.to_string())?;
        procs.remove(&run_id)
    };

    if let Some(mut c) = child {
        let _ = c.kill().await;
        Ok(format!("Test {} stopped", run_id))
    } else {
        Err(format!("No running test found for id: {}", run_id))
    }
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
        if let Some(pid) = child.id() {
            println!("Shutting down robot test {} (PID: {})", run_id, pid);

            #[cfg(target_os = "windows")]
            {
                use std::os::windows::process::CommandExt;
                let _ = std::process::Command::new("taskkill")
                    .args(&["/F", "/T", "/PID", &pid.to_string()])
                    .creation_flags(0x08000000)
                    .output();
            }

            #[cfg(not(target_os = "windows"))]
            {
                let _ = std::process::Command::new("kill")
                    .args(&["-9", &pid.to_string()])
                    .output();
            }
        }
        
        let _ = child.start_kill();
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
    success: bool,
    status: String,
}

#[tauri::command]
pub async fn run_robot_test(
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
    rerun_failed_from: Option<String>,
    selected_tests: Option<Vec<String>>,
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

    // Inject LiveConsoleListener to force real-time stdout updates for test names
    let listener_path = std::path::Path::new(&abs_output_dir).join("LiveConsoleListener.py");
    let listener_code = r#"
import sys

ROBOT_LISTENER_API_VERSION = 2

def start_suite(name, attrs):
    sys.stdout.write(f"\n[RR-SUITE-START] {name}\n")
    sys.stdout.flush()

def end_suite(name, attrs):
    sys.stdout.write(f"\n[RR-SUITE-END] {name} | {attrs['status']}\n")
    sys.stdout.flush()

def start_test(name, attrs):
    sys.stdout.write(f"\n[RR-TEST-START] {name}\n")
    sys.stdout.flush()

def end_test(name, attrs):
    sys.stdout.write(f"\n[RR-TEST-END] {name} | {attrs['status']}\n")
    sys.stdout.flush()
"#;
    // Ensure dir exists before writing and fail clearly if we cannot set up the listener
    std::fs::create_dir_all(&abs_output_dir)
        .map_err(|e| format!("Failed to create output directory '{}': {}", abs_output_dir, e))?;
    std::fs::write(&listener_path, listener_code)
        .map_err(|e| format!("Failed to write listener file '{}': {}", listener_path.display(), e))?;

    args.push("--listener");
    let listener_str = listener_path
        .to_str()
        .ok_or_else(|| format!("Listener path '{}' is not valid UTF-8", listener_path.display()))?;
    args.push(listener_str);

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

    let model_arg;
    if let Some(m) = &device_model {
        model_arg = format!("device_name:{}", m);
        args.push("-v");
        args.push(&model_arg);
    }

    let version_arg;
    if let Some(v) = &android_version {
        version_arg = format!("os_version:{}", v);
        args.push("-v");
        args.push(&version_arg);
    }

    // Add selected tests if any
    let test_specific_args: Vec<String>;
    if let Some(tests) = &selected_tests {
        test_specific_args = tests.iter()
            .map(|t| {
                // Robot uses glob patterns for --test, escape [ and ]
                let escaped = t.replace("[", "[[]").replace("]", "[]]");
                format!("--test={}", escaped)
            })
            .collect();
        for arg in &test_specific_args {
            args.push(arg);
        }
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
    #[derive(Serialize)]
    struct RunMetadata {
        run_id: String,
        device_udid: String,
        test_path: String,
        timestamp: String,
        device_model: String,
        android_version: String,
    }

    let metadata = RunMetadata {
        run_id: run_id.clone(),
        device_udid: device.clone().unwrap_or_else(|| "Local/Unknown".to_string()),
        test_path: test_path.clone().unwrap_or_default(),
        timestamp: chrono::Local::now().to_rfc3339(),
        device_model: device_model.unwrap_or_default(),
        android_version: android_version.unwrap_or_default(),
    };

    let metadata_path = std::path::Path::new(&abs_output_dir).join("metadata.json");
    if let Ok(json) = serde_json::to_string_pretty(&metadata) {
        let _ = std::fs::write(metadata_path, json);
    }

    let mut cmd = Command::new("python");
    cmd.env("PYTHONIOENCODING", "utf-8");
    cmd.env("PYTHONUTF8", "1");
    cmd.arg("-m").arg("robot");
    cmd.args(&args);

    spawn_and_monitor(app, state, run_id, cmd, working_dir).await
}

#[tauri::command]
pub async fn run_maestro_test(
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
    #[derive(Serialize)]
    struct RunMetadata {
        run_id: String,
        framework: String,
        test_path: String,
        timestamp: String,
    }

    let metadata = RunMetadata {
        run_id: run_id.clone(),
        framework: "maestro".to_string(),
        test_path: test_path.clone(),
        timestamp: chrono::Local::now().to_rfc3339(),
    };

    let metadata_path = std::path::Path::new(&abs_output_dir).join("metadata.json");
    if let Ok(json) = serde_json::to_string_pretty(&metadata) {
        let _ = std::fs::write(metadata_path, json);
    }

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

    spawn_and_monitor(app, state, run_id, cmd, working_dir).await
}

#[tauri::command]
pub async fn run_appium_test(
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
    #[derive(Serialize)]
    struct RunMetadata {
        run_id: String,
        framework: String,
        timestamp: String,
    }

    let metadata = RunMetadata {
        run_id: run_id.clone(),
        framework: "appium".to_string(),
        timestamp: chrono::Local::now().to_rfc3339(),
    };

    let metadata_path = std::path::Path::new(&abs_output_dir).join("metadata.json");
    if let Ok(json) = serde_json::to_string_pretty(&metadata) {
        let _ = std::fs::write(metadata_path, json);
    }

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

    spawn_and_monitor(app, state, run_id, cmd, Some(abs_project_path)).await
}

async fn spawn_and_monitor(
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

    let child = cmd
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to spawn process: {}", e))?;

    let mut child = child;
    let stdout = child.stdout.take().ok_or("Failed to open stdout")?;
    let stderr = child.stderr.take().ok_or("Failed to open stderr")?;

    // Streaming tasks
    let app_handle = app.clone();
    let rid = run_id.clone();
    tokio::spawn(async move {
        let mut reader = tokio::io::BufReader::new(stdout).lines();
        while let Ok(Some(line)) = reader.next_line().await {
            let _ = app_handle.emit(
                "test-output",
                TestOutput {
                    run_id: rid.clone(),
                    message: line,
                },
            );
        }
    });

    let app_handle_err = app.clone();
    let rid_err = run_id.clone();
    tokio::spawn(async move {
        let mut reader = tokio::io::BufReader::new(stderr).lines();
        while let Ok(Some(line)) = reader.next_line().await {
            let _ = app_handle_err.emit(
                "test-output",
                TestOutput {
                    run_id: rid_err.clone(),
                    message: line,
                },
            );
        }
    });

    // Store process
    {
        let mut procs = state.0.lock().map_err(|e| e.to_string())?;
        procs.insert(run_id.clone(), child);
    }

    // Monitor for finish (Async Polling)
    let app_handle_mon = app.clone();
    let rid_mon = run_id.clone();
    let state_mon = state.0.clone();
    
    tokio::spawn(async move {
        let mut final_status: Option<std::process::ExitStatus> = None;
        loop {
            tokio::time::sleep(tokio::time::Duration::from_millis(500)).await;
            
            let mut procs: std::sync::MutexGuard<'_, HashMap<String, Child>> = match state_mon.lock() {
                Ok(p) => p,
                Err(_) => break,
            };

            if let Some(child) = procs.get_mut(&rid_mon) {
                match child.try_wait() {
                    Ok(Some(status)) => {
                        final_status = Some(status);
                        procs.remove(&rid_mon);
                        break;
                    }
                    Ok(None) => {} // Still running
                    Err(_) => {
                        procs.remove(&rid_mon);
                        break;
                    }
                }
            } else {
                break; // Process removed or stopped elsewhere
            }
        }

        if let Some(status) = final_status {
            let code = status.code().unwrap_or(-1);
            let _ = app_handle_mon.emit(
                "test-finished",
                TestFinished {
                    run_id: rid_mon,
                    success: status.success(),
                    status: format!("Process finished with exit code: {}", code),
                },
            );
        }
    });

    Ok(run_id)
}

#[tauri::command]
pub async fn get_robot_test_cases(path: String) -> Result<Vec<String>, String> {
    use std::fs::File;
    use std::io::{BufRead, BufReader};

    let file = File::open(&path).map_err(|e| e.to_string())?;
    let reader = BufReader::new(file);
    let mut tests = Vec::new();
    let mut in_test_cases = false;

    for line in reader.lines() {
        let line = line.map_err(|e| e.to_string())?;
        let trimmed = line.trim();

        if trimmed.starts_with("*** Test Cases ***") || trimmed.starts_with("*** Tasks ***") {
            in_test_cases = true;
            continue;
        } else if trimmed.starts_with("***") {
            in_test_cases = false;
            continue;
        }

        if in_test_cases && !line.is_empty() && !line.starts_with(" ") && !line.starts_with("\t") && !trimmed.starts_with("#") {
            tests.push(trimmed.to_string());
        }
    }

    Ok(tests)
}
