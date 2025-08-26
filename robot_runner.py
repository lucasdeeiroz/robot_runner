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

# --- Scrcpy Frame Class (Refactored for reusability) ---
class ScrcpyFrame(ttk.Frame):
    """A Frame containing all scrcpy functionality, embeddable in any window."""
    def __init__(self, parent, parent_app, command_template: str, udid: str, parent_paned_window: Optional[ttk.PanedWindow] = None):
        super().__init__(parent)
        self.parent_app = parent_app
        self.command_template = command_template
        self.udid = udid
        self.parent_paned_window = parent_paned_window
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
        self._is_closing = False

        self._setup_widgets()
        self._start_scrcpy()
        self.after(100, self._check_scrcpy_output_queue)
        self.bind("<Configure>", self._on_window_resize)

    def _setup_widgets(self):
        """Creates the layout for the scrcpy frame."""
        if hasattr(self.master, 'main_paned_window') and isinstance(self.master.main_paned_window, ttk.PanedWindow):
             self.main_paned_window = self.master.main_paned_window
        else:
            self.main_paned_window = ttk.PanedWindow(self, orient=HORIZONTAL)
            self.main_paned_window.pack(fill=BOTH, expand=YES)

        left_pane_container = ttk.Frame(self.main_paned_window)
        self.main_paned_window.add(left_pane_container)

        self.left_paned_window = ttk.PanedWindow(left_pane_container, orient=VERTICAL)
        self.left_paned_window.pack(fill=BOTH, expand=YES)

        commands_frame = ttk.LabelFrame(self.left_paned_window, text="Scrcpy Controls", padding=10)
        self.left_paned_window.add(commands_frame, weight=1)

        self.scrcpy_output_frame = ttk.LabelFrame(self.left_paned_window, text="Scrcpy Output", padding=5)
        self.scrcpy_output_text = ScrolledText(self.scrcpy_output_frame, wrap=WORD, state=DISABLED, autohide=True)
        self.scrcpy_output_text.pack(fill=BOTH, expand=YES)

        self.screenshot_button = ttk.Button(commands_frame, text="Take Screenshot", command=self._take_screenshot)
        self.screenshot_button.pack(fill=X, pady=5, padx=5)
        ToolTip(self.screenshot_button, "Takes a screenshot and saves it to the 'screenshots' folder.")

        self.record_button = ttk.Button(commands_frame, text="Start Recording", command=self._toggle_recording, bootstyle="primary")
        self.record_button.pack(fill=X, pady=5, padx=5)
        ToolTip(self.record_button, "Starts or stops screen recording. Recordings are saved to the 'recordings' folder.")

        self.toggle_output_button = ttk.Button(commands_frame, text="Show Scrcpy Output", command=self._toggle_scrcpy_output_visibility, bootstyle="secondary")
        self.toggle_output_button.pack(fill=X, pady=5, padx=5)
        ToolTip(self.toggle_output_button, "Shows or hides the scrcpy output console.")

        self.embed_frame = ttk.LabelFrame(self.main_paned_window, text="Screen Mirror", padding=5)
        self.main_paned_window.add(self.embed_frame)
        
        self.left_paned_window.add(self.scrcpy_output_frame)
        self.left_paned_window.forget(self.scrcpy_output_frame)


    def _start_scrcpy(self):
        """Starts the scrcpy process and management threads in the background."""
        thread = threading.Thread(target=self._run_and_embed_scrcpy)
        thread.daemon = True
        thread.start()

    def _run_and_embed_scrcpy(self):
        """Runs scrcpy, captures its output, and embeds its window."""
        try:
            self.unique_title = f"scrcpy_{int(time.time() * 1000)}"
            command_with_udid = self.command_template.format(udid=self.udid)
            command_to_run = f'{command_with_udid} --window-title="{self.unique_title}"'

            creationflags = subprocess.CREATE_NO_WINDOW if sys.platform == "win32" else 0
            
            self.scrcpy_process = subprocess.Popen(
                command_to_run,
                shell=True,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                encoding='utf-8',
                errors='replace',
                creationflags=creationflags
            )

            output_thread = threading.Thread(target=self._pipe_scrcpy_output_to_queue)
            output_thread.daemon = True
            output_thread.start()

            self._find_and_embed_window()

        except Exception as e:
            self.scrcpy_output_queue.put(f"FATAL ERROR: Failed to start scrcpy process.\n{e}\n")

    def _pipe_scrcpy_output_to_queue(self):
        """Reads output from the process line-by-line and puts it in a thread-safe queue."""
        if not self.scrcpy_process: return
        for line in iter(self.scrcpy_process.stdout.readline, ''):
            self.scrcpy_output_queue.put(line)
        self.scrcpy_process.stdout.close()

    def _check_scrcpy_output_queue(self):
        """Periodically checks the queue and updates the GUI text widget."""
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
        self.after(100, self._check_scrcpy_output_queue)

    def _on_window_resize(self, event=None):
        """Callback for when the main Toplevel window is resized. Debounces events."""
        if self.aspect_ratio:
            if self.resize_job:
                self.after_cancel(self.resize_job)
            self.resize_job = self.after(100, self._adjust_aspect_ratio)

    def _adjust_aspect_ratio(self):
        """Adjusts the paned window sash to match the device's aspect ratio."""
        self.resize_job = None
        if not self.aspect_ratio:
            return

        self.update_idletasks()

        pane_height = self.embed_frame.winfo_height()
        if pane_height <= 1:
            self.after(100, self._adjust_aspect_ratio)
            return

        ideal_mirror_width = int(pane_height * self.aspect_ratio)

        try:
            if self.parent_paned_window:
                # --- TestRunnerWindow Logic (3 virtual panes) ---
                total_window_width = self.parent_paned_window.winfo_width()
                
                remaining_width = total_window_width - ideal_mirror_width
                if remaining_width < 300: remaining_width = 300
                
                ideal_test_output_width = int(remaining_width * 0.80)
                ideal_scrcpy_controls_width = int(remaining_width * 0.20)

                self.parent_paned_window.sashpos(0, ideal_test_output_width)
                self.main_paned_window.sashpos(0, ideal_scrcpy_controls_width)

            else:
                # --- Standalone ScrcpyEmbedWindow Logic (2 panes) ---
                total_scrcpy_width = self.main_paned_window.winfo_width()
                new_sash_pos = total_scrcpy_width - ideal_mirror_width
                
                min_controls_width = 150 
                if new_sash_pos < min_controls_width:
                    new_sash_pos = min_controls_width
                
                self.main_paned_window.sashpos(0, new_sash_pos)

        except tk.TclError:
            pass

    def _find_and_embed_window(self):
        """Finds the scrcpy window by its unique title, then embeds it."""
        start_time = time.time()
        
        while time.time() - start_time < 15:
            hwnd = win32gui.FindWindow(None, self.unique_title)
            if hwnd:
                self.scrcpy_hwnd = hwnd
                self.after(0, self._embed_window)
                return
            time.sleep(0.2)
        
        self.scrcpy_output_queue.put(f"ERROR: Could not find scrcpy window with title '{self.unique_title}' in time.\n")

    def _embed_window(self):
        """Uses pywin32 to embed the found window into a Tkinter frame."""
        if not self.scrcpy_hwnd: return

        try:
            if not win32gui.IsWindow(self.scrcpy_hwnd):
                self.scrcpy_output_queue.put("ERROR: Scrcpy window handle became invalid before embedding.\n")
                return

            container_id = self.embed_frame.winfo_id()
            self.original_parent = win32gui.SetParent(self.scrcpy_hwnd, container_id)
            
            self.original_style = win32gui.GetWindowLong(self.scrcpy_hwnd, win32con.GWL_STYLE)
            new_style = self.original_style & ~win32con.WS_CAPTION & ~win32con.WS_THICKFRAME
            win32gui.SetWindowLong(self.scrcpy_hwnd, win32con.GWL_STYLE, new_style)

            self.embed_frame.update_idletasks()
            width = self.embed_frame.winfo_width()
            height = self.embed_frame.winfo_height()
            win32gui.MoveWindow(self.scrcpy_hwnd, 0, 0, width, height, True)

            self.embed_frame.bind("<Configure>", self._resize_child)
            self.scrcpy_output_queue.put(f"INFO: Embedded scrcpy window (HWND: {self.scrcpy_hwnd})\n")
        except win32gui.error as e:
            if e.winerror == 1400: # Invalid window handle
                self.scrcpy_output_queue.put("ERROR: Failed to embed scrcpy window. The window handle is invalid. Scrcpy might have crashed on startup.\n")
            else:
                self.scrcpy_output_queue.put(f"ERROR: A win32 error occurred during embedding: {e}\n")

    def _resize_child(self, event):
        """Resizes the embedded scrcpy window when its container frame is resized."""
        if self.scrcpy_hwnd:
            win32gui.MoveWindow(self.scrcpy_hwnd, 0, 0, event.width, event.height, True)

    def _toggle_scrcpy_output_visibility(self):
        """Shows or hides the Scrcpy Output console."""
        if self.scrcpy_output_is_visible:
            self.left_paned_window.forget(self.scrcpy_output_frame)
            self.toggle_output_button.config(text="Show Scrcpy Output")
        else:
            self.left_paned_window.add(self.scrcpy_output_frame, weight=1)
            self.toggle_output_button.config(text="Hide Scrcpy Output")
        self.scrcpy_output_is_visible = not self.scrcpy_output_is_visible

    def _take_screenshot(self):
        """Takes a screenshot and saves it locally in a non-blocking thread."""
        self.screenshot_button.config(state=DISABLED)
        thread = threading.Thread(target=self._take_screenshot_thread)
        thread.daemon = True
        thread.start()

    def _take_screenshot_thread(self):
        """The actual logic for taking a screenshot."""
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

            rm_cmd = f"adb -s {self.udid} shell rm {device_filename}"
            execute_command(rm_cmd)
        finally:
            self.master.after(0, lambda: self.screenshot_button.config(state=NORMAL))

    def _toggle_recording(self):
        """Starts or stops the screen recording."""
        if not self.is_recording:
            self._start_recording()
        else:
            self._stop_recording()

    def _start_recording(self):
        """Starts a screen recording in a separate thread."""
        self.record_button.config(state=DISABLED)
        thread = threading.Thread(target=self._start_recording_thread)
        thread.daemon = True
        thread.start()

    def _start_recording_thread(self):
        """The actual logic for starting a recording."""
        recordings_dir = self.parent_app.recordings_dir
        recordings_dir.mkdir(exist_ok=True)

        timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
        device_filename = f"recording_{timestamp}.mp4"
        self.recording_device_path = f"/sdcard/{device_filename}"

        command_list = ["adb", "-s", self.udid, "shell", "screenrecord", self.recording_device_path]
        self.scrcpy_output_queue.put(f"INFO: Starting recording...\n> {' '.join(command_list)}\n")
        try:
            self.recording_process = subprocess.Popen(
                command_list,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                encoding='utf-8',
                errors='replace',
                creationflags=subprocess.CREATE_NO_WINDOW if sys.platform == "win32" else 0
            )
            self.master.after(0, self._update_recording_ui, True)
        except Exception as e:
            self.scrcpy_output_queue.put(f"ERROR: Failed to start recording process.\n{e}\n")
            self.master.after(0, lambda: self.record_button.config(state=NORMAL))

    def _stop_recording(self):
        """Stops the screen recording in a separate thread."""
        self.record_button.config(state=DISABLED)
        thread = threading.Thread(target=self._stop_recording_thread)
        thread.daemon = True
        thread.start()

    def _stop_recording_thread(self):
        """The actual logic for stopping a recording and saving the file."""
        self.scrcpy_output_queue.put("INFO: Stopping recording...\n")
        if not self.recording_process or self.recording_process.poll() is not None:
            self.scrcpy_output_queue.put("ERROR: No active recording process found to stop.\n")
            self.master.after(0, self._update_recording_ui, False)
            return

        try:
            self.recording_process.send_signal(signal.CTRL_C_EVENT if sys.platform == "win32" else signal.SIGINT)
            self.recording_process.wait(timeout=10)
            self.scrcpy_output_queue.put("INFO: Recording process stopped.\n")
            self.scrcpy_output_queue.put("INFO: Now trying to save the file...\n")
        except subprocess.TimeoutExpired:
            self.scrcpy_output_queue.put("WARNING: Recording process did not stop in time, killing it forcefully.\n")
            self.recording_process.kill()
        except Exception as e:
            self.scrcpy_output_queue.put(f"ERROR: An error occurred while stopping the recording: {e}\n")
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

        rm_cmd = f"adb -s {self.udid} shell rm {self.recording_device_path}"
        execute_command(rm_cmd)
        
        self.master.after(0, self._update_recording_ui, False)

    def _update_recording_ui(self, is_recording: bool):
        """Updates the recording button and state."""
        self.is_recording = is_recording
        if is_recording:
            self.record_button.config(text="Stop Recording", bootstyle="danger")
        else:
            self.record_button.config(text="Start Recording", bootstyle="primary")
        self.record_button.config(state=NORMAL)

    def close(self):
        """Public method to safely close the scrcpy process."""
        if self._is_closing:
            return
        self._is_closing = True

        def final_close_actions():
            if self.scrcpy_process and self.scrcpy_process.poll() is None:
                pid = self.scrcpy_process.pid
                self.scrcpy_output_queue.put(f"INFO: Terminating scrcpy process tree (Parent PID: {pid})...\n")
                if sys.platform == "win32":
                    try:
                        subprocess.run(
                            f"taskkill /PID {pid} /T /F",
                            check=True,
                            capture_output=True,
                            creationflags=subprocess.CREATE_NO_WINDOW
                        )
                    except (subprocess.CalledProcessError, FileNotFoundError):
                        self.scrcpy_process.terminate()
                else:
                    self.scrcpy_process.terminate()

        if self.is_recording:
            self.scrcpy_output_queue.put("INFO: Stopping active recording before closing...\n")
            self.record_button.config(state=DISABLED)
            self.screenshot_button.config(state=DISABLED)

            def stop_and_close_thread():
                self._stop_recording_thread()
                self.master.after(0, final_close_actions)

            threading.Thread(target=stop_and_close_thread, daemon=True).start()
        else:
            final_close_actions()

