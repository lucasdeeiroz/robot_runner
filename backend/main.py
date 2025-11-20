from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from typing import List, Dict, Any
import sys
from pathlib import Path
import asyncio

# Add src to path
sys.path.append(str(Path(__file__).parent.parent))
from src.device_utils import get_connected_devices
from backend.api_models import Device, TestRunRequest
from backend.test_runner import TestRunner
from backend.appium_manager import AppiumManager
from backend.scrcpy_manager import ScrcpyManager
from backend.inspector_manager import InspectorManager
from backend.performance_manager import PerformanceManager
from backend.file_browser import FileBrowser
from backend.adb_wireless import ADBWireless
from backend.screenshot_manager import ScreenshotManager
from backend.adb_command_manager import ADBCommandManager
from backend.settings_manager import SettingsManager
from fastapi.staticfiles import StaticFiles

# Fix for Windows asyncio subprocess error
if sys.platform == 'win32':
    asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())

app = FastAPI(title="Robot Runner API", version="1.0.0")

# Global Managers
appium_manager = AppiumManager()
scrcpy_manager = ScrcpyManager()
# Create static dir for screenshots
static_dir = Path(__file__).parent / "static"
inspector_manager = InspectorManager(static_dir)
performance_manager = PerformanceManager()

# File browser for test/suite selection
base_dir = Path(__file__).parent.parent
suites_dir = base_dir / "suites"
tests_dir = base_dir / "tests"
file_browser = FileBrowser(suites_dir, tests_dir)

# ADB Wireless manager
adb_wireless = ADBWireless()

# Screenshot and recording manager
screenshots_dir = base_dir / "screenshots"
recordings_dir = base_dir / "recordings"
screenshot_manager = ScreenshotManager(screenshots_dir, recordings_dir)

# ADB Command manager
settings_file = CONFIG_DIR / "settings.json" if 'CONFIG_DIR' in dir() else base_dir / "config" / "settings.json"
adb_command_manager = ADBCommandManager(settings_file)

# Settings manager (use same settings file)
settings_manager = SettingsManager(settings_file)

# Mount static files
app.mount("/static", StaticFiles(directory=str(static_dir)), name="static")
app.mount("/screenshots", StaticFiles(directory=str(screenshots_dir)), name="screenshots")
app.mount("/recordings", StaticFiles(directory=str(recordings_dir)), name="recordings")

# Enable CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Store active test runners
active_runners: Dict[str, TestRunner] = {}

@app.get("/")
async def root():
    return {"message": "Robot Runner API is running"}

@app.get("/devices", response_model=List[Device])
async def list_devices():
    devices_data = get_connected_devices()
    # Convert to Pydantic models
    return [Device(**d) for d in devices_data]

@app.websocket("/ws/run")
async def websocket_run(websocket: WebSocket):
    await websocket.accept()
    runner = TestRunner()
    
    try:
        # Wait for start command
        data = await websocket.receive_json()
        request = TestRunRequest(**data)
        
        # For now, handle single device run
        if not request.devices:
            await websocket.send_text("Error: No devices selected")
            return

        udid = request.devices[0].split(" | ")[-1].split(" ")[0] # Extract UDID from string if needed, or expect clean UDID
        # The frontend might send full string "Android 11 | Model | UDID", let's clean it up
        if "|" in request.devices[0]:
             udid = request.devices[0].split("|")[-1].strip().split(" ")[0]
        else:
             udid = request.devices[0]

        async for line in runner.run_test(request.test_path, udid, request.mode):
            await websocket.send_text(line)
            
    except WebSocketDisconnect:
        await runner.stop_test()
    except Exception as e:
        await websocket.send_text(f"Error: {str(e)}")
    finally:
        await runner.stop_test()
        await websocket.close()

@app.post("/appium/start")
async def start_appium():
    if appium_manager.start():
        return {"status": "started"}
    return {"status": "failed"}

@app.post("/appium/stop")
async def stop_appium():
    appium_manager.stop()
    return {"status": "stopped"}

@app.get("/appium/status")
async def get_appium_status():
    return {"running": appium_manager.is_running()}

@app.post("/scrcpy/start")
async def start_scrcpy(request: Device):
    # Extract UDID from request
    udid = request.udid
    if scrcpy_manager.start(udid):
        return {"status": "started", "udid": udid}
    return {"status": "failed", "udid": udid}

