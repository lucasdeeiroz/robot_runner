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
use tauri::Manager;

fn resolve_script_path(name: &str, app: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    if let Ok(resource_dir) = app.path().resource_dir() {
        let resource_candidate = resource_dir.join("scripts").join(name);
        if resource_candidate.exists() {
            return Ok(resource_candidate);
        }
        let fallback_resource_candidate = resource_dir.join(name);
        if fallback_resource_candidate.exists() {
            return Ok(fallback_resource_candidate);
        }
    }
    
    let current_dir = std::env::current_dir().unwrap_or_else(|_| std::path::PathBuf::from("."));
    
    let direct = current_dir.join(format!("scripts/{}", name));
    if direct.exists() {
        return Ok(direct);
    }
    let parent = current_dir.join(format!("../scripts/{}", name));
    if parent.exists() {
        return Ok(parent);
    }
    Err(format!("Could not find scripts/{}", name))
}

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
    let output_dir = crate::cmd_utils::expand_env_vars(&output_dir);
    let test_path = test_path.map(|p| crate::cmd_utils::expand_env_vars(&p));
    let logs_path = logs_path.map(|p| crate::cmd_utils::expand_env_vars(&p));
    let working_dir = working_dir.map(|p| crate::cmd_utils::expand_env_vars(&p));
    let arguments_file = arguments_file.map(|p| crate::cmd_utils::expand_env_vars(&p));
    let rerun_failed_from = rerun_failed_from.map(|p| crate::cmd_utils::expand_env_vars(&p));

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

    let adb_program = get_adb_program(&app);
    let adb_path_var = adb_program.replace('\\', "/");
    args.push("-v".to_string());
    args.push(format!("ADB_PATH:{}", adb_path_var));

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

    let python_bin = if let Some(ref wd) = working_dir {
        crate::env_setup::get_venv_python_path(std::path::Path::new(wd))
            .map(|p| p.to_string_lossy().to_string())
            .unwrap_or_else(|| "python".to_string())
    } else {
        "python".to_string()
    };
    let mut cmd = new_tokio_command(&python_bin);
    
    // Inject the custom ADB path into the PATH environment variable so that 
    // Appium and other child processes use the configured ADB executable.
    let adb_path_obj = std::path::Path::new(&adb_program);
    if adb_path_obj.is_absolute() {
        if let Some(parent) = adb_path_obj.parent() {
            if let Ok(current_path) = std::env::var("PATH") {
                let sep = if cfg!(target_os = "windows") { ";" } else { ":" };
                let new_path = format!("{}{}{}", parent.to_string_lossy(), sep, current_path);
                cmd.env("PATH", new_path);
            }
        }
    }

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
    let output_dir = crate::cmd_utils::expand_env_vars(&output_dir);
    let test_path = crate::cmd_utils::expand_env_vars(&test_path);
    let logs_path = logs_path.map(|p| crate::cmd_utils::expand_env_vars(&p));
    let working_dir = working_dir.map(|p| crate::cmd_utils::expand_env_vars(&p));

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

    let adb_path_obj = std::path::Path::new(&adb_program);
    if adb_path_obj.is_absolute() {
        if let Some(parent) = adb_path_obj.parent() {
            if let Ok(current_path) = std::env::var("PATH") {
                let sep = if cfg!(target_os = "windows") { ";" } else { ":" };
                let new_path = format!("{}{}{}", parent.to_string_lossy(), sep, current_path);
                cmd.env("PATH", new_path);
            }
        }
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
    let output_dir = crate::cmd_utils::expand_env_vars(&output_dir);
    let project_path = crate::cmd_utils::expand_env_vars(&project_path);
    let logs_path = logs_path.map(|p| crate::cmd_utils::expand_env_vars(&p));

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

    let adb_path_obj = std::path::Path::new(&adb_program);
    if adb_path_obj.is_absolute() {
        if let Some(parent) = adb_path_obj.parent() {
            if let Ok(current_path) = std::env::var("PATH") {
                let sep = if cfg!(target_os = "windows") { ";" } else { ":" };
                let new_path = format!("{}{}{}", parent.to_string_lossy(), sep, current_path);
                cmd.env("PATH", new_path);
            }
        }
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
        let mut procs = state
            .0
            .lock()
            .map_err(|e| AppError::ProcessError(format!("Failed to lock process state: {}", e)))?;
        if procs.contains_key(&run_id) {
            return Err(AppError::ProcessError(format!(
                "A test with run ID '{}' is already running",
                run_id
            )));
        }
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
        if let Ok(mut procs) = state_mon.lock() {
            procs.remove(&rid_mon);
        }
        let exit_code = final_status.and_then(|s| s.code()).unwrap_or(-1);
        let _ = app_handle_mon.emit("test-finished", TestFinished { run_id: rid_mon, exit_code });
    });

    Ok(format!("Test {} started successfully", run_id))
}

