import tkinter as tk
from tkinter import messagebox, simpledialog
import ttkbootstrap as ttk
from ttkbootstrap.scrolled import ScrolledText
from ttkbootstrap.constants import *
from ttkbootstrap.tooltip import ToolTip
import subprocess
import sys
import json
import urllib.request
import zipfile
import threading
from typing import List, Tuple, Dict, Optional
from pathlib import Path
import time
import datetime
from queue import Queue, Empty
import ctypes
import os
import signal
import re
import xml.etree.ElementTree as ET

# --- Conditional import for pywin32 ---
if sys.platform == "win32":
    try:
        import win32gui
        import win32con
    except ImportError:
        messagebox.showerror(
            "Dependency Missing",
            "The 'pywin32' library is required for scrcpy embedding on Windows.\n"
            "Please install it by running: pip install pywin32"
        )
        sys.exit(1)


# --- Constants ---
if getattr(sys, 'frozen', False):
    BASE_DIR = Path(sys.executable).parent
else:
    BASE_DIR = Path(__file__).resolve().parent

CONFIG_DIR = BASE_DIR / "config"
SETTINGS_FILE = CONFIG_DIR / "settings.json"


# --- Console Redirector Class ---
class ConsoleRedirector:
    """A class to redirect stdout/stderr to a tkinter text widget."""
    def __init__(self, text_widget: ScrolledText):
        self.text_widget = text_widget
        self.text_widget.text.config(state=NORMAL)

    def write(self, text: str):
        """Writes text to the widget and scrolls to the end."""
        self.text_widget.insert(END, text)
        self.text_widget.see(END)

    def flush(self):
        """Flush method is required for stream-like objects."""
        pass

