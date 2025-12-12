import subprocess
import sys
import threading
from typing import Dict, Optional

from .app_utils import execute_on_persistent_shell

# --- Encoding for subprocess output ---
OUTPUT_ENCODING = 'mbcs' if sys.platform == "win32" else 'utf-8'

# --- ADB Shell Manager Class ---
class AdbShellManager:
    """Manages persistent adb shell processes for multiple devices."""
    def __init__(self):
        self.shells: Dict[str, subprocess.Popen] = {}
        self.shell_locks: Dict[str, threading.Lock] = {}
        self.lock = threading.Lock()

    def get_shell(self, udid: str) -> Optional[subprocess.Popen]:
        """Gets an existing shell process or creates a new one for the given UDID."""
        with self.lock:
            if udid in self.shells and self.shells[udid].poll() is None:
                return self.shells[udid]

            try:
                creationflags = subprocess.CREATE_NO_WINDOW if sys.platform == "win32" else 0
                process = subprocess.Popen(
                    f"adb -s {udid} shell",
                    shell=True,
                    stdin=subprocess.PIPE,
                    stdout=subprocess.PIPE,
                    stderr=subprocess.STDOUT,
                    text=True,
                    encoding=OUTPUT_ENCODING,
                    errors='replace',
                    creationflags=creationflags
                )
                self.shells[udid] = process
                if udid not in self.shell_locks:
                     self.shell_locks[udid] = threading.Lock()
                return process
            except Exception:
                return None

    def execute(self, udid: str, command: str) -> str:
        """Executes a command on the persistent shell for the given UDID."""
        process = self.get_shell(udid)
        if not process or process.poll() is not None:
            return f"Error: Shell for {udid} is not running."

        # Acquire the lock for this specific device to prevent interleaved commands
        device_lock = self.shell_locks.get(udid)
        if device_lock:
             with device_lock:
                 return execute_on_persistent_shell(process, command)
        else:
             # Should practically not happen if get_shell works, but fallback safely
             return execute_on_persistent_shell(process, command)

    def close(self, udid: str):
        """Closes the persistent shell for a specific UDID."""
        with self.lock:
            if udid in self.shells:
                if self.shells[udid].poll() is None:
                    self.shells[udid].terminate()
                del self.shells[udid]
            if udid in self.shell_locks:
                del self.shell_locks[udid]

    def close_all(self):
        """Closes all active persistent shells."""
        with self.lock:
            for udid in list(self.shells.keys()):
                if self.shells[udid].poll() is None:
                    self.shells[udid].terminate()
            self.shells.clear()
            self.shell_locks.clear()