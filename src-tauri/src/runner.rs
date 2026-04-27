use chrono;
use serde::Serialize;
use std::collections::HashMap;
use std::process::Stdio;
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter, State};
use tokio::io::AsyncBufReadExt;
use tokio::process::{Child, Command};

pub enum ProcessCommand {
    Stop,
    Kill,
}

pub struct ProcessInfo {
    pub control_tx: tokio::sync::mpsc::Sender<ProcessCommand>,
}

pub struct TestState(pub Arc<Mutex<HashMap<String, ProcessInfo>>>);

use crate::cmd_utils::{new_std_command, new_tokio_command};
use crate::errors::{AppError, AppResult};

/// Sends a graceful stop signal to a process.
/// On Windows: Uses `taskkill /T` without `/F` to request termination of the process tree.
/// On Unix: Sends SIGINT.
fn graceful_stop(child: &mut Child, output_dir: &str) -> bool {
    // 1. Trigger Listener-based stop via file flag
    let stop_file = std::path::Path::new(output_dir).join("stop.flag");
    if let Ok(_) = std::fs::File::create(&stop_file) {
        println!("[System] Created stop.flag in {}", output_dir);
    }

    if let Some(pid) = child.id() {
        #[cfg(target_os = "windows")]
        {
            // Windows Fallback: taskkill /T (Tree) WITHOUT /F (Force)
            // This sends a WM_CLOSE or similar close request to GUI apps and handles console apps politely.
            let _ = new_std_command("taskkill")
                .arg("/T")
                .arg("/PID")
                .arg(pid.to_string())
                .stdout(std::process::Stdio::null())
                .stderr(std::process::Stdio::null())
                .spawn();

            return true;
        }

        #[cfg(not(target_os = "windows"))]
        {
            unsafe {
                if libc::kill(pid as i32, libc::SIGINT) == 0 {
                    return true;
                }
            }
        }
    }
    false
}

#[tauri::command]
pub async fn stop_test(state: State<'_, TestState>, run_id: String) -> AppResult<String> {
    if run_id == "all" {
        let procs = {
            let procs_map = state
                .0
                .lock()
                .map_err(|e| AppError::StringError(e.to_string()))?;
            procs_map
                .values()
                .map(|info| info.control_tx.clone())
                .collect::<Vec<_>>()
        };

        if procs.is_empty() {
            return Ok("No tests were running".to_string());
        }

        for tx in procs {
            let _ = tx.send(ProcessCommand::Stop).await;
        }
        return Ok("Stop signal sent to all tests".to_string());
    }

    let tx = {
        let procs = state
            .0
            .lock()
            .map_err(|e| AppError::StringError(e.to_string()))?;
        procs.get(&run_id).map(|info| info.control_tx.clone())
    };

    if let Some(tx) = tx {
        let _ = tx.send(ProcessCommand::Stop).await;
        Ok(format!("Stop signal sent to test {}", run_id))
    } else {
        Err(AppError::ProcessError(format!(
            "No running test found for id: {}",
            run_id
        )))
    }
}

pub fn shutdown_all_tests(state: &State<'_, TestState>) {
    let procs = match state.0.lock() {
        Ok(g) => g,
        Err(e) => {
            eprintln!("Failed to lock TestState mutex: {}", e);
            return;
        }
    };

    for (run_id, info) in procs.iter() {
        println!("Shutting down test {}", run_id);
        let _ = info.control_tx.blocking_send(ProcessCommand::Kill);
    }
}

#[derive(serde::Serialize, Clone)]
struct TestOutput {
    run_id: String,
    message: String,
}

#[derive(serde::Serialize, Clone)]
struct TestFinished {
    run_id: String,
    exit_code: i32,
}