# --- Run Command Window Class (Unified) ---
class RunCommandWindow(tk.Toplevel):
    """
    A unified Toplevel window for running tests and mirroring devices.
    Features a three-pane layout: Outputs, Controls, and Screen Mirror.
    """
    def __init__(self, parent, udid: str, mode: str, run_path: Optional[str] = None, title: Optional[str] = None, run_mode: Optional[str] = None):
        super().__init__(parent.root)
        self.parent_app = parent
        self.udid = udid
        self.mode = mode  # 'test' or 'mirror'
        self.run_path = run_path
        self.run_mode = run_mode

        # --- State Attributes ---
        self._is_closing = False
        self.is_mirroring = False

        # --- Robot Test Attributes ---
        self.robot_process = None
        self.robot_output_queue = Queue()
        self.robot_output_is_visible = (self.mode == 'test')
        self.cur_log_dir = None

        # --- Scrcpy Attributes ---
        self.command_template = self.parent_app.scrcpy_path_var.get() + " -s {udid}"
        self.scrcpy_process = None
        self.scrcpy_hwnd = None
        self.original_style = None
        self.original_parent = None
        self.scrcpy_output_queue = Queue()
        self.aspect_ratio = None
        self.resize_job = None
        self.is_recording = False
        self.recording_process = None
        self.recording_device_path = ""
        self.scrcpy_output_is_visible = False

        # --- Performance Monitor Attributes ---
        self.performance_monitor_is_visible = False
        self.is_monitoring = False
        self.performance_thread = None
        self.stop_monitoring_event = threading.Event()
        self.performance_output_queue = Queue()
        self.performance_log_file = None

        # --- Window Setup ---
        window_title = title if title else f"Running: {Path(run_path).name}"
        self.title(window_title)
        self.geometry("1200x800")
        self.protocol("WM_DELETE_WINDOW", self._on_close)

        self._setup_widgets()

        # --- Start Processes ---
        if self.mode == 'test':
            self._start_test()

        self.after(100, self._check_robot_output_queue)
        self.after(100, self._check_scrcpy_output_queue)
        self.after(100, self._check_performance_output_queue)

        self.bind("<Configure>", self._on_window_resize)

    # --- UI Setup ------------------------------------------------------------------
    def _setup_widgets(self):
        """Sets up the 3-pane widget layout for the window."""
        self.main_paned_window = ttk.PanedWindow(self, orient=HORIZONTAL)
        self.main_paned_window.pack(fill=BOTH, expand=YES)

        # --- 1. Left Pane (Outputs) ---
        self.left_pane_container = ttk.Frame(self.main_paned_window, padding=5)
        self.output_paned_window = ttk.PanedWindow(self.left_pane_container, orient=VERTICAL)
        self.output_paned_window.pack(fill=BOTH, expand=YES)

        # Robot Output (only for test mode)
        if self.mode == 'test':
            self.robot_output_frame = ttk.LabelFrame(self.output_paned_window, text="Test Output", padding=5)
            self.robot_output_text = ScrolledText(self.robot_output_frame, wrap=WORD, state=DISABLED, autohide=True)
            self.robot_output_text.pack(fill=BOTH, expand=YES)
            self.robot_output_text.text.tag_config("PASS", foreground="green")
            self.robot_output_text.text.tag_config("FAIL", foreground="red")
            self.robot_output_text.text.tag_config("INFO", foreground="yellow")
            self.robot_output_text.text.tag_config("LINK", foreground="cyan", underline=True)
            self.output_paned_window.add(self.robot_output_frame, weight=1)

        # Scrcpy Output
        self.scrcpy_output_frame = ttk.LabelFrame(self.output_paned_window, text="Scrcpy Output", padding=5)
        self.scrcpy_output_text = ScrolledText(self.scrcpy_output_frame, wrap=WORD, state=DISABLED, autohide=True)
        self.scrcpy_output_text.pack(fill=BOTH, expand=YES)

        # Performance Monitor Output & Controls
        self.performance_output_frame = ttk.LabelFrame(self.output_paned_window, text="Performance Monitor", padding=5)

        monitor_controls_frame = ttk.Frame(self.performance_output_frame)
        monitor_controls_frame.pack(side=TOP, fill=X, pady=(0, 5), padx=5)
        monitor_controls_frame.columnconfigure(0, weight=1)
        monitor_controls_frame.columnconfigure(1, weight=1)

        self.performance_output_text = ScrolledText(self.performance_output_frame, wrap=WORD, state=DISABLED, autohide=True)
        self.performance_output_text.pack(fill=BOTH, expand=YES, padx=5, pady=(0,5))
        
        ttk.Label(monitor_controls_frame, text="App Package:").grid(row=0, column=0, columnspan=2, sticky=W, pady=(0,2))
        self.app_package_combo = ttk.Combobox(monitor_controls_frame, values=self.parent_app.app_packages_var.get().split(','))
        self.app_package_combo.grid(row=1, column=0, columnspan=2, sticky="ew", pady=(0, 5))
        if self.app_package_combo['values']:
            self.app_package_combo.set(self.app_package_combo['values'][0])
        self.start_monitor_button = ttk.Button(monitor_controls_frame, text="Start Monitoring", command=self._start_performance_monitor, bootstyle="success")
        self.start_monitor_button.grid(row=2, column=0, sticky="ew", padx=(0, 2))
        self.stop_monitor_button = ttk.Button(monitor_controls_frame, text="Stop Monitoring", command=self._stop_performance_monitor, bootstyle="danger", state=DISABLED)
        self.stop_monitor_button.grid(row=2, column=1, sticky="ew", padx=(2, 0))

        # --- 2. Center Pane (Controls) ---
        self.center_pane_container = ttk.LabelFrame(self.main_paned_window, text="Controls", padding=10)
        
        # Mirroring controls
        self.mirror_button = ttk.Button(self.center_pane_container, text="Start Mirroring", command=self._toggle_mirroring, bootstyle="info")
        self.mirror_button.pack(fill=X, pady=5, padx=5)
        ToolTip(self.mirror_button, "Starts or stops the device screen mirror.")

        # Scrcpy-dependent controls
        self.screenshot_button = ttk.Button(self.center_pane_container, text="Take Screenshot", command=self._take_screenshot, state=DISABLED)
        self.screenshot_button.pack(fill=X, pady=5, padx=5)
        ToolTip(self.screenshot_button, "Takes a screenshot and saves it to the 'screenshots' folder.")
        
        self.record_button = ttk.Button(self.center_pane_container, text="Start Recording", command=self._toggle_recording, bootstyle="primary", state=DISABLED)
        self.record_button.pack(fill=X, pady=5, padx=5)
        ToolTip(self.record_button, "Starts or stops screen recording.")
        
        # Visibility toggles
        if self.mode == 'test':
            self.toggle_robot_button = ttk.Button(self.center_pane_container, text="Hide Test Output", command=lambda: self._toggle_output_visibility('robot'), bootstyle="secondary")
            self.toggle_robot_button.pack(fill=X, pady=5, padx=5)

        self.toggle_scrcpy_out_button = ttk.Button(self.center_pane_container, text="Show Scrcpy Output", command=lambda: self._toggle_output_visibility('scrcpy'), bootstyle="secondary")
        self.toggle_scrcpy_out_button.pack(fill=X, pady=5, padx=5)
        
        self.toggle_perf_button = ttk.Button(self.center_pane_container, text="Show Performance", command=lambda: self._toggle_output_visibility('performance'), bootstyle="secondary")
        self.toggle_perf_button.pack(fill=X, pady=5, padx=5)

        # Test controls (only for test mode)
        if self.mode == 'test':
            separator = ttk.Separator(self.center_pane_container, orient=HORIZONTAL)
            separator.pack(fill=X, pady=10, padx=5)

            self.repeat_test_button = ttk.Button(self.center_pane_container, text="Repeat Test", command=self._repeat_test)
            self.close_button = ttk.Button(self.center_pane_container, text="Close", command=self._on_close)

            self.stop_test_button = ttk.Button(self.center_pane_container, text="Stop Test", bootstyle="danger", command=self._stop_test)
            self.stop_test_button.pack(fill=X, pady=5, padx=5)

        # --- 3. Right Pane (Screen Mirror) ---
        self.right_pane_container = ttk.LabelFrame(self.main_paned_window, text="Screen Mirror", padding=5)
        self.embed_frame = self.right_pane_container # for compatibility with old code

        # --- Add panes and set initial state ---
        self.main_paned_window.add(self.left_pane_container, weight=3)
        self.main_paned_window.add(self.center_pane_container, weight=1)

        if self.mode != 'test':
             self.after(100, lambda: self.main_paned_window.sashpos(0, 0)) # Hide left pane

    # --- Visibility & Layout Toggles ---------------------------------------------
    def _update_left_pane_visibility(self):
        """Automatically shows or hides the left output pane based on visible content."""
        is_any_output_visible = self.scrcpy_output_is_visible or self.performance_monitor_is_visible
        if self.mode == 'test':
            is_any_output_visible = is_any_output_visible or self.robot_output_is_visible

        try:
            sash_pos = self.main_paned_window.sashpos(0)
            is_pane_visible = sash_pos > 10

            if is_any_output_visible and not is_pane_visible:
                restore_width = getattr(self, '_left_pane_width', 300)
                self.main_paned_window.sashpos(0, restore_width)
            elif not is_any_output_visible and is_pane_visible:
                self._left_pane_width = sash_pos
                self.main_paned_window.sashpos(0, 0)
        except tk.TclError:
            pass # Sash may not exist yet

    def _toggle_output_visibility(self, output_type: str):
        """Shows or hides a specific output frame in the left pane."""
        frame_map = {
            'scrcpy': (self.scrcpy_output_frame, self.toggle_scrcpy_out_button, "Scrcpy Output", self.scrcpy_output_is_visible),
            'performance': (self.performance_output_frame, self.toggle_perf_button, "Performance", self.performance_monitor_is_visible)
        }
        if self.mode == 'test':
            frame_map['robot'] = (self.robot_output_frame, self.toggle_robot_button, "Test Output", self.robot_output_is_visible)

        if output_type not in frame_map: return
        
        frame, button, name, is_visible = frame_map[output_type]

        if is_visible:
            self.output_paned_window.forget(frame)
            button.config(text=f"Show {name}")
        else:
            self.output_paned_window.add(frame, weight=1)
            button.config(text=f"Hide {name}")

        # Update state variable
        if output_type == 'robot': self.robot_output_is_visible = not is_visible
        elif output_type == 'scrcpy': self.scrcpy_output_is_visible = not is_visible
        elif output_type == 'performance': self.performance_monitor_is_visible = not is_visible

        self._update_left_pane_visibility()

    def _on_window_resize(self, event=None):
        """Debounces resize events to adjust aspect ratio."""
        if self.aspect_ratio:
            if self.resize_job:
                self.after_cancel(self.resize_job)
            self.resize_job = self.after(100, self._adjust_aspect_ratio)

    def _adjust_aspect_ratio(self):
        """Adjusts paned window sashes to match the device's aspect ratio."""
        self.resize_job = None
        if not self.aspect_ratio or not self.is_mirroring: return

        self.update_idletasks()
        
        pane_height = self.embed_frame.winfo_height()
        if pane_height <= 1:
            self.after(100, self._adjust_aspect_ratio)
            return
        
        ideal_mirror_width = int(pane_height * self.aspect_ratio)
        try:
            total_width = self.main_paned_window.winfo_width()

            # Position of sash between center and right panes
            sash1_pos = total_width - ideal_mirror_width
            
            # Enforce minimum width for other panes.
            min_other_panes_width = 300
            if sash1_pos < min_other_panes_width:
                sash1_pos = min_other_panes_width
            
            if sash1_pos >= total_width: # prevent error
                sash1_pos = total_width - 50 # keep mirror visible a bit

            self.main_paned_window.sashpos(1, sash1_pos)
        except (tk.TclError, AttributeError):
            pass

    # --- Scrcpy Core Methods -----------------------------------------------------
    def _toggle_mirroring(self):
        if self.is_mirroring:
            self._stop_scrcpy()
        else:
            self._start_scrcpy()

    def _start_scrcpy(self):
        """Starts the scrcpy process and adds the mirror pane."""
        if self.is_mirroring: return
        self.is_mirroring = True
        
        self.main_paned_window.add(self.right_pane_container, weight=5)
        self.update_idletasks()
        try:
            # Set an initial position for the new sash to make the pane visible
            total_width = self.main_paned_window.winfo_width()
            self.main_paned_window.sashpos(1, int(total_width * 0.6))
        except tk.TclError:
            pass # Window may not be fully realized yet. Aspect ratio will fix it later.

        self.mirror_button.config(text="Stop Mirroring", bootstyle="danger")
        self.screenshot_button.config(state=NORMAL)
        self.record_button.config(state=NORMAL)
        
        thread = threading.Thread(target=self._run_and_embed_scrcpy)
        thread.daemon = True
        thread.start()

    def _stop_scrcpy(self):
        """Stops the scrcpy process and removes the mirror pane."""
        if not self.is_mirroring: return
        self.is_mirroring = False

        self.main_paned_window.forget(self.right_pane_container)
        self.mirror_button.config(text="Start Mirroring", bootstyle="info")
        self.screenshot_button.config(state=DISABLED)
        self.record_button.config(state=DISABLED)
        
        if self.scrcpy_process and self.scrcpy_process.poll() is None:
            self._terminate_process_tree(self.scrcpy_process.pid, "scrcpy")
            self.scrcpy_process = None
            self.scrcpy_output_queue.put("INFO: Scrcpy stopped by user.\n")

    def _run_and_embed_scrcpy(self):
        """Runs scrcpy, captures its output, and embeds its window."""
        try:
            self.unique_title = f"scrcpy_{int(time.time() * 1000)}"
            command_with_udid = self.command_template.format(udid=self.udid)
            command_to_run = f'{command_with_udid} -m 1024 -b 2M --max-fps=30 --no-audio --window-title="{self.unique_title}"'
            creationflags = subprocess.CREATE_NO_WINDOW if sys.platform == "win32" else 0
            
            self.scrcpy_process = subprocess.Popen(
                command_to_run, shell=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                text=True, encoding='utf-8', errors='replace', creationflags=creationflags
            )
            output_thread = threading.Thread(target=self._pipe_scrcpy_output_to_queue)
            output_thread.daemon = True
            output_thread.start()
            self._find_and_embed_window()
        except Exception as e:
            self.scrcpy_output_queue.put(f"FATAL ERROR: Failed to start scrcpy process.\n{e}\n")
            self.after(0, self._stop_scrcpy)

    def _pipe_scrcpy_output_to_queue(self):
        local_scrcpy_process = self.scrcpy_process
        if not local_scrcpy_process or not local_scrcpy_process.stdout:
            return

        for line in iter(local_scrcpy_process.stdout.readline, ''):
            self.scrcpy_output_queue.put(line)
        
        try:
            local_scrcpy_process.stdout.close()
        except (IOError, AttributeError):
            pass # Pipe may already be closed or process object gone

    def _check_scrcpy_output_queue(self):
        while not self.scrcpy_output_queue.empty():
            try:
                line = self.scrcpy_output_queue.get_nowait()
                self.scrcpy_output_text.text.config(state=NORMAL)
                self.scrcpy_output_text.insert(END, line)
                self.scrcpy_output_text.see(END)
                self.scrcpy_output_text.text.config(state=DISABLED)
                if "INFO: Texture:" in line and not self.aspect_ratio:
                    try:
                        resolution = line.split(":")[-1].strip()
                        width, height = map(int, resolution.split('x'))
                        if height > 0:
                            self.aspect_ratio = width / height
                            self.after(100, self._adjust_aspect_ratio)
                    except (ValueError, IndexError):
                        pass
            except Empty:
                pass
        if self.is_mirroring and self.scrcpy_process and self.scrcpy_process.poll() is not None:
             self.scrcpy_output_queue.put("\n--- Scrcpy process terminated unexpectedly. ---\n")
             self._stop_scrcpy()
        self.after(100, self._check_scrcpy_output_queue)

    def _find_and_embed_window(self):
        start_time = time.time()
        while time.time() - start_time < 15:
            if not self.is_mirroring: return # Stop if user cancelled
            hwnd = win32gui.FindWindow(None, self.unique_title)
            if hwnd:
                self.scrcpy_hwnd = hwnd
                self.after(0, self._embed_window)
                return
            time.sleep(0.2)
        self.scrcpy_output_queue.put(f"ERROR: Could not find scrcpy window '{self.unique_title}'.\n")

    def _embed_window(self):
        if not self.scrcpy_hwnd or not self.is_mirroring: return
        try:
            if not win32gui.IsWindow(self.scrcpy_hwnd):
                self.scrcpy_output_queue.put("ERROR: Scrcpy handle invalid before embedding.\n")
                return
            container_id = self.embed_frame.winfo_id()
            self.original_parent = win32gui.SetParent(self.scrcpy_hwnd, container_id)
            self.original_style = win32gui.GetWindowLong(self.scrcpy_hwnd, win32con.GWL_STYLE)
            new_style = self.original_style & ~win32con.WS_CAPTION & ~win32con.WS_THICKFRAME
            win32gui.SetWindowLong(self.scrcpy_hwnd, win32con.GWL_STYLE, new_style)
            self.embed_frame.update_idletasks()
            width, height = self.embed_frame.winfo_width(), self.embed_frame.winfo_height()
            win32gui.MoveWindow(self.scrcpy_hwnd, 0, 0, width, height, True)
            self.embed_frame.bind("<Configure>", self._resize_child)
            self.scrcpy_output_queue.put(f"INFO: Embedded scrcpy window (HWND: {self.scrcpy_hwnd})\n")
        except win32gui.error as e:
            self.scrcpy_output_queue.put(f"ERROR: A win32 error occurred during embedding: {e}\n")

    def _resize_child(self, event):
        if self.scrcpy_hwnd:
            try:
                win32gui.MoveWindow(self.scrcpy_hwnd, 0, 0, event.width, event.height, True)
            except win32gui.error as e:
                if e.winerror == 1400: # Invalid window handle
                    self.scrcpy_hwnd = None
                    self.embed_frame.unbind("<Configure>") # Stop listening for resize events
                else:
                    raise # Re-raise other unexpected errors

    # --- Scrcpy Feature Methods --------------------------------------------------
    def _take_screenshot(self):
        self.screenshot_button.config(state=DISABLED)
        threading.Thread(target=self._take_screenshot_thread, daemon=True).start()

    def _take_screenshot_thread(self):
        self.scrcpy_output_queue.put("INFO: Taking screenshot...\n")
        screenshots_dir = self.parent_app.screenshots_dir
        screenshots_dir.mkdir(exist_ok=True)
        timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
        device_filename = "/sdcard/screenshot.png"
        local_filename = f"screenshot_{self.udid.replace(':', '-')}_{timestamp}.png"
        local_filepath = screenshots_dir / local_filename
        try:
            capture_cmd = f"adb -s {self.udid} shell screencap -p {device_filename}"
            success_cap, out_cap = execute_command(capture_cmd)
            if not success_cap:
                self.scrcpy_output_queue.put(f"ERROR: Failed to capture screenshot.\n{out_cap}\n")
                return
            pull_cmd = f"adb -s {self.udid} pull {device_filename} \"{local_filepath}\""
            success_pull, out_pull = execute_command(pull_cmd)
            if not success_pull:
                self.scrcpy_output_queue.put(f"ERROR: Failed to pull screenshot.\n{out_pull}\n")
            else:
                self.scrcpy_output_queue.put(f"SUCCESS: Screenshot saved to {local_filepath}\n")
            execute_command(f"adb -s {self.udid} shell rm {device_filename}")
        finally:
            self.after(0, lambda: self.screenshot_button.config(state=NORMAL))

    def _toggle_recording(self):
        if not self.is_recording: self._start_recording()
        else: self._stop_recording()

    def _start_recording(self):
        self.record_button.config(state=DISABLED)
        threading.Thread(target=self._start_recording_thread, daemon=True).start()

    def _start_recording_thread(self):
        recordings_dir = self.parent_app.recordings_dir
        recordings_dir.mkdir(exist_ok=True)
        timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
        device_filename = f"recording_{timestamp}.mp4"
        self.recording_device_path = f"/sdcard/{device_filename}"
        command_list = ["adb", "-s", self.udid, "shell", "screenrecord", self.recording_device_path]
        self.scrcpy_output_queue.put(f"INFO: Starting recording...\n> {' '.join(command_list)}\n")
        try:
            self.recording_process = subprocess.Popen(
                command_list, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True,
                encoding='utf-8', errors='replace',
                creationflags=subprocess.CREATE_NO_WINDOW if sys.platform == "win32" else 0
            )
            self.after(0, self._update_recording_ui, True)
        except Exception as e:
            self.scrcpy_output_queue.put(f"ERROR: Failed to start recording process.\n{e}\n")
            self.after(0, lambda: self.record_button.config(state=NORMAL))

    def _stop_recording(self):
        self.record_button.config(state=DISABLED)
        threading.Thread(target=self._stop_recording_thread, daemon=True).start()

    def _stop_recording_thread(self):
        self.scrcpy_output_queue.put("INFO: Stopping recording...\n")
        if not self.recording_process or self.recording_process.poll() is not None:
            self.scrcpy_output_queue.put("ERROR: No active recording process found to stop.\n")
            self.after(0, self._update_recording_ui, False)
            return
        try:
            self.recording_process.kill()
            self.scrcpy_output_queue.put("INFO: Recording stopped. Saving file...\n")
        except subprocess.TimeoutExpired:
            self.scrcpy_output_queue.put("WARNING: Recording process unresponsive, killing it.\n")
            self.recording_process.kill()
        except Exception as e:
            self.scrcpy_output_queue.put(f"ERROR stopping recording: {e}\n")
            self.recording_process.kill()
        time.sleep(2)
        recordings_dir = self.parent_app.recordings_dir
        local_filename = Path(self.recording_device_path).name
        local_filepath = recordings_dir / f"{self.udid.replace(':', '-')}_{local_filename}"
        pull_cmd = f"adb -s {self.udid} pull {self.recording_device_path} \"{local_filepath}\""
        success_pull, out_pull = execute_command(pull_cmd)
        if not success_pull:
            self.scrcpy_output_queue.put(f"ERROR: Failed to pull recording.\n{out_pull}\n")
        else:
            self.scrcpy_output_queue.put(f"SUCCESS: Recording saved to {local_filepath}\n")
        execute_command(f"adb -s {self.udid} shell rm {self.recording_device_path}")
        self.after(0, self._update_recording_ui, False)

    def _update_recording_ui(self, is_recording: bool):
        self.is_recording = is_recording
        if is_recording:
            self.record_button.config(text="Stop Recording", bootstyle="danger")
        else:
            self.record_button.config(text="Start Recording", bootstyle="primary")
        self.record_button.config(state=NORMAL)

    # --- Performance Monitor Methods ---------------------------------------------
    def _start_performance_monitor(self):
        app_package = self.app_package_combo.get()
        if not app_package:
            messagebox.showwarning("Input Error", "Please select an app package to monitor.", parent=self)
            return
        self.is_monitoring = True
        self.stop_monitoring_event.clear()
        self.start_monitor_button.config(state=DISABLED)
        self.stop_monitor_button.config(state=NORMAL)
        self.app_package_combo.config(state=DISABLED)
        self.performance_output_text.text.config(state=NORMAL)
        self.performance_output_text.delete("1.0", END)
        self.performance_output_text.text.config(state=DISABLED)
        log_dir = self.parent_app.logs_dir
        log_dir.mkdir(exist_ok=True)
        app_name = app_package.split('.')[-1]
        self.performance_log_file = log_dir / f"performance_log_{app_name}_{self.udid.replace(':', '-')}.txt"
        self.performance_thread = threading.Thread(
            target=run_performance_monitor, 
            args=(self.udid, app_package, self.performance_output_queue, self.stop_monitoring_event)
        )
        self.performance_thread.daemon = True
        self.performance_thread.start()
        
    def _stop_performance_monitor(self):
        if self.is_monitoring:
            self.stop_monitoring_event.set()
            self.is_monitoring = False
            self.start_monitor_button.config(state=NORMAL)
            self.stop_monitor_button.config(state=DISABLED)
            self.app_package_combo.config(state="readonly")
            self.performance_output_queue.put("\n--- Monitoring stopped by user. ---\n")

    def _check_performance_output_queue(self):
        while not self.performance_output_queue.empty():
            try:
                line = self.performance_output_queue.get_nowait()
                self.performance_output_text.text.config(state=NORMAL)
                self.performance_output_text.insert(END, line)
                self.performance_output_text.see(END)
                self.performance_output_text.text.config(state=DISABLED)
                if self.performance_log_file:
                    try:
                        mode = 'w' if "Starting monitoring" in line else 'a'
                        with open(self.performance_log_file, mode, encoding='utf-8') as f: f.write(line)
                    except Exception as e:
                        self.performance_output_queue.put(f"\nERROR: Could not write to log file. Error: {e}\n")
            except Empty:
                pass
        if self.is_monitoring and (self.performance_thread is None or not self.performance_thread.is_alive()):
             self._stop_performance_monitor()
        self.after(100, self._check_performance_output_queue)

    # --- Robot Test Methods ------------------------------------------------------
    def _on_test_finished(self):
        """Configures UI when test is finished."""
        self.stop_test_button.pack_forget()
        self.repeat_test_button.pack(fill=X, pady=5, padx=5)
        self.close_button.pack(fill=X, pady=5, padx=5)

    def _repeat_test(self):
        """Repeats the test."""
        self._start_test()

    def _reset_ui_for_test_run(self):
        """Resets the UI to the initial state for a test run."""
        self.robot_output_text.text.config(state=NORMAL)
        self.robot_output_text.delete("1.0", END)
        self.robot_output_text.text.config(state=DISABLED)

        self.repeat_test_button.pack_forget()
        self.close_button.pack_forget()

        self.stop_test_button.config(state=NORMAL)
        self.stop_test_button.pack(fill=X, pady=5, padx=5)

    def _start_test(self):
        self._reset_ui_for_test_run()
        robot_thread = threading.Thread(target=self._run_robot_test)
        robot_thread.daemon = True
        robot_thread.start()

    def _run_robot_test(self):
        try:
            device_info = get_device_properties(self.udid)
            if not device_info:
                self.robot_output_queue.put(f"ERROR: Could not get device info for {self.udid}\n")
                return

            file_path = Path(self.run_path)
            suite_name = file_path.stem
            self.cur_log_dir = self.parent_app.logs_dir / f"A{device_info['release']}_{device_info['model']}_{self.udid}" / suite_name
            self.cur_log_dir.mkdir(parents=True, exist_ok=True)
            
            base_command = (
                f'robot --split-log --logtitle "{device_info["release"]} - {device_info["model"]}" '
                f'-v udid:"{self.udid}" -v deviceName:"{device_info["model"]}" -v versao_OS:"{device_info["release"]}" '
                f'-d "{self.cur_log_dir}" --name "{suite_name}" '
            )
            if self.run_mode == "Suite":
                command = f'{base_command} --argumentfile ".\\{file_path}"'
            else:
                command = f'{base_command} ".\\{file_path}"'

            self.robot_output_queue.put(f"Executing command:\n{command}\n\n")

            creationflags = subprocess.CREATE_NO_WINDOW if sys.platform == "win32" else 0
            self.robot_process = subprocess.Popen(
                command, shell=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                text=True, encoding='utf-8', errors='replace', creationflags=creationflags
            )
            for line in iter(self.robot_process.stdout.readline, ''):
                self.robot_output_queue.put(line)
            self.robot_process.stdout.close()
            return_code = self.robot_process.wait()
            self.robot_output_queue.put(f"\n--- Test execution finished with return code: {return_code} ---\n")
            
        except Exception as e:
            self.robot_output_queue.put(f"FATAL ERROR: Failed to run robot test.\n{e}\n")
        finally:
            self.after(0, self._on_test_finished)
            self.after(0, self.parent_app._on_period_change) # Refresh logs view for current period

    def _check_robot_output_queue(self):
        if self.mode != 'test': return
        while not self.robot_output_queue.empty():
            try:
                line = self.robot_output_queue.get_nowait()
                self.robot_output_text.text.config(state=NORMAL)

                if line.strip().startswith(("Output:", "Log:", "Report:")):
                    parts = line.split(":", 1)
                    prefix = parts[0].strip() + ":"
                    path = parts[1].strip()

                    self.robot_output_text.insert(END, f"{prefix: <8}")

                    link_tag = f"LINK_{time.time()}"
                    self.robot_output_text.insert(END, path, ("LINK", link_tag))
                    self.robot_output_text.tag_bind(link_tag, "<Button-1>", lambda e, p=path: self._open_file_path(p))
                    self.robot_output_text.tag_bind(link_tag, "<Enter>", lambda e: self.robot_output_text.config(cursor="hand2"))
                    self.robot_output_text.tag_bind(link_tag, "<Leave>", lambda e: self.robot_output_text.config(cursor=""))
                    self.robot_output_text.insert(END, "\n")

                else:
                    tag = None
                    if "| PASS |" in line: tag = "PASS"
                    elif "| FAIL |" in line: tag = "FAIL"
                    elif line.startswith("---"): tag = "INFO"
                    self.robot_output_text.insert(END, line, tag)

                self.robot_output_text.see(END)
                self.robot_output_text.text.config(state=DISABLED)
            except Empty:
                pass
        self.after(100, self._check_robot_output_queue)

    def _open_file_path(self, path: str):
        """Callback to open a file path from a link in the text widget."""
        try:
            # Sanitize path, sometimes it might have extra characters
            clean_path = Path(path.strip())
            if clean_path.exists():
                os.startfile(clean_path)
            else:
                messagebox.showwarning("File Not Found", f"Could not find file:\n{clean_path}", parent=self)
        except Exception as e:
            messagebox.showerror("Error", f"Could not open file: {e}", parent=self)

    def _stop_test(self):
        self.stop_test_button.config(state=DISABLED)
        self.robot_output_queue.put("\n--- STOP button clicked. Terminating test... ---\n")
        if self.robot_process and self.robot_process.poll() is None:
            self._terminate_process_tree(self.robot_process.pid, "robot")
        else:
            self.robot_output_queue.put("INFO: Robot process was already finished.\n")

    # --- Window Management -------------------------------------------------------
    def _terminate_process_tree(self, pid: int, name: str):
        """Forcefully terminates a process and its entire tree."""
        try:
            if sys.platform == "win32":
                subprocess.run(
                    f"taskkill /PID {pid} /T /F", check=True, capture_output=True,
                    creationflags=subprocess.CREATE_NO_WINDOW
                )
            else:
                os.killpg(os.getpgid(pid), signal.SIGTERM)
            output_q = self.robot_output_queue if name == "robot" else self.scrcpy_output_queue
            output_q.put(f"INFO: {name.capitalize()} process tree (PID: {pid}) terminated.\n")
        except (subprocess.CalledProcessError, ProcessLookupError, FileNotFoundError) as e:
            print(f"WARNING: Could not terminate {name} process tree (PID: {pid}). Error: {e}")

    def _on_close(self):
        if self._is_closing: return
        self._is_closing = True

        # Stop all background activities
        if self.mode == 'test' and self.robot_process: self._stop_test()
        if self.is_monitoring: self._stop_performance_monitor()
        if self.is_recording:
            self.scrcpy_output_queue.put("INFO: Stopping active recording before closing...\n")
            threading.Thread(target=self._stop_recording_thread, daemon=True).start()

        if self.is_mirroring: self._stop_scrcpy()

        # Remove window from parent's active list
        key_to_remove = None
        for key, win in self.parent_app.active_command_windows.items():
            if win is self:
                key_to_remove = key
                break
        if key_to_remove:
            del self.parent_app.active_command_windows[key_to_remove]

        self.destroy()

