import threading
import time
import re
import asyncio
from typing import Dict, Optional, Callable
from src.shell_manager import AdbShellManager

class PerformanceManager:
    def __init__(self):
        self.shell_manager = AdbShellManager()
        self.active_monitors: Dict[str, bool] = {}
        self.threads: Dict[str, threading.Thread] = {}

    def start_monitoring(self, udid: str, app_package: str, callback: Callable[[dict], None]):
        if self.active_monitors.get(udid):
            return

        self.active_monitors[udid] = True
        thread = threading.Thread(
            target=self._monitor_loop,
            args=(udid, app_package, callback),
            daemon=True
        )
        self.threads[udid] = thread
        thread.start()

    def stop_monitoring(self, udid: str):
        if udid in self.active_monitors:
            self.active_monitors[udid] = False
            # Thread will exit on next loop
            if udid in self.threads:
                self.threads[udid].join(timeout=2)
                del self.threads[udid]
            self.shell_manager.close(udid)
            del self.active_monitors[udid]

    def _monitor_loop(self, udid: str, app_package: str, callback: Callable[[dict], None]):
        try:
            # Reset gfxinfo
            self.shell_manager.execute(udid, f"dumpsys gfxinfo {app_package} reset")
            time.sleep(0.2)
            
            start_time = time.time()
            
            while self.active_monitors.get(udid):
                # 1. RAM
                ram_output = self.shell_manager.execute(udid, f"dumpsys meminfo {app_package}")
                ram_mb = "N/A"
                if "TOTAL" in ram_output and (match := re.search(r"TOTAL\s+(\d+)", ram_output)):
                    ram_mb = f"{int(match.group(1)) / 1024:.2f}"

                # 2. CPU
                cpu_output = self.shell_manager.execute(udid, "top -n 1 -b")
                cpu_percent = "0.0"
                if "Error" not in cpu_output and "not found" not in cpu_output:
                    for line in cpu_output.splitlines():
                        if app_package in line:
                            parts = line.strip().split()
                            # Android top output varies, usually around index 8 or 9 for CPU%
                            # We'll try to be robust
                            for part in parts:
                                if "%" in part: # e.g. 12.5%
                                    cpu_percent = part.replace("%", "")
                                    break
                            else:
                                # Fallback to index 8 if no % symbol
                                cpu_percent = parts[8] if len(parts) > 8 else "0.0"
                            break

                # 3. FPS / GPU (Simplified for now, full implementation can be added)
                # For now, let's just send CPU/RAM to get the chart working
                
                data = {
                    "udid": udid,
                    "timestamp": time.time(),
                    "elapsed": time.time() - start_time,
                    "cpu": cpu_percent,
                    "ram": ram_mb
                }
                
                callback(data)
                time.sleep(1)
                
        except Exception as e:
            print(f"Error in performance monitor for {udid}: {e}")
            self.stop_monitoring(udid)