#[tauri::command]
pub async fn get_robot_test_cases(path: String) -> AppResult<Vec<String>> {
    let path = crate::cmd_utils::expand_env_vars(&path);
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
    logs_path: Option<String>,
    browser: Option<String>,
    cypress_args: Option<String>,
    working_dir: Option<String>,
) -> AppResult<String> {
    let output_dir = crate::cmd_utils::expand_env_vars(&output_dir);
    let test_path = crate::cmd_utils::expand_env_vars(&test_path);
    let logs_path = logs_path.map(|p| crate::cmd_utils::expand_env_vars(&p));
    let working_dir = working_dir.map(|p| crate::cmd_utils::expand_env_vars(&p));

    let abs_output_dir = std::fs::canonicalize(&output_dir)
        .map(|p| p.to_string_lossy().to_string().replace(r"\\?\", ""))
        .unwrap_or_else(|_| output_dir.clone());

    let _ = std::fs::create_dir_all(&abs_output_dir);

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
    logs_path: Option<String>,
    browser: Option<String>,
    selenium_args: Option<String>,
    working_dir: Option<String>,
) -> AppResult<String> {
    let output_dir = crate::cmd_utils::expand_env_vars(&output_dir);
    let test_path = crate::cmd_utils::expand_env_vars(&test_path);
    let logs_path = logs_path.map(|p| crate::cmd_utils::expand_env_vars(&p));
    let working_dir = working_dir.map(|p| crate::cmd_utils::expand_env_vars(&p));

    let abs_output_dir = std::fs::canonicalize(&output_dir)
        .map(|p| p.to_string_lossy().to_string().replace(r"\\?\", ""))
        .unwrap_or_else(|_| output_dir.clone());

    let _ = std::fs::create_dir_all(&abs_output_dir);

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

#[tauri::command]
pub async fn compile_and_send_rrt(
    app: AppHandle,
    _state: State<'_, TestState>,
    run_id: String,
    test_path: Option<String>,
    output_dir: String,
    _logs_path: Option<String>,
    device: Option<String>,
    _device_model: Option<String>,
    _android_version: Option<String>,
    working_dir: Option<String>,
    _selected_tests: Option<Vec<String>>,
    _arguments_file: Option<String>,
    _timestamp_outputs: Option<bool>,
) -> AppResult<String> {
    let output_dir = crate::cmd_utils::expand_env_vars(&output_dir);
    let test_path = test_path.map(|p| crate::cmd_utils::expand_env_vars(&p));
    let working_dir = working_dir.map(|p| crate::cmd_utils::expand_env_vars(&p));

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

    std::fs::create_dir_all(&abs_output_dir).map_err(|e| AppError::IoError(format!("Failed to create output directory: {}", e)))?;

    let _ = app.emit("test-output", TestOutput {
        run_id: run_id.clone(),
        message: "[System] Compiling RRT...".to_string(),
    });

    let python_bin = if let Some(ref wd) = working_dir {
        crate::env_setup::get_venv_python_path(std::path::Path::new(wd))
            .map(|p| p.to_string_lossy().to_string())
            .unwrap_or_else(|| "python".to_string())
    } else {
        "python".to_string()
    };

    let script_path = resolve_script_path("rrt_compiler.py", &app)
        .map_err(|e| AppError::CommandFailed(e))?;

    let mut compiler_cmd = Command::new(&python_bin);
    compiler_cmd.arg(script_path);
    if let Some(tp) = &test_path {
        compiler_cmd.arg(tp);
    }

    if let Some(ref wd) = working_dir {
        compiler_cmd.current_dir(wd);
    }
    compiler_cmd.stdout(Stdio::piped());
    compiler_cmd.stderr(Stdio::piped());

    let output = compiler_cmd.output().await.map_err(|e| AppError::IoError(format!("Failed to run rrt_compiler: {}", e)))?;
    let payload = String::from_utf8_lossy(&output.stdout).to_string();

    if !output.status.success() {
        let err = String::from_utf8_lossy(&output.stderr).to_string();
        let _ = app.emit("test-output", TestOutput {
            run_id: run_id.clone(),
            message: format!("RRT Compilation failed: {}", err),
        });
        let _ = app.emit("test-finished", TestFinished {
            run_id: run_id.clone(),
            exit_code: 1,
        });
        return Err(AppError::CommandFailed(format!("RRT Compilation failed: {}", err)));
    }

    let _ = app.emit("test-output", TestOutput {
        run_id: run_id.clone(),
        message: "[System] Compiled Robot file to RRT protocol payload.".to_string(),
    });

    // Send to Companion
    let udid = device.unwrap_or_else(|| "emulator-5554".to_string());
    
    // Setup port forwarding
    let adb_program = get_adb_program(&app);
    let mut port_fwd = std::process::Command::new(&adb_program);
    port_fwd.args(&["-s", &udid, "forward", "tcp:9876", "tcp:9876"]);
    let _ = port_fwd.output(); // Ignore errors, it might already be forwarded

    let target_package = serde_json::from_str::<serde_json::Value>(&payload)
        .ok()
        .and_then(|v| v.get("target_package").and_then(|p| p.as_str().map(|s| s.to_string())));

    let client = reqwest::Client::new();
    let res = client.post("http://127.0.0.1:9876/rrt/execute")
        .header("Content-Type", "application/json")
        .body(payload)
        .send()
        .await;

    match res {
        Ok(mut response) => {
            if response.status().is_success() {
                let mut buffer = String::new();
                let mut exit_code = 0;

                while let Ok(Some(chunk)) = response.chunk().await {
                    let chunk_str = String::from_utf8_lossy(&chunk);
                    buffer.push_str(&chunk_str);

                    while let Some(pos) = buffer.find('\n') {
                        let line = buffer[..pos].trim().to_string();
                        buffer = buffer[pos + 1..].to_string();

                        if line.is_empty() {
                            continue;
                        }

                        if let Ok(json_val) = serde_json::from_str::<serde_json::Value>(&line) {
                            let event_type = json_val.get("type").and_then(|t| t.as_str()).unwrap_or("");
                            match event_type {
                                "log" => {
                                    if let Some(msg) = json_val.get("message").and_then(|m| m.as_str()) {
                                        let _ = app.emit("test-output", TestOutput {
                                            run_id: run_id.clone(),
                                            message: msg.to_string(),
                                        });
                                    }
                                }
                                "finish" => {
                                    if let Some(code) = json_val.get("exitCode").and_then(|c| c.as_i64()) {
                                        exit_code = code as i32;
                                    }
                                    if let Some(status_str) = json_val.get("status").and_then(|s| s.as_str()) {
                                        if status_str == "error" && exit_code == 0 {
                                            exit_code = 1;
                                        }
                                    }
                                }
                                _ => {
                                    if let Some(msg) = json_val.get("message").and_then(|m| m.as_str()) {
                                        let _ = app.emit("test-output", TestOutput {
                                            run_id: run_id.clone(),
                                            message: msg.to_string(),
                                        });
                                    }
                                }
                            }
                        } else {
                            let _ = app.emit("test-output", TestOutput {
                                run_id: run_id.clone(),
                                message: line,
                            });
                        }
                    }
                }

                // Final flush if any leftovers
                if !buffer.trim().is_empty() {
                    let line = buffer.trim();
                    if let Ok(json_val) = serde_json::from_str::<serde_json::Value>(line) {
                        if let Some(msg) = json_val.get("message").and_then(|m| m.as_str()) {
                            let _ = app.emit("test-output", TestOutput {
                                run_id: run_id.clone(),
                                message: msg.to_string(),
                            });
                        }
                        if let Some(code) = json_val.get("exitCode").and_then(|c| c.as_i64()) {
                            exit_code = code as i32;
                        }
                    } else {
                        let _ = app.emit("test-output", TestOutput {
                            run_id: run_id.clone(),
                            message: line.to_string(),
                        });
                    }
                }

                // Guaranteed ADB privileged termination of target application on test teardown
                if let Some(ref target_pkg) = target_package {
                    if !target_pkg.is_empty() {
                        let mut force_stop_cmd = std::process::Command::new(&adb_program);
                        force_stop_cmd.args(&["-s", &udid, "shell", "am", "force-stop", target_pkg]);
                        let _ = force_stop_cmd.output();
                    }
                }

                let _ = app.emit("test-finished", TestFinished {
                    run_id: run_id.clone(),
                    exit_code,
                });
                Ok("RRT executed".to_string())
            } else {
                let status = response.status();
                let text = response.text().await.unwrap_or_default();

                // Guaranteed ADB privileged termination on failure
                if let Some(ref target_pkg) = target_package {
                    if !target_pkg.is_empty() {
                        let mut force_stop_cmd = std::process::Command::new(&adb_program);
                        force_stop_cmd.args(&["-s", &udid, "shell", "am", "force-stop", target_pkg]);
                        let _ = force_stop_cmd.output();
                    }
                }

                let _ = app.emit("test-output", TestOutput {
                    run_id: run_id.clone(),
                    message: format!("[System] Failed to execute RRT on Companion. Status: {}, Body: {}", status, text),
                });
                let _ = app.emit("test-finished", TestFinished {
                    run_id: run_id.clone(),
                    exit_code: 1,
                });
                Ok("RRT failed".to_string())
            }
        }
        Err(e) => {
            // Guaranteed ADB privileged termination on connection error
            if let Some(ref target_pkg) = target_package {
                if !target_pkg.is_empty() {
                    let mut force_stop_cmd = std::process::Command::new(&adb_program);
                    force_stop_cmd.args(&["-s", &udid, "shell", "am", "force-stop", target_pkg]);
                    let _ = force_stop_cmd.output();
                }
            }

            let _ = app.emit("test-output", TestOutput {
                run_id: run_id.clone(),
                message: format!("[System] Error connecting to Companion server: {}", e),
            });
            let _ = app.emit("test-finished", TestFinished {
                run_id: run_id.clone(),
                exit_code: 1,
            });
            Ok("RRT connection error".to_string())
        }
    }
}
