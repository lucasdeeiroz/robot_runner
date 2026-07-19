use crate::cmd_utils::{new_tokio_command, get_adb_program};
use serde::Serialize;
use tauri::{AppHandle, State, Emitter};
use once_cell::sync::Lazy;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;
use std::time::Instant;
use std::collections::HashMap;

static FPS_CACHE: Lazy<Mutex<HashMap<String, (u64, Instant)>>> = Lazy::new(|| Mutex::new(HashMap::new()));

pub struct PerformanceState(pub Mutex<HashMap<String, Arc<AtomicBool>>>);

#[derive(Debug, Serialize, Default, Clone)]
pub struct AppStats {
    pub cpu_usage: f32, // Percentage
    pub ram_used: u64,  // KB
    pub fps: u32,       // Frames per second
}

#[derive(Debug, Serialize, Default, Clone)]
pub struct DeviceStats {
    pub cpu_usage: f32,
    pub ram_used: u64,
    pub ram_total: u64,
    pub battery_level: u8,
    pub temperature: f32, // Celsius
    pub battery_status: String,
    pub battery_power_source: String,
    pub app_stats: Option<AppStats>,
    pub foreground_activity: Option<String>,
    pub screen_state: Option<String>,
}

#[derive(Debug, Serialize, Clone)]
pub struct DeviceStatsPayload {
    pub device: String,
    pub stats: DeviceStats,
}

#[tauri::command]
pub async fn start_performance_stream(
    app: AppHandle,
    state: State<'_, PerformanceState>,
    device: String,
    package: Option<String>,
    interval_ms: u64,
) -> Result<(), String> {
    let mut map = state.0.lock().map_err(|e| e.to_string())?;

    // If there is already a stream for this device, stop it first
    if let Some(flag) = map.get(&device) {
        flag.store(true, Ordering::Relaxed);
    }

    let cancel_flag = Arc::new(AtomicBool::new(false));
    map.insert(device.clone(), cancel_flag.clone());

    let app_clone = app.clone();
    let device_clone = device.clone();

    tokio::spawn(async move {
        while !cancel_flag.load(Ordering::Relaxed) {
            match get_device_stats_internal(&app_clone, &device_clone, package.clone()).await {
                Ok(stats) => {
                    let payload = DeviceStatsPayload {
                        device: device_clone.clone(),
                        stats,
                    };
                    let _ = app_clone.emit("device-performance", payload);
                }
                Err(e) => {
                    println!("Error getting device stats: {}", e);
                }
            }
            tokio::time::sleep(Duration::from_millis(interval_ms)).await;
        }
    });

    Ok(())
}

#[tauri::command]
pub async fn stop_performance_stream(
    state: State<'_, PerformanceState>,
    device: String,
) -> Result<(), String> {
    let mut map = state.0.lock().map_err(|e| e.to_string())?;
    if let Some(flag) = map.remove(&device) {
        flag.store(true, Ordering::Relaxed);
    }
    Ok(())
}

#[tauri::command]
pub async fn get_device_stats(
    app: AppHandle,
    device: String,
    package: Option<String>,
) -> Result<DeviceStats, String> {
    get_device_stats_internal(&app, &device, package).await
}

