use std::collections::HashMap;
use std::fs::OpenOptions;
use std::io::{BufRead, BufReader, Write};
use std::process::{Child, Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;
use tauri::State;

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

// Structure to hold the process and the shared buffer
pub struct LogcatProcess {
    // Child is now optional and protected by Mutex to allow replacement/restarting
    child: Arc<Mutex<Option<Child>>>,
    // Flag to signal the monitoring thread to stop
    should_stop: Arc<AtomicBool>,
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
    let mut procs = state.0.lock().map_err(|_e| _e.to_string())?;

    if procs.contains_key(&device) {
        return Ok("Logcat already running".to_string());
    }

    // Shared State for the supervisor thread
    let buffer = Arc::new(Mutex::new(Vec::new()));
    match output_file.clone() {
        Some(path) => {
             // Add header to buffer
             if let Ok(mut b) = buffer.lock() {
                 b.push(format!("--- Logcat started for device: {} (Writing to {}) ---", device, path));
             }
        },
        None => {
            if let Ok(mut b) = buffer.lock() {
                b.push(format!("--- Logcat started for device: {} ---", device));
            }
        }
    }

    let child_mutex = Arc::new(Mutex::new(None));
    let should_stop = Arc::new(AtomicBool::new(false));

    // Clones for the thread
    let thread_device = device.clone();
    let thread_filter = filter.clone();
    let thread_level = level.clone();
    let thread_buffer = buffer.clone();
    let thread_output_file = output_file.clone();
    let thread_child_mutex = child_mutex.clone();
    let thread_should_stop = should_stop.clone();

    thread::spawn(move || {
        let device_id = thread_device;
        let pkg = thread_filter;
        let lvl = thread_level.unwrap_or_else(|| "V".to_string()); // Default to Verbose but we format later

        // Loop until stopped
        while !thread_should_stop.load(Ordering::Relaxed) {
            let mut current_pid: Option<String> = None;

            // 1. Resolve PID if package is provided
            if let Some(ref package) = pkg {
                // Try to find PID
                match get_pid(&device_id, package) {
                     Ok(Some(pid)) => {
                         current_pid = Some(pid);
                     },
                     Ok(None) => {
                         // App not running, wait and retry
                         // println!("Logcat: App {} not running, waiting...", package);
                     },
                     Err(_) => {
                         // Error checking
                     }
                }
            }
            
            // If we have a package filter but no PID, wait and continue
            if pkg.is_some() && current_pid.is_none() {
                 if thread_should_stop.load(Ordering::Relaxed) { break; }
                 thread::sleep(Duration::from_millis(1500));
                 continue;
            }

            // 2. Start Logcat Process
            let mut args = vec!["-s", &device_id, "shell", "logcat"];
            if let Some(ref p) = current_pid {
                args.push("--pid");
                args.push(p);
            }
            args.push("-v");
            args.push("threadtime");
            
            let level_arg = format!("*:{}", lvl);
            args.push(&level_arg);

            // Spawn
            let mut cmd = Command::new("adb");
            cmd.args(&args);
            cmd.stdout(Stdio::piped()).stderr(Stdio::piped());
            #[cfg(target_os = "windows")]
            cmd.creation_flags(0x08000000); 

            match cmd.spawn() {
                Ok(mut child_proc) => {
                     // println!("Logcat: Started process for PID {:?}", current_pid);
                     let stdout = child_proc.stdout.take();
                     
                     // Store child
                     {
                         let mut lock = thread_child_mutex.lock().unwrap();
                         *lock = Some(child_proc);
                     }

                     // SPAWN READER THREAD
                     // We need a separate thread because reader.lines() blocks
                     if let Some(out) = stdout {
                         let reader_buffer = thread_buffer.clone();
                         let reader_output_file = thread_output_file.clone();
                         let reader_should_stop = thread_should_stop.clone();
                         
                         thread::spawn(move || {
                             let reader = BufReader::new(out);
                             let mut file_writer = if let Some(ref path) = reader_output_file {
                                OpenOptions::new().create(true).append(true).open(path).ok()
                             } else { None };

                             for line in reader.lines() {
                                 // Stop reading if global stop is requested
                                 if reader_should_stop.load(Ordering::Relaxed) { break; }
                                 
                                 if let Ok(l) = line {
                                     // Write file
                                     if let Some(ref mut f) = file_writer {
                                         let _ = writeln!(f, "{}", l);
                                     }
                                     // Buffer
                                     if let Ok(mut b) = reader_buffer.lock() {
                                         b.push(l);
                                         if b.len() > 10000 {
                                             b.drain(0..1000);
                                         }
                                     }
                                 } else {
                                     break; // Stream broken or process killed
                                 }
                             }
                         });
                     }
                     
                     // MONITOR LOOP
                     // Watch the child and the App PID
                     loop {
                         if thread_should_stop.load(Ordering::Relaxed) { break; }
                         thread::sleep(Duration::from_millis(1000));

                         // 1. Check if child is still running
                         let mut child_dead = false;
                         {
                             let mut lock = thread_child_mutex.lock().unwrap();
                             if let Some(child) = lock.as_mut() {
                                 match child.try_wait() {
                                     Ok(Some(_)) => child_dead = true, // Exited naturally
                                     Ok(None) => {}, // Still running
                                     Err(_) => child_dead = true,
                                 }
                             } else {
                                 child_dead = true; // No child?
                             }
                         }

                         if child_dead {
                             // println!("Logcat: Child exited naturally or error.");
                             break; // Go back to start of supervisor loop to restart
                         }

                         // 2. Check if App PID changed (Only if we are filtering by package)
                         if let Some(ref package) = pkg {
                              // If we knew a PID, check if it's stillvalid
                              if let Some(ref old_pid) = current_pid {
                                  match get_pid(&device_id, package) {
                                      Ok(Some(new_pid)) => {
                                          if new_pid != *old_pid {
                                              // PID Changed! App restarted.
                                              // println!("Logcat: PID changed from {} to {}. Restarting...", old_pid, new_pid);
                                              
                                              // Kill current child to force restart
                                              let mut lock = thread_child_mutex.lock().unwrap();
                                              if let Some(mut child) = lock.take() {
                                                  let _ = child.kill();
                                              }
                                              break; // Monitor loop ends -> Supervisor loop restarts
                                          }
                                      },
                                      Ok(None) => {
                                          // App died (returns None). 
                                          // Keep waiting? Or kill logcat?
                                          // If app died, logcat --pid might stay alive waiting.
                                          // Better to kill and go back to searching.
                                          // println!("Logcat: App died. Killing logcat waiting for restart.");
                                          let mut lock = thread_child_mutex.lock().unwrap();
                                          if let Some(mut child) = lock.take() {
                                              let _ = child.kill();
                                          }
                                          break;
                                      },
                                      Err(_) => {}
                                  }
                              }
                         }
                     }
                     
                     // Cleanup child handle (ensure it's cleared if we broke out)
                     {
                         let mut lock = thread_child_mutex.lock().unwrap();
                         *lock = None;
                     }
                },
                Err(_e) => {
                    // println!("Logcat: Failed to spawn adb: {}", e);
                    thread::sleep(Duration::from_secs(2));
                }
            }
            
            // If we are just running global logcat (no filter), and it exits, we probably shouldn't restart immediately loop hard, 
            // but `adb logcat` usually runs forever. If it crashes, restart is fine.
            if pkg.is_none() {
                 if thread_should_stop.load(Ordering::Relaxed) { break; }
                 thread::sleep(Duration::from_secs(1));
            }
        }
        // println!("Logcat: Supervisor thread exiting for {}", device_id);
    });

    procs.insert(device, LogcatProcess { 
        child: child_mutex, 
        should_stop, 
        buffer, 
        output_file 
    });

    Ok("Logcat started".to_string())
}

fn get_pid(device: &str, pkg: &str) -> Result<Option<String>, String> {
    let mut pidof_cmd = Command::new("adb");
    pidof_cmd.args(&["-s", device, "shell", "pidof", "-s", pkg]);
    #[cfg(target_os = "windows")]
    pidof_cmd.creation_flags(0x08000000);

    match pidof_cmd.output() {
        Ok(output) => {
            let pid = String::from_utf8_lossy(&output.stdout).trim().to_string();
            if pid.is_empty() {
                return Ok(None);
            }
            
            // Check process state (zombie/cached check)
            let mut oom_cmd = Command::new("adb");
            oom_cmd.args(&["-s", device, "shell", "cat", &format!("/proc/{}/oom_score_adj", pid)]);
            #[cfg(target_os = "windows")]
            oom_cmd.creation_flags(0x08000000);

            if let Ok(oom_output) = oom_cmd.output() {
                let score_str = String::from_utf8_lossy(&oom_output.stdout).trim().to_string();
                if let Ok(score) = score_str.parse::<i32>() {
                    // 900+ is cached
                    if score >= 900 {
                        return Ok(None);
                    }
                }
            }
            Ok(Some(pid))
        },
        Err(e) => Err(e.to_string())
    }
}

#[tauri::command]
pub fn stop_logcat(state: State<'_, LogcatState>, device: String) -> Result<String, String> {
    let mut procs = state.0.lock().map_err(|e| e.to_string())?;

    if let Some(process) = procs.remove(&device) {
        // Signal stop
        process.should_stop.store(true, Ordering::Relaxed);

        // Kill current child if exists
        let mut child_lock = process.child.lock().map_err(|e| e.to_string())?;
        if let Some(mut child) = child_lock.take() {
            let _ = child.kill();
        }
        
        return Ok("Logcat stopped".to_string());
    }

    Ok("Logcat not running".to_string())
}

#[tauri::command]
pub fn is_logcat_active(state: State<'_, LogcatState>, device: String) -> Result<bool, String> {
    let procs = state.0.lock().map_err(|_e| _e.to_string())?;
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
    let procs = state.0.lock().map_err(|_e| _e.to_string())?;
    
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
