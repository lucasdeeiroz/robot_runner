use std::process::Command;
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
    pub app_stats: Option<AppStats>,
}

#[tauri::command]
pub async fn get_device_stats(device: String, package: Option<String>) -> Result<DeviceStats, String> {
    // 1. Get Battery Level
    let bat_output = run_adb_shell(&device, "dumpsys battery");
    let battery_level = parse_battery_level(&bat_output).unwrap_or(0);

    // 2. Get System RAM Info
    let mem_output = run_adb_shell(&device, "cat /proc/meminfo");
    let (ram_total, ram_used) = parse_mem_info(&mem_output).unwrap_or((0, 0));

    // 3. Get System CPU Info (Simplified top)
    let top_output = run_adb_shell(&device, "top -n 1 -m 5"); 
    let cpu_usage = parse_cpu_usage(&top_output).unwrap_or(0.0);

    // 4. Get App Stats (if package provided)
    let mut app_stats = None;
    if let Some(pkg) = package {
        if !pkg.is_empty() {
             let app_cpu = parse_app_cpu(&top_output, &pkg).unwrap_or(0.0);
             let app_ram = get_app_ram(&device, &pkg).unwrap_or(0);
             let app_fps = get_app_fps(&device, &pkg).unwrap_or(0);

             app_stats = Some(AppStats {
                 cpu_usage: app_cpu,
                 ram_used: app_ram,
                 fps: app_fps,
             });
        }
    }

    Ok(DeviceStats {
        cpu_usage,
        ram_used,
        ram_total,
        battery_level,
        app_stats,
    })
}

fn run_adb_shell(device: &str, command: &str) -> String {
    #[cfg(target_os = "windows")]
    let program = "adb";
    
    // Split command for arguments
    let args: Vec<&str> = command.split_whitespace().collect();

    let mut full_args = vec!["-s", device, "shell"];
    full_args.extend(args);

    let mut cmd = Command::new(program);
    cmd.args(&full_args);
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000);
    }
    let output = cmd.output();

    match output {
        Ok(o) => String::from_utf8_lossy(&o.stdout).to_string(),
        Err(_) => String::new(),
    }
}

fn parse_battery_level(output: &str) -> Option<u8> {
    // output example:
    // AC powered: false
    // USB powered: true
    // Wireless powered: false
    // Max charging current: 0
    // Max charging voltage: 0
    // Charge counter: 0
    // status: 2
    // health: 2
    // present: true
    // level: 100
    // scale: 100
    
    output.lines()
        .find(|line| line.trim().starts_with("level:"))
        .and_then(|line| {
            let parts: Vec<&str> = line.split(':').collect();
            parts.get(1).and_then(|val| val.trim().parse::<u8>().ok())
        })
}

fn parse_mem_info(output: &str) -> Option<(u64, u64)> {
    // MemTotal:        5850688 kB
    // MemFree:          123456 kB
    // MemAvailable:    2345678 kB
    
    let mut total = 0;
    let mut available = 0;

    for line in output.lines() {
        if line.starts_with("MemTotal:") {
             if let Some(val) = extract_kb(line) { total = val; }
        } else if line.starts_with("MemAvailable:") { // Linux 3.14+
             if let Some(val) = extract_kb(line) { available = val; }
        }
    }
    
    // Fallback if MemAvailable missing (older Android)
    if available == 0 {
         // Naive fallback: MemFree + Buffers + Cached... keep it simple for now
         // Or just return 0
    }

    if total > 0 {
        Some((total, total - available))
    } else {
        None
    }
}

fn extract_kb(line: &str) -> Option<u64> {
    // "MemTotal: 123 kB"
    line.split_whitespace().nth(1)
        .and_then(|s| s.parse::<u64>().ok())
}