async fn get_device_stats_internal(
    app: &AppHandle,
    device: &str,
    package: Option<String>,
) -> Result<DeviceStats, String> {
    let mut script = String::from("dumpsys battery; echo ___S\"EP\"___; cat /proc/meminfo || dumpsys meminfo; echo ___S\"EP\"___; top -b -n 2 -d 0.5; echo ___S\"EP\"___; dumpsys window displays; echo ___S\"EP\"___; dumpsys power");
    
    if let Some(pkg) = &package {
        if !pkg.is_empty() {
            script.push_str(&format!("; echo ___S\"EP\"___; dumpsys meminfo {}; echo ___S\"EP\"___; dumpsys gfxinfo {}; echo ___S\"EP\"___; pidof {}", pkg, pkg, pkg));
        }
    }

    let combined_output = run_adb_shell(app, device, &script).await;
    let parts: Vec<&str> = combined_output.split("___SEP___").collect();

    let bat_output = parts.get(0).unwrap_or(&"");
    let mem_output = parts.get(1).unwrap_or(&"");
    let top_output = parts.get(2).unwrap_or(&"");
    let act_output = parts.get(3).unwrap_or(&"");
    let pwr_output = parts.get(4).unwrap_or(&"");

    let (battery_level, temperature, battery_status, battery_power_source) = parse_battery_info(bat_output).unwrap_or((0, 0.0, "unknown".to_string(), "none".to_string()));
    let (ram_total, ram_used) = parse_mem_info(mem_output).unwrap_or((0, 0));
    let cpu_usage = parse_cpu_usage(top_output).unwrap_or(0.0);
    let foreground_activity = parse_foreground_activity(act_output);
    let screen_state = parse_screen_state(pwr_output);

    let mut app_stats = None;
    if let Some(pkg) = &package {
        if !pkg.is_empty() {
            let app_ram_output = parts.get(5).unwrap_or(&"");
            let app_fps_output = parts.get(6).unwrap_or(&"");
            let app_pidof_output = parts.get(7).unwrap_or(&"");
            
            // Reusing the same string-based parsing functions without async ADB calls
            let mut app_ram_res = None;
            for line in app_ram_output.lines() {
                let trimmed = line.trim();
                if trimmed.starts_with("TOTAL") || trimmed.starts_with("Total PSS:") {
                    if let Some(val_str) = trimmed.split_whitespace().nth(1) {
                        if let Ok(val) = val_str.parse::<u64>() {
                            app_ram_res = Some(val);
                            break;
                        }
                    }
                }
            }

            // Quick extraction of fps
            let app_fps_res = parse_app_fps_from_string(device, pkg, app_fps_output);
            let app_cpu_res = parse_app_cpu_from_string(pkg, top_output, app_pidof_output);

            app_stats = Some(AppStats {
                cpu_usage: app_cpu_res.unwrap_or(0.0),
                ram_used: app_ram_res.unwrap_or(0),
                fps: app_fps_res.unwrap_or(0),
            });
        }
    }

    Ok(DeviceStats {
        cpu_usage,
        ram_used,
        ram_total,
        battery_level,
        temperature,
        battery_status,
        battery_power_source,
        app_stats,
        foreground_activity,
        screen_state,
    })
}

async fn run_adb_shell(app: &AppHandle, device: &str, command_str: &str) -> String {
    let program = get_adb_program(app);
    let mut cmd = new_tokio_command(&program);
    cmd.arg("-s").arg(device).arg("shell").arg(command_str);

    let output = cmd.output().await;

    match output {
        Ok(o) => {
            let raw = String::from_utf8_lossy(&o.stdout);
            let mut result = String::new();
            for line in raw.lines() {
                if line.starts_with("* daemon") || line.starts_with("adb server") {
                    continue;
                }
                result.push_str(line);
                result.push('\n');
            }
            result
        }
        Err(_) => String::new(),
    }
}

pub fn parse_battery_info(output: &str) -> Option<(u8, f32, String, String)> {
    let mut level = 0;
    let mut temp = 0.0;
    let mut status_val = 1;
    let mut ac = false;
    let mut usb = false;
    let mut wireless = false;
    let mut found_level = false;

    for line in output.lines() {
        let trimmed = line.trim();
        if trimmed.starts_with("level:") {
            if let Some(val_str) = trimmed.split(':').nth(1) {
                if let Ok(val) = val_str.trim().parse::<u8>() {
                    level = val;
                    found_level = true;
                }
            }
        } else if trimmed.starts_with("temperature:") {
            if let Some(val_str) = trimmed.split(':').nth(1) {
                if let Ok(val) = val_str.trim().parse::<f32>() {
                    temp = val / 10.0;
                }
            }
        } else if trimmed.starts_with("status:") {
            if let Some(val_str) = trimmed.split(':').nth(1) {
                if let Ok(val) = val_str.trim().parse::<u8>() {
                    status_val = val;
                }
            }
        } else if trimmed.starts_with("AC powered:") {
            ac = trimmed.contains("true");
        } else if trimmed.starts_with("USB powered:") {
            usb = trimmed.contains("true");
        } else if trimmed.starts_with("Wireless powered:") {
            wireless = trimmed.contains("true");
        }
    }

    let status_str = match status_val {
        2 => "charging".to_string(),
        3 => "discharging".to_string(),
        4 => "not_charging".to_string(),
        5 => "full".to_string(),
        _ => "unknown".to_string(),
    };

    let power_source = if ac {
        "ac".to_string()
    } else if usb {
        "usb".to_string()
    } else if wireless {
        "wireless".to_string()
    } else {
        "none".to_string()
    };

    if found_level {
        Some((level, temp, status_str, power_source))
    } else {
        None
    }
}

