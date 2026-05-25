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

use crate::cmd_utils::{new_std_command, new_tokio_command, get_adb_program};
use crate::errors::{AppError, AppResult};

/// Sends a graceful stop signal to a process.
fn graceful_stop(child: &mut Child, output_dir: &str) -> bool {
    let stop_file = std::path::Path::new(output_dir).join("stop.flag");
    if let Ok(_) = std::fs::File::create(&stop_file) {
        println!("[System] Created stop.flag in {}", output_dir);
    }

    if let Some(pid) = child.id() {
        #[cfg(target_os = "windows")]
        {
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
    let abs_output_dir = std::fs::canonicalize(&output_dir)
        .map(|p| {
            let s = p.to_string_lossy().to_string();
            if s.starts_with(r"\\?\") {
                s[4..].to_string()
            } else {
                s
            }
        })
        .unwrap_or_else(|_| output_dir.clone());

    let stop_file_init = std::path::Path::new(&abs_output_dir).join("stop.flag");
    if stop_file_init.exists() {
        let _ = std::fs::remove_file(stop_file_init);
    }

    let mut args: Vec<String> = vec!["-d".to_string(), abs_output_dir.clone(), "--console".to_string(), "verbose".to_string()];

    let listener_path = std::path::Path::new(&abs_output_dir).join("LiveConsoleListener.py");
    let listener_code = r#"
import sys
import os
import threading
import time
import _thread

ROBOT_LISTENER_API_VERSION = 2

def _sanitize(txt):
    if txt is None: return ""
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
    stop_file = os.path.join(os.path.dirname(__file__), "stop.flag")
    while True:
        if os.path.exists(stop_file):
            _thread.interrupt_main()
            break
        time.sleep(0.5)

t = threading.Thread(target=_monitor_stop, daemon=True)
t.start()
"#;
    std::fs::create_dir_all(&abs_output_dir).map_err(|e| AppError::IoError(format!("Failed to create output directory: {}", e)))?;
    std::fs::write(&listener_path, listener_code).map_err(|e| AppError::IoError(format!("Failed to write listener file: {}", e)))?;

    args.push("--listener".to_string());
    args.push(listener_path.to_string_lossy().to_string());

    if let Some(xml_path) = &rerun_failed_from {
        if !xml_path.is_empty() {
            args.push("--rerunfailed".to_string());
            args.push(xml_path.clone());
            args.push("--output".to_string());
            args.push("output_rerun.xml".to_string());
        }
    }

    if let Some(true) = timestamp_outputs {
        args.push("--timestampoutputs".to_string());
    }

    if let Some(d) = &device {
        args.push("-v".to_string());
        args.push(format!("udid:{}", d));
    }

    if let Some(m) = &device_model {
        args.push("-v".to_string());
        args.push(format!("device_name:{}", m));
    }

    if let Some(v) = &android_version {
        args.push("-v".to_string());
        args.push(format!("os_version:{}", v));
    }

    if let Some(tests) = &selected_tests {
        for t in tests {
            args.push("--test".to_string());
            args.push(t.replace("[", "[[]").replace("]", "[]]"));
        }
    }

    if let Some(arg_file) = &arguments_file {
        args.push("-A".to_string());
        args.push(arg_file.clone());
    }

    if let Some(tp) = &test_path {
        if !tp.is_empty() {
            args.push(tp.clone());
        }
    }

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
        device_udid: device.clone().unwrap_or_else(|| "Local".to_string()),
        test_path: test_path.clone().unwrap_or_default(),
        timestamp: chrono::Local::now().to_rfc3339(),
        device_model: device_model.unwrap_or_default(),
        android_version: android_version.unwrap_or_default(),
    };

    let metadata_path = std::path::Path::new(&abs_output_dir).join("metadata.json");
    if let Ok(json) = serde_json::to_string_pretty(&metadata) {
        let _ = std::fs::write(metadata_path, json);
    }

    let adb_program = get_adb_program(&app);
    let mut cmd = new_tokio_command("python");
    cmd.env("ADB", &adb_program);
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

    let mut report_filename = "output-maestro.xml".to_string();
    if let Some(true) = timestamp_outputs {
        let timestamp = chrono::Local::now().format("%Y%m%d-%H%M%S").to_string();
        report_filename = format!("output-maestro-{}.xml", timestamp);
    }

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

    let report_path = std::path::Path::new(&abs_output_dir).join(report_filename);
    cmd_args.push("--format".to_string());
    cmd_args.push("junit".to_string());
    cmd_args.push("--output".to_string());
    cmd_args.push(report_path.to_string_lossy().to_string());

    let adb_program = get_adb_program(&app);
    let mut cmd;
    #[cfg(target_os = "windows")]
    {
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

    cmd.env("ADB", &adb_program);
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

    let adb_program = get_adb_program(&app);
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

    cmd.env("ADB", &adb_program);
    cmd.env("JAVA_TOOL_OPTIONS", "-Dfile.encoding=UTF-8");

    spawn_and_monitor(app, state, run_id, cmd, Some(abs_project_path), abs_output_dir).await
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
        cmd.as_std_mut().creation_flags(0x00000200 | 0x08000000);
    }

    let mut child = cmd
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| AppError::ProcessError(format!("Failed to spawn process: {}", e)))?;

    let stdout = child.stdout.take().unwrap();
    let stderr = child.stderr.take().unwrap();

    let app_handle = app.clone();
    let rid = run_id.clone();
    tokio::spawn(async move {
        let mut reader = tokio::io::BufReader::new(stdout).lines();
        while let Ok(Some(line)) = reader.next_line().await {
            let _ = app_handle.emit("test-output", TestOutput { run_id: rid.clone(), message: line });
        }
    });

    let app_handle_err = app.clone();
    let rid_err = run_id.clone();
    tokio::spawn(async move {
        let mut reader = tokio::io::BufReader::new(stderr).lines();
        while let Ok(Some(line)) = reader.next_line().await {
            let _ = app_handle_err.emit("test-output", TestOutput { run_id: rid_err.clone(), message: line });
        }
    });

    let (control_tx, mut control_rx) = tokio::sync::mpsc::channel::<ProcessCommand>(10);
    {
        let mut procs = state.0.lock().unwrap();
        procs.insert(run_id.clone(), ProcessInfo { control_tx: control_tx.clone() });
    }

    let app_handle_mon = app.clone();
    let rid_mon = run_id.clone();
    let state_mon = state.0.clone();
    let output_dir_mon = output_dir.clone();

    tokio::spawn(async move {
        let final_status = loop {
            tokio::select! {
                status = child.wait() => {
                    break status.ok();
                }
                Some(cmd) = control_rx.recv() => {
                    match cmd {
                        ProcessCommand::Stop => {
                            let _ = graceful_stop(&mut child, &output_dir_mon);
                        }
                        ProcessCommand::Kill => {
                            let _ = child.start_kill();
                        }
                    }
                }
            }
        };
        state_mon.lock().unwrap().remove(&rid_mon);
        let exit_code = final_status.and_then(|s| s.code()).unwrap_or(-1);
        let _ = app_handle_mon.emit("test-finished", TestFinished { run_id: rid_mon, exit_code });
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
        if in_test_cases && !line.is_empty() && !line.starts_with(" ") && !line.starts_with("\t") && !trimmed.starts_with("#") {
            tests.push(trimmed.to_string());
        }
    }
    Ok(tests)
}

#[tauri::command]
pub async fn run_cypress_test(
    app: AppHandle,
    state: State<'_, TestState>,
    run_id: String,
    test_path: String,
    output_dir: String,
    browser: Option<String>,
    cypress_args: Option<String>,
    working_dir: Option<String>,
) -> AppResult<String> {
    let abs_output_dir = std::fs::canonicalize(&output_dir)
        .map(|p| p.to_string_lossy().to_string().replace(r"\\?\", ""))
        .unwrap_or_else(|_| output_dir.clone());

    let _ = std::fs::create_dir_all(&abs_output_dir);

    #[derive(Serialize)]
    struct RunMetadata {
        run_id: String,
        framework: String,
        test_path: String,
        timestamp: String,
    }

    let metadata = RunMetadata {
        run_id: run_id.clone(),
        framework: "cypress".to_string(),
        test_path: test_path.clone(),
        timestamp: chrono::Local::now().to_rfc3339(),
    };

    let metadata_path = std::path::Path::new(&abs_output_dir).join("metadata.json");
    if let Ok(json) = serde_json::to_string_pretty(&metadata) {
        let _ = std::fs::write(metadata_path, json);
    }

    let adb_program = get_adb_program(&app);
    let mut cmd;
    #[cfg(target_os = "windows")]
    {
        cmd = new_tokio_command("cmd");
        cmd.arg("/C").arg("npx").arg("cypress").arg("run");
    }
    #[cfg(not(target_os = "windows"))]
    {
        cmd = new_tokio_command("npx");
        cmd.arg("cypress").arg("run");
    }
    if !test_path.is_empty() { cmd.arg("--spec").arg(&test_path); }
    if let Some(b) = browser { cmd.arg("--browser").arg(b); }
    if let Some(args) = cypress_args {
        for arg in args.split_whitespace() { cmd.arg(arg); }
    }
    cmd.env("ADB", &adb_program);
    spawn_and_monitor(app, state, run_id, cmd, working_dir, abs_output_dir).await
}

#[tauri::command]
pub async fn run_selenium_test(
    app: AppHandle,
    state: State<'_, TestState>,
    run_id: String,
    test_path: String,
    output_dir: String,
    browser: Option<String>,
    selenium_args: Option<String>,
    working_dir: Option<String>,
) -> AppResult<String> {
    let abs_output_dir = std::fs::canonicalize(&output_dir)
        .map(|p| p.to_string_lossy().to_string().replace(r"\\?\", ""))
        .unwrap_or_else(|_| output_dir.clone());

    let _ = std::fs::create_dir_all(&abs_output_dir);

    #[derive(Serialize)]
    struct RunMetadata {
        run_id: String,
        framework: String,
        test_path: String,
        timestamp: String,
    }

    let metadata = RunMetadata {
        run_id: run_id.clone(),
        framework: "selenium".to_string(),
        test_path: test_path.clone(),
        timestamp: chrono::Local::now().to_rfc3339(),
    };

    let metadata_path = std::path::Path::new(&abs_output_dir).join("metadata.json");
    if let Ok(json) = serde_json::to_string_pretty(&metadata) {
        let _ = std::fs::write(metadata_path, json);
    }

    let adb_program = get_adb_program(&app);
    let mut cmd;
    let is_python = test_path.ends_with(".py");
    let is_js = test_path.ends_with(".js") || test_path.ends_with(".ts");

    if is_python {
        #[cfg(target_os = "windows")]
        { cmd = new_tokio_command("cmd"); cmd.arg("/C").arg("python").arg(&test_path); }
        #[cfg(not(target_os = "windows"))]
        { cmd = new_tokio_command("python"); cmd.arg(&test_path); }
    } else if is_js {
        #[cfg(target_os = "windows")]
        { cmd = new_tokio_command("cmd"); cmd.arg("/C").arg("node").arg(&test_path); }
        #[cfg(not(target_os = "windows"))]
        { cmd = new_tokio_command("node"); cmd.arg(&test_path); }
    } else {
        #[cfg(target_os = "windows")]
        { cmd = new_tokio_command("cmd"); cmd.arg("/C").arg(&test_path); }
        #[cfg(not(target_os = "windows"))]
        { cmd = new_tokio_command(&test_path); }
    }

    if let Some(b) = browser { cmd.env("SELENIUM_BROWSER", b); }
    if let Some(args) = selenium_args {
        for arg in args.split_whitespace() { cmd.arg(arg); }
    }
    cmd.env("ADB", &adb_program);
    spawn_and_monitor(app, state, run_id, cmd, working_dir, abs_output_dir).await
}
