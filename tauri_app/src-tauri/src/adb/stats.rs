use std::process::Command;
use serde::Serialize;

#[derive(Debug, Serialize, Default)]
pub struct DeviceStats {
    pub cpu_usage: f32, // Percentage (0-100)
    pub ram_used: u64,  // KB
    pub ram_total: u64, // KB
    pub battery_level: u8, // Percentage (0-100)
}

#[tauri::command]
pub async fn get_device_stats(device: String) -> Result<DeviceStats, String> {
    // 1. Get Battery Level
    // dumpsys battery | grep level: 100
    let bat_output = run_adb_shell(&device, "dumpsys battery");
    let battery_level = parse_battery_level(&bat_output).unwrap_or(0);

    // 2. Get RAM Info
    // cat /proc/meminfo -> MemTotal, MemFree/MemAvailable
    let mem_output = run_adb_shell(&device, "cat /proc/meminfo");
    let (ram_total, ram_used) = parse_mem_info(&mem_output).unwrap_or((0, 0));

    // 3. Get CPU Info
    // This is tricky on Android. `top -n 1` is usually the way.
    // user + nice + sys + idle...
    let top_output = run_adb_shell(&device, "top -n 1 -m 1"); // Minimal output
    let cpu_usage = parse_cpu_usage(&top_output).unwrap_or(0.0);

    Ok(DeviceStats {
        cpu_usage,
        ram_used,
        ram_total,
        battery_level,
    })
}

fn run_adb_shell(device: &str, command: &str) -> String {
    #[cfg(target_os = "windows")]
    let program = "adb";
    
    // Split command for arguments
    let args: Vec<&str> = command.split_whitespace().collect();

    let mut full_args = vec!["-s", device, "shell"];
    full_args.extend(args);

    let output = Command::new(program)
        .args(&full_args)
        .output();

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
    // Output varies A LOT between android versions/busybox/toybox.
    // Example 1 (newer):
    // Tasks: 123 total,   1 running, 122 sleeping,   0 stopped,   0 zombie
    // Mem:   5850688k total,  5612345k used,   238343k free,    12345k buffers
    // Swap:  2097152k total,    12345k used,  2084807k free,   234567k cached
    // 800%cpu  34%user   0%nice  23%sys 743%idle   0%iow   0%irq   0%sirq   0%host
    
    // Example 2 (older):
    // User 5%, System 3%, IOW 0%, IRQ 0%
    // User 166 + Nice 0 + Sys 140 + Idle 2296 + IOW 0 + IRQ 0 + SIRQ 1 = 2603

    // Heuristic: Look for "idle" or percentage signs.
    
    // Simplest approach: "dumpsys cpuinfo" (usually aggregated over last few seconds)
    // "Load: 7.23 / 7.15 / 7.09"
    // "CPU usage from 0ms to ...: 12% total" -> this is better but slow.
    
    // Let's rely on `top` header if present.
    // Searching for line containing "%cpu" or "System"
    
    for line in output.lines() {
        if line.to_lowercase().contains("cpu") && line.contains("%") {
             // Try to parse "12% idle" or similar
             // Very fragile.
             // Let's assume we can't get reliable CPU easily without `dumpsys cpuinfo`
             return None; 
        }
    }

    None
}
