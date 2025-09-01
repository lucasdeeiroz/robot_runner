import subprocess
from typing import Optional, Callable
import threading

class ScrcpyManager:
    """Manages the lifecycle of the scrcpy process."""
    def __init__(self, scrcpy_path: str):
        self.scrcpy_path = scrcpy_path
        self.process: Optional[subprocess.Popen] = None

    def start_mirroring(
        self, 
        udid: str, 
        scrcpy_args: str,
        log_callback: Optional[Callable[[str], None]] = None
    ):
        if self.process and self.process.poll() is None:
            if log_callback:
                log_callback("[WARN] A mirroring session is already active.")
            return

        command = f'"{self.scrcpy_path}" -s {udid} {scrcpy_args}'
        
        self.process = subprocess.Popen(
            command, 
            shell=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            encoding='utf-8',
            errors='replace'
        )
        
        if log_callback:
            log_callback(f"[INFO] Started scrcpy for {udid}.")
            
            def reader_thread():
                for line in iter(self.process.stdout.readline, ''):
                    if line and log_callback:
                        log_callback(f"[SCRCPY] {line.strip()}")
                self.process = None # Clear process when done

            threading.Thread(target=reader_thread, daemon=True).start()

    def stop_all_mirroring(self):
        """Stops any active scrcpy process managed by this instance."""
        if self.process and self.process.poll() is None:
            self.process.terminate()
            self.process.wait()
            self.process = None