# --- Main Application Class ---
class RobotRunnerApp:
    def __init__(self, root: ttk.Window):
        self.root = root
        self.root.title("Robot Runner")
        self.root.geometry("1000x700")
        self.root.protocol("WM_DELETE_WINDOW", self._on_close)

        self.devices: List[Dict[str, str]] = []
        self.appium_process: Optional[subprocess.Popen] = None
        self.active_command_windows: Dict[str, tk.Toplevel] = {}
        self.parsed_logs_data: Optional[List[Dict]] = None
        self.logs_tab_initialized = False
        self._is_closing = False

        self._setup_string_vars()
        self._load_settings()
        self._update_paths_from_settings()
        
        self._initialize_dirs_and_files()
        
        self._setup_style()
        self._create_widgets()
        
        self.root.after(100, self._refresh_devices)
        self.root.after(200, self._check_scrcpy_version)

    def _setup_string_vars(self):
        """Initializes all Tkinter StringVars."""
        self.scrcpy_path_var = tk.StringVar()
        self.appium_command_var = tk.StringVar()
        self.run_mode_var = tk.StringVar(value="Suite")
        self.suites_dir_var = tk.StringVar()
        self.tests_dir_var = tk.StringVar()
        self.logs_dir_var = tk.StringVar()
        self.screenshots_dir_var = tk.StringVar()
        self.recordings_dir_var = tk.StringVar()
        self.theme_var = tk.StringVar()
        self.group_by_var = tk.StringVar(value="Device")
        self.log_period_var = tk.StringVar(value="Last 7 Days")
        # --- Performance Monitor ---
        self.app_packages_var = tk.StringVar()

    def _update_paths_from_settings(self):
        """Updates Path objects from the StringVars."""
        self.suites_dir = Path(self.suites_dir_var.get())
        self.tests_dir = Path(self.tests_dir_var.get())
        self.logs_dir = Path(self.logs_dir_var.get())
        self.screenshots_dir = Path(self.screenshots_dir_var.get())
        self.recordings_dir = Path(self.recordings_dir_var.get())

    def _setup_style(self):
        """Configures the application's theme."""
        self.style = ttk.Style(self.theme_var.get())

    def _create_widgets(self):
        """Creates and places all the widgets in the main window."""
        self.notebook = ttk.Notebook(self.root)
        self.notebook.pack(pady=10, padx=10, fill=BOTH, expand=YES)

        self.run_tab = ttk.Frame(self.notebook, padding=10)
        self.logs_tab = ttk.Frame(self.notebook, padding=10)
        self.adb_tools_tab = ttk.Frame(self.notebook, padding=10)
        self.settings_tab = ttk.Frame(self.notebook, padding=10)
        self.about_tab = ttk.Frame(self.notebook, padding=10)

        self.notebook.add(self.run_tab, text="Run Tests")
        self.notebook.add(self.logs_tab, text="Tests Logs")
        self.notebook.add(self.adb_tools_tab, text="ADB Tools")
        self.notebook.add(self.settings_tab, text="Settings")
        self.notebook.add(self.about_tab, text="About")

        self._setup_run_tab()
        self._setup_adb_tools_tab()
        self._setup_settings_tab()
        self._setup_about_tab()
        
        self.notebook.bind("<<NotebookTabChanged>>", self._on_tab_change)

        self.status_bar = ttk.Frame(self.root, padding=(5, 2), relief=SUNKEN)
        self.status_bar.pack(side=BOTTOM, fill=X)
        self.status_var = tk.StringVar(value="Initializing...")
        ttk.Label(self.status_bar, textvariable=self.status_var).pack(side=LEFT)

    def _on_tab_change(self, event):
        """Callback for when a notebook tab is changed."""
        selected_tab = self.notebook.tab(self.notebook.select(), "text")
        if selected_tab == "Tests Logs" and not self.logs_tab_initialized:
            self._setup_logs_tab()
            self.logs_tab_initialized = True
            self._on_period_change()


    def _initialize_dirs_and_files(self):
        """Creates necessary directories and files on startup."""
        CONFIG_DIR.mkdir(exist_ok=True)
        self.suites_dir.mkdir(exist_ok=True)
        self.tests_dir.mkdir(exist_ok=True)
        self.logs_dir.mkdir(exist_ok=True)

    def _setup_run_tab(self):
        """Configures the 'Run Tests' tab."""
        device_frame = ttk.LabelFrame(self.run_tab, text="Device Selection", padding=10)
        device_frame.pack(fill=X, pady=5)
        
        ttk.Label(device_frame, text="Select Device(s):").pack(side=LEFT, padx=5)
        
        listbox_frame = ttk.Frame(device_frame)
        listbox_frame.pack(side=LEFT, padx=5, fill=X, expand=YES)
        
        scrollbar = ttk.Scrollbar(listbox_frame, orient=VERTICAL)
        self.device_listbox = tk.Listbox(listbox_frame, selectmode=EXTENDED, exportselection=False, height=4, yscrollcommand=scrollbar.set)
        scrollbar.config(command=self.device_listbox.yview)
        
        scrollbar.pack(side=RIGHT, fill=Y)
        self.device_listbox.pack(side=LEFT, fill=BOTH, expand=YES)
        ToolTip(self.device_listbox, "Selects device(s) to run tests on. Use Ctrl+Click or Shift+Click for multiple selections.")
        
        self.refresh_button = ttk.Button(device_frame, text="Refresh", command=self._refresh_devices, bootstyle="secondary")
        self.refresh_button.pack(side=LEFT, padx=5)
        ToolTip(self.refresh_button, "Refreshes the list of connected devices.")

        test_frame = ttk.LabelFrame(self.run_tab, text="Test Selection", padding=10)
        test_frame.pack(fill=BOTH, expand=YES, pady=5)
        test_frame.columnconfigure(0, weight=1)
        test_frame.rowconfigure(1, weight=1)

        top_controls_frame = ttk.Frame(test_frame)
        top_controls_frame.grid(row=0, column=0, sticky="ew", padx=5, pady=2)
        top_controls_frame.columnconfigure(0, weight=1)

        self.selection_label = ttk.Label(top_controls_frame, text="Test Suites (.txt):")
        self.selection_label.grid(row=0, column=0, sticky=W)
        
        mode_frame = ttk.Frame(top_controls_frame)
        mode_frame.grid(row=0, column=1, sticky="e")
        ttk.Radiobutton(mode_frame, text="Run by Suite", variable=self.run_mode_var, value="Suite", command=self._on_run_mode_change).pack(side=LEFT, padx=5)
        ttk.Radiobutton(mode_frame, text="Run by Test", variable=self.run_mode_var, value="Test", command=self._on_run_mode_change).pack(side=LEFT, padx=5)

        self.selection_listbox = tk.Listbox(test_frame, exportselection=False)
        self.selection_listbox.grid(row=1, column=0, padx=5, pady=2, sticky="nsew")
        self.selection_listbox.bind("<Double-1>", self._on_selection_listbox_double_click)

        self._on_run_mode_change()

        run_frame = ttk.LabelFrame(self.run_tab, text="Run Controls", padding=10)
        run_frame.pack(fill=X, pady=5)
        run_frame.columnconfigure(0, weight=1)
        
        self.device_options_button = ttk.Button(run_frame, text="Device Options", command=self._mirror_device, bootstyle="info")
        self.device_options_button.grid(row=0, column=1, sticky="e", padx=(0, 5), pady=5)
        ToolTip(self.device_options_button, "Opens a window with mirroring and other controls for the selected device(s).")

        self.run_button = ttk.Button(run_frame, text="Run Test", command=self._run_test, bootstyle="success")
        self.run_button.grid(row=0, column=2, sticky="e", padx=5, pady=5)
        ToolTip(self.run_button, "Runs the selected test suite or test on the selected device.")

    def _on_run_mode_change(self):
        """Handles the change of run mode and populates the listbox."""
        if self.run_mode_var.get() == "Suite":
            self.current_path = self.suites_dir
        else:
            self.current_path = self.tests_dir
        self._populate_selection_listbox()

    def _populate_selection_listbox(self):
        """Populates the listbox based on the selected run mode and current path."""
        self.selection_listbox.delete(0, END)
        mode = self.run_mode_var.get()
        
        base_dir = self.suites_dir if mode == "Suite" else self.tests_dir
        
        if self.current_path != base_dir:
            self.selection_listbox.insert(END, "[..] Back")

        items = sorted(list(self.current_path.iterdir()), key=lambda p: (not p.is_dir(), p.name.lower()))
        for item in items:
            if item.is_dir():
                self.selection_listbox.insert(END, f"[FOLDER] {item.name}")
            elif mode == "Suite" and item.suffix == ".txt":
                self.selection_listbox.insert(END, item.name)
            elif mode == "Test" and item.suffix == ".robot":
                self.selection_listbox.insert(END, item.name)
        
        self.selection_label.config(text=f"Current Path: {self.current_path}")

    def _on_selection_listbox_double_click(self, event):
        """Handles navigation in the listbox."""
        selected_indices = self.selection_listbox.curselection()
        if not selected_indices:
            return
        
        selected_item = self.selection_listbox.get(selected_indices[0])

        if selected_item == "[..] Back":
            self.current_path = self.current_path.parent
        elif selected_item.startswith("[FOLDER]"):
            folder_name = selected_item.replace("[FOLDER] ", "")
            self.current_path = self.current_path / folder_name
        
        self._populate_selection_listbox()

    def _setup_adb_tools_tab(self):
        """Configures the 'ADB Tools' tab."""
        adb_tools_frame = ttk.Frame(self.adb_tools_tab)
        adb_tools_frame.pack(fill=BOTH, expand=YES)
        adb_tools_frame.rowconfigure(2, weight=1)
        adb_tools_frame.columnconfigure(0, weight=1)

        wireless_frame = ttk.LabelFrame(adb_tools_frame, text="Wireless ADB", padding=10)
        wireless_frame.grid(row=0, column=0, sticky="ew", pady=5)
        wireless_frame.columnconfigure(0, weight=2)
        wireless_frame.columnconfigure(1, weight=1)
        wireless_frame.columnconfigure(2, weight=1)

        ttk.Label(wireless_frame, text="IP Address").grid(row=0, column=0, sticky=W, padx=5)
        ttk.Label(wireless_frame, text="Port").grid(row=0, column=1, sticky=W, padx=5)
        ttk.Label(wireless_frame, text="Pairing Code").grid(row=0, column=2, sticky=W, padx=5)

        self.ip_entry = ttk.Entry(wireless_frame)
        self.ip_entry.grid(row=1, column=0, sticky="ew", padx=5, pady=(0, 5))
        self.port_entry = ttk.Entry(wireless_frame, width=8)
        self.port_entry.grid(row=1, column=1, sticky="ew", padx=5, pady=(0, 5))
        self.code_entry = ttk.Entry(wireless_frame, width=8)
        self.code_entry.grid(row=1, column=2, sticky="ew", padx=5, pady=(0, 5))
        
        button_frame = ttk.Frame(wireless_frame)
        button_frame.grid(row=2, column=0, columnspan=3, sticky="ew", pady=5)
        button_frame.columnconfigure(0, weight=1)
        button_frame.columnconfigure(1, weight=1)
        button_frame.columnconfigure(2, weight=1)
        
        self.disconnect_button = ttk.Button(button_frame, text="Disconnect", command=self._disconnect_wireless_device, bootstyle="danger")
        self.disconnect_button.grid(row=0, column=0, sticky="ew", padx=5)
        ToolTip(self.disconnect_button, "Disconnect a specific IP:Port, or all devices if fields are empty.")

        self.pair_button = ttk.Button(button_frame, text="Pair", command=self._pair_wireless_device, bootstyle="info")
        self.pair_button.grid(row=0, column=1, sticky="ew", padx=5)
        ToolTip(self.pair_button, "Pair with a device using IP, Port, and Pairing Code.")

        self.connect_button = ttk.Button(button_frame, text="Connect", command=self._connect_wireless_device)
        self.connect_button.grid(row=0, column=2, sticky="ew", padx=5)
        ToolTip(self.connect_button, "Connect to a device using IP and Port.")

        manual_cmd_frame = ttk.LabelFrame(adb_tools_frame, text="Manual ADB Command", padding=10)
        manual_cmd_frame.grid(row=1, column=0, sticky="ew", pady=5)
        manual_cmd_frame.columnconfigure(0, weight=1)

        ttk.Label(manual_cmd_frame, text="Enter ADB command (e.g., 'devices -l'):").grid(row=0, column=0, sticky=W, padx=5)
        self.adb_command_entry = ttk.Entry(manual_cmd_frame)
        self.adb_command_entry.grid(row=1, column=0, sticky="ew", padx=5, pady=(0, 5))
        ToolTip(self.adb_command_entry, "Enter any ADB command without the 'adb' prefix.")

        self.run_adb_button = ttk.Button(manual_cmd_frame, text="Run Command", command=self._run_manual_adb_command)
        self.run_adb_button.grid(row=2, column=0, sticky="ew", padx=5, pady=5)
        ToolTip(self.run_adb_button, "Run the specified ADB command and see the output below.")

        output_frame = ttk.LabelFrame(adb_tools_frame, text="ADB Output", padding=5)
        output_frame.grid(row=2, column=0, sticky="nsew", pady=5)
        output_frame.rowconfigure(0, weight=1)
        output_frame.columnconfigure(0, weight=1)

        self.adb_tools_output_text = ScrolledText(output_frame, wrap=WORD, state=DISABLED, autohide=True)
        self.adb_tools_output_text.grid(row=0, column=0, sticky="nsew")

    def _setup_logs_tab(self):
        """Configures the 'Tests Logs' tab."""
        logs_controls_frame = ttk.Frame(self.logs_tab)
        logs_controls_frame.pack(fill=X, pady=5)

        # --- Left-aligned controls ---
        left_controls_frame = ttk.Frame(logs_controls_frame)
        left_controls_frame.pack(side=LEFT, fill=X, expand=True)

        ttk.Label(left_controls_frame, text="Group by:").pack(side=LEFT, padx=(0,5))
        self.group_by_combobox = ttk.Combobox(left_controls_frame, textvariable=self.group_by_var,
                                              values=["Device", "Suite", "Status"], state="readonly", width=10)
        self.group_by_combobox.pack(side=LEFT, padx=(0, 15))
        self.group_by_combobox.bind("<<ComboboxSelected>>", self._on_group_by_selected)
        ToolTip(self.group_by_combobox, "Select how to group the displayed logs.")

        ttk.Label(left_controls_frame, text="Period:").pack(side=LEFT, padx=(0,5))
        self.period_combobox = ttk.Combobox(left_controls_frame, textvariable=self.log_period_var,
                                        values=["Today", "Last 7 Days", "Last 30 Days", "Last 6 Months", "All Time"], state="readonly")
        self.period_combobox.pack(side=LEFT, padx=(0, 5))
        self.period_combobox.bind("<<ComboboxSelected>>", self._on_period_change)
        ToolTip(self.period_combobox, "Select the time period for the logs to display.")

        # --- Right-aligned controls ---
        right_controls_frame = ttk.Frame(logs_controls_frame)
        right_controls_frame.pack(side=RIGHT)

        self.log_cache_info_label = ttk.Label(right_controls_frame, text="No data loaded.")
        self.log_cache_info_label.pack(side=LEFT, padx=(0, 10))

        self.reparse_button = ttk.Button(right_controls_frame, text="Reparse",
                                    command=self._start_log_reparse,
                                    bootstyle="secondary")
        self.reparse_button.pack(side=LEFT)
        ToolTip(self.reparse_button, "Force a re-parse of all logs for the selected period.")

        self.progress_frame = ttk.Frame(self.logs_tab)
        # self.progress_frame is packed later when needed
        self.progress_label = ttk.Label(self.progress_frame, text="Parsing...")
        self.progress_bar = ttk.Progressbar(self.progress_frame, mode='determinate')
        ToolTip(self.progress_bar, "Parsing logs... This may take a while depending on the number of logs.")
        
        logs_tree_frame = ttk.Frame(self.logs_tab)
        logs_tree_frame.pack(fill=BOTH, expand=YES, pady=5)

        scrollbar = ttk.Scrollbar(logs_tree_frame, orient=VERTICAL)
        
        self.logs_tree = ttk.Treeview(logs_tree_frame, columns=("suite", "status", "time"), show="headings", yscrollcommand=scrollbar.set)
        scrollbar.config(command=self.logs_tree.yview)
        
        self.logs_tree.heading("suite", text="Suite")
        self.logs_tree.heading("status", text="Status")
        self.logs_tree.heading("time", text="Execution Time")
        
        scrollbar.pack(side=RIGHT, fill=Y)
        self.logs_tree.pack(side=LEFT, fill=BOTH, expand=YES)
        
        self.logs_tree.bind("<Double-1>", self._on_log_double_click)
        self.logs_tree.tag_configure("no_logs", foreground="gray")
        
    def _setup_settings_tab(self):
        """Configures the 'Settings' tab."""
        settings_frame = ttk.Frame(self.settings_tab)
        settings_frame.pack(fill=BOTH, expand=YES)

        app_settings_frame = ttk.LabelFrame(settings_frame, text="Application & Tool Paths", padding=10)
        app_settings_frame.pack(fill=X, pady=5)
        app_settings_frame.columnconfigure(1, weight=1)

        ttk.Label(app_settings_frame, text="Appium Server:").grid(row=0, column=0, padx=5, pady=5, sticky=W)
        self.appium_status_label = ttk.Label(app_settings_frame, text="Status: Stopped", bootstyle="danger")
        self.appium_status_label.grid(row=0, column=1, padx=5, pady=5, sticky=W)
        self.toggle_appium_button = ttk.Button(app_settings_frame, text="Start Appium", command=self._toggle_appium_server, bootstyle="primary")
        self.toggle_appium_button.grid(row=0, column=2, padx=5, pady=5)
        ToolTip(self.toggle_appium_button, "Starts or stops the Appium server.")

        ttk.Label(app_settings_frame, text="Appium Command:").grid(row=1, column=0, padx=5, pady=5, sticky=W)
        ttk.Entry(app_settings_frame, textvariable=self.appium_command_var).grid(row=1, column=1, columnspan=2, padx=5, pady=5, sticky=EW)
        
        dir_settings_frame = ttk.LabelFrame(settings_frame, text="Directory & Path Settings", padding=10)
        dir_settings_frame.pack(fill=X, pady=5)
        dir_settings_frame.columnconfigure(1, weight=1)

        ttk.Label(dir_settings_frame, text="Suites Directory:").grid(row=0, column=0, padx=5, pady=2, sticky=W)
        ttk.Entry(dir_settings_frame, textvariable=self.suites_dir_var).grid(row=0, column=1, padx=5, pady=2, sticky=EW)

        ttk.Label(dir_settings_frame, text="Tests Directory:").grid(row=1, column=0, padx=5, pady=2, sticky=W)
        ttk.Entry(dir_settings_frame, textvariable=self.tests_dir_var).grid(row=1, column=1, padx=5, pady=2, sticky=EW)

        ttk.Label(dir_settings_frame, text="Logs Directory:").grid(row=2, column=0, padx=5, pady=2, sticky=W)
        ttk.Entry(dir_settings_frame, textvariable=self.logs_dir_var).grid(row=2, column=1, padx=5, pady=2, sticky=EW)

        ttk.Label(dir_settings_frame, text="Screenshots Directory:").grid(row=3, column=0, padx=5, pady=2, sticky=W)
        ttk.Entry(dir_settings_frame, textvariable=self.screenshots_dir_var).grid(row=3, column=1, padx=5, pady=2, sticky=EW)

        ttk.Label(dir_settings_frame, text="Recordings Directory:").grid(row=4, column=0, padx=5, pady=2, sticky=W)
        ttk.Entry(dir_settings_frame, textvariable=self.recordings_dir_var).grid(row=4, column=1, padx=5, pady=2, sticky=EW)
        
        ttk.Label(dir_settings_frame, text="Scrcpy Path:").grid(row=5, column=0, padx=5, pady=5, sticky=W)
        ttk.Entry(dir_settings_frame, textvariable=self.scrcpy_path_var).grid(row=5, column=1, padx=5, pady=5, sticky=EW)
        
        # --- Performance Monitor Settings ---
        ttk.Label(dir_settings_frame, text="App Packages:").grid(row=6, column=0, padx=5, pady=5, sticky=W)
        app_packages_entry = ttk.Entry(dir_settings_frame, textvariable=self.app_packages_var)
        app_packages_entry.grid(row=6, column=1, padx=5, pady=5, sticky=EW)
        ToolTip(app_packages_entry, "Comma-separated list of app package names for the performance monitor.")


        bottom_frame = ttk.Frame(settings_frame)
        bottom_frame.pack(fill=X, pady=0, padx=0)
        bottom_frame.columnconfigure(0, weight=1)

        appearance_frame = ttk.LabelFrame(bottom_frame, text="Appearance", padding=10)
        appearance_frame.grid(row=0, column=0, sticky="ew", pady=5, padx=0)
        appearance_frame.columnconfigure(1, weight=1)

        ttk.Label(appearance_frame, text="Theme:").grid(row=0, column=0, padx=5, pady=2, sticky=W)
        theme_combo = ttk.Combobox(appearance_frame, textvariable=self.theme_var, values=["darkly", "litera"], state="readonly")
        theme_combo.grid(row=0, column=1, padx=5, pady=2, sticky=W)
        ttk.Label(appearance_frame, text="(Requires app restart)").grid(row=0, column=2, padx=5, pady=2, sticky=W)
        ToolTip(theme_combo, "Select the application theme. Requires restart to apply changes.")

        save_button = ttk.Button(bottom_frame, text="Save Settings", command=self._save_settings, bootstyle="success")
        save_button.grid(row=0, column=1, sticky="e", padx=10)
        ToolTip(save_button, "Saves all current settings to settings.json.")

        output_frame = ttk.LabelFrame(settings_frame, text="Appium Server Output", padding=5)
        output_frame.pack(fill=BOTH, expand=YES, pady=5)
        self.appium_output_text = ScrolledText(output_frame, wrap=WORD, state=DISABLED, autohide=True)
        self.appium_output_text.pack(fill=BOTH, expand=YES)

    def _setup_about_tab(self):
        """Configures the 'About' tab with project information."""
        about_frame = ttk.Frame(self.about_tab)
        about_frame.pack(fill=BOTH, expand=YES, padx=10, pady=5)

        title_label = ttk.Label(about_frame, text="Robot Runner", font="-size 20 -weight bold")
        title_label.pack(pady=(0, 10))
        ToolTip(title_label, "Robot Runner - by Lucas de Eiroz Rodrigues")

        desc_label = ttk.Label(about_frame, text="A GUI for managing and executing Robot Framework tests on Android devices.", wraplength=500)
        desc_label.pack(pady=(0, 20))

        tools_frame = ttk.LabelFrame(about_frame, text="Acknowledgements", padding=10)
        tools_frame.pack(fill=X, pady=5)

        tools_text = (
            "This application is built with Python and relies on several fantastic open-source projects:\n\n"
            "•  **Python**: The core programming language.\n"
            "•  **Tkinter**: Python's standard GUI library.\n"
            "•  **ttkbootstrap**: For modern, themed widgets in Tkinter.\n"
            "•  **Robot Framework**: The generic open source automation framework.\n"
            "•  **Appium**: For mobile test automation.\n"
            "•  **Scrcpy**: For high-performance screen mirroring.\n"
            "•  **pywin32**: For Windows-specific API calls."
        )
        ttk.Label(tools_frame, text=tools_text, justify=LEFT).pack(anchor=W)

        license_frame = ttk.LabelFrame(about_frame, text="License", padding=10)
        license_frame.pack(fill=BOTH, expand=YES, pady=5)
        
        license_text = (
            "MIT License\n\n"
            "Copyright (c) 2025 Lucas de Eiroz Rodrigues\n\n"
            "Permission is hereby granted, free of charge, to any person obtaining a copy\n"
            "of this software and associated documentation files (the \"Software\"), to deal\n"
            "in the Software without restriction, including without limitation the rights\n"
            "to use, copy, modify, merge, publish, distribute, sublicense, and/or sell\n"
            "copies of the Software, and to permit persons to whom the Software is\n"
            "furnished to do so, subject to the following conditions:\n\n"
            "The above copyright notice and this permission notice shall be included in all\n"
            "copies or substantial portions of the Software.\n\n"
            "THE SOFTWARE IS PROVIDED \"AS IS\", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR\n"
            "IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,\n"
            "FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE\n"
            "AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER\n"
            "LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,\n"
            "OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE\n"
            "SOFTWARE."
        )
        license_st = ScrolledText(license_frame, wrap=WORD, autohide=True)
        license_st.pack(fill=BOTH, expand=YES)
        license_st.insert(END, license_text)
        license_st.text.config(state=DISABLED)

    def _load_settings(self):
        """Loads settings from the settings.json file."""
        try:
            if SETTINGS_FILE.exists():
                with open(SETTINGS_FILE, 'r') as f:
                    settings = json.load(f)
            else:
                settings = {}
        except (json.JSONDecodeError, IOError) as e:
            print(f"Error loading settings: {e}. Using defaults.")
            settings = {}

        self.appium_command_var.set(settings.get("appium_command", "appium --base-path=/wd/hub --relaxed-security"))
        self.scrcpy_path_var.set(settings.get("scrcpy_path", "scrcpy"))
        self.suites_dir_var.set(settings.get("suites_dir", "suites"))
        self.tests_dir_var.set(settings.get("tests_dir", "tests"))
        self.logs_dir_var.set(settings.get("logs_dir", "logs"))
        self.screenshots_dir_var.set(settings.get("screenshots_dir", "screenshots"))
        self.recordings_dir_var.set(settings.get("recordings_dir", "recordings"))
        self.theme_var.set(settings.get("theme", "darkly"))
        # --- Performance Monitor ---
        self.app_packages_var.set(settings.get("app_packages", "com.android.chrome"))
        
        self.initial_theme = self.theme_var.get()

    def _save_settings(self):
        """Saves current settings to the settings.json file."""
        CONFIG_DIR.mkdir(exist_ok=True)
        settings = {
            "appium_command": self.appium_command_var.get(),
            "scrcpy_path": self.scrcpy_path_var.get(),
            "suites_dir": self.suites_dir_var.get(),
            "tests_dir": self.tests_dir_var.get(),
            "logs_dir": self.logs_dir_var.get(),
            "screenshots_dir": self.screenshots_dir_var.get(),
            "recordings_dir": self.recordings_dir_var.get(),
            "theme": self.theme_var.get(),
            # --- Performance Monitor ---
            "app_packages": self.app_packages_var.get()
        }
        try:
            with open(SETTINGS_FILE, 'w') as f:
                json.dump(settings, f, indent=4)
            
            self._update_paths_from_settings()
            
            if self.initial_theme != self.theme_var.get():
                messagebox.showinfo("Restart Required", "Theme change will be applied on the next application restart.", parent=self.root)
                self.initial_theme = self.theme_var.get()
            else:
                messagebox.showinfo("Settings Saved", "Your settings have been saved successfully.", parent=self.root)

        except IOError as e:
            messagebox.showerror("Error", f"Failed to save settings: {e}", parent=self.root)
        
    def _on_close(self):
        """Handles the main window closing event."""
        if messagebox.askokcancel("Quit", "Do you want to quit Robot Runner?"):
            self._is_closing = True
            
            if self.appium_process:
                self.status_var.set("Stopping Appium server...")
                self.root.update_idletasks()
                self._terminate_process_tree(self.appium_process.pid, "Appium")
            
            for window in list(self.active_command_windows.values()):
                if window.winfo_exists():
                    window._on_close()

            self.root.destroy()
            
    def _terminate_process_tree(self, pid: int, name: str):
        """Forcefully terminates a process and its entire tree."""
        try:
            if sys.platform == "win32":
                subprocess.run(
                    f"taskkill /PID {pid} /T /F",
                    check=True,
                    capture_output=True,
                    creationflags=subprocess.CREATE_NO_WINDOW
                )
            else:
                os.killpg(os.getpgid(pid), signal.SIGTERM)
            print(f"INFO: {name.capitalize()} process tree (PID: {pid}) terminated.")
        except (subprocess.CalledProcessError, ProcessLookupError, FileNotFoundError) as e:
            print(f"WARNING: Could not terminate {name} process tree (PID: {pid}). It might have already finished. Error: {e}")

    def _on_test_suite_select(self, event):
        """Handles test selection, preventing selection of blank space."""
        w = event.widget
        index = w.nearest(event.y)
        try:
            w.get(index) 
            if not w.selection_includes(index):
                w.selection_clear(0, END)
                w.selection_set(index)
                w.activate(index)
        except tk.TclError:
            w.selection_clear(0, END)
            
    def _run_test(self):
        """Runs the selected test or suite on the selected device(s)."""
        try:
            selected_device_indices = self.device_listbox.curselection()
            if not selected_device_indices:
                messagebox.showerror("Error", "No device selected.")
                return

            selected_devices = [self.device_listbox.get(i) for i in selected_device_indices]
            if any("No devices" in s for s in selected_devices):
                messagebox.showerror("Error", "No device selected.")
                return

            selected_indices = self.selection_listbox.curselection()
            if not selected_indices:
                messagebox.showerror("Error", "No test or suite file selected.")
                return
            
            selected_filename = self.selection_listbox.get(selected_indices[0])
            
            if selected_filename.startswith("["): # It's a folder or back button
                messagebox.showwarning("Invalid Selection", "Please select a valid test or suite file to run.")
                return

            run_mode = self.run_mode_var.get()
            
            path_to_run = self.current_path / selected_filename

            if not path_to_run.exists():
                messagebox.showerror("Error", f"File not found:\n{path_to_run}")
                return

            for device_str in selected_devices:
                udid = device_str.split(" | ")[-1]
                win = RunCommandWindow(self, udid, mode='test', run_path=str(path_to_run), run_mode=run_mode)
                self.active_command_windows[f"{udid}_test"] = win

        except Exception as e:
            messagebox.showerror("Execution Error", f"An error occurred: {e}")

    def _pair_wireless_device(self):
        """Pairs with a device wirelessly using a pairing code."""
        ip = self.ip_entry.get()
        port = self.port_entry.get()
        code = self.code_entry.get()

        if not all([ip, port, code]):
            messagebox.showwarning("Input Error", "Please enter IP Address, Port, and Pairing Code to pair.")
            return

        command = f"adb pair {ip}:{port} {code}"
        self.pair_button.config(state=DISABLED)
        self._update_output_text(self.adb_tools_output_text, f"> {command}\n", True)
        
        thread = threading.Thread(target=self._run_command_and_update_gui, args=(command, self.adb_tools_output_text, self.pair_button, True))
        thread.daemon = True
        thread.start()

    def _connect_wireless_device(self):
        """Attempts to connect to a device wirelessly via ADB."""
        ip = self.ip_entry.get()
        port = self.port_entry.get()
        
        if not all([ip, port]):
            messagebox.showwarning("Input Error", "Please enter an IP Address and Port to connect.")
            return

        command = f"adb connect {ip}:{port}"
        self.connect_button.config(state=DISABLED)
        self._update_output_text(self.adb_tools_output_text, f"> {command}\n", True)
        
        thread = threading.Thread(target=self._run_command_and_update_gui, args=(command, self.adb_tools_output_text, self.connect_button, True))
        thread.daemon = True
        thread.start()

    def _disconnect_wireless_device(self):
        """Disconnects a specific wireless device or all of them."""
        ip = self.ip_entry.get()
        port = self.port_entry.get()
        
        if ip and port:
            command = f"adb disconnect {ip}:{port}"
        else:
            command = "adb disconnect"

        self.disconnect_button.config(state=DISABLED)
        self._update_output_text(self.adb_tools_output_text, f"> {command}\n", True)
        
        thread = threading.Thread(target=self._run_command_and_update_gui, args=(command, self.adb_tools_output_text, self.disconnect_button, True))
        thread.daemon = True
        thread.start()

    def _mirror_device(self):
        """Opens a separate scrcpy window for each selected device."""
        try:
            selected_device_indices = self.device_listbox.curselection()
            if not selected_device_indices:
                messagebox.showerror("Error", "No device selected.")
                return
            
            selected_devices = [self.device_listbox.get(i) for i in selected_device_indices]
            if any("No devices" in s for s in selected_devices):
                messagebox.showerror("Error", "No device selected.")
                return

            for selected_device_str in selected_devices:
                udid = selected_device_str.split(" | ")[-1]
                model = selected_device_str.split(" | ")[0]

                win_key = f"{udid}_mirror"
                if win_key in self.active_command_windows and self.active_command_windows[win_key].winfo_exists():
                    self.active_command_windows[win_key].lift()
                    continue

                scrcpy_win = RunCommandWindow(self, udid, mode='mirror', title=f"Mirror - {model}")
                self.active_command_windows[win_key] = scrcpy_win

        except Exception as e:
            messagebox.showerror("Mirror Error", f"Could not start screen mirror: {e}")

    def _refresh_devices(self):
        """Refreshes the list of connected ADB devices."""
        self.status_var.set("Refreshing devices...")
        self.refresh_button.config(state=DISABLED)
        thread = threading.Thread(target=self._get_devices_thread)
        thread.daemon = True
        thread.start()

    def _get_devices_thread(self):
        """Gets device list in a background thread to avoid freezing the GUI."""
        self.devices = get_connected_devices()
        self.root.after(0, self._update_device_list)

    def _update_device_list(self):
        """Updates the device listbox with the found devices."""
        self.device_listbox.delete(0, END)
        if self.devices:
            self.device_listbox.config(state=NORMAL)
            device_strings = [
                f"{d['model']} | Android {d['release']} | {d['udid']}"
                for d in self.devices
            ]
            for device_string in device_strings:
                self.device_listbox.insert(END, device_string)
            self.device_listbox.selection_set(0)
        else:
            self.device_listbox.insert(END, "No devices found")
            self.device_listbox.config(state=DISABLED)
        self.refresh_button.config(state=NORMAL)
        self.status_var.set("Ready")
        
    def _check_scrcpy_version(self):
        """Checks for scrcpy and offers to download if not found."""
        if sys.platform != "win32": return
        
        def check_thread():
            scrcpy_path = find_scrcpy()
            if not scrcpy_path:
                self.root.after(0, self._prompt_download_scrcpy)
            else:
                self.scrcpy_path_var.set(str(scrcpy_path))

        threading.Thread(target=check_thread, daemon=True).start()

    def _prompt_download_scrcpy(self):
        """Asks the user if they want to download scrcpy."""
        if messagebox.askyesno("Scrcpy Not Found", 
                               "Scrcpy was not found in your system's PATH.\n"
                               "Would you like to download it automatically to the application folder?"):
            self.status_var.set("Downloading Scrcpy...")
            download_thread = threading.Thread(target=self._download_and_extract_scrcpy)
            download_thread.daemon = True
            download_thread.start()

    def _download_and_extract_scrcpy(self):
        """Downloads and extracts the latest scrcpy release for Windows."""
        try:
            api_url = "https://api.github.com/repos/Genymobile/scrcpy/releases/latest"
            with urllib.request.urlopen(api_url) as response:
                release_data = json.loads(response.read().decode())
            
            asset = next((a for a in release_data['assets'] if 'win64' in a['name'] and a['name'].endswith('.zip')), None)
            if not asset:
                self.root.after(0, messagebox.showerror, "Download Error", "Could not find a suitable Windows (64-bit) release for scrcpy.")
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
                    item.rename(scrcpy_dir / item.name)
                
                temp_extract_dir.rmdir()
                extracted_folder.rmdir()

            zip_path.unlink()
            
            new_scrcpy_path = scrcpy_dir / "scrcpy.exe"
            self.scrcpy_path_var.set(str(new_scrcpy_path))
            self.root.after(0, messagebox.showinfo, "Success", f"Scrcpy downloaded and extracted to:\n{scrcpy_dir}")

        except Exception as e:
            self.root.after(0, messagebox.showerror, "Download Failed", f"An error occurred while downloading scrcpy: {e}")
        finally:
            self.root.after(0, self.status_var.set, "Ready")

    def _toggle_appium_server(self):
        """Starts or stops the Appium server."""
        if self.appium_process and self.appium_process.poll() is None:
            self.status_var.set("Stopping Appium server...")
            self.toggle_appium_button.config(state=DISABLED)
            
            thread = threading.Thread(target=self._terminate_process_tree, args=(self.appium_process.pid, "Appium"))
            thread.daemon = True
            thread.start()
        else:
            self.status_var.set("Starting Appium server...")
            self.toggle_appium_button.config(state=DISABLED)
            thread = threading.Thread(target=self._start_appium_thread)
            thread.daemon = True
            thread.start()

    def _start_appium_thread(self):
        """Runs the appium server in a background thread."""
        try:
            command = self.appium_command_var.get()
            self.root.after(0, self._update_output_text, self.appium_output_text, f"> {command}\n", True)
            
            creationflags = subprocess.CREATE_NO_WINDOW if sys.platform == "win32" else 0
            self.appium_process = subprocess.Popen(
                command,
                shell=True,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                encoding='utf-8',
                errors='replace',
                creationflags=creationflags
            )

            self.root.after(0, lambda: self.appium_status_label.configure(text="Status: Running", bootstyle="success"))
            self.root.after(0, lambda: self.toggle_appium_button.configure(text="Stop Appium", bootstyle="danger", state=NORMAL))
            self.root.after(0, self.status_var.set, "Appium server running.")

            for line in iter(self.appium_process.stdout.readline, ''):
                if self._is_closing or self.appium_process.poll() is not None:
                    break
                self.root.after(0, self._update_output_text, self.appium_output_text, line, False)
            
            if self.appium_process:
                self.appium_process.stdout.close()
                self.appium_process.wait()

        except FileNotFoundError:
            self.root.after(0, messagebox.showerror, "Error", "Appium command not found. Make sure it is installed and in your system's PATH.")
            self.root.after(0, lambda: self.appium_status_label.configure(text="Status: Error", bootstyle="danger"))
            self.root.after(0, lambda: self.toggle_appium_button.config(state=NORMAL))
        except Exception as e:
            self.root.after(0, messagebox.showerror, "Error", f"Failed to start Appium server: {e}")
            self.root.after(0, lambda: self.appium_status_label.configure(text="Status: Error", bootstyle="danger"))
            self.root.after(0, lambda: self.toggle_appium_button.config(state=NORMAL))
        finally:
            self.appium_process = None
            if not self._is_closing:
                self.root.after(0, lambda: self.appium_status_label.configure(text="Status: Stopped", bootstyle="danger"))
                self.root.after(0, lambda: self.toggle_appium_button.configure(text="Start Appium", bootstyle="primary", state=NORMAL))
                self.root.after(0, self.status_var.set, "Appium server stopped.")

    def _run_manual_adb_command(self):
        """Runs a manual ADB command entered by the user."""
        command = self.adb_command_entry.get()
        if not command:
            return
        
        full_command = f"adb {command}"
        self.run_adb_button.config(state=DISABLED)
        self._update_output_text(self.adb_tools_output_text, f"> {full_command}\n", True)
        
        thread = threading.Thread(target=self._run_command_and_update_gui, args=(full_command, self.adb_tools_output_text, self.run_adb_button))
        thread.daemon = True
        thread.start()

    def _get_cache_path_for_period(self, period: str) -> Path:
        """Returns the specific cache file path for a given period."""
        period_map = {
            "Today": "today",
            "Last 7 Days": "7d",
            "Last 30 Days": "30d",
            "Last 6 Months": "6m",
            "All Time": "all"
        }
        suffix = period_map.get(period, "all")
        return self.logs_dir / f"parsed_logs_cache_{suffix}.json"

    def _start_log_reparse(self):
        """Starts the log parsing process based on the selected period."""
        if not self.logs_tab_initialized:
            self._setup_logs_tab()
            self.logs_tab_initialized = True

        self.group_by_combobox.config(state=DISABLED)
        self.period_combobox.config(state=DISABLED)
        self.reparse_button.config(state=DISABLED)
        self.progress_frame.pack(fill=X, pady=5)
        self.progress_label.pack(side=LEFT, padx=(0, 5))
        self.progress_bar.pack(side=LEFT, fill=X, expand=YES)

        selected_period = self.log_period_var.get()
        thread = threading.Thread(target=self._parse_logs_thread, args=(selected_period,))
        thread.daemon = True
        thread.start()

    def _on_period_change(self, event=None):
        """Handles period selection change by attempting to load a cache file."""
        if not self.logs_tab_initialized: return

        period = self.log_period_var.get()
        cache_file = self._get_cache_path_for_period(period)

        for item in self.logs_tree.get_children():
            self.logs_tree.delete(item)
        self.parsed_logs_data = []

        if cache_file.exists():
            try:
                with open(cache_file, 'r', encoding='utf-8') as f:
                    self.parsed_logs_data = json.load(f)
                
                mtime = os.path.getmtime(cache_file)
                mtime_str = datetime.datetime.fromtimestamp(mtime).strftime('%Y-%m-%d %H:%M:%S')
                self.log_cache_info_label.config(text=f"Displaying cache from: {mtime_str}")
                
                self._display_logs(self.parsed_logs_data)
            except (json.JSONDecodeError, IOError) as e:
                self.log_cache_info_label.config(text=f"Error loading cache: {e}")
                self.parsed_logs_data = []
        else:
            self.log_cache_info_label.config(text="No cache for this period. Click 'Reparse'.")
            self._display_logs([])

    def _parse_logs_thread(self, period: str):
        """Parses logs in a background thread based on the selected period."""
        now = datetime.datetime.now()
        time_delta = None
        if period == "Today":
            start_date = now.date()
        elif period == "Last 7 Days":
            time_delta = datetime.timedelta(days=7)
        elif period == "Last 30 Days":
            time_delta = datetime.timedelta(days=30)
        elif period == "Last 6 Months":
            time_delta = datetime.timedelta(days=180)

        all_xml_files = list(self.logs_dir.glob("**/output.xml"))
        xml_files = []

        if time_delta:
            cutoff_time = now - time_delta
            for f in all_xml_files:
                if datetime.datetime.fromtimestamp(f.stat().st_mtime) >= cutoff_time:
                    xml_files.append(f)
        elif period == "Today":
            for f in all_xml_files:
                if datetime.date.fromtimestamp(f.stat().st_mtime) == start_date:
                    xml_files.append(f)
        else: # All Time
            xml_files = all_xml_files

        total_files = len(xml_files)
        all_results = []

        for i, xml_file in enumerate(xml_files):
            try:
                tree = ET.parse(xml_file)
                root = tree.getroot()
                suite_element = root.find("suite")
                if suite_element is not None:
                    suite_name = suite_element.get("name", "Unknown_Suite")
                    
                    device_dir_name = xml_file.parent.parent.name
                    device_parts = device_dir_name.split('_')
                    if len(device_parts) > 2:
                        device = " ".join(device_parts[1:-1])
                    else:
                        device = device_dir_name

                    for test_element in suite_element.findall("test"):
                        test_name = test_element.get("name", "Unknown_Test")
                        status_element = test_element.find("status")
                        status = status_element.get("status", "UNKNOWN")
                        elapsed_element = status_element.get("elapsed", "0")
                        
                        try:
                            elapsed_seconds = float(elapsed_element)
                            elapsed_formatted = str(datetime.timedelta(seconds=round(elapsed_seconds)))
                        except (ValueError, TypeError):
                            elapsed_formatted = "N/A"

                        all_results.append({
                            "device": device,
                            "suite": suite_name,
                            "test": test_name,
                            "status": status,
                            "time": elapsed_formatted,
                            "log_path": str(xml_file.parent / "log.html")
                        })
            except ET.ParseError:
                print(f"Warning: Could not parse {xml_file}")
            except Exception as e:
                print(f"Error processing log file {xml_file}: {e}")
            
            self.root.after(0, self._update_parse_progress, i + 1, total_files)

        cache_file_to_save = self._get_cache_path_for_period(period)
        try:
            with open(cache_file_to_save, 'w', encoding='utf-8') as f:
                json.dump(all_results, f, indent=4)
        except Exception as e:
            print(f"Error writing to log cache file: {e}")
            
        self.root.after(0, self._finalize_parsing, all_results)

    def _update_parse_progress(self, current, total):
        """Updates the progress bar and label from the main thread."""
        if total > 0:
            percentage = (current / total) * 100
            self.progress_bar['value'] = percentage
            self.progress_label.config(text=f"Parsing file {current} of {total}...")
        else:
            self.progress_label.config(text="No log files found.")
            self.progress_bar['value'] = 100

    def _finalize_parsing(self, results):
        """Called on the main thread after parsing is complete."""
        self.parsed_logs_data = results
        self.progress_label.pack_forget()
        self.progress_bar.pack_forget()
        self.progress_frame.pack_forget()
        self.group_by_combobox.config(state="readonly")
        self.period_combobox.config(state="readonly")
        self.reparse_button.config(state=NORMAL)
        
        now_str = datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        self.log_cache_info_label.config(text=f"Cache updated: {now_str}")
        
        self._display_logs(results)

    def _display_logs(self, log_data: List[Dict]):
        """Displays the parsed log data in the Treeview."""
        for item in self.logs_tree.get_children():
            self.logs_tree.delete(item)

        if not log_data:
            self.logs_tree.insert("", END, values=("No logs found for the selected period.", "", ""), tags=("no_logs",))
            return

        group_by = self.group_by_var.get()
        grouped_data = {}

        for result in log_data:
            key = ""
            if group_by == "Device":
                key = result.get("device", "Unknown Device")
            elif group_by == "Suite":
                key = result.get("suite", "Unknown Suite")
            elif group_by == "Status":
                key = result.get("status", "UNKNOWN")
            
            if key not in grouped_data:
                grouped_data[key] = []
            grouped_data[key].append(result)

        for group, results in sorted(grouped_data.items()):
            parent_id = self.logs_tree.insert("", END, text=group, values=(group, "", ""), open=True)

            if group_by == "Device":
                suites_in_group = {}
                for res in results:
                    suite_key = res.get("suite", "Unknown Suite")
                    if suite_key not in suites_in_group:
                        suites_in_group[suite_key] = []
                    suites_in_group[suite_key].append(res)
                
                self.logs_tree.heading("suite", text="Suite / Test")
                for suite_name, tests in sorted(suites_in_group.items()):
                    indented_suite_name = f"    {suite_name}"
                    suite_id = self.logs_tree.insert(parent_id, END, text=suite_name, values=(indented_suite_name, "", ""), open=True)
                    for test in tests:
                        test_display_name = f"        - {test['test']}"
                        self.logs_tree.insert(suite_id, END, values=(test_display_name, test["status"], test["time"]),
                                              tags=(test["status"], test["log_path"]))
            else:
                if group_by == "Suite":
                    self.logs_tree.heading("suite", text="Test")
                elif group_by == "Status":
                    self.logs_tree.heading("suite", text="Device / Suite")

                for result in results:
                    first_col_val = result["test"]
                    if group_by == "Status":
                        first_col_val = f'{result["device"]} / {result["suite"]}'
                    
                    indented_val = f"    {first_col_val}"
                    self.logs_tree.insert(parent_id, END, values=(indented_val, result["status"], result["time"]),
                                          tags=(result["status"], result["log_path"]))
        
        self.logs_tree.tag_configure("PASS", foreground="green")
        self.logs_tree.tag_configure("FAIL", foreground="red")
        self.logs_tree.tag_configure("SKIP", foreground="orange")

    def _on_group_by_selected(self, event=None):
        """Handles changing the grouping of logs."""
        if self.parsed_logs_data is not None:
            self._display_logs(self.parsed_logs_data)

    def _on_log_double_click(self, event):
        """Opens the log.html file in the default web browser."""
        try:
            item_id = self.logs_tree.selection()[0]
            item_tags = self.logs_tree.item(item_id, "tags")
            if "no_logs" in item_tags: return # Do nothing for the placeholder message
            if len(item_tags) > 1:
                log_path = item_tags[1]
                if Path(log_path).exists():
                    os.startfile(log_path)
                else:
                    messagebox.showwarning("File Not Found", f"Log file not found at:\n{log_path}")
        except IndexError:
            pass
        except Exception as e:
            messagebox.showerror("Error", f"Could not open log file: {e}")
            
    def _run_command_and_update_gui(self, command: str, output_widget: ScrolledText, button: ttk.Button, refresh_on_success: bool = False):
        success, output = execute_command(command)
        if not output:
            self.root.after(0, self._update_output_text, output_widget, f"\nResult: {success}\n", False)
        else:
            self.root.after(0, self._update_output_text, output_widget, f"\nResult:\n{output}\n", False)
        
        if success and refresh_on_success:
            self.root.after(100, self._refresh_devices)
            
        self.root.after(0, lambda: button.config(state=NORMAL))


    def _update_output_text(self, widget: ScrolledText, result: str, clear: bool):
        widget.text.config(state=NORMAL)
        if clear:
            widget.delete("1.0", END)
        widget.insert(END, result)
        widget.text.config(state=DISABLED)
        widget.see(END)