fn parse_cpu_usage(output: &str) -> Option<f32> {
    // Format example: "800%cpu  17%user   0%nice 128%sys 648%idle   0%iow   7%irq   0%sirq   0%host"
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
    // Header: PID USER PR NI VIRT RES SHR S[%CPU] %MEM TIME+ ARGS
    // We need to find the index of [%CPU] or %CPU
    
    let mut cpu_idx = 8; // Default to 9th column (index 8) if header missing
    
    for line in top_output.lines() {
        if line.contains("PID") && (line.contains("%CPU") || line.contains("[%CPU]")) {
            let parts: Vec<&str> = line.split_whitespace().collect();
            for (i, part) in parts.iter().enumerate() {
                if part.contains("CPU") { // Match %CPU or [%CPU]
                    cpu_idx = i;
                    break;
                }
            }
            continue;
        }
        
        if line.contains(package) {
            let parts: Vec<&str> = line.split_whitespace().collect();
            // Ensure strictly that we have enough columns
            if parts.len() > cpu_idx {
                 // Clean up any brackets if present (e.g. user logic)
                 // But typically the value is just a number in that column
                 if let Ok(val) = parts[cpu_idx].parse::<f32>() {
                     return Some(val);
                 }
            }
        }
    }
    None
}

fn get_app_ram(device: &str, package: &str) -> Option<u64> {
    // dumpsys meminfo <package>
    // Look for "TOTAL" row or "Total PSS"
    let output = run_adb_shell(device, &format!("dumpsys meminfo {}", package));
    
    // Output format varies but usually has a "TOTAL" line at bottom of "App Summary" or "Total PSS"
    // "TOTAL    123456    ..."
    
    for line in output.lines() {
        let trimmed = line.trim();
        if trimmed.starts_with("TOTAL") || trimmed.starts_with("Total PSS:") {
             // Extract first number
             if let Some(val_str) = trimmed.split_whitespace().nth(1) {
                 if let Ok(val) = val_str.parse::<u64>() {
                     return Some(val); // In KB usually
                 }
             }
        }
    }
    None
}

fn get_app_fps(device: &str, package: &str) -> Option<u32> {
    // Use chained command to get stats and uptime together
    // "dumpsys gfxinfo <pkg> framestats" gives CSV data with frame timings.
    // "cat /proc/uptime" gives system uptime in seconds, which matches CLOCK_MONOTONIC used in gfxinfo.
    let cmd = format!("dumpsys gfxinfo {} framestats; echo UPTIME_MARKER; cat /proc/uptime", package);
    let output = run_adb_shell(device, &cmd);
    
    let mut intended_vsyncs: Vec<u64> = Vec::new();
    let mut uptime_ns: u64 = 0;
    
    let mut parsing_uptime = false;

    for line in output.lines() {
        if line.contains("UPTIME_MARKER") {
            parsing_uptime = true;
            continue;
        }

        if parsing_uptime {
            // Parse uptime: "12345.67 9999.99"
            if let Some(uptime_str) = line.split_whitespace().next() {
                if let Ok(uptime_sec) = uptime_str.parse::<f64>() {
                    // Convert to nanoseconds to match gfxinfo timestamps
                    uptime_ns = (uptime_sec * 1_000_000_000.0) as u64;
                }
            }
            continue;
        }

        // Parse framestats CSV
        // Format: Flags,IntendedVsync,Vsync,...,FrameCompleted
        // We look for lines with enough commas.
        let parts: Vec<&str> = line.split(',').collect();
        if parts.len() >= 14 {
             // Index 1: IntendedVsync
             // Index 13: FrameCompleted
             if let (Ok(vsync), Ok(completed)) = (parts[1].parse::<u64>(), parts[13].parse::<u64>()) {
                 // Check logical validity: completed != 0
                 if completed > 0 { 
                     intended_vsyncs.push(vsync);
                 }
             }
        }
    }
    
    if intended_vsyncs.is_empty() {
        return None; 
    }

    // 1. Check for Idleness
    // If the last frame happened more than 0.5s ago, the app is likely not animating, so FPS is effectively 0.
    // Use a threshold of 500ms (500,000,000 ns).
    let last_vsync = *intended_vsyncs.last().unwrap();
    if uptime_ns > 0 {
        if uptime_ns > last_vsync && (uptime_ns - last_vsync) > 500_000_000 {
            return Some(0);
        }
    }

    // 2. Calculate FPS from the window
    // FPS = (Frame Count - 1) / (Last Frame Time - First Frame Time)
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
    
    // If we have frames but can't ensure duration > 0, fallback
    None
}
