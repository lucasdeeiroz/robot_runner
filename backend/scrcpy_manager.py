import subprocess
import sys
import asyncio
from typing import Optional, Dict

class ScrcpyManager:
    def __init__(self):
        self.processes: Dict[str, subprocess.Popen] = {}

    def start(self, udid: str) -> bool:
        if self.is_running(udid):
            return True

        # Basic scrcpy command
        # We assume scrcpy is in the PATH
        cmd = f'scrcpy -s {udid}'
        
        try:
            creationflags = subprocess.CREATE_NO_WINDOW if sys.platform == "win32" else 0
            process = subprocess.Popen(
                cmd,
                shell=True,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                creationflags=creationflags
            )
            self.processes[udid] = process
            return True
        except Exception as e:
            print(f"Failed to start Scrcpy for {udid}: {e}")
            return False

    def stop(self, udid: str):
        if udid in self.processes:
            process = self.processes[udid]
            process.terminate()
            try:
                process.wait(timeout=2)
            except subprocess.TimeoutExpired:
                process.kill()
            del self.processes[udid]

    def is_running(self, udid: str) -> bool:
        if udid in self.processes:
            if self.processes[udid].poll() is None:
                return True
            else:
                # Clean up if it died
                del self.processes[udid]
        return False
