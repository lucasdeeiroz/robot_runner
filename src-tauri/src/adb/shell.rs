use std::process::{Command, Child, Stdio};
use std::sync::Mutex;
use std::collections::HashMap;
use std::io::{BufRead, BufReader};
use tauri::{command, AppHandle, Emitter, State};
use std::thread;

pub struct ShellState {
    pub running_commands: Mutex<HashMap<String, Child>>,
}

impl Default for ShellState {
    fn default() -> Self {
        Self {
            running_commands: Mutex::new(HashMap::new()),
        }
    }
}



#[command]
pub fn get_adb_version() -> Result<String, String> {
    let output = Command::new("adb")
        .arg("version")
        .output()
        .map_err(|e| format!("Failed to execute adb: {}", e))?;

    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).to_string())
    } else {
        Err(String::from_utf8_lossy(&output.stderr).to_string())
    }
}

#[command]
pub fn run_adb_command(device: String, args: Vec<String>) -> Result<String, String> {
    let mut cmd = Command::new("adb");
    cmd.arg("-s").arg(&device).args(&args);

    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
    }

    let output = cmd.output()
        .map_err(|e| format!("Failed to execute adb: {}", e))?;

    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
    } else {
        Err(String::from_utf8_lossy(&output.stderr).trim().to_string())
    }
}

#[command]
pub fn start_adb_command(
    app: AppHandle, 
    state: State<'_, ShellState>, 
    id: String, 
    device: String, 
    command: String
) -> Result<(), String> {
    // Split command string into args
    let args: Vec<&str> = command.split_whitespace().collect();
    
    let mut cmd = Command::new("adb");
    cmd.arg("-s").arg(&device).args(&args);
    
    // We need pipes for output
    cmd.stdout(Stdio::piped());
    cmd.stderr(Stdio::piped());

    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000); 
    }

    let mut child = cmd.spawn().map_err(|e| e.to_string())?;
    
    let stdout = child.stdout.take().ok_or("Failed to open stdout")?;
    // let stderr = child.stderr.take().ok_or("Failed to open stderr")?;
    
    let id_clone = id.clone();
    let app_clone = app.clone();
    
    // stdout thread
    thread::spawn(move || {
        let reader = BufReader::new(stdout);
        for line in reader.lines() {
            if let Ok(l) = line {
                 let _ = app_clone.emit(&format!("cmd-output-{}", id_clone), l);
            }
        }
        let _ = app_clone.emit(&format!("cmd-close-{}", id_clone), "Process finished");
    });

    state.running_commands.lock().unwrap().insert(id, child);
    Ok(())
}

#[command]
pub fn stop_adb_command(state: State<'_, ShellState>, id: String) -> Result<(), String> {
    let mut commands = state.running_commands.lock().unwrap();
    if let Some(mut child) = commands.remove(&id) {
        child.kill().map_err(|e| e.to_string())?;
        Ok(())
    } else {
        Err("Command not found".to_string())
    }
}

#[command]
pub fn restart_adb_server() -> Result<String, String> {
    use std::os::windows::process::CommandExt;
    
    // Kill
    let mut kill_cmd = Command::new("adb");
    kill_cmd.arg("kill-server");
    #[cfg(target_os = "windows")]
    kill_cmd.creation_flags(0x08000000);
    
    let kill_output = kill_cmd.output()
        .map_err(|e| format!("Failed to kill server: {}", e))?;

    // Start
    let mut start_cmd = Command::new("adb");
    start_cmd.arg("start-server");
    #[cfg(target_os = "windows")]
    start_cmd.creation_flags(0x08000000);

    let start_output = start_cmd.output()
        .map_err(|e| format!("Failed to start server: {}", e))?;

    Ok(format!("Server Restarted.\nKill: {}\nStart: {}", 
        String::from_utf8_lossy(&kill_output.stdout),
        String::from_utf8_lossy(&start_output.stdout)))
}

#[command]
pub fn is_adb_server_running() -> bool {
    #[cfg(target_os = "windows")]
    {
        let output = Command::new("tasklist")
            .args(&["/FI", "IMAGENAME eq adb.exe", "/NH"])
            .output();
            
        if let Ok(o) = output {
             let s = String::from_utf8_lossy(&o.stdout);
             return s.contains("adb.exe");
        }
    }
    
    #[cfg(not(target_os = "windows"))]
    {
         let output = Command::new("pgrep").arg("adb").output();
         if let Ok(o) = output {
             return o.status.success();
         }
    }

    false 
}

#[command]
pub fn kill_adb_server() -> Result<String, String> {
    let mut cmd = Command::new("adb");
    cmd.arg("kill-server");
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000);
    }
    
    let output = cmd.output().map_err(|e| e.to_string())?;
    Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
}

#[command]
pub fn start_adb_server() -> Result<String, String> {
    let mut cmd = Command::new("adb");
    cmd.arg("start-server");
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000);
    }
    
    let output = cmd.output().map_err(|e| e.to_string())?;
    Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
}