# --- Helper Functions ---
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
            errors='replace',
            creationflags=subprocess.CREATE_NO_WINDOW if sys.platform == "win32" else 0
        )
        return True, process.stdout.strip()
    except subprocess.CalledProcessError as e:
        return False, e.stdout.strip() + "\n" + e.stderr.strip()
    except FileNotFoundError:
        return False, f"Error: Command not found. Make sure '{command.split()[0]}' is in your system's PATH."
    except Exception as e:
        return False, f"An unexpected error occurred: {e}"

def get_connected_devices() -> List[Dict[str, str]]:
    """Returns a list of dictionaries, each representing a connected device."""
    success, output = execute_command("adb devices -l")
    if not success:
        return []
    
    devices = []
    lines = output.strip().split('\n')[1:]
    for line in lines:
        if "device" in line and "unauthorized" not in line:
            parts = line.split()
            udid = parts[0]
            properties = get_device_properties(udid)
            if properties:
                devices.append(properties)
    return devices

def get_device_properties(udid: str) -> Optional[Dict[str, str]]:
    """Gets model and Android version for a given device UDID."""
    try:
        model_cmd = f"adb -s {udid} shell getprop ro.product.model"
        release_cmd = f"adb -s {udid} shell getprop ro.build.version.release"
        
        success_model, model = execute_command(model_cmd)
        success_release, release = execute_command(release_cmd)
        
        if success_model and success_release:
            return {"udid": udid, "model": model, "release": release}
        return None
    except Exception:
        return None

