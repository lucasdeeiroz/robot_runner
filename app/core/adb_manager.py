import subprocess
import re
from typing import List, Optional, Tuple
from app.models.device import Device

def execute_command(command: str) -> Tuple[bool, str]:
    """Executes a shell command and returns its success status and output."""
    try:
        process = subprocess.run(
            command,
            shell=True,
            check=True,
            capture_output=True,
            text=True,
            encoding='utf-8',
            errors='replace'
        )
        return True, process.stdout.strip()
    except subprocess.CalledProcessError as e:
        return False, e.stdout.strip() + "\n" + e.stderr.strip()
    except FileNotFoundError:
        return False, f"Error: Command '{command.split()[0]}' not found. Is it in your PATH?"
    except Exception as e:
        return False, f"An unexpected error occurred: {e}"

def get_connected_devices() -> List[Device]:
    """Returns a list of connected and authorized devices."""
    success, output = execute_command("adb devices -l")
    if not success:
        return []

    devices = []
    lines = output.strip().split('\n')[1:]
    for line in lines:
        if "device" in line and "unauthorized" not in line:
            udid = line.split()[0]
            device_info = _get_device_properties(udid)
            if device_info:
                devices.append(device_info)
    return devices

def _get_device_properties(udid: str) -> Optional[Device]:
    """Gets properties for a given device UDID."""
    try:
        _, model = execute_command(f"adb -s {udid} shell getprop ro.product.model")
        _, release = execute_command(f"adb -s {udid} shell getprop ro.build.version.release")
        _, battery_level = execute_command(f"adb -s {udid} shell dumpsys battery | grep level")
        battery = re.search(r'\d+', battery_level)
        
        return Device(
            udid=udid,
            model=model or "Unknown",
            release=release or "Unknown",
            battery=f"{battery.group(0)}%" if battery else "N/A"
        )
    except Exception:
        return None

def install_apk(udid: str, apk_path: str) -> Tuple[bool, str]:
    """Installs an APK on a specific device."""
    return execute_command(f'adb -s {udid} install -r "{apk_path}"')

def uninstall_apk(udid: str, package_name: str) -> Tuple[bool, str]:
    """Uninstalls an APK from a specific device."""
    return execute_command(f'adb -s {udid} uninstall {package_name}')

def clear_apk_data(udid: str, package_name: str) -> Tuple[bool, str]:
    """Clears the data for an application package."""
    return execute_command(f'adb -s {udid} shell pm clear {package_name}')