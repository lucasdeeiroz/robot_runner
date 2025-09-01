import subprocess
import re
import os
import signal
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

def get_device_info(udid: str) -> Optional[Device]:
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
            device_info = get_device_info(udid)
            if device_info:
                devices.append(device_info)
    return devices

def install_apk(udid: str, apk_path: str) -> Tuple[bool, str]:
    """Installs an APK on a specific device."""
    return execute_command(f'adb -s {udid} install -r "{apk_path}"')


def uninstall_apk(udid: str, package_name: str) -> Tuple[bool, str]:
    """Uninstalls an APK from a specific device."""
    return execute_command(f'adb -s {udid} uninstall {package_name}')

def clear_apk_data(udid: str, package_name: str) -> Tuple[bool, str]:
    """Clears the data for an application package."""
    return execute_command(f'adb -s {udid} shell pm clear {package_name}')

def take_screenshot(udid: str, local_path: str) -> Tuple[bool, str]:
    """Takes a screenshot on the device and pulls it to a local path."""
    device_path = "/sdcard/screenshot.png"
    success, output = execute_command(f'adb -s {udid} shell screencap -p {device_path}')
    if not success:
        return False, f"Failed to take screenshot on device: {output}"
    
    success, output = execute_command(f'adb -s {udid} pull {device_path} "{local_path}"')
    if not success:
        return False, f"Failed to pull screenshot from device: {output}"
        
    execute_command(f'adb -s {udid} shell rm {device_path}')
    return True, f"Screenshot saved to {local_path}"

def start_screen_recording(udid: str) -> Optional[subprocess.Popen]:
    """Starts a screen recording on the device."""
    try:
        # The command will run in the background. We are just starting it.
        process = subprocess.Popen(f"adb -s {udid} shell screenrecord /sdcard/recording.mp4", shell=True)
        return process
    except Exception as e:
        print(f"Error starting screen recording: {e}")
        return None

def stop_screen_recording(process: subprocess.Popen, udid: str, local_path: str) -> Tuple[bool, str]:
    """Stops the screen recording and pulls the file."""
    try:
        # On Windows, send CTRL_C_EVENT to the process group
        if os.name == 'nt': # Check if OS is Windows
            os.kill(process.pid, signal.CTRL_C_EVENT)
        else: # For POSIX systems
            process.send_signal(signal.SIGINT)
        
        process.wait(timeout=5) # Wait for the process to terminate gracefully
    except subprocess.TimeoutExpired:
        # If the process doesn't terminate after sending SIGINT/CTRL_C_EVENT
        process.kill() # Force kill if it doesn't respond
        process.wait()
        print("Warning: Screen recording process did not terminate gracefully, forced kill.")
    except Exception as e:
        return False, f"Error stopping recording process: {e}"

    device_path = "/sdcard/recording.mp4"
    success, output = execute_command(f'adb -s {udid} pull {device_path} "{local_path}"')
    if not success:
        return False, f"Failed to pull recording from device: {output}"
    
    execute_command(f'adb -s {udid} shell rm {device_path}')
    return True, f"Recording saved to {local_path}"