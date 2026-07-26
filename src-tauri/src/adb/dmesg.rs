use crate::cmd_utils::{new_std_command, get_adb_program};
use std::collections::HashMap;
use std::fs::OpenOptions;
use std::io::{BufRead, BufReader, Write};
use std::process::{Child, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant};
use tauri::{State, AppHandle, Emitter};

pub struct DmesgProcess {
    child: Arc<Mutex<Option<Child>>>,
    should_stop: Arc<AtomicBool>,
    buffer: Arc<Mutex<Vec<String>>>,
    output_file: Option<String>,
}

pub struct DmesgState(pub Mutex<HashMap<String, DmesgProcess>>);

#[tauri::command]
pub fn start_dmesg(
    app: AppHandle,
    state: State<'_, DmesgState>,
    device: String,
    output_file: Option<String>,
) -> Result<String, String> {
    let mut procs = state.0.lock().map_err(|_e| _e.to_string())?;

    if procs.contains_key(&device) {
        return Ok("Dmesg already running".to_string());
    }

    let adb_program = get_adb_program(&app);

    let buffer = Arc::new(Mutex::new(Vec::new()));
    match output_file.clone() {
        Some(path) => {
            if let Ok(mut b) = buffer.lock() {
                b.push(format!(
                    "--- Kernel Logs (dmesg) started for device: {} (Writing to {}) ---",
                    device, path
                ));
            }
        }
        None => {
            if let Ok(mut b) = buffer.lock() {
                b.push(format!("--- Kernel Logs (dmesg) started for device: {} ---", device));
            }
        }
    }

    let child_mutex = Arc::new(Mutex::new(None));
    let should_stop = Arc::new(AtomicBool::new(false));

    let thread_device = device.clone();
    let thread_buffer = buffer.clone();
    let thread_output_file = output_file.clone();
    let thread_child_mutex = child_mutex.clone();
    let thread_should_stop = should_stop.clone();
    let thread_adb_program = adb_program;
    let thread_app_handle = app.clone();

    thread::spawn(move || {
        let device_id = thread_device;
        let adb_bin = thread_adb_program;

        while !thread_should_stop.load(Ordering::Relaxed) {
            let mut cmd = new_std_command(&adb_bin);
            // Some devices might not support -w, but we'll try it.
            // If it exits immediately, we sleep and retry, acting as a fallback poll if -w behaves like normal dmesg.
            cmd.args(&["-s", &device_id, "shell", "dmesg", "-w"]);
            cmd.stdout(Stdio::piped()).stderr(Stdio::piped());

            match cmd.spawn() {
                Ok(mut child_proc) => {
                    let stdout = child_proc.stdout.take();

                    {
                        let mut lock = thread_child_mutex.lock().unwrap();
                        *lock = Some(child_proc);
                    }

                    if let Some(out) = stdout {
                        let reader_buffer = thread_buffer.clone();
                        let reader_output_file = thread_output_file.clone();
                        let reader_should_stop = thread_should_stop.clone();
                        let reader_app_handle = thread_app_handle.clone();
                        let reader_device_id = device_id.clone();

                        thread::spawn(move || {
                            let reader = BufReader::new(out);
                            let mut file_writer = if let Some(ref path) = reader_output_file {
                                let expanded = crate::cmd_utils::expand_env_vars(path);
                                if let Some(parent) = std::path::Path::new(&expanded).parent() {
                                    let _ = std::fs::create_dir_all(parent);
                                }
                                OpenOptions::new().create(true).append(true).open(&expanded).ok()
                            } else {
                                None
                            };

                            let mut chunk = Vec::new();
                            let mut last_emit = Instant::now();

                            #[derive(Clone, serde::Serialize)]
                            struct DmesgPayload {
                                device: String,
                                lines: Vec<String>,
                            }

                            for line in reader.lines() {
                                if reader_should_stop.load(Ordering::Relaxed) {
                                    break;
                                }

                                if let Ok(l) = line {
                                    if let Some(ref mut f) = file_writer {
                                        let _ = writeln!(f, "{}", l);
                                    }
                                    if let Ok(mut b) = reader_buffer.lock() {
                                        b.push(l.clone());
                                        if b.len() > 10000 {
                                            b.drain(0..1000);
                                        }
                                    }

                                    chunk.push(l);

                                    if chunk.len() >= 50 || last_emit.elapsed().as_millis() >= 200 {
                                        let payload = DmesgPayload {
                                            device: reader_device_id.clone(),
                                            lines: chunk.clone(),
                                        };
                                        let _ = reader_app_handle.emit("dmesg-data", payload);
                                        chunk.clear();
                                        last_emit = Instant::now();
                                    }
                                } else {
                                    break;
                                }
                            }
                            
                            if !chunk.is_empty() {
                                let payload = DmesgPayload {
                                    device: reader_device_id.clone(),
                                    lines: chunk,
                                };
                                let _ = reader_app_handle.emit("dmesg-data", payload);
                            }
                        });
                    }

                    loop {
                        if thread_should_stop.load(Ordering::Relaxed) {
                            break;
                        }
                        thread::sleep(Duration::from_millis(1000));

                        let mut child_dead = false;
                        {
                            let mut lock = thread_child_mutex.lock().unwrap();
                            if let Some(child) = lock.as_mut() {
                                match child.try_wait() {
                                    Ok(Some(_)) => child_dead = true,
                                    Ok(None) => {}
                                    Err(_) => child_dead = true,
                                }
                            } else {
                                child_dead = true;
                            }
                        }

                        if child_dead {
                            break;
                        }
                    }

                    {
                        let mut lock = thread_child_mutex.lock().unwrap();
                        *lock = None;
                    }
                }
                Err(_e) => {
                    thread::sleep(Duration::from_secs(2));
                }
            }

            if thread_should_stop.load(Ordering::Relaxed) {
                break;
            }
            // If the process exited quickly, wait before restarting
            thread::sleep(Duration::from_secs(2));
        }
    });

    procs.insert(
        device,
        DmesgProcess {
            child: child_mutex,
            should_stop,
            buffer,
            output_file,
        },
    );

    Ok("Dmesg started".to_string())
}

