import json
import re
import shutil
import urllib.request
import zipfile
from pathlib import Path
from tkinter import messagebox
from typing import Dict, List, Optional, Set, Tuple

from src.locales.i18n import gettext as translate
from .app_utils import BASE_DIR, execute_command


# --- Cache for device properties ---
_DEVICE_PROPERTIES_CACHE: Dict[str, Dict[str, str]] = {}

def get_connected_devices(appium_command: Optional[str] = None, check_busy_devices: bool = False, local_busy_devices: Optional[Set[str]] = None) -> List[Dict[str, str]]:
    """Returns a list of dictionaries, each representing a connected device."""
    busy_udids = set()
    if check_busy_devices:
        busy_udids = _get_busy_udids(appium_command)
    
    if local_busy_devices:
        busy_udids.update(local_busy_devices)

    success, output = execute_command("adb devices -l")
    if not success:
        return []
    
    devices = []
    lines = output.strip().splitlines()[1:]
    
    # Identify currently connected UDIDs to clean up cache
    connected_udids = set()

    for line in lines:
        if "device" in line and "unauthorized" not in line:
            parts = line.split()
            udid = parts[0]
            connected_udids.add(udid)
            
            properties = get_device_properties(udid)
            if properties:
                properties['status'] = "Busy" if udid in busy_udids else "Available"
                devices.append(properties)
    
    # Clean up cache for disconnected devices
    for cached_udid in list(_DEVICE_PROPERTIES_CACHE.keys()):
        if cached_udid not in connected_udids:
            del _DEVICE_PROPERTIES_CACHE[cached_udid]

    return devices

def get_device_properties(udid: str) -> Optional[Dict[str, str]]:
    """Gets model and Android version for a given device UDID, using cache if available."""
    if udid in _DEVICE_PROPERTIES_CACHE:
        return _DEVICE_PROPERTIES_CACHE[udid].copy()

    try:
        # Optimized: Get both properties in a single shell command
        cmd = f"adb -s {udid} shell \"getprop ro.product.model; echo '|'; getprop ro.build.version.release\""
        success, output = execute_command(cmd)
        
        if success:
            parts = output.split('|')
            if len(parts) == 2:
                model = parts[0].strip()
                release = parts[1].strip()
                
                props = {"udid": udid, "model": model, "release": release}
                _DEVICE_PROPERTIES_CACHE[udid] = props
                return props
        return None
    except Exception:
        return None

def get_device_ip(udid: str) -> Optional[str]:
    """Gets the wlan0 IP address for a given device UDID."""
    command = f"adb -s {udid} shell ip -f inet addr show wlan0"
    success, output = execute_command(command)
    if success:
        match = re.search(r'inet (\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})/', output)
        if match:
            return match.group(1)
    return None

def get_device_aspect_ratio(udid: str) -> Optional[float]:
    """Gets the device's physical screen aspect ratio using 'wm size'."""
    success, output = execute_command(f"adb -s {udid} shell wm size")
    if success:
        match = re.search(r'Physical size:\s*(\d+)x(\d+)', output)
        if match:
            width, height = int(match.group(1)), int(match.group(2))
            if height > 0:
                return width / height
    return None

def find_scrcpy() -> Optional[Path]:
    """Tries to find scrcpy.exe in common locations or PATH."""
    local_scrcpy = BASE_DIR / "scrcpy" / "scrcpy.exe"
    if local_scrcpy.exists():
        return local_scrcpy
    
    if shutil.which("scrcpy"):
        return Path("scrcpy")
        
    return None

def _prompt_download_scrcpy(app_instance):
    """Asks the user if they want to download scrcpy."""
    if messagebox.askyesno(translate("scrcpy_not_found_title"), translate("scrcpy_not_found_message")):
        app_instance.status_var.set(translate("downloading_scrcpy"))
        _download_and_extract_scrcpy(app_instance)

def _download_and_extract_scrcpy(app_instance):
    """Downloads and extracts the latest scrcpy release for Windows."""
    try:
        api_url = "https://api.github.com/repos/Genymobile/scrcpy/releases/latest"
        with urllib.request.urlopen(api_url) as response:
            release_data = json.loads(response.read().decode())
        
        asset = next((a for a in release_data['assets'] if 'win64' in a['name'] and a['name'].endswith('.zip')), None)
        if not asset:
            app_instance.root.after(0, messagebox.showerror, translate("download_error_title"), translate("download_error_no_release"))
            return

        download_url = asset['browser_download_url']
        zip_path = BASE_DIR / "scrcpy.zip"
        
        urllib.request.urlretrieve(download_url, zip_path)
        
        scrcpy_dir = BASE_DIR / "scrcpy"
        scrcpy_dir.mkdir(exist_ok=True)
        
        with zipfile.ZipFile(zip_path, 'r') as zip_ref:
            temp_extract_dir = BASE_DIR / "scrcpy_temp"
            zip_ref.extractall(temp_extract_dir)
            
            extracted_folder = next(temp_extract_dir.iterdir())
            for item in extracted_folder.iterdir():
                shutil.move(str(item), str(scrcpy_dir / item.name))
            shutil.rmtree(temp_extract_dir)

        zip_path.unlink()
        
        new_scrcpy_path = scrcpy_dir / "scrcpy.exe"
        app_instance.scrcpy_path_var.set(str(new_scrcpy_path))
        app_instance.root.after(0, messagebox.showinfo, translate("success_title"), translate("scrcpy_download_success", path=scrcpy_dir))

    except Exception as e:
        app_instance.root.after(0, messagebox.showerror, translate("download_failed_title"), translate("scrcpy_download_error", error=e))
    finally:
        app_instance.root.after(0, app_instance.status_var.set, translate("ready"))

def _parse_appium_command(appium_command: Optional[str]) -> Tuple[str, int, str]:
    """Parses the Appium command string to extract host, port, and base path."""
    host, port, base_path = "127.0.0.1", 4723, ""
    if appium_command:
        parts = appium_command.split()
        for i, part in enumerate(parts):
            if part == "--address" and i + 1 < len(parts): host = parts[i+1]
            elif part.startswith("--address="): host = part.split("=", 1)[1]
            elif part == "--port" and i + 1 < len(parts): port = int(parts[i+1])
            elif part.startswith("--port="): port = int(part.split("=", 1)[1])
            elif part == "--base-path" and i + 1 < len(parts): base_path = parts[i+1]
            elif part.startswith("--base-path="): base_path = part.split("=", 1)[1]
    if base_path and not base_path.startswith('/'): base_path = '/' + base_path
    return host, int(port), base_path

def _get_busy_udids(appium_command: Optional[str]) -> Set[str]:
    """Checks Appium server for active sessions and returns a set of UDIDs for devices in use."""
    host, port, base_path = _parse_appium_command(appium_command)
    urls_to_try = [f"http://{host}:{port}{p}" for p in [f"{base_path}/sessions", "/wd/hub/sessions"] if p]
    for endpoint in urls_to_try:
        try:
            with urllib.request.urlopen(endpoint, timeout=2) as response:
                if response.status == 200:
                    data = json.loads(response.read().decode())
                    sessions = data.get('value', [])
                    busy_udids = set()
                    for session in sessions:
                        caps = session.get('capabilities', {})
                        udid = caps.get('udid') or caps.get('appium:udid')
                        if udid: busy_udids.add(udid)
                    return busy_udids
        except Exception: continue
    return set()