# --- Performance Monitor Helper Functions (Integrated) ---

def execute_monitor_command(command: str) -> str:
    """Executes a shell command for monitoring and returns its output."""
    try:
        process = subprocess.Popen(command, shell=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                                   creationflags=subprocess.CREATE_NO_WINDOW if sys.platform == "win32" else 0)
        output, err = process.communicate(timeout=10)
        if err and "daemon not running" in err.decode('utf-8', errors='ignore'):
            time.sleep(2)
            return execute_monitor_command(command)
        if err:
            return f"Error: {err.decode('utf-8', errors='ignore').strip()}"
        return output.decode("utf-8", errors='ignore').strip()
    except subprocess.TimeoutExpired:
        return "Error: Command timed out"
    except Exception as e:
        return f"Unexpected Error: {e}"

def get_surface_view_name(udid: str, app_package: str) -> str:
    """Finds the full name of the SurfaceView layer for the app package."""
    output = execute_monitor_command(f"adb -s {udid} shell dumpsys SurfaceFlinger --list")
    blast_match = re.search(r'(SurfaceView\[.*?{}\S*?\(BLAST\)#\d+)'.format(re.escape(app_package)), output)
    if blast_match:
        return blast_match.group(1)
    match = re.search(r'(SurfaceView\[.*?{}.*?#\d+)'.format(re.escape(app_package)), output)
    return match.group(1) if match else ""