pub fn parse_foreground_activity(output: &str) -> Option<String> {
    for line in output.lines() {
        // Look for mCurrentFocus or mFocusedApp (dumpsys window displays) or fallbacks (activity top)
        if line.contains("mCurrentFocus=") || line.contains("mFocusedApp=") || line.contains("topApp=ActivityRecord") || line.contains("TASK:") {
            let parts: Vec<&str> = line.split_whitespace().collect();
            for part in parts {
                if part.contains("/") {
                    // Potential package/activity string
                    let clean = part.replace("}", "").replace("{", "");
                    if let Some(slash_idx) = clean.find('/') {
                        // Ensure it's not just a path
                        if slash_idx > 0 && slash_idx < clean.len() - 1 {
                             return Some(clean);
                        }
                    }
                }
            }
        }
    }
    None
}

pub fn parse_screen_state(output: &str) -> Option<String> {
    for line in output.lines() {
        let trimmed = line.trim();
        if trimmed.starts_with("mHoldingDisplaySuspendBlocker=") {
            if trimmed.contains("true") {
                return Some("ON".to_string());
            } else {
                return Some("OFF".to_string());
            }
        }
        if trimmed.starts_with("Display Power: state=") {
            if trimmed.contains("ON") {
                return Some("ON".to_string());
            } else if trimmed.contains("OFF") {
                return Some("OFF".to_string());
            }
        }
    }
    None
}

pub fn parse_mem_info(output: &str) -> Option<(u64, u64)> {
    let mut total = 0;
    let mut available = 0;

    for line in output.lines() {
        if line.starts_with("MemTotal:") {
            if let Some(val) = extract_kb(line) {
                total = val;
            }
        } else if line.starts_with("MemAvailable:") {
            if let Some(val) = extract_kb(line) {
                available = val;
            }
        }
    }

    if total > 0 {
        Some((total, total - available))
    } else {
        None
    }
}

fn extract_kb(line: &str) -> Option<u64> {
    line.split_whitespace()
        .nth(1)
        .and_then(|s| s.parse::<u64>().ok())
}

fn parse_cpu_usage(output: &str) -> Option<f32> {
    let mut last_cpu: Option<f32> = None;
    for line in output.lines() {
        let trimmed = line.trim();
        
        if trimmed.contains("TOTAL:") {
            if let Some(percent_str) = trimmed.split('%').next() {
                if let Ok(val) = percent_str.trim().parse::<f32>() {
                    last_cpu = Some(val);
                }
            }
        } else if trimmed.contains("%cpu") && trimmed.contains("%idle") {
            let parts: Vec<&str> = trimmed.split_whitespace().collect();
            let mut total_cap = 0.0;
            let mut idle = 0.0;
            for part in &parts {
                if part.ends_with("%cpu") {
                    if let Ok(val) = part.replace("%cpu", "").parse::<f32>() {
                        total_cap = val;
                    }
                } else if part.ends_with("%idle") {
                    if let Ok(val) = part.replace("%idle", "").parse::<f32>() {
                        idle = val;
                    }
                }
            }
            if total_cap > 0.0 {
                let used = total_cap - idle;
                let normalized = (used / total_cap) * 100.0;
                last_cpu = Some(normalized);
            }
        } else if trimmed.starts_with("User ") && trimmed.contains("System ") {
            let clean = trimmed.replace('%', "").replace(',', "");
            let parts: Vec<&str> = clean.split_whitespace().collect();
            let mut total_used = 0.0;
            for (i, p) in parts.iter().enumerate() {
                if (*p == "User" || *p == "System" || *p == "IOW" || *p == "IRQ") && i + 1 < parts.len() {
                    if let Ok(val) = parts[i+1].parse::<f32>() {
                        total_used += val;
                    }
                }
            }
            last_cpu = Some(total_used);
        }
    }
    last_cpu
}


#[derive(Debug, Serialize, Clone)]
pub struct ProcessStat {
    pub pid: u32,
    pub user: String,
    pub pr: String,
    pub ni: String,
    pub virt: String,
    pub res: String,
    pub shr: String,
    pub s: String,
    pub cpu: f32,
    pub mem: f32,
    pub time: String,
    pub command: String,
}

#[derive(Debug, Serialize, Clone)]
pub struct ProcessStatsPayload {
    pub device: String,
    pub processes: Vec<ProcessStat>,
}

