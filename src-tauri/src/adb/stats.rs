use crate::cmd_utils::{new_tokio_command, get_adb_program};
use serde::Serialize;
use tauri::AppHandle;
use once_cell::sync::Lazy;
use std::sync::Mutex;
use std::time::Instant;
use std::collections::HashMap;

static FPS_CACHE: Lazy<Mutex<HashMap<String, (u64, Instant)>>> = Lazy::new(|| Mutex::new(HashMap::new()));

#[derive(Debug, Serialize, Default)]
pub struct AppStats {
    pub cpu_usage: f32, // Percentage
    pub ram_used: u64,  // KB
    pub fps: u32,       // Frames per second
}

#[derive(Debug, Serialize, Default)]
pub struct DeviceStats {
    pub cpu_usage: f32,
    pub ram_used: u64,
    pub ram_total: u64,
    pub battery_level: u8,
    pub temperature: f32, // Celsius
    pub app_stats: Option<AppStats>,
    pub foreground_activity: Option<String>,
    pub screen_state: Option<String>,
}

#[tauri::command]
pub async fn get_device_stats(
    app: AppHandle,
    device: String,
    package: Option<String>,
) -> Result<DeviceStats, String> {
    // 1. Prepare async tasks for base device stats
    let battery_task = run_adb_shell(&app, &device, "dumpsys battery");
    let meminfo_task = run_adb_shell(&app, &device, "cat /proc/meminfo");
    let top_task = run_adb_shell(&app, &device, "dumpsys cpuinfo");
    let activity_task = run_adb_shell(&app, &device, "dumpsys activity top");
    let power_task = run_adb_shell(&app, &device, "dumpsys power");

    // Start these in parallel
    let (bat_output, mem_output, top_output, act_output, pwr_output) = tokio::join!(battery_task, meminfo_task, top_task, activity_task, power_task);

    let (battery_level, temperature) = parse_battery_info(&bat_output).unwrap_or((0, 0.0));
    let (ram_total, ram_used) = parse_mem_info(&mem_output).unwrap_or((0, 0));
    let cpu_usage = parse_cpu_usage(&top_output).unwrap_or(0.0);
    let foreground_activity = parse_foreground_activity(&act_output);
    let screen_state = parse_screen_state(&pwr_output);

    // 2. Prepare app stats if package provided
    let mut app_stats = None;
    if let Some(pkg) = package {
        if !pkg.is_empty() {
            let ram_task = get_app_ram(&app, &device, &pkg);
            let fps_task = get_app_fps(&app, &device, &pkg);
            let cpu_task = get_app_cpu(&app, &device, &pkg, &top_output);

            let (app_ram_res, app_fps_res, app_cpu_res) = tokio::join!(ram_task, fps_task, cpu_task);

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
        Ok(o) => String::from_utf8_lossy(&o.stdout).to_string(),
        Err(_) => String::new(),
    }
}

pub fn parse_battery_info(output: &str) -> Option<(u8, f32)> {
    let mut level = 0;
    let mut temp = 0.0;
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
                    // Convert tenths to celsius
                    temp = val / 10.0;
                }
            }
        }
    }

    if found_level {
        Some((level, temp))
    } else {
        None
    }
}

pub fn parse_foreground_activity(output: &str) -> Option<String> {
    for line in output.lines() {
        // Look for topApp=ActivityRecord or TASK:
        if line.contains("topApp=ActivityRecord") || line.contains("TASK:") {
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
    for line in output.lines() {
        if line.contains("TOTAL:") {
            let trimmed = line.trim();
            if let Some(percent_str) = trimmed.split('%').next() {
                if let Ok(val) = percent_str.trim().parse::<f32>() {
                    return Some(val);
                }
            }
        } else if line.contains("%cpu") {
            // Fallback to top parsing if cpuinfo didn't have TOTAL
            let parts: Vec<&str> = line.split_whitespace().collect();
            let mut total_cap = 0.0;
            let mut idle = 0.0;

            for part in parts {
                if part.contains("%cpu") {
                    if let Ok(val) = part.replace("%cpu", "").parse::<f32>() {
                        total_cap = val;
                    }
                } else if part.contains("%idle") {
                    if let Ok(val) = part.replace("%idle", "").parse::<f32>() {
                        idle = val;
                    }
                }
            }

            if total_cap > 0.0 {
                let used = total_cap - idle;
                let normalized = (used / total_cap) * 100.0;
                return Some(normalized);
            }
        }
    }
    None
}

async fn get_app_cpu(app: &AppHandle, device: &str, package: &str, fallback_top_output: &str) -> Option<f32> {
    let pid_output = run_adb_shell(app, device, &format!("pidof {}", package)).await;
    let pid = pid_output.split_whitespace().next().unwrap_or("");
    
    if !pid.is_empty() && pid.chars().all(char::is_numeric) {
        let top_output = run_adb_shell(app, device, &format!("top -n 2 -d 0.5 -p {}", pid)).await;
        
        let mut found_cpu: Option<f32> = None;
        for line in top_output.lines().rev() {
            if line.contains(pid) {
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
        
        if let Some(cpu) = found_cpu {
            return Some(cpu);
        }
    }

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
    None
}

async fn get_app_ram(app: &AppHandle, device: &str, package: &str) -> Option<u64> {
    let output = run_adb_shell(app, device, &format!("dumpsys meminfo {}", package)).await;

    for line in output.lines() {
        let trimmed = line.trim();
        if trimmed.starts_with("TOTAL") || trimmed.starts_with("Total PSS:") {
            if let Some(val_str) = trimmed.split_whitespace().nth(1) {
                if let Ok(val) = val_str.parse::<u64>() {
                    return Some(val);
                }
            }
        }
    }
    None
}

async fn get_app_fps(app: &AppHandle, device: &str, package: &str) -> Option<u32> {
    let cmd_str = format!(
        "dumpsys gfxinfo {} framestats",
        package
    );
    let output = run_adb_shell(app, device, &cmd_str).await;

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
                    // Ignore missing or pending frames
                    if completed > 0 && vsync > 0 {
                        // Some lines have IntendedVsync as max u64 if pending
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
        let mut cache = FPS_CACHE.lock().unwrap();
        
        if let Some((last_frames, last_time)) = cache.get(&cache_key) {
            let elapsed = last_time.elapsed().as_secs_f64();
            if elapsed > 0.0 {
                if current_frames >= *last_frames {
                    let diff = (current_frames - *last_frames) as f64;
                    let fps = diff / elapsed;
                    cache.insert(cache_key, (current_frames, Instant::now()));
                    return Some(fps.round() as u32);
                }
            }
        }
        
        cache.insert(cache_key, (current_frames, Instant::now()));
        return Some(0);
    }

    None
}
