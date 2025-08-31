import subprocess
import time
import pygetwindow as gw
from typing import Optional

class ScrcpyManager:
    """Manages the lifecycle and positioning of the scrcpy window."""
    def __init__(self, scrcpy_path: str):
        self.scrcpy_path = scrcpy_path
        self.process: Optional[subprocess.Popen] = None
        self.window_title: Optional[str] = None
        self.udid: Optional[str] = None

    def start_mirroring(self, udid: str):
        if self.process and self.process.poll() is None:
            print("A mirroring session is already active.")
            return

        self.udid = udid
        self.window_title = f"scrcpy_mirror_{udid.replace(':', '_')}"
        
        command = f'{self.scrcpy_path} -s {udid} --window-title="{self.window_title}"'
        self.process = subprocess.Popen(command, shell=True)
        print(f"Started scrcpy for {udid} with title {self.window_title}")

    def stop_mirroring(self):
        if self.process:
            self.process.terminate()
            self.process.wait()
            self.process = None
            self.window_title = None
            print(f"Stopped scrcpy for {self.udid}")

    def position_and_resize_window(self, main_window: gw.Window):
        if not self.window_title:
            return

        try:
            scrcpy_windows = gw.getWindowsWithTitle(self.window_title)
            if not scrcpy_windows:
                # Window might not be ready yet, try again shortly
                time.sleep(0.5)
                scrcpy_windows = gw.getWindowsWithTitle(self.window_title)
            
            if scrcpy_windows:
                scrcpy_win = scrcpy_windows[0]
                new_x = main_window.left + main_window.width
                
                # Ensure the window doesn't go off-screen
                screen_width, screen_height = gw.getScreenSize()
                if new_x + 350 > screen_width: # 350 is an example width
                    new_x = main_window.left - 350

                scrcpy_win.moveTo(new_x, main_window.top)
                
                # Optional: resize to match main window height
                scrcpy_win.resizeTo(scrcpy_win.width, main_window.height)
                scrcpy_win.activate()
                main_window.activate()

        except IndexError:
            # This can happen if the window title is not found yet.
            # It's usually a transient state.
            print(f"Could not find scrcpy window '{self.window_title}' to position.")
        except Exception as e:
            print(f"Error positioning scrcpy window: {e}")