@app.post("/scrcpy/stop")
async def stop_scrcpy(request: Device):
    udid = request.udid
    scrcpy_manager.stop(udid)
    return {"status": "stopped", "udid": udid}

@app.get("/scrcpy/status/{udid}")
async def get_scrcpy_status(udid: str):
    return {"running": scrcpy_manager.is_running(udid)}

@app.post("/inspector/capture")
async def capture_inspector(request: Device):
    return inspector_manager.capture(request.udid)

@app.websocket("/ws/performance/{udid}")
async def websocket_performance(websocket: WebSocket, udid: str, package: str):
    await websocket.accept()
    
    async def send_data(data: dict):
        try:
            await websocket.send_json(data)
        except Exception:
            pass # Connection likely closed

    # Bridge the sync callback to async websocket send
    # We need a thread-safe way to schedule the async send
    loop = asyncio.get_running_loop()
    
    def callback(data):
        asyncio.run_coroutine_threadsafe(send_data(data), loop)

    try:
        performance_manager.start_monitoring(udid, package, callback)
        # Keep connection open
        while True:
            await websocket.receive_text() # Wait for messages (or close)
    except Exception:
        pass
    finally:
        performance_manager.stop_monitoring(udid)

@app.get("/files/browse")
async def browse_files(path: str = "", mode: str = "suite"):
    """Browse test suites or robot files."""
    return file_browser.list_directory(path, mode)

@app.get("/files/resolve")
async def resolve_file_path(path: str, mode: str = "suite"):
    """Get absolute path for a relative file path."""
    abs_path = file_browser.get_absolute_path(path, mode)
    if abs_path:
        return {"absolute_path": str(abs_path)}
    return {"error": "Invalid path"}

@app.post("/adb/pair")
async def pair_device(ip: str, port: str, code: str):
    """Pair with a device over wireless ADB."""
    success, message = adb_wireless.pair(ip, port, code)
    return {"success": success, "message": message}

@app.post("/adb/connect")
async def connect_device(ip: str, port: str = "5555"):
    """Connect to a device over wireless ADB."""
    success, message = adb_wireless.connect(ip, port)
    return {"success": success, "message": message}

@app.post("/adb/disconnect")
async def disconnect_device(ip_port: str):
    """Disconnect from a wireless ADB device."""
    success, message = adb_wireless.disconnect(ip_port)
    return {"success": success, "message": message}

@app.post("/screenshot/{udid}")
async def take_screenshot(udid: str):
    """Capture a screenshot from the device."""
    success, message, filename = screenshot_manager.take_screenshot(udid)
    if success:
        return {"success": True, "message": message, "filename": filename, "url": f"/screenshots/{filename}"}
    return {"success": False, "message": message}

@app.post("/recording/start/{udid}")
async def start_recording(udid: str, max_duration: int = 180):
    """Start screen recording on the device."""
    success, message = screenshot_manager.start_recording(udid, max_duration)
    return {"success": success, "message": message}

@app.post("/recording/stop/{udid}")
async def stop_recording(udid: str):
    """Stop screen recording and retrieve the file."""
    success, message, filename = screenshot_manager.stop_recording(udid)
    if success:
        return {"success": True, "message": message, "filename": filename, "url": f"/recordings/{filename}"}
    return {"success": False, "message": message}

@app.post("/appium/start")
async def start_appium():
    if appium_manager.start():
        return {"status": "started"}
    return {"status": "failed"}

@app.post("/appium/stop")
async def stop_appium():
    appium_manager.stop()
    return {"status": "stopped"}

@app.get("/appium/status")
async def get_appium_status():
    return {"running": appium_manager.is_running()}

@app.post("/scrcpy/start")
async def start_scrcpy(request: Device):
    # Extract UDID from request
    udid = request.udid
    if scrcpy_manager.start(udid):
        return {"status": "started", "udid": udid}
    return {"status": "failed", "udid": udid}

@app.post("/scrcpy/stop")
async def stop_scrcpy(request: Device):
    udid = request.udid
    scrcpy_manager.stop(udid)
    return {"status": "stopped", "udid": udid}

@app.get("/scrcpy/status/{udid}")
async def get_scrcpy_status(udid: str):
    return {"running": scrcpy_manager.is_running(udid)}

