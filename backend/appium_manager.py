import subprocess
import sys
import asyncio
from typing import Optional

class AppiumManager:
    def __init__(self):
        self.process: Optional[subprocess.Popen] = None

    def start(self, port: int = 4723) -> bool:
        if self.is_running():
            return True

        cmd = f'appium --port {port} --base-path=/wd/hub --relaxed-security'
        
        try:
            creationflags = subprocess.CREATE_NO_WINDOW if sys.platform == "win32" else 0
            self.process = subprocess.Popen(
                cmd,
                shell=True,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                creationflags=creationflags
            )
            return True
        except Exception as e:
            print(f"Failed to start Appium: {e}")
            return False

    def stop(self):
        if self.process:
            self.process.terminate()
            try:
                self.process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                self.process.kill()
            self.process = None

    def is_running(self) -> bool:
        if self.process:
            return self.process.poll() is None
        return False