#[tauri::command]
pub async fn start_process_monitor_stream(
    app: AppHandle,
    state: State<'_, PerformanceState>,
    device: String,
    interval_ms: u64,
) -> Result<(), String> {
    let mut map = state.0.lock().map_err(|e| e.to_string())?;

    let stream_key = format!("proc_{}", device);
    if let Some(flag) = map.get(&stream_key) {
        flag.store(true, Ordering::Relaxed);
    }

    let cancel_flag = Arc::new(AtomicBool::new(false));
    map.insert(stream_key, cancel_flag.clone());

    let app_clone = app.clone();
    let device_clone = device.clone();

    tokio::spawn(async move {
        while !cancel_flag.load(Ordering::Relaxed) {
            match get_process_stats_internal(&app_clone, &device_clone).await {
                Ok(processes) => {
                    let payload = ProcessStatsPayload {
                        device: device_clone.clone(),
                        processes,
                    };
                    let _ = app_clone.emit("process_monitor_update", payload);
                }
                Err(e) => {
                    tracing::error!("Error getting process stats: {}", e);
                }
            }
            tokio::time::sleep(Duration::from_millis(interval_ms)).await;
        }
    });

    Ok(())
}

#[tauri::command]
pub async fn stop_process_monitor_stream(
    state: State<'_, PerformanceState>,
    device: String,
) -> Result<(), String> {
    let mut map = state.0.lock().map_err(|e| e.to_string())?;
    let stream_key = format!("proc_{}", device);
    if let Some(flag) = map.remove(&stream_key) {
        flag.store(true, Ordering::Relaxed);
    }
    Ok(())
}

async fn get_process_stats_internal(app: &AppHandle, device: &str) -> Result<Vec<ProcessStat>, String> {
    // Some devices use "top -b -n 1", others just "top -n 1". "-b" avoids escape characters.
    let output = run_adb_shell(app, device, "top -b -n 1").await;
    let mut processes = Vec::new();

    let mut start_parsing = false;
    for line in output.lines() {
        let trimmed = line.trim();
        if trimmed.starts_with("PID") {
            start_parsing = true;
            continue;
        }

        if start_parsing && !trimmed.is_empty() {
            let parts: Vec<&str> = trimmed.split_whitespace().collect();
            // Expected format (might vary slightly but usually at least 12 columns):
            // PID USER PR NI VIRT RES SHR S %CPU %MEM TIME+ COMMAND
            if parts.len() >= 12 {
                if let Ok(pid) = parts[0].parse::<u32>() {
                    let cpu = parts[8].parse::<f32>().unwrap_or(0.0);
                    let mem = parts[9].parse::<f32>().unwrap_or(0.0);
                    // Handle command which might have spaces
                    let command = parts[11..].join(" ");
                    if !command.contains("top") {
                        processes.push(ProcessStat {
                            pid,
                            user: parts[1].to_string(),
                            pr: parts[2].to_string(),
                            ni: parts[3].to_string(),
                            virt: parts[4].to_string(),
                            res: parts[5].to_string(),
                            shr: parts[6].to_string(),
                            s: parts[7].to_string(),
                            cpu,
                            mem,
                            time: parts[10].to_string(),
                            command,
                        });
                    }
                }
            }
        }
    }

    Ok(processes)
}

#[tauri::command]
pub async fn reset_battery_stats(app: AppHandle, device: String) -> Result<(), String> {
    let output = run_adb_shell(&app, &device, "dumpsys batterystats --reset").await;
    if output.contains("Battery stats reset") || output.is_empty() || output.contains("reset") {
        Ok(())
    } else {
        Err(format!("Failed to reset: {}", output))
    }
}

#[derive(serde::Serialize, Clone)]
pub struct BatteryAuditApp {
    pub uid: String,
    pub name: String,
    pub usage: f32,
    pub details: String,
}

#[derive(serde::Serialize, Clone)]
pub struct BatteryAuditData {
    pub capacity: f32,
    pub computed_drain: f32,
    pub actual_drain: f32,
    pub apps: Vec<BatteryAuditApp>,
}