def get_surface_fps(udid: str, surface_name: str, last_timestamps: set) -> tuple[str, set]:
    """Calculates FPS by comparing frame timestamps."""
    if not surface_name:
        return "N/A", last_timestamps
    output = execute_monitor_command(f"adb -s {udid} shell dumpsys SurfaceFlinger --latency '{surface_name}'")
    lines = output.splitlines()
    current_timestamps = {int(parts[2]) for line in lines[1:] if len(parts := line.split()) == 3 and parts[0] != '0'}
    if not last_timestamps:
        return "0.00", current_timestamps
    new_frames_count = len(current_timestamps - last_timestamps)
    return f"{float(new_frames_count):.2f}", current_timestamps

def run_performance_monitor(udid: str, app_package: str, output_queue: Queue, stop_event: threading.Event):
    """Continuously monitors app performance and puts the output in a queue."""
    output_queue.put(f"Starting monitoring for app '{app_package}' on device '{udid}'...\n")
    header = f"{'Timestamp':<10} | {'Elapsed':<10} | {'CPU':<5} | {'RAM':<7} | {'GPU':<10} | {'Missed Vsync':<1} | {'Janky':<15} | {'FPS':<4}\n"
    output_queue.put(header)
    output_queue.put("-" * len(header) + "\n")

    execute_monitor_command(f"adb -s {udid} shell dumpsys gfxinfo {app_package} reset")
    time.sleep(0.2)

    last_timestamps = set()
    start_time = time.time()

    while not stop_event.is_set():
        try:
            elapsed_seconds = time.time() - start_time
            elapsed_time_str = time.strftime("%M:%S", time.gmtime(elapsed_seconds))
            ts = time.strftime("%H:%M:%S")

            ram_output = execute_monitor_command(f"adb -s {udid} shell dumpsys meminfo {app_package}")
            ram_mb = "N/A"
            if "TOTAL" in ram_output and (match := re.search(r"TOTAL\s+(\d+)", ram_output)):
                ram_mb = f"{int(match.group(1)) / 1024:.2f}"

            cpu_output = execute_monitor_command(f"adb -s {udid} shell dumpsys cpuinfo")
            cpu_percent = "N/A"
            if "Error" not in cpu_output:
                for line in cpu_output.splitlines():
                    if app_package in line:
                        parts = line.strip().split()
                        if parts and '%' in parts[0]:
                            cpu_percent = parts[0].replace('%', '')
                            break
            
            gfx_output = execute_monitor_command(f"adb -s {udid} shell dumpsys gfxinfo {app_package}")
            jank_info = "0.00% (0/0)"
            if jank_match := re.search(r"Janky frames: (\d+) \(([\d.]+)%\)", gfx_output):
                total_frames = (re.search(r"Total frames rendered: (\d+)", gfx_output) or '?').group(1)
                jank_info = f"{jank_match.group(2)}% ({jank_match.group(1)}/{total_frames})"

            gpu_mem_kb = "N/A"
            if gpu_mem_match := re.search(r"Total GPU memory usage:\s+\d+ bytes, ([\d.]+) (KB|MB)", gfx_output):
                value, unit = float(gpu_mem_match.group(1)), gpu_mem_match.group(2)
                gpu_mem_kb = f"{value * 1024:.2f}" if unit == "MB" else f"{value:.2f}"

            missed_vsync = (re.search(r"Number Missed Vsync: (\d+)", gfx_output) or "N/A").group(1)

            surface_name = get_surface_view_name(udid, app_package)
            surface_fps, last_timestamps = get_surface_fps(udid, surface_name, last_timestamps)

            output_line = f"{ts:<10} | {elapsed_time_str:<10} | CPU: {cpu_percent:<5} | RAM: {ram_mb:<7} | GPU: {gpu_mem_kb:<10} | Missed Vsync: {missed_vsync:<1} | Janky: {jank_info:<15} | FPS: {surface_fps:<4}\n"
            output_queue.put(output_line)
            
            # This loop runs roughly every second, driven by the ADB command delays
        
        except Exception as e:
            output_queue.put(f"ERROR in monitoring loop: {e}. Retrying...\n")
            time.sleep(2)


def find_scrcpy() -> Optional[Path]:
    """Tries to find scrcpy.exe in common locations or PATH."""
    local_scrcpy = BASE_DIR / "scrcpy" / "scrcpy.exe"
    if local_scrcpy.exists():
        return local_scrcpy
    
    try:
        subprocess.run("scrcpy --version", shell=True, check=True, capture_output=True, creationflags=subprocess.CREATE_NO_WINDOW)
        return Path("scrcpy")
    except (subprocess.CalledProcessError, FileNotFoundError):
        return None

def load_theme_setting():
    """Loads the theme from settings.json before the main window is created."""
    try:
        if SETTINGS_FILE.exists():
            with open(SETTINGS_FILE, 'r') as f:
                settings = json.load(f)
                return settings.get("theme", "darkly")
        return "darkly"
    except Exception:
        return "darkly"

# --- Main Execution ---
if __name__ == "__main__":
    # High DPI awareness for Windows
    if sys.platform == "win32":
        try:
            ctypes.windll.shcore.SetProcessDpiAwareness(1)
        except Exception:
            pass

    theme = load_theme_setting()
    app = ttk.Window(themename=theme)
    gui = RobotRunnerApp(app)
    app.mainloop()