#[tauri::command]
pub fn stop_dmesg(state: State<'_, DmesgState>, device: String) -> Result<String, String> {
    let mut procs = state.0.lock().map_err(|e| e.to_string())?;

    if let Some(process) = procs.remove(&device) {
        process.should_stop.store(true, Ordering::Relaxed);

        let mut child_lock = process.child.lock().map_err(|e| e.to_string())?;
        if let Some(mut child) = child_lock.take() {
            let _ = child.kill();
        }

        return Ok("Dmesg stopped".to_string());
    }

    Ok("Dmesg not running".to_string())
}

#[tauri::command]
pub fn is_dmesg_active(state: State<'_, DmesgState>, device: String) -> Result<bool, String> {
    let procs = state.0.lock().map_err(|_e| _e.to_string())?;
    Ok(procs.contains_key(&device))
}

#[derive(serde::Serialize)]
pub struct DmesgDetails {
    pub is_active: bool,
    pub output_file: Option<String>,
}

#[tauri::command]
pub fn get_dmesg_details(
    state: State<'_, DmesgState>,
    device: String,
) -> Result<DmesgDetails, String> {
    let procs = state.0.lock().map_err(|_e| _e.to_string())?;

    if let Some(process) = procs.get(&device) {
        Ok(DmesgDetails {
            is_active: true,
            output_file: process.output_file.clone(),
        })
    } else {
        Ok(DmesgDetails {
            is_active: false,
            output_file: None,
        })
    }
}

#[tauri::command]
pub fn fetch_dmesg_buffer(
    state: State<'_, DmesgState>,
    device: String,
    offset: usize,
) -> Result<(Vec<String>, usize), String> {
    let procs = state.0.lock().map_err(|_e| _e.to_string())?;

    if let Some(process) = procs.get(&device) {
        let buf = process.buffer.lock().map_err(|_e| _e.to_string())?;

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