#[tauri::command]
pub async fn get_battery_audit(app: AppHandle, device: String) -> Result<BatteryAuditData, String> {
    let mut uid_map = std::collections::HashMap::new();
    let pm_output = run_adb_shell(&app, &device, "pm list packages -U").await;
    for line in pm_output.lines() {
        let parts: Vec<&str> = line.trim().split(" uid:").collect();
        if parts.len() == 2 {
            let pkg = parts[0].replace("package:", "");
            let uid = parts[1].to_string();
            uid_map.insert(uid, pkg);
        }
    }
    uid_map.insert("0".to_string(), "Android System (root)".to_string());
    uid_map.insert("1000".to_string(), "Android System".to_string());
    uid_map.insert("1001".to_string(), "Radio/Telephony".to_string());

    let output = run_adb_shell(&app, &device, "dumpsys batterystats").await;
    let mut in_estimated_power = false;
    
    let mut capacity = 0.0;
    let mut computed_drain = 0.0;
    let mut actual_drain = 0.0;
    let mut apps = Vec::new();

    for line in output.lines() {
        let trimmed = line.trim();
        if trimmed.starts_with("Estimated power use") {
            in_estimated_power = true;
            continue;
        }

        if in_estimated_power {
            if trimmed.is_empty() && !apps.is_empty() {
                break; // end of block
            }
            if trimmed.starts_with("Capacity:") {
                // Capacity: 2946, Computed drain: 0, actual drain: 0
                let parts: Vec<&str> = trimmed.split(',').collect();
                for p in parts {
                    let kv: Vec<&str> = p.split(':').collect();
                    if kv.len() == 2 {
                        let k = kv[0].trim();
                        let v = kv[1].trim().parse::<f32>().unwrap_or(0.0);
                        if k == "Capacity" { capacity = v; }
                        else if k == "Computed drain" { computed_drain = v; }
                        else if k == "actual drain" { actual_drain = v; }
                    }
                }
            } else if trimmed.starts_with("UID ") {
                // UID 1000: 0.000782 ( audio=0 ... )
                let parts: Vec<&str> = trimmed.splitn(2, ": ").collect();
                if parts.len() == 2 {
                    let uid_raw = parts[0].replace("UID ", "");
                    let mut numeric_uid = uid_raw.clone();
                    if uid_raw.starts_with("u0a") {
                        if let Ok(app_id) = uid_raw[3..].parse::<u32>() {
                            numeric_uid = (10000 + app_id).to_string();
                        }
                    }
                    
                    let name = uid_map.get(&numeric_uid).cloned().unwrap_or(uid_raw.clone());
                    
                    let rest = parts[1];
                    let mut tokens = rest.split_whitespace();
                    let usage_str = tokens.next().unwrap_or("0");
                    let usage = usage_str.parse::<f32>().unwrap_or(0.0);
                    
                    let details = tokens.collect::<Vec<&str>>().join(" ");

                    apps.push(BatteryAuditApp {
                        uid: uid_raw,
                        name,
                        usage,
                        details,
                    });
                }
            }
        }
    }

    // Sort apps by usage descending
    apps.sort_by(|a, b| b.usage.partial_cmp(&a.usage).unwrap_or(std::cmp::Ordering::Equal));

    Ok(BatteryAuditData {
        capacity,
        computed_drain,
        actual_drain,
        apps,
    })
}


fn parse_app_cpu_from_string(package: &str, fallback_top_output: &str, pidof_output: &str) -> Option<f32> {
    let mut found_cpu: Option<f32> = None;
    let mut clean_pid = "";
    
    for line in pidof_output.lines() {
        let trimmed = line.trim();
        if !trimmed.is_empty() {
            clean_pid = trimmed.split_whitespace().next().unwrap_or("");
            break;
        }
    }

    if !clean_pid.is_empty() && clean_pid.chars().all(char::is_numeric) {
        for line in fallback_top_output.lines().rev() {
            let parts: Vec<&str> = line.split_whitespace().collect();
            if parts.first() == Some(&clean_pid) || line.contains(clean_pid) {
                for (i, p) in parts.iter().enumerate() {
                    if i > 3 && p.len() == 1 && (*p == "S" || *p == "R" || *p == "D" || *p == "Z" || *p == "I" || *p == "T") {
                        if i + 1 < parts.len() {
                            if let Ok(cpu) = parts[i + 1].replace("%", "").parse::<f32>() {
                                found_cpu = Some(cpu);
                                break;
                            }
                        }
                    }
                }
                if found_cpu.is_some() {
                    break;
                }
            }
        }
    }

    if found_cpu.is_none() {
        let pkg_search = if package.len() > 15 { &package[0..15] } else { package };
        
        for line in fallback_top_output.lines().rev() {
            if line.contains(pkg_search) {
                let parts: Vec<&str> = line.split_whitespace().collect();
                for (i, p) in parts.iter().enumerate() {
                    if i > 3 && p.len() == 1 && (*p == "S" || *p == "R" || *p == "D" || *p == "Z" || *p == "I" || *p == "T") {
                        if i + 1 < parts.len() {
                            if let Ok(cpu) = parts[i + 1].replace("%", "").parse::<f32>() {
                                found_cpu = Some(cpu);
                                break;
                            }
                        }
                    }
                }
                if found_cpu.is_some() {
                    break;
                }
            }
        }
    }

    if found_cpu.is_none() {
        for line in fallback_top_output.lines() {
            if line.contains(package) {
                let trimmed = line.trim();
                if let Some(percent_str) = trimmed.split('%').next() {
                    if let Ok(val) = percent_str.trim().parse::<f32>() {
                        return Some(val);
                    }
                }
            }
        }
    }

    found_cpu
}