# --- Scrcpy Toplevel Window ---
class ScrcpyEmbedWindow(tk.Toplevel):
    """A Toplevel window to display the ScrcpyFrame."""
    def __init__(self, parent, command_template: str, udid: str, title: str):
        super().__init__(parent.root)
        self.title(title)
        self.geometry("1200x800")
        
        self.scrcpy_frame = ScrcpyFrame(self, parent, command_template, udid)
        self.scrcpy_frame.pack(fill=BOTH, expand=YES)
        
        self.protocol("WM_DELETE_WINDOW", self._on_close)

    def _on_close(self):
        self.scrcpy_frame.close()
        self.destroy()

# --- Test Runner Window Class ---
class TestRunnerWindow(tk.Toplevel):
    """A Toplevel window for running a test and viewing its output."""
    def __init__(self, parent, udid: str, run_path: str, use_scrcpy: bool, run_mode: str):
        super().__init__(parent.root)
        self.parent_app = parent
        self.udid = udid
        self.run_path = run_path
        self.use_scrcpy = use_scrcpy
        self.run_mode = run_mode
        self.robot_process = None
        self.scrcpy_frame_widget = None
        self.output_queue = Queue()
        self._is_closing = False

        self.title(f"Running: {Path(run_path).name}")
        self.geometry("1200x800")
        self.protocol("WM_DELETE_WINDOW", self._on_close)

        self._setup_widgets()
        self._start_test()
        self.after(100, self._check_output_queue)
        
        if self.use_scrcpy and self.scrcpy_frame_widget:
            self.bind("<Configure>", self.scrcpy_frame_widget._on_window_resize)

    def _setup_widgets(self):
        """Sets up the widgets for the test runner window."""
        main_frame = ttk.Frame(self, padding=5)
        main_frame.pack(fill=BOTH, expand=YES)

        self.main_paned_window = ttk.PanedWindow(main_frame, orient=HORIZONTAL)
        self.main_paned_window.pack(fill=BOTH, expand=YES)

        left_pane_container = ttk.Frame(self.main_paned_window)
        self.main_paned_window.add(left_pane_container) 
        left_pane_container.rowconfigure(0, weight=1)
        left_pane_container.columnconfigure(0, weight=1)

        output_frame = ttk.LabelFrame(left_pane_container, text="Test Output", padding=5)
        output_frame.grid(row=0, column=0, sticky="nsew")
        output_frame.rowconfigure(0, weight=1)
        output_frame.columnconfigure(0, weight=1)

        self.output_text = ScrolledText(output_frame, wrap=WORD, state=DISABLED, autohide=True)
        self.output_text.grid(row=0, column=0, sticky="nsew")
        self.output_text.text.tag_config("PASS", foreground="green")
        self.output_text.text.tag_config("FAIL", foreground="red")
        self.output_text.text.tag_config("INFO", foreground="yellow")

        controls_frame = ttk.LabelFrame(left_pane_container, text="Test Controls", padding=5)
        controls_frame.grid(row=1, column=0, sticky="ew", pady=(5, 0))
        controls_frame.columnconfigure(0, weight=1)

        self.stop_button = ttk.Button(controls_frame, text="Stop Test", bootstyle="danger", command=self._stop_test)
        self.stop_button.grid(row=0, column=0, sticky="ew")

        if self.use_scrcpy and sys.platform == "win32":
            scrcpy_command = self.parent_app.scrcpy_path_var.get() + " -s {udid}"
            
            scrcpy_container = ttk.Frame(self.main_paned_window)
            
            self.scrcpy_frame_widget = ScrcpyFrame(scrcpy_container, self.parent_app, scrcpy_command, self.udid, parent_paned_window=self.main_paned_window)
            self.scrcpy_frame_widget.pack(fill=BOTH, expand=YES)
            
            self.main_paned_window.add(scrcpy_container)

    def _start_test(self):
        """Starts the Robot Framework test."""
        robot_thread = threading.Thread(target=self._run_robot_test)
        robot_thread.daemon = True
        robot_thread.start()

    def _run_robot_test(self):
        """Executes the robot command."""
        try:
            device_info = get_device_properties(self.udid)
            if not device_info:
                self.output_queue.put(f"ERROR: Could not get device info for {self.udid}\n")
                return

            file_path = Path(self.run_path)
            suite_name = file_path.stem
            cur_log_dir = self.parent_app.logs_dir / f"A{device_info['release']}_{device_info['model']}_{self.udid}" / suite_name
            cur_log_dir.mkdir(parents=True, exist_ok=True)
            
            base_command = (
                f'robot --split-log --logtitle "{device_info["release"]} - {device_info["model"]}" '
                f'-v udid:"{self.udid}" '
                f'-v deviceName:"{device_info["model"]}" '
                f'-v versao_OS:"{device_info["release"]}" '
                f'-d "{cur_log_dir}" '
                f'--name "{suite_name}" '
            )

            if self.run_mode == "Suite":
                command = f'{base_command} --argumentfile ".\\{file_path}"'
            else:
                command = f'{base_command} ".\\{file_path}"'

            self.output_queue.put(f"Executing command:\n{command}\n\n")

            creationflags = subprocess.CREATE_NO_WINDOW if sys.platform == "win32" else 0
            
            self.robot_process = subprocess.Popen(
                command,
                shell=True,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                encoding='utf-8',
                errors='replace',
                creationflags=creationflags
            )
            
            # --- FIX STARTS HERE ---
            # REMOVED: self.parent_app.robot_process = self.robot_process
            # This line was the source of the leak, as it only tracked the last process.
            # --- FIX ENDS HERE ---
            
            for line in iter(self.robot_process.stdout.readline, ''):
                self.output_queue.put(line)
            self.robot_process.stdout.close()
            
            return_code = self.robot_process.wait()
            self.output_queue.put(f"\n--- Test execution finished with return code: {return_code} ---\n")
            
            self.output_queue.put("--- Generating report with rebot... ---\n")
            output_xml_path = cur_log_dir / 'output.xml'
            if output_xml_path.exists():
                rebot_command = f'rebot -d "{cur_log_dir}/" "{output_xml_path}"'
                self.output_queue.put(f"Executing command:\n{rebot_command}\n\n")
                rebot_process = subprocess.Popen(
                    rebot_command,
                    shell=True,
                    stdout=subprocess.PIPE,
                    stderr=subprocess.STDOUT,
                    text=True,
                    encoding='utf-8',
                    errors='replace',
                    creationflags=creationflags
                )
                for line in iter(rebot_process.stdout.readline, ''):
                    self.output_queue.put(line)
                rebot_process.stdout.close()
                rebot_return_code = rebot_process.wait()
                self.output_queue.put(f"\n--- Rebot finished with return code: {rebot_return_code} ---\n")
            else:
                self.output_queue.put("ERROR: output.xml not found. Cannot generate rebot report.\n")
                
        except Exception as e:
            self.output_queue.put(f"FATAL ERROR: Failed to run robot test.\n{e}\n")
        finally:
            self.after(0, lambda: self.stop_button.config(text="Close", command=self._on_close))
            self.after(0, self.parent_app._load_and_display_logs, True)

    def _check_output_queue(self):
        """Checks the output queue and updates the text widget."""
        while not self.output_queue.empty():
            try:
                line = self.output_queue.get_nowait()
                self.output_text.text.config(state=NORMAL)
                
                tag = None
                if "| PASS |" in line:
                    tag = "PASS"
                elif "| FAIL |" in line:
                    tag = "FAIL"
                elif line.startswith(("Output:", "Log:", "Report:")):
                    tag = "INFO"
                
                self.output_text.insert(END, line, tag)
                self.output_text.see(END)
                self.output_text.text.config(state=DISABLED)
            except Empty:
                pass
        self.after(100, self._check_output_queue)

    def _stop_test(self):
        """Stops the running robot test."""
        self.stop_button.config(state=DISABLED)
        self.output_queue.put("\n--- STOP button clicked. Terminating test... ---\n")
        if self.robot_process and self.robot_process.poll() is None:
            thread = threading.Thread(target=self._terminate_process_tree, args=(self.robot_process.pid, "robot"))
            thread.daemon = True
            thread.start()
        else:
            self.output_queue.put("INFO: Robot process was already finished.\n")

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
            self.output_queue.put(f"INFO: {name.capitalize()} process tree (PID: {pid}) terminated.\n")
        except (subprocess.CalledProcessError, ProcessLookupError, FileNotFoundError) as e:
            self.output_queue.put(f"WARNING: Could not terminate {name} process tree (PID: {pid}). It might have already finished. Error: {e}\n")

    def _on_close(self):
        """Handles window closing event."""
        if self._is_closing:
            return
        self._is_closing = True
        
        self._stop_test()
        
        if self.scrcpy_frame_widget:
            self.scrcpy_frame_widget.close()

        # --- FIX STARTS HERE ---
        # Remove self from the parent's list of active windows
        if self in self.parent_app.active_test_windows:
            self.parent_app.active_test_windows.remove(self)
        # --- FIX ENDS HERE ---

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
        # --- FIX STARTS HERE ---
        # Replaced self.robot_process with a list to track all active test windows
        self.active_test_windows: List[TestRunnerWindow] = []
        # --- FIX ENDS HERE ---
        self.active_scrcpy_windows: Dict[str, ScrcpyEmbedWindow] = {}
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

    def _update_paths_from_settings(self):
        """Updates Path objects from the StringVars."""
        self.suites_dir = Path(self.suites_dir_var.get())
        self.tests_dir = Path(self.tests_dir_var.get())
        self.logs_dir = Path(self.logs_dir_var.get())
        self.screenshots_dir = Path(self.screenshots_dir_var.get())
        self.recordings_dir = Path(self.recordings_dir_var.get())
        self.logs_cache_file = self.logs_dir / "parsed_logs_cache.json"

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
            self.status_var.set("Parsing logs...")
            self.root.update_idletasks()
            self._load_and_display_logs(reparse=True)
            self.status_var.set("Ready")


    def _initialize_dirs_and_files(self):
        """Creates necessary directories and files on startup."""
        CONFIG_DIR.mkdir(exist_ok=True)
        self.suites_dir.mkdir(exist_ok=True)
        self.tests_dir.mkdir(exist_ok=True)
        self.logs_dir.mkdir(exist_ok=True)
        if not self.logs_cache_file.exists():
            with open(self.logs_cache_file, 'w') as f:
                json.dump([], f)

    def _setup_run_tab(self):
        """Configures the 'Run Tests' tab."""
        device_frame = ttk.LabelFrame(self.run_tab, text="Device Selection", padding=10)
        device_frame.pack(fill=X, pady=5)
        
        ttk.Label(device_frame, text="Select Device:").pack(side=LEFT, padx=5)
        self.device_combobox = ttk.Combobox(device_frame, state="readonly", width=50)
        self.device_combobox.pack(side=LEFT, padx=5, fill=X, expand=YES)
        ToolTip(self.device_combobox, "Selects the device to run tests on.")
        
        self.refresh_button = ttk.Button(device_frame, text="Refresh", command=self._refresh_devices, bootstyle="secondary")
        self.refresh_button.pack(side=LEFT, padx=5)
        ToolTip(self.refresh_button, "Refreshes the list of connected devices.")
        
        self.mirror_button = ttk.Button(device_frame, text="Mirror Screen", command=self._mirror_device, bootstyle="info")
        self.mirror_button.pack(side=LEFT, padx=5)
        ToolTip(self.mirror_button, "Opens a separate, resizable screen mirror for the selected device.")

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

        self.use_scrcpy_var = tk.BooleanVar(value=(sys.platform == "win32"))
        scrcpy_check = ttk.Checkbutton(run_frame, text="Use Scrcpy during test", variable=self.use_scrcpy_var)
        scrcpy_check.grid(row=0, column=0, sticky="e", padx=(0,5), pady=5)
        
        if sys.platform != "win32":
            scrcpy_check.config(state=DISABLED)
            ToolTip(scrcpy_check, "Scrcpy embedding is only supported on Windows.")

        self.run_button = ttk.Button(run_frame, text="Run Test", command=self._run_test, bootstyle="success")
        self.run_button.grid(row=0, column=1, sticky="e", padx=5, pady=5)
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

        ttk.Label(logs_controls_frame, text="Group by:").pack(side=LEFT, padx=5)
        self.group_by_combobox = ttk.Combobox(logs_controls_frame, textvariable=self.group_by_var,
                                              values=["Device", "Suite", "Status"], state="readonly")
        self.group_by_combobox.pack(side=LEFT, padx=5)
        self.group_by_combobox.bind("<<ComboboxSelected>>", self._on_group_by_selected)
        ToolTip(self.group_by_combobox, "Select how to group the displayed logs.")

        self.reparse_button = ttk.Button(logs_controls_frame, text="Reparse Logs",
                                    command=lambda: self._load_and_display_logs(reparse=True),
                                    bootstyle="secondary")
        self.reparse_button.pack(side=LEFT, padx=5)
        ToolTip(self.reparse_button, "Force a full re-parse of all logs in the 'logs' directory.")

        self.progress_frame = ttk.Frame(self.logs_tab)
        self.progress_frame.pack(fill=X, pady=5)
        self.progress_label = ttk.Label(self.progress_frame, text="Parsing...")
        self.progress_bar = ttk.Progressbar(self.progress_frame, mode='determinate')
        ToolTip(self.progress_bar, "Parsing logs... This may take a while depending on the number of logs.")
        
        # --- FIX STARTS HERE ---
        # Create a frame to hold the Treeview and its scrollbar
        logs_tree_frame = ttk.Frame(self.logs_tab)
        logs_tree_frame.pack(fill=BOTH, expand=YES, pady=5)

        # Create the scrollbar
        scrollbar = ttk.Scrollbar(logs_tree_frame, orient=VERTICAL)
        
        # Create the Treeview and link it to the scrollbar
        self.logs_tree = ttk.Treeview(logs_tree_frame, columns=("suite", "status", "time"), show="headings", yscrollcommand=scrollbar.set)
        scrollbar.config(command=self.logs_tree.yview)
        
        self.logs_tree.heading("suite", text="Suite")
        self.logs_tree.heading("status", text="Status")
        self.logs_tree.heading("time", text="Execution Time")
        
        # Pack the scrollbar and Treeview
        scrollbar.pack(side=RIGHT, fill=Y)
        self.logs_tree.pack(side=LEFT, fill=BOTH, expand=YES)
        
        self.logs_tree.bind("<Double-1>", self._on_log_double_click)
        # --- FIX ENDS HERE ---
        
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
            "theme": self.theme_var.get()
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
            
            # --- FIX STARTS HERE ---
            # Replace the old logic with a loop to close all tracked windows properly
            for window in list(self.active_test_windows):
                if window.winfo_exists():
                    window._on_close()
            # --- FIX ENDS HERE ---

            for window in list(self.active_scrcpy_windows.values()):
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
        """Runs the selected test or suite on the selected device."""
        try:
            selected_device_str = self.device_combobox.get()
            if not selected_device_str or "No devices" in selected_device_str:
                messagebox.showerror("Error", "No device selected.")
                return
            udid = selected_device_str.split(" | ")[-1]

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

            use_scrcpy = self.use_scrcpy_var.get()
            # --- FIX STARTS HERE ---
            # Create the window and add it to our tracking list
            test_win = TestRunnerWindow(self, udid, str(path_to_run), use_scrcpy, run_mode)
            self.active_test_windows.append(test_win)
            # --- FIX ENDS HERE ---

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
        """Opens a separate scrcpy window for the selected device."""
        try:
            selected_device_str = self.device_combobox.get()
            if not selected_device_str or "No devices" in selected_device_str:
                messagebox.showerror("Error", "No device selected.")
                return
            
            udid = selected_device_str.split(" | ")[-1]
            model = selected_device_str.split(" | ")[0]

            if udid in self.active_scrcpy_windows and self.active_scrcpy_windows[udid].winfo_exists():
                self.active_scrcpy_windows[udid].lift()
                return

            command_template = self.scrcpy_path_var.get() + " -s {udid}"
            scrcpy_win = ScrcpyEmbedWindow(self, command_template, udid, f"Mirror - {model}")
            self.active_scrcpy_windows[udid] = scrcpy_win

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
        """Updates the device combobox with the found devices."""
        if self.devices:
            device_strings = [
                f"{d['model']} | Android {d['release']} | {d['udid']}"
                for d in self.devices
            ]
            self.device_combobox['values'] = device_strings
            self.device_combobox.set(device_strings[0])
        else:
            self.device_combobox.set("No devices found")
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

    def _load_and_display_logs(self, reparse: bool = False):
        """Loads logs from cache or reparses, then displays them."""
        if not self.logs_tab_initialized:
            self._setup_logs_tab()
            self.logs_tab_initialized = True

        if reparse or not self.parsed_logs_data:
            self.group_by_combobox.config(state=DISABLED)
            self.reparse_button.config(state=DISABLED)
            self.progress_frame.pack(fill=X, pady=5)
            self.progress_label.pack(side=LEFT, padx=(0, 5))
            self.progress_bar.pack(side=LEFT, fill=X, expand=YES)
            
            thread = threading.Thread(target=self._parse_logs_thread)
            thread.daemon = True
            thread.start()
        else:
            self._display_logs(self.parsed_logs_data)

    def _parse_logs_thread(self):
        """Parses logs in a background thread to avoid freezing the GUI."""
        xml_files = list(self.logs_dir.glob("**/output.xml"))
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
                            elapsed_formatted = str(datetime.timedelta(seconds=elapsed_seconds))
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

        try:
            with open(self.logs_cache_file, 'w') as f:
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

    def _finalize_parsing(self, results):
        """Called on the main thread after parsing is complete."""
        self.parsed_logs_data = results
        self.progress_label.pack_forget()
        self.progress_bar.pack_forget()
        self.group_by_combobox.config(state="readonly")
        self.reparse_button.config(state=NORMAL)
        self._display_logs(results)

    def _display_logs(self, log_data: List[Dict]):
        """Displays the parsed log data in the Treeview."""
        for item in self.logs_tree.get_children():
            self.logs_tree.delete(item)

        if not log_data:
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

        for group, results in grouped_data.items():
            parent_id = self.logs_tree.insert("", END, text=group, values=(group, "", ""), open=True)

            # --- FIX STARTS HERE ---
            if group_by == "Device":
                suites_in_group = {}
                for res in results:
                    suite_key = res.get("suite", "Unknown Suite")
                    if suite_key not in suites_in_group:
                        suites_in_group[suite_key] = []
                    suites_in_group[suite_key].append(res)
                
                self.logs_tree.heading("suite", text="Suite / Test")
                for suite_name, tests in suites_in_group.items():
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
            # --- FIX ENDS HERE ---
        
        self.logs_tree.tag_configure("PASS", foreground="green")
        self.logs_tree.tag_configure("FAIL", foreground="red")
        self.logs_tree.tag_configure("SKIP", foreground="orange")

    def _on_group_by_selected(self, event=None):
        """Handles changing the grouping of logs."""
        if self.parsed_logs_data:
            self._display_logs(self.parsed_logs_data)
        else:
            self._load_and_display_logs(reparse=True)

    def _on_log_double_click(self, event):
        """Opens the log.html file in the default web browser."""
        try:
            item_id = self.logs_tree.selection()[0]
            item_tags = self.logs_tree.item(item_id, "tags")
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