#[tauri::command]
pub async fn run_robot_test(
    app: AppHandle,
    state: State<'_, TestState>,
    run_id: String,
    test_path: Option<String>,
    output_dir: String,
    logs_path: Option<String>,
    device: Option<String>,
    device_model: Option<String>,
    android_version: Option<String>,
    working_dir: Option<String>,
    selected_tests: Option<Vec<String>>,
    arguments_file: Option<String>,
    timestamp_outputs: Option<bool>,
    rerun_failed_from: Option<String>,
) -> AppResult<String> {
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

    // Cleanup any stale stop flag before starting the test
    let stop_file_init = std::path::Path::new(&abs_output_dir).join("stop.flag");
    if stop_file_init.exists() {
        let _ = std::fs::remove_file(stop_file_init);
    }

    let mut args = vec!["-d", &abs_output_dir, "--console", "verbose"];

    // Inject LiveConsoleListener to force real-time stdout updates for test names
    let listener_path = std::path::Path::new(&abs_output_dir).join("LiveConsoleListener.py");
    let listener_code = r#"
import sys
import os
import threading
import time
import _thread
from robot.libraries.BuiltIn import BuiltIn

ROBOT_LISTENER_API_VERSION = 2

def _sanitize(txt):
    if txt is None: return ""
    # Replace newlines/tabs with spaces, pipe with 'I', and ' :: ' with ' : ' to avoid breaking delimiters
    return str(txt).replace('\n', ' ').replace('\r', '').replace('\t', ' ').replace('|', 'I').replace(' :: ', ' : ')

def start_suite(name, attrs):
    doc = _sanitize(attrs.get('doc', ''))
    s_name = _sanitize(name)
    sys.stdout.write(f"\n[RR-SUITE-START] {s_name} :: {doc}\n")
    sys.stdout.flush()

def end_suite(name, attrs):
    s_name = _sanitize(name)
    elapsed = attrs.get('elapsedtime', '0')
    sys.stdout.write(f"\n[RR-SUITE-END] {s_name} | {attrs['status']} | {elapsed}\n")
    sys.stdout.flush()

def start_test(name, attrs):
    doc = _sanitize(attrs.get('doc', ''))
    t_name = _sanitize(name)
    sys.stdout.write(f"\n[RR-TEST-START] {t_name} :: {doc}\n")
    sys.stdout.flush()

def end_test(name, attrs):
    t_name = _sanitize(name)
    status = attrs.get('status', 'PASS')
    msg = _sanitize(attrs.get('message', ''))
    elapsed = attrs.get('elapsedtime', '0')
    sys.stdout.write(f"\n[RR-TEST-END] {t_name} | {status} | {msg} | {elapsed}\n")
    sys.stdout.flush()

def start_keyword(name, attrs):
    pass

def _monitor_stop():
    # Check for stop signal in the same directory as the listener
    stop_file = os.path.join(os.path.dirname(__file__), "stop.flag")
    while True:
        if os.path.exists(stop_file):
            # Inject a KeyboardInterrupt into the main thread
            _thread.interrupt_main()
            break
        time.sleep(0.5)

# Start background monitor thread
t = threading.Thread(target=_monitor_stop, daemon=True)
t.start()
"#;
    // Ensure dir exists before writing and fail clearly if we cannot set up the listener
    std::fs::create_dir_all(&abs_output_dir).map_err(|e| {
        AppError::IoError(format!(
            "Failed to create output directory '{}': {}",
            abs_output_dir, e
        ))
    })?;
    std::fs::write(&listener_path, listener_code).map_err(|e| {
        AppError::IoError(format!(
            "Failed to write listener file '{}': {}",
            listener_path.display(),
            e
        ))
    })?;

    args.push("--listener");
    let listener_str = listener_path.to_str().ok_or_else(|| {
        AppError::IoError(format!(
            "Listener path '{}' is not valid UTF-8",
            listener_path.display()
        ))
    })?;
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
        test_specific_args = tests
            .iter()
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
        logs_path: Option<String>,
        device_udid: String,
        test_path: String,
        timestamp: String,
        device_model: String,
        android_version: String,
    }

    let metadata = RunMetadata {
        run_id: run_id.clone(),
        logs_path: logs_path.clone(),
        device_udid: device
            .clone()
            .unwrap_or_else(|| "Local/Unknown".to_string()),
        test_path: test_path.clone().unwrap_or_default(),
        timestamp: chrono::Local::now().to_rfc3339(),
        device_model: device_model.unwrap_or_default(),
        android_version: android_version.unwrap_or_default(),
    };

    let metadata_path = std::path::Path::new(&abs_output_dir).join("metadata.json");
    if let Ok(json) = serde_json::to_string_pretty(&metadata) {
        let _ = std::fs::write(metadata_path, json);
    }

    let mut cmd = new_tokio_command("python");
    cmd.env("PYTHONIOENCODING", "utf-8");
    cmd.env("PYTHONUTF8", "1");
    cmd.arg("-m").arg("robot");
    cmd.args(&args);

    spawn_and_monitor(app, state, run_id, cmd, working_dir, abs_output_dir).await
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
    logs_path: Option<String>,
    timestamp_outputs: Option<bool>,
) -> AppResult<String> {
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
        logs_path: Option<String>,
        framework: String,
        test_path: String,
        timestamp: String,
    }

    let metadata = RunMetadata {
        run_id: run_id.clone(),
        logs_path: logs_path.clone(),
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
        cmd = new_tokio_command("cmd");
        cmd.arg("/C").arg("maestro");
        for arg in cmd_args {
            cmd.arg(arg);
        }
    }

    #[cfg(not(target_os = "windows"))]
    {
        cmd = new_tokio_command("maestro");
        cmd.args(cmd_args);
    }

    cmd.env("JAVA_TOOL_OPTIONS", "-Dfile.encoding=UTF-8");

    spawn_and_monitor(app, state, run_id, cmd, working_dir, abs_output_dir).await
}

