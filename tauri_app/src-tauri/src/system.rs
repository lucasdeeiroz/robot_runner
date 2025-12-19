use tauri::command;
use std::process::Command;
use serde::Serialize;
use serde_json::Value;
use std::os::windows::process::CommandExt;
use regex::Regex;

// CREATE_NO_WINDOW constant for Windows
const CREATE_NO_WINDOW: u32 = 0x08000000;

#[derive(Debug, Serialize)]
pub struct SystemVersions {
    pub adb: String,
    pub appium: String,
    pub uiautomator2: String,
    pub scrcpy: String,
    pub robot: String,
    pub python: String,
    pub node: String,
}

#[command]
pub fn get_system_versions() -> SystemVersions {
    let adb_raw = get_version("adb", &["--version"]);
    let adb = extract_version(&adb_raw, r"Android Debug Bridge version ([\d\.]+)");

    let node = get_version("node", &["--version"]); // Usually just vX.X.X
    
    let python_raw = get_version("python", &["--version"]);
    let python = extract_version(&python_raw, r"Python ([\d\.]+)");

    let scrcpy_raw = get_version("scrcpy", &["--version"]);
    let scrcpy = extract_version(&scrcpy_raw, r"scrcpy ([\d\.]+)");
    
    // Check Appium and determine command
    let (appium_raw, appium_cmd) = if let Some(v) = try_get_version("appium", &["--version"]) {
        (v, "appium")
    } else if let Some(v) = try_get_version("appium.cmd", &["--version"]) {
        (v, "appium.cmd")
    } else {
        ("Not Found".to_string(), "appium")
    };
    let appium = appium_raw; // usually just X.X.X

    // Check Robot - Output often exits with 1, so use loose check
    let robot_raw = if let Some(v) = try_get_version_loose("robot", &["--version"]) {
        v
    } else if let Some(v) = try_get_version_loose("python", &["-m", "robot", "--version"]) {
        v
    } else {
        "Not Found".to_string()
    };
    let robot = extract_version(&robot_raw, r"Robot Framework ([\d\.]+)");

    // Check UiAutomator2 using the found Appium command
    let uiautomator2 = if appium != "Not Found" {
        check_uiautomator2(appium_cmd)
    } else {
        "Not Found".to_string()
    };

    SystemVersions {
        adb,
        appium,
        uiautomator2,
        scrcpy,
        robot,
        python,
        node,
    }
}

fn extract_version(input: &str, pattern: &str) -> String {
    if input == "Not Found" {
        return input.to_string();
    }
    if let Ok(re) = Regex::new(pattern) {
        if let Some(caps) = re.captures(input) {
            if let Some(m) = caps.get(1) {
                return m.as_str().to_string();
            }
        }
    }
    input.to_string()
}

// Helper to return Option<String> for cleaner logic
fn try_get_version(cmd: &str, args: &[&str]) -> Option<String> {
    let res = get_version_internal(cmd, args, true); // strict
    if res == "Not Found" { None } else { Some(res) }
}

fn try_get_version_loose(cmd: &str, args: &[&str]) -> Option<String> {
    let res = get_version_internal(cmd, args, false); // loose (ignore exit code)
    if res == "Not Found" { None } else { Some(res) }
}

fn get_version(cmd: &str, args: &[&str]) -> String {
    get_version_internal(cmd, args, true)
}

fn get_version_internal(cmd: &str, args: &[&str], strict: bool) -> String {
    // Try executing directly
    let mut command = Command::new(cmd);
    command.args(args);
    
    #[cfg(target_os = "windows")]
    command.creation_flags(CREATE_NO_WINDOW);

    match command.output() {
        Ok(output) => {
            if !strict || output.status.success() {
                // Combine stdout and stderr because some tools print version to stderr
                let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
                if !stdout.is_empty() {
                    return stdout.lines().next().unwrap_or("Unknown").trim().to_string();
                }
                
                let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
                 if !stderr.is_empty() {
                    return stderr.lines().next().unwrap_or("Unknown").trim().to_string();
                }
            }
        },
        Err(_) => {
             // Fallback to shell execution on Windows for .cmd/.bat resolution
             #[cfg(target_os = "windows")]
             {
                let mut shell_cmd = Command::new("cmd");
                shell_cmd.creation_flags(CREATE_NO_WINDOW);
                shell_cmd.args(&["/C", cmd]);
                shell_cmd.args(args);
                 if let Ok(output) = shell_cmd.output() {
                     if !strict || output.status.success() {
                         let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
                         if !stdout.is_empty() {
                             return stdout.lines().next().unwrap_or("Unknown").trim().to_string();
                         }
                         let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
                         if !stderr.is_empty() {
                             return stderr.lines().next().unwrap_or("Unknown").trim().to_string();
                         }
                     }
                 }
             }
        }
    }
    "Not Found".to_string()
}

fn check_uiautomator2(appium_cmd: &str) -> String {
    // try --json first for better parsing
    let mut command = Command::new(appium_cmd);
    command.args(&["driver", "list", "--installed", "--json"]);
    
    #[cfg(target_os = "windows")]
    command.creation_flags(CREATE_NO_WINDOW);

    // If direct fails, try shell wrapper logic again
    let output_res = command.output().or_else(|_| {
         #[cfg(target_os = "windows")]
         {
            let mut shell_cmd = Command::new("cmd");
            shell_cmd.creation_flags(CREATE_NO_WINDOW);
            shell_cmd.args(&["/C", appium_cmd, "driver", "list", "--installed", "--json"]);
            shell_cmd.output()
         }
         #[cfg(not(target_os = "windows"))]
         Err(std::io::Error::new(std::io::ErrorKind::NotFound, "not found"))
    });

    if let Ok(output) = output_res {
        if output.status.success() {
            let stdout = String::from_utf8_lossy(&output.stdout);
            
            // Parse JSON
            if let Ok(json) = serde_json::from_str::<Value>(&stdout) {
                // Determine structure: 
                // Appium 2.x often returns: {"uiautomator2": {"version": "x.x.x", ...}}
                if let Some(uia2) = json.get("uiautomator2") {
                    if let Some(ver) = uia2.get("version") {
                         return ver.as_str().unwrap_or("Installed").to_string();
                    }
                    return "Installed".to_string();
                }
            } else {
                 // Text mode fallback
                 if stdout.contains("uiautomator2") {
                     if let Some(line) = stdout.lines().find(|l| l.contains("uiautomator2")) {
                        return line.trim().to_string();
                    }
                    return "Installed".to_string();
                 }
            }
        }
    }
    
    "Not Found".to_string()
}
