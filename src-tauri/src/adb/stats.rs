use crate::cmd_utils::new_tokio_command;
use serde::Serialize;

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
}

#[tauri::command]
pub async fn get_device_stats(
    device: String,
    package: Option<String>,
) -> Result<DeviceStats, String> {
    // 1. Prepare async tasks for base device stats
    let battery_task = run_adb_shell(&device, "dumpsys battery");
    let meminfo_task = run_adb_shell(&device, "cat /proc/meminfo");
    let top_task = run_adb_shell(&device, "top -n 1 -m 5");

    // Start these in parallel
    let (bat_output, mem_output, top_output) = tokio::join!(battery_task, meminfo_task, top_task);

    let (battery_level, temperature) = parse_battery_info(&bat_output).unwrap_or((0, 0.0));
    let (ram_total, ram_used) = parse_mem_info(&mem_output).unwrap_or((0, 0));
    let cpu_usage = parse_cpu_usage(&top_output).unwrap_or(0.0);

    // 2. Prepare app stats if package provided
    let mut app_stats = None;
    if let Some(pkg) = package {
        if !pkg.is_empty() {
            let app_cpu = parse_app_cpu(&top_output, &pkg).unwrap_or(0.0);

            // These still call adb individually but we can parallelize them too
            let ram_task = get_app_ram(&device, &pkg);
            let fps_task = get_app_fps(&device, &pkg);

            let (app_ram_res, app_fps_res) = tokio::join!(ram_task, fps_task);

            app_stats = Some(AppStats {
                cpu_usage: app_cpu,
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
    })
}

async fn run_adb_shell(device: &str, command_str: &str) -> String {
    // Split command for arguments
    let shell_args: Vec<&str> = command_str.split_whitespace().collect();

    let mut cmd = new_tokio_command("adb");
    cmd.arg("-s").arg(device).arg("shell").args(&shell_args);

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
        if line.contains("%cpu") {
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

fn parse_app_cpu(top_output: &str, package: &str) -> Option<f32> {
    let mut cpu_idx = 8;

    for line in top_output.lines() {
        if line.contains("PID") && (line.contains("%CPU") || line.contains("[%CPU]")) {
            let parts: Vec<&str> = line.split_whitespace().collect();
            for (i, part) in parts.iter().enumerate() {
                if part.contains("CPU") {
                    cpu_idx = i;
                    break;
                }
            }
            continue;
        }

        if line.contains(package) {
            let parts: Vec<&str> = line.split_whitespace().collect();
            if parts.len() > cpu_idx {
                if let Ok(val) = parts[cpu_idx].parse::<f32>() {
                    return Some(val);
                }
            }
        }
    }
    None
}

async fn get_app_ram(device: &str, package: &str) -> Option<u64> {
    let output = run_adb_shell(device, &format!("dumpsys meminfo {}", package)).await;

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

async fn get_app_fps(device: &str, package: &str) -> Option<u32> {
    let cmd_str = format!(
        "dumpsys gfxinfo {} framestats; echo UPTIME_MARKER; cat /proc/uptime",
        package
    );
    let output = run_adb_shell(device, &cmd_str).await;

    let mut intended_vsyncs: Vec<u64> = Vec::new();
    let mut uptime_ns: u64 = 0;

    let mut parsing_uptime = false;

    for line in output.lines() {
        if line.contains("UPTIME_MARKER") {
            parsing_uptime = true;
            continue;
        }

        if parsing_uptime {
            if let Some(uptime_str) = line.split_whitespace().next() {
                if let Ok(uptime_sec) = uptime_str.parse::<f64>() {
                    uptime_ns = (uptime_sec * 1_000_000_000.0) as u64;
                }
            }
            continue;
        }

        let parts: Vec<&str> = line.split(',').collect();
        if parts.len() >= 14 {
            if let (Ok(vsync), Ok(completed)) = (parts[1].parse::<u64>(), parts[13].parse::<u64>())
            {
                if completed > 0 {
                    intended_vsyncs.push(vsync);
                }
            }
        }
    }

    if intended_vsyncs.is_empty() {
        return None;
    }

    let last_vsync = *intended_vsyncs.last().unwrap();
    if uptime_ns > 0 {
        if uptime_ns > last_vsync && (uptime_ns - last_vsync) > 500_000_000 {
            return Some(0);
        }
    }

    if intended_vsyncs.len() > 1 {
        let start = intended_vsyncs[0];
        let end = last_vsync;

        if end > start {
            let duration_ns = end - start;
            let duration_sec = duration_ns as f64 / 1_000_000_000.0;

            if duration_sec > 0.0 {
                let count = intended_vsyncs.len() as f64 - 1.0;
                let fps = count / duration_sec;
                return Some(fps.round() as u32);
            }
        }
    }

    None
}