fn parse_app_fps_from_string(device: &str, package: &str, output: &str) -> Option<u32> {
    let mut intended_vsyncs: Vec<u64> = Vec::new();
    let mut vsync_index: Option<usize> = None;
    let mut completed_index: Option<usize> = None;
    let mut uptime_ns: u64 = 0;
    let mut total_frames_rendered: Option<u64> = None;

    for line in output.lines() {
        if line.starts_with("Total frames rendered: ") {
            if let Ok(frames) = line.replace("Total frames rendered: ", "").trim().parse::<u64>() {
                total_frames_rendered = Some(frames);
            }
            continue;
        }

        if line.starts_with("Uptime: ") {
            let parts: Vec<&str> = line.split_whitespace().collect();
            if parts.len() >= 2 {
                if let Ok(uptime_ms) = parts[1].parse::<u64>() {
                    uptime_ns = uptime_ms * 1_000_000;
                }
            }
            continue;
        }

        if line.starts_with("Flags,") {
            let headers: Vec<&str> = line.split(',').collect();
            for (i, h) in headers.iter().enumerate() {
                if *h == "IntendedVsync" {
                    vsync_index = Some(i);
                } else if *h == "FrameCompleted" {
                    completed_index = Some(i);
                }
            }
            continue;
        }

        let parts: Vec<&str> = line.split(',').collect();
        if let (Some(v_idx), Some(c_idx)) = (vsync_index, completed_index) {
            if parts.len() > v_idx && parts.len() > c_idx {
                if let (Ok(vsync), Ok(completed)) = (parts[v_idx].parse::<u64>(), parts[c_idx].parse::<u64>()) {
                    if completed > 0 && vsync > 0 {
                        if vsync < u64::MAX - 1000000 {
                            intended_vsyncs.push(vsync);
                        }
                    }
                }
            }
        }
    }

    if !intended_vsyncs.is_empty() {
        intended_vsyncs.sort_unstable();

        let last_vsync = *intended_vsyncs.last().unwrap();
        if uptime_ns > 0 {
            if uptime_ns > last_vsync && (uptime_ns - last_vsync) > 500_000_000 {
                return Some(0);
            }
        }

        let one_sec_ago = last_vsync.saturating_sub(1_000_000_000);
        let recent_frames: Vec<u64> = intended_vsyncs.into_iter().filter(|&v| v >= one_sec_ago).collect();

        if recent_frames.len() > 1 {
            let start = recent_frames[0];
            let end = *recent_frames.last().unwrap();
            
            if end > start {
                let duration_ns = end - start;
                let duration_sec = duration_ns as f64 / 1_000_000_000.0;

                if duration_sec > 0.0 {
                    let count = (recent_frames.len() - 1) as f64;
                    let fps = count / duration_sec;
                    return Some(fps.round() as u32);
                }
            }
        }
    }

    if let Some(current_frames) = total_frames_rendered {
        let cache_key = format!("{}|{}", device, package);
        let mut cache = match FPS_CACHE.lock() {
            Ok(guard) => guard,
            Err(_) => return Some(0),
        };
        
        if let Some((last_frames, last_time)) = cache.get(&cache_key) {
            let elapsed = last_time.elapsed().as_secs_f64();
            if elapsed > 0.0 {
                if current_frames >= *last_frames {
                    let diff = (current_frames - *last_frames) as f64;
                    let fps = diff / elapsed;
                    cache.insert(cache_key, (current_frames, std::time::Instant::now()));
                    return Some(fps.round() as u32);
                }
            }
        }
        
        cache.insert(cache_key, (current_frames, std::time::Instant::now()));
        return Some(0);
    }

    None
}
