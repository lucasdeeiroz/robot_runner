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
                return process
            except Exception:
                return None

    def execute(self, udid: str, command: str) -> str:
        """Executes a command on the persistent shell for the given UDID."""
        process = self.get_shell(udid)
        if not process or process.poll() is not None:
            return f"Error: Shell for {udid} is not running."

        return execute_on_persistent_shell(process, command)

    def close(self, udid: str):
        """Closes the persistent shell for a specific UDID."""
        with self.lock:
            if udid in self.shells and self.shells[udid].poll() is None:
                self.shells[udid].terminate()
                del self.shells[udid]

    def close_all(self):
        """Closes all active persistent shells."""
        for udid in list(self.shells.keys()):
            self.close(udid)