#[tauri::command]
pub async fn run_appium_test(
    app: AppHandle,
    state: State<'_, TestState>,
    run_id: String,
    project_path: String,
    output_dir: String,
    logs_path: Option<String>,
    appium_java_args: Option<String>,
) -> AppResult<String> {
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
        logs_path: Option<String>,
        framework: String,
        timestamp: String,
    }

    let metadata = RunMetadata {
        run_id: run_id.clone(),
        logs_path: logs_path.clone(),
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
        cmd = new_tokio_command("cmd");
        cmd.arg("/C").arg("mvn");
    }
    #[cfg(not(target_os = "windows"))]
    {
        cmd = new_tokio_command("mvn");
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

    spawn_and_monitor(
        app,
        state,
        run_id,
        cmd,
        Some(abs_project_path),
        abs_output_dir,
    )
    .await
}

async fn spawn_and_monitor(
    app: AppHandle,
    state: State<'_, TestState>,
    run_id: String,
    mut cmd: Command,
    working_dir: Option<String>,
    output_dir: String,
) -> AppResult<String> {
    if let Some(wd) = working_dir {
        if !wd.is_empty() {
            cmd.current_dir(wd);
        }
    }

    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        // 0x00000200 = CREATE_NEW_PROCESS_GROUP
        // We already set CREATE_NO_WINDOW in new_tokio_command, but we need to combine it here
        cmd.as_std_mut().creation_flags(0x00000200 | 0x08000000);
    }

    let child = cmd
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| AppError::ProcessError(format!("Failed to spawn process: {}", e)))?;

    let mut child = child;
    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| AppError::ProcessError("Failed to open stdout".to_string()))?;
    let stderr = child
        .stderr
        .take()
        .ok_or_else(|| AppError::ProcessError("Failed to open stderr".to_string()))?;

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

    // Store process info
    let (control_tx, mut control_rx) = tokio::sync::mpsc::channel::<ProcessCommand>(10);
    {
        let mut procs = state
            .0
            .lock()
            .map_err(|e| AppError::StringError(e.to_string()))?;
        if procs.contains_key(&run_id) {
            let _ = child.start_kill();
            return Err(AppError::ProcessError(format!(
                "Process with run_id '{}' already exists",
                run_id
            )));
        }
        procs.insert(
            run_id.clone(),
            ProcessInfo {
                control_tx: control_tx.clone(),
            },
        );
    }

    // Monitor for finish (Reactive Wait)
    let app_handle_mon = app.clone();
    let rid_mon = run_id.clone();
    let state_mon = state.0.clone();
    let output_dir_mon = output_dir.clone();

    tokio::spawn(async move {
        let mut final_status: Option<std::process::ExitStatus> = None;

        loop {
            tokio::select! {
                status = child.wait() => {
                    match status {
                        Ok(s) => final_status = Some(s),
                        Err(e) => eprintln!("[Monitor] Error waiting for process: {}", e),
                    }
                    break;
                }
                Some(cmd) = control_rx.recv() => {
                    match cmd {
                        ProcessCommand::Stop => {
                            let _ = graceful_stop(&mut child, &output_dir_mon);
                            let tx_kill = control_tx.clone();
                            tokio::spawn(async move {
                                tokio::time::sleep(tokio::time::Duration::from_secs(10)).await;
                                let _ = tx_kill.send(ProcessCommand::Kill).await;
                            });
                        }
                        ProcessCommand::Kill => {
                            let _ = child.start_kill();
                        }
                    }
                }
            }
        }

        // Cleanup after exit
        match state_mon.lock() {
            Ok(mut procs) => {
                procs.remove(&rid_mon);
            }
            Err(e) => {
                eprintln!(
                    "[Monitor] Failed to acquire process state lock during cleanup for {}: {}",
                    rid_mon, e
                );
            }
        }

        // Cleanup stop signal if it exists
        let stop_file = std::path::Path::new(&output_dir_mon).join("stop.flag");
        if stop_file.exists() {
            let _ = std::fs::remove_file(stop_file);
        }

        // Emit finished event
        let exit_code = final_status.and_then(|s| s.code()).unwrap_or(-1);
        let _ = app_handle_mon.emit(
            "test-finished",
            TestFinished {
                run_id: rid_mon,
                exit_code,
            },
        );
    });

    Ok(format!("Test {} started successfully", run_id))
}

#[tauri::command]
pub async fn get_robot_test_cases(path: String) -> AppResult<Vec<String>> {
    use std::fs::File;
    use std::io::{BufRead, BufReader};

    let file = File::open(&path).map_err(|e| AppError::FileSystemError(e.to_string()))?;
    let reader = BufReader::new(file);
    let mut tests = Vec::new();
    let mut in_test_cases = false;

    for line in reader.lines() {
        let line = line.map_err(|e| AppError::FileSystemError(e.to_string()))?;
        let trimmed = line.trim();

        if trimmed.starts_with("*** Test Cases ***") || trimmed.starts_with("*** Tasks ***") {
            in_test_cases = true;
            continue;
        } else if trimmed.starts_with("***") {
            in_test_cases = false;
            continue;
        }

        if in_test_cases
            && !line.is_empty()
            && !line.starts_with(" ")
            && !line.starts_with("\t")
            && !trimmed.starts_with("#")
        {
            tests.push(trimmed.to_string());
        }
    }

    Ok(tests)
}
