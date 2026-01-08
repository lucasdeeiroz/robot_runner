use std::collections::HashMap;
use std::fs::OpenOptions;
use std::io::{BufRead, BufReader, Write};
use std::process::{Child, Command, Stdio};
use std::sync::{Arc, Mutex};
use std::thread;
use tauri::State;

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

// Structure to hold the process and the shared buffer
pub struct LogcatProcess {
    child: Child,
    buffer: Arc<Mutex<Vec<String>>>,
    output_file: Option<String>,
}

pub struct LogcatState(pub Mutex<HashMap<String, LogcatProcess>>);

#[tauri::command]
pub fn start_logcat(
    state: State<'_, LogcatState>,
    device: String,
    filter: Option<String>,
    level: Option<String>,
    output_file: Option<String>,
) -> Result<String, String> {
    println!("Logcat: Received request for device: {}", device);

    let mut procs = state.0.lock().map_err(|e| e.to_string())?;

    if procs.contains_key(&device) {
        println!("Logcat: Already active for {}", device);
        return Ok("Logcat already running".to_string());
    }

    let mut pid_filter = None;
    if let Some(pkg) = &filter {
        println!("Logcat: Looking up PID for package: {}", pkg);
        // Try to find PID
        // adb -s <device> shell pidof -s <package>
        let mut pidof_cmd = Command::new("adb");
        pidof_cmd.args(&["-s", &device, "shell", "pidof", "-s", pkg]);
        #[cfg(target_os = "windows")]
        pidof_cmd.creation_flags(0x08000000);
        // Execute logic
        match pidof_cmd.output() {
            Ok(output) => {
                let pid = String::from_utf8_lossy(&output.stdout).trim().to_string();
                if pid.is_empty() {
                    return Err(format!("APP_NOT_RUNNING:{}", pkg));
                }
                
                // Check process state to ensure it's not a cached/zombie process (Android 16+ behavior)
                // Read oom_score_adj: >= 900 usually means CACHED_APP
                let mut oom_cmd = Command::new("adb");
                oom_cmd.args(&["-s", &device, "shell", "cat", &format!("/proc/{}/oom_score_adj", pid)]);
                #[cfg(target_os = "windows")]
                oom_cmd.creation_flags(0x08000000);

                // We treat errors (e.g. permission denied) as "Assuming Running" to be safe
                if let Ok(oom_output) = oom_cmd.output() {
                    let score_str = String::from_utf8_lossy(&oom_output.stdout).trim().to_string();
                    if let Ok(score) = score_str.parse::<i32>() {
                        // 900 is CACHED_APP_MIN_ADJ. If it's cached, we treat as closed.
                        if score >= 900 {
                            println!("Logcat: Process {} ({}) is cached (score {}), treating as stopped.", pkg, pid, score);
                            return Err(format!("APP_NOT_RUNNING:{}", pkg));
                        }
                    }
                }
                
                pid_filter = Some(pid);
            }
            Err(e) => {
                println!("Logcat: Failed to run pidof: {}", e);
                return Err(format!("Failed to checking if app is running: {}", e));
            }
        }
    }

    let mut args = vec!["-s", &device, "shell", "logcat"];
    if let Some(pid) = &pid_filter {
        args.push("--pid");
        args.push(pid);
    }

    args.push("-v");
    args.push("threadtime");

    // Refactor to ensure strings live long enough
    let level_arg = if let Some(lvl) = level {
        format!("*:{}", lvl)
    } else {
        "*:V".to_string()
    };

    args.push(&level_arg);

    println!("Logcat: Exec params {:?}", args);
    let cmd_trace = format!("Command: adb {}", args.join(" "));

    #[cfg(target_os = "windows")]
    let mut child = Command::new("adb")
        .args(&args)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .creation_flags(0x08000000)
        .spawn()
        .map_err(|e| format!("Failed to start logcat: {}", e))?;

    #[cfg(not(target_os = "windows"))]
    let mut child = Command::new("adb")
        .args(&args)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to start logcat: {}", e))?;

    let stdout = child.stdout.take().ok_or("Failed to open stdout")?;

    // Create shared buffer
    let mut vec_with_trace = Vec::new();
    vec_with_trace.push(format!("--- Logcat started for device: {} ---", device));
    vec_with_trace.push(cmd_trace);
    let buffer = Arc::new(Mutex::new(vec_with_trace));
    let buffer_clone = buffer.clone();

    // Prepare file writer
    // Use ref path to avoid moving output_file
    let mut file_writer = if let Some(ref path) = output_file {
        println!("Logcat: Writing to file '{}'", path);
        match OpenOptions::new().create(true).append(true).open(path) {
            Ok(f) => Some(f),
            Err(e) => {
                println!("Logcat: Failed to open output file: {}", e);
                None
            }
        }
    } else {
        None
    };

    let dev_id = device.clone();
    println!("Logcat: Spawning stdout thread for device {}", dev_id);
    thread::spawn(move || {
        let reader = BufReader::new(stdout);
        for line in reader.lines() {
            if let Ok(l) = line {
                let preview: String = l.chars().take(100).collect();
                println!("Logcat read: {}", preview);

                // Write to file
                if let Some(ref mut file) = file_writer {
                    let _ = writeln!(file, "{}", l);
                }

                // Push to buffer
                if let Ok(mut buf) = buffer_clone.lock() {
                    buf.push(l);
                    if buf.len() > 10000 {
                        buf.drain(0..1000); // Remove oldest
                    }
                }
            } else {
                println!("Logcat: EOF or Error");
                break;
            }
        }
        println!("Logcat thread finished for {}", dev_id);
    });

    procs.insert(device.clone(), LogcatProcess { child, buffer, output_file: output_file.clone() });

    Ok("Logcat started".to_string())
}