@app.post("/inspector/capture")
async def capture_inspector(request: Device):
    return inspector_manager.capture(request.udid)

@app.websocket("/ws/performance/{udid}")
async def websocket_performance(websocket: WebSocket, udid: str, package: str):
    await websocket.accept()
    
    async def send_data(data: dict):
        try:
            await websocket.send_json(data)
        except Exception:
            pass # Connection likely closed

    # Bridge the sync callback to async websocket send
    # We need a thread-safe way to schedule the async send
    loop = asyncio.get_running_loop()
    
    def callback(data):
        asyncio.run_coroutine_threadsafe(send_data(data), loop)

    try:
        performance_manager.start_monitoring(udid, package, callback)
        # Keep connection open
        while True:
            await websocket.receive_text() # Wait for messages (or close)
    except Exception:
        pass
    finally:
        performance_manager.stop_monitoring(udid)

@app.get("/files/browse")
async def browse_files(path: str = "", mode: str = "suite"):
    """Browse test suites or robot files."""
    return file_browser.list_directory(path, mode)

@app.get("/files/resolve")
async def resolve_file_path(path: str, mode: str = "suite"):
    """Get absolute path for a relative file path."""
    abs_path = file_browser.get_absolute_path(path, mode)
    if abs_path:
        return {"absolute_path": str(abs_path)}
    return {"error": "Invalid path"}

@app.post("/adb/pair")
async def pair_device(ip: str, port: str, code: str):
    """Pair with a device over wireless ADB."""
    success, message = adb_wireless.pair(ip, port, code)
    return {"success": success, "message": message}

@app.post("/adb/connect")
async def connect_device(ip: str, port: str = "5555"):
    """Connect to a device over wireless ADB."""
    success, message = adb_wireless.connect(ip, port)
    return {"success": success, "message": message}

@app.post("/adb/disconnect")
async def disconnect_device(ip_port: str):
    """Disconnect from a wireless ADB device."""
    success, message = adb_wireless.disconnect(ip_port)
    return {"success": success, "message": message}

@app.post("/screenshot/{udid}")
async def take_screenshot(udid: str):
    """Capture a screenshot from the device."""
    success, message, filename = screenshot_manager.take_screenshot(udid)
    if success:
        return {"success": True, "message": message, "filename": filename, "url": f"/screenshots/{filename}"}
    return {"success": False, "message": message}

@app.post("/recording/start/{udid}")
async def start_recording(udid: str, max_duration: int = 180):
    """Start screen recording on the device."""
    success, message = screenshot_manager.start_recording(udid, max_duration)
    return {"success": success, "message": message}

@app.post("/recording/stop/{udid}")
async def stop_recording(udid: str):
    """Stop screen recording and retrieve the file."""
    success, message, filename = screenshot_manager.stop_recording(udid)
    if success:
        return {"success": True, "message": message, "filename": filename, "url": f"/recordings/{filename}"}
    return {"success": False, "message": message}

@app.get("/recording/status/{udid}")
async def recording_status(udid: str):
    """Check if device is currently recording."""
    return {"recording": screenshot_manager.is_recording(udid)}

@app.post("/adb/execute")
async def execute_adb_command(udid: str, command: str):
    """Execute a custom ADB command."""
    success, output = adb_command_manager.execute(udid, command)
    return {"success": success, "output": output}

@app.get("/adb/commands/common")
async def get_common_commands():
    """Get list of saved common commands."""
    commands = adb_command_manager.get_common_commands()
    return {"commands": commands}

@app.post("/adb/commands/save")
async def save_common_command(command: str):
    """Save a command to favorites."""
    success, message = adb_command_manager.save_common_command(command)
    return {"success": success, "message": message}

@app.post("/adb/commands/remove")
async def remove_common_command(command: str):
    """Remove a command from favorites."""
    success, message = adb_command_manager.remove_common_command(command)
    return {"success": success, "message": message}

@app.get("/settings")
async def get_settings():
    """Get all application settings."""
    return settings_manager.get_settings()

@app.post("/settings")
async def update_settings(settings: Dict[str, Any]):
    """Update application settings."""
    success, message = settings_manager.update_settings(settings)
    return {"success": success, "message": message}

@app.post("/settings/reset")
async def reset_settings():
    """Reset settings to defaults."""
    success, message = settings_manager.reset_settings()
    return {"success": success, "message": message}