#[tauri::command]
pub fn stop_logcat(state: State<'_, LogcatState>, device: String) -> Result<String, String> {
    println!("Logcat: STOP request for {}", device);
    let mut procs = state.0.lock().map_err(|e| e.to_string())?;

    if let Some(mut process) = procs.remove(&device) {
        let _ = process.child.kill();
        println!("Logcat: Killed process for {}", device);
        return Ok("Logcat stopped".to_string());
    }

    Ok("Logcat not running".to_string())
}

#[tauri::command]
pub fn is_logcat_active(state: State<'_, LogcatState>, device: String) -> Result<bool, String> {
    let procs = state.0.lock().map_err(|e| e.to_string())?;
    Ok(procs.contains_key(&device))
}

#[derive(serde::Serialize)]
pub struct LogcatDetails {
    pub is_active: bool,
    pub output_file: Option<String>,
}

#[tauri::command]
pub fn get_logcat_details(
    state: State<'_, LogcatState>,
    device: String,
) -> Result<LogcatDetails, String> {
    let procs = state.0.lock().map_err(|e| e.to_string())?;
    
    if let Some(process) = procs.get(&device) {
        Ok(LogcatDetails {
            is_active: true,
            output_file: process.output_file.clone(),
        })
    } else {
        Ok(LogcatDetails {
            is_active: false,
            output_file: None,
        })
    }
}

#[tauri::command]
pub fn fetch_logcat_buffer(
    state: State<'_, LogcatState>,
    device: String,
    offset: usize,
) -> Result<(Vec<String>, usize), String> {
    let procs = state.0.lock().map_err(|e| e.to_string())?;

    if let Some(process) = procs.get(&device) {
        let buf = process.buffer.lock().map_err(|e| e.to_string())?;
        
        let len = buf.len();
        if offset >= len {
            return Ok((Vec::new(), len));
        }
        
        let new_lines = buf[offset..].to_vec();
        Ok((new_lines, len))
    } else {
        Ok((Vec::new(), 0))
    }
}
