import tkinter as tk
from tkinter import messagebox, simpledialog
import ttkbootstrap as ttk
from ttkbootstrap.scrolled import ScrolledText
from ttkbootstrap.constants import *
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
        import win32process
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

SUITES_DIR = BASE_DIR / "suites"
TESTS_DIR = BASE_DIR / "tests"
LOGS_DIR = BASE_DIR / "logs"


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

# --- Scrcpy Window Class ---
class ScrcpyEmbedWindow(tk.Toplevel):
    """A Toplevel window to display and embed a scrcpy instance."""
    def __init__(self, parent, command_template: str, udid: str, title: str):
        super().__init__(parent)
        self.title(title)
        self.geometry("1200x800")
        self.protocol("WM_DELETE_WINDOW", self._on_close)

        self.command_template = command_template
        self.udid = udid
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
        self.scrcpy_output_is_visible = True
        self._is_closing = False

        self._setup_widgets()
        self._start_scrcpy()
        self.after(100, self._check_scrcpy_output_queue)
        self.bind("<Configure>", self._on_window_resize)

    def _setup_widgets(self):
        """Creates the layout for the scrcpy window."""
        main_frame = ttk.Frame(self, padding=5)
        main_frame.pack(fill=BOTH, expand=YES)
        
        self.main_paned_window = ttk.PanedWindow(main_frame, orient=HORIZONTAL)
        self.main_paned_window.pack(fill=BOTH, expand=YES)

        left_pane_container = ttk.Frame(self.main_paned_window)
        self.main_paned_window.add(left_pane_container, weight=1)

        self.left_paned_window = ttk.PanedWindow(left_pane_container, orient=VERTICAL)
        self.left_paned_window.pack(fill=BOTH, expand=YES)

        commands_frame = ttk.LabelFrame(self.left_paned_window, text="Scrcpy Controls", padding=10)
        self.left_paned_window.add(commands_frame, weight=1)

        self.scrcpy_output_frame = ttk.LabelFrame(self.left_paned_window, text="Scrcpy Output", padding=5)
        self.scrcpy_output_text = ScrolledText(self.scrcpy_output_frame, wrap=WORD, state=DISABLED, autohide=True)
        self.scrcpy_output_text.pack(fill=BOTH, expand=YES)
        self.left_paned_window.add(self.scrcpy_output_frame, weight=1)

        self.screenshot_button = ttk.Button(commands_frame, text="Take Screenshot", command=self._take_screenshot)
        self.screenshot_button.pack(fill=X, pady=5, padx=5)

        self.record_button = ttk.Button(commands_frame, text="Start Recording", command=self._toggle_recording, bootstyle="primary")
        self.record_button.pack(fill=X, pady=5, padx=5)

        self.toggle_output_button = ttk.Button(commands_frame, text="Hide Scrcpy Output", command=self._toggle_scrcpy_output_visibility, bootstyle="secondary")
        self.toggle_output_button.pack(fill=X, pady=5, padx=5)

        self.embed_frame = ttk.LabelFrame(self.main_paned_window, text="Screen Mirror", padding=5)
        self.main_paned_window.add(self.embed_frame, weight=3)
        
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
        total_width = self.main_paned_window.winfo_width()
        
        new_sash_pos = total_width - ideal_mirror_width

        min_output_width = 250
        if new_sash_pos < min_output_width:
            new_sash_pos = min_output_width
        if new_sash_pos > total_width - min_output_width:
             new_sash_pos = total_width - min_output_width

        try:
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

    def _resize_child(self, event):
        """Resizes the embedded scrcpy window when its container frame is resized."""
        if self.scrcpy_hwnd:
            win32gui.MoveWindow(self.scrcpy_hwnd, 0, 0, event.width, event.height, True)

    def _on_close(self):
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
                        self.scrcpy_output_queue.put("INFO: Scrcpy process tree terminated successfully via taskkill.\n")
                    except (subprocess.CalledProcessError, FileNotFoundError) as e:
                        self.scrcpy_output_queue.put(f"WARNING: taskkill failed ({e}), falling back to standard terminate/kill.\n")
                        self.scrcpy_process.terminate()
                        try:
                            self.scrcpy_process.wait(timeout=2)
                        except subprocess.TimeoutExpired:
                            self.scrcpy_process.kill()
                else:
                    self.scrcpy_process.terminate()

            self.destroy()

        if self.is_recording:
            self.scrcpy_output_queue.put("INFO: Window closing, stopping active recording...\n")
            self.record_button.config(state=DISABLED)
            self.screenshot_button.config(state=DISABLED)

            def stop_and_close_thread():
                self._stop_recording_thread()
                self.master.after(0, final_close_actions)

            threading.Thread(target=stop_and_close_thread, daemon=True).start()
        else:
            final_close_actions()

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
        
        screenshots_dir = BASE_DIR / "screenshots"
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
        recordings_dir = BASE_DIR / "recordings"
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
            # Send CTRL+C to stop the screenrecord process gracefully
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

        recordings_dir = BASE_DIR / "recordings"
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
        """Helper to update UI elements from the main thread."""
        self.is_recording = is_recording
        if is_recording:
            self.record_button.config(text="Stop Recording", state=NORMAL, bootstyle="danger-outline")
        else:
            self.record_button.config(text="Start Recording", state=NORMAL, bootstyle="primary")
            self.recording_process = None
            self.recording_device_path = ""

# --- Test Runner Window Class ---
class TestRunnerWindow(ScrcpyEmbedWindow):
    def __init__(self, parent, test_file_path: Path, suitename: str, device: Tuple[str, str, str], use_scrcpy: bool, test_type: str):
        self.test_file_path = test_file_path
        self.suitename = suitename
        self.udid, self.version, self.model = device
        self.use_scrcpy = use_scrcpy
        self.test_type = test_type
        self.robot_process = None
        self.test_output_queue = Queue()
        self.log_dir_path = None
        
        # Call parent __init__ with a dummy command if scrcpy is not used
        scrcpy_command = "scrcpy" if use_scrcpy else "echo"
        super().__init__(parent, scrcpy_command, self.udid, f"Test Runner - {self.suitename} on {self.model}")
        
        # Set visibility state AFTER parent __init__ is complete
        self.scrcpy_output_is_visible = False

    def _setup_widgets(self):
        """
        MODIFIED: Creates the correct layout for the test runner window.
        Layout: Test Output | Controls | Screen Mirror
        The Screen Mirror pane's size is controlled by the aspect ratio logic.
        The Test Output and Controls panes are divided by a draggable sash.
        """
        main_frame = ttk.Frame(self, padding=5)
        main_frame.pack(fill=BOTH, expand=YES)

        # Main paned window splits the screen mirror from the rest of the UI
        self.main_paned_window = ttk.PanedWindow(main_frame, orient=HORIZONTAL)
        self.main_paned_window.pack(fill=BOTH, expand=YES)

        # Left container for Test Output and Controls
        left_container = ttk.Frame(self.main_paned_window)
        self.main_paned_window.add(left_container, weight=3) # Give more initial space to the left side

        # This paned window splits Test Output and Controls
        self.left_paned_window = ttk.PanedWindow(left_container, orient=HORIZONTAL)
        self.left_paned_window.pack(fill=BOTH, expand=YES)

        # --- Pane 1: Test Output ---
        test_output_frame = ttk.LabelFrame(self.left_paned_window, text="Test Output", padding=5)
        self.test_output_text = ScrolledText(test_output_frame, wrap=WORD, state=DISABLED, autohide=True)
        self.test_output_text.pack(fill=BOTH, expand=YES)
        self.left_paned_window.add(test_output_frame, weight=4) # Approx 80%

        # --- Pane 2: Controls and Scrcpy Output ---
        middle_pane_container = ttk.Frame(self.left_paned_window)
        self.left_paned_window.add(middle_pane_container, weight=1) # Approx 20%

        self.middle_paned_window = ttk.PanedWindow(middle_pane_container, orient=VERTICAL)
        self.middle_paned_window.pack(fill=BOTH, expand=YES)

        controls_frame = ttk.LabelFrame(self.middle_paned_window, text="Test Controls", padding=10)
        self.middle_paned_window.add(controls_frame, weight=0)

        self.stop_test_button = ttk.Button(controls_frame, text="Stop Test", command=self._stop_test, bootstyle="danger")
        self.stop_test_button.pack(fill=X, pady=5, padx=5)

        self.screenshot_button = ttk.Button(controls_frame, text="Take Screenshot", command=self._take_screenshot)
        self.screenshot_button.pack(fill=X, pady=5, padx=5)

        self.record_button = ttk.Button(controls_frame, text="Start Recording", command=self._toggle_recording, bootstyle="primary")
        self.record_button.pack(fill=X, pady=5, padx=5)

        if self.use_scrcpy:
            self.scrcpy_output_frame = ttk.LabelFrame(self.middle_paned_window, text="Scrcpy Output", padding=5)
            self.scrcpy_output_text = ScrolledText(self.scrcpy_output_frame, wrap=WORD, state=DISABLED, autohide=True)
            self.scrcpy_output_text.pack(fill=BOTH, expand=YES)
            # Add the frame but immediately hide it.
            self.middle_paned_window.add(self.scrcpy_output_frame, weight=1)
            self.middle_paned_window.forget(self.scrcpy_output_frame)

            self.toggle_output_button = ttk.Button(controls_frame, text="Show Scrcpy Output", command=self._toggle_scrcpy_output_visibility, bootstyle="secondary")
            self.toggle_output_button.pack(fill=X, pady=5, padx=5)

            # --- Pane 3: Screen Mirror (in the main paned window) ---
            self.embed_frame = ttk.LabelFrame(self.main_paned_window, text="Screen Mirror", padding=5)
            self.main_paned_window.add(self.embed_frame, weight=1)
        else:
            # If not using scrcpy, the layout is simpler
            self.main_paned_window.remove(left_container) # Remove the split pane
            
            # Re-create Test Output and Controls directly in the main window
            main_paned_simple = ttk.PanedWindow(main_frame, orient=HORIZONTAL)
            main_paned_simple.pack(fill=BOTH, expand=YES)

            test_output_frame_simple = ttk.LabelFrame(main_paned_simple, text="Test Output", padding=5)
            self.test_output_text = ScrolledText(test_output_frame_simple, wrap=WORD, state=DISABLED, autohide=True)
            self.test_output_text.pack(fill=BOTH, expand=YES)
            main_paned_simple.add(test_output_frame_simple, weight=4)

            controls_frame_simple = ttk.LabelFrame(main_paned_simple, text="Test Controls", padding=10)
            self.stop_test_button = ttk.Button(controls_frame_simple, text="Stop Test", command=self._stop_test, bootstyle="danger")
            self.stop_test_button.pack(fill=X, pady=5, padx=5)
            self.screenshot_button = ttk.Button(controls_frame_simple, text="Take Screenshot", command=self._take_screenshot)
            self.screenshot_button.pack(fill=X, pady=5, padx=5)
            self.record_button = ttk.Button(controls_frame_simple, text="Start Recording", command=self._toggle_recording, bootstyle="primary")
            self.record_button.pack(fill=X, pady=5, padx=5)
            main_paned_simple.add(controls_frame_simple, weight=1)


    def _start_scrcpy(self):
        """Starts scrcpy if enabled, then starts the robot test."""
        if self.use_scrcpy:
            super()._start_scrcpy()
        self._start_robot_test()
        self.after(100, self._check_test_output_queue)


    def _start_robot_test(self):
        thread = threading.Thread(target=self._run_robot_test)
        thread.daemon = True
        thread.start()

    def _run_robot_test(self):
        """
        Executes the robot command from the project's base directory
        using the `cwd` parameter to ensure relative paths are correct.
        """
        udid_dir = re.sub(r"[^a-zA-Z0-9\n\.]", "-", self.udid)
        modelo_dir = re.sub(r"[^a-zA-Z0-9\n\.]", "-", self.model)
        
        # Store the log directory path for later use by rebot
        self.log_dir_path = LOGS_DIR / f"A{self.version}_{modelo_dir}_{udid_dir}" / self.suitename

        base_command = (
            f"robot --splitlog "
            f"-v versao_OS:{self.version} "
            f"-v udid:{self.udid} "
            f"-v deviceName:{modelo_dir} "
            f"-d \"{self.log_dir_path}\" "
            f"--name {self.suitename} "
        )

        if self.test_type == 'Suites':
            command_de_teste = f"{base_command} -A \"{self.test_file_path}\""
        else: # 'Tests'
            command_de_teste = f"{base_command} \"{self.test_file_path}\""

        try:
            self.robot_process = subprocess.Popen(
                command_de_teste,
                shell=True,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                encoding='utf-8',
                errors='replace',
                # This is the crucial fix: run the command from the project root
                cwd=BASE_DIR,
                creationflags=subprocess.CREATE_NEW_PROCESS_GROUP if sys.platform == "win32" else 0,
                preexec_fn=os.setsid if sys.platform != "win32" else None
            )

            output_thread = threading.Thread(target=self._pipe_robot_output_to_queue)
            output_thread.daemon = True
            output_thread.start()

        except Exception as e:
            self.test_output_queue.put(f"FATAL ERROR: Failed to start Robot Framework process.\n{e}\n")

    def _pipe_robot_output_to_queue(self):
        if not self.robot_process: return
        for line in iter(self.robot_process.stdout.readline, ''):
            self.test_output_queue.put(line)
        self.robot_process.stdout.close()
        self.test_output_queue.put("\n\n--- TEST EXECUTION FINISHED ---\n")
        self.master.after(0, lambda: self.stop_test_button.config(state=DISABLED))

    def _check_test_output_queue(self):
        """Periodically checks the test output queue and updates the GUI."""
        while not self.test_output_queue.empty():
            try:
                line = self.test_output_queue.get_nowait()
                self.test_output_text.text.config(state=NORMAL)
                self.test_output_text.insert(END, line)
                self.test_output_text.see(END)
                self.test_output_text.text.config(state=DISABLED)
            except Empty:
                pass
        self.after(100, self._check_test_output_queue)


    def _stop_test(self):
        """
        Forcefully terminates the Robot Framework process and then runs rebot
        to generate the final log and report files.
        """
        if self.robot_process and self.robot_process.poll() is None:
            self.test_output_queue.put("\n\n--- FORCEFULLY TERMINATING TEST ---\n")
            self.stop_test_button.config(text="Stopping...", state=DISABLED)
            
            try:
                # Use taskkill for robustness on Windows
                if sys.platform == "win32":
                    subprocess.run(f"taskkill /PID {self.robot_process.pid} /T /F", check=True, capture_output=True, creationflags=subprocess.CREATE_NO_WINDOW)
                else:
                    self.robot_process.kill() # kill() is sufficient for other platforms
                
                self.test_output_queue.put("--- Test process terminated. ---\n")
                
                # Start rebot in a separate thread
                rebot_thread = threading.Thread(target=self._run_rebot)
                rebot_thread.daemon = True
                rebot_thread.start()

            except Exception as e:
                self.test_output_queue.put(f"ERROR: Failed to terminate process: {e}\n")
            finally:
                # Reset button text but keep it disabled
                self.master.after(100, lambda: self.stop_test_button.config(text="Stop Test"))
        else:
            self.test_output_queue.put("\n--- TEST PROCESS ALREADY FINISHED ---\n")

    def _run_rebot(self):
        """
        Runs the rebot command to parse the output.xml and generate logs.
        This method is intended to run in a background thread.
        """
        if not self.log_dir_path:
            self.test_output_queue.put("ERROR: Log directory path not set. Cannot run rebot.\n")
            return

        output_xml_path = self.log_dir_path / "output.xml"
        
        # Wait a moment for the filesystem to catch up after process kill
        time.sleep(1)

        if not output_xml_path.exists():
            self.test_output_queue.put(f"ERROR: output.xml not found in {self.log_dir_path}. Cannot generate report.\n")
            return

        self.test_output_queue.put("\n--- Attempting to generate logs and report from output.xml ---\n")
        command = f"rebot \"{output_xml_path}\""
        
        try:
            process = subprocess.Popen(
                command,
                shell=True,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                encoding='utf-8',
                errors='replace',
                cwd=BASE_DIR,
                creationflags=subprocess.CREATE_NO_WINDOW if sys.platform == "win32" else 0
            )
            
            # Pipe rebot output to the GUI
            for line in iter(process.stdout.readline, ''):
                self.test_output_queue.put(line)
            process.stdout.close()
            
            self.test_output_queue.put("\n--- Log generation finished. ---\n")

        except FileNotFoundError:
            self.test_output_queue.put("FATAL ERROR: 'rebot' command not found. Is Robot Framework installed and in your PATH?\n")
        except Exception as e:
            self.test_output_queue.put(f"ERROR: Rebot execution failed: {e}\n")

    def _toggle_scrcpy_output_visibility(self):
        """MODIFIED: Shows or hides the Scrcpy Output console within the middle pane."""
        if not self.use_scrcpy: return
        
        if self.scrcpy_output_is_visible:
            self.middle_paned_window.forget(self.scrcpy_output_frame)
            self.toggle_output_button.config(text="Show Scrcpy Output")
        else:
            self.middle_paned_window.add(self.scrcpy_output_frame, weight=1)
            self.toggle_output_button.config(text="Hide Scrcpy Output")
        self.scrcpy_output_is_visible = not self.scrcpy_output_is_visible

    def _on_close(self):
        """Overrides the parent's on_close to also stop the test if running."""
        if self._is_closing:
            return
        
        # Stop the test if it's running
        if self.robot_process and self.robot_process.poll() is None:
            self._stop_test()
        
        # Call the parent's close method to handle scrcpy, recordings, etc.
        super()._on_close()


# --- Core Logic Functions (Separated from GUI) ---

def manage_adb_server(start: bool = True):
    command = "adb start-server" if start else "adb kill-server"
    action = "Starting" if start else "Killing"
    print(f"INFO: {action} ADB server...")
    try:
        process = subprocess.Popen(
            command,
            shell=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            encoding='utf-8',
            errors='replace',
            creationflags=subprocess.CREATE_NO_WINDOW if sys.platform == "win32" else 0
        )
        stdout, stderr = process.communicate(timeout=10)
        if process.returncode != 0:
            print(f"WARNING: Command '{command}' may have failed.")
            error_output = (stdout + stderr).strip()
            if error_output:
                 print(f"Output:\n{error_output}")
        else:
            print(f"INFO: ADB server command '{command}' executed successfully.")

    except subprocess.TimeoutExpired:
        print(f"ERROR: Timeout expired for command '{command}'. Killing process.")
        process.kill()
    except Exception as e:
        print(f"ERROR: Failed to execute '{command}': {e}")


def hide_console():
    """Hides the console window on Windows."""
    if sys.platform == "win32":
        console_window = ctypes.windll.kernel32.GetConsoleWindow()
        if console_window != 0:
            ctypes.windll.user32.ShowWindow(console_window, 0)

def execute_command(command: str) -> Tuple[bool, str]:
    """Executes a shell command and returns a tuple (success, output)."""
    try:
        process = subprocess.Popen(
            command,
            shell=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            encoding='utf-8',
            errors='replace',
            creationflags=subprocess.CREATE_NO_WINDOW if sys.platform == "win32" else 0
        )
        stdout, stderr = process.communicate()

        if process.returncode != 0:
            output = stdout + stderr
            if "device not found" in output:
                return False, "Error: Device not found."
            if "* daemon not running" in output:
                return False, "ADB daemon is not responding. Please wait..."
            return False, f"Error executing command:\n{output.strip()}"

        return True, (stdout + stderr).strip()

    except FileNotFoundError:
        return False, "Error: Command or executable not found. Check your system's PATH."
    except Exception as e:
        return False, f"An unexpected error occurred: {e}"

def get_device_info(udid: str) -> Tuple[Optional[str], Optional[str]]:
    """Gets the Android version and model for a given device UDID."""
    version_cmd = f"adb -s {udid} shell getprop ro.build.version.release"
    model_cmd = f"adb -s {udid} shell getprop ro.product.model"
    success_ver, version = execute_command(version_cmd)
    success_mod, model = execute_command(model_cmd)
    return (version if success_ver else "N/A", model if success_mod else "N/A")

def get_connected_devices() -> List[Tuple[str, str, str]]:
    """Gets a list of connected devices with their UDID, version, and model."""
    devices = []
    success, output = execute_command("adb devices")
    if not success or not output:
        return []
    lines = output.strip().splitlines()
    for line in lines[1:]:
        parts = line.split()
        if len(parts) == 2 and parts[1] == "device":
            udid = parts[0]
            version, model = get_device_info(udid)
            devices.append((udid, version, model))
    return devices

def find_robot_files(directory: Path) -> List[Path]:
    """Finds all .txt files in the given directory and its subdirectories."""
    return sorted(list(directory.rglob("*.txt")))


def check_and_download_scrcpy() -> Optional[Path]:
    """Checks for a local scrcpy folder, otherwise offers to download it."""
    for folder in BASE_DIR.glob("scrcpy-win64-*"):
        if folder.is_dir() and (folder / "scrcpy.exe").exists():
            return folder

    if not messagebox.askyesno("Scrcpy Not Found", "Scrcpy was not found. Do you want to download the latest version automatically?"):
        return None

    try:
        url = "https://api.github.com/repos/Genymobile/scrcpy/releases/latest"
        with urllib.request.urlopen(url) as response:
            data = json.loads(response.read().decode())
        
        asset_url = next((asset["browser_download_url"] for asset in data.get("assets", []) if asset["name"].startswith("scrcpy-win64-")), None)
        
        if not asset_url:
            messagebox.showerror("Download Error", "Could not find the download asset for Windows 64-bit.")
            return None

        zip_path = BASE_DIR / "scrcpy.zip"
        urllib.request.urlretrieve(asset_url, zip_path)

        with zipfile.ZipFile(zip_path, 'r') as zip_ref:
            zip_ref.extractall(BASE_DIR)
        
        zip_path.unlink()
        return next((folder for folder in BASE_DIR.glob("scrcpy-win64-*") if folder.is_dir()), None)

    except Exception as e:
        messagebox.showerror("Download Error", f"Failed to download or extract Scrcpy: {e}")
        return None

# --- Main Application Class ---
class RobotRunnerApp:
    def __init__(self, root: ttk.Window):
        self.root = root
        self.root.title("Robot Framework Test Runner")
        self.root.geometry("900x750")

        self.root.protocol("WM_DELETE_WINDOW", self._on_closing)

        self.scrcpy_path = check_and_download_scrcpy()
        self.selected_robot_file: Optional[Path] = None
        self.appium_process = None
        self.appium_url1_var = tk.StringVar()
        self.appium_url2_var = tk.StringVar()
        self.test_type_var = tk.StringVar(value="Suites")

        self._create_widgets()
        self._redirect_console()

        threading.Thread(target=manage_adb_server, args=(True,), daemon=True).start()

        self._initial_refresh()

    def _on_closing(self):
        """Handles cleanup before the application window is destroyed."""
        print("INFO: Close button clicked. Shutting down...")
        if self.appium_process and self.appium_process.poll() is None:
            print("INFO: Stopping Appium server...")
            if sys.platform == "win32":
                os.kill(self.appium_process.pid, signal.CTRL_C_EVENT)
            else:
                os.killpg(os.getpgid(self.appium_process.pid), signal.SIGINT)
        
        threading.Thread(target=manage_adb_server, args=(False,), daemon=True).start()
        self.root.after(500, self.root.destroy)

    def _create_widgets(self):
        main_frame = ttk.Frame(self.root, padding=10)
        main_frame.pack(fill=BOTH, expand=YES)

        device_frame = ttk.LabelFrame(main_frame, text="Target Device", padding=10)
        device_frame.pack(fill=X, pady=(0, 10))

        self.device_combobox = ttk.Combobox(device_frame, state="readonly", font=("Segoe UI", 10))
        self.device_combobox.pack(side=LEFT, fill=X, expand=YES, padx=(0, 10))
        self.devices_map: Dict[str, Tuple[str, str, str]] = {}

        self.refresh_button = ttk.Button(device_frame, text="Refresh", command=self._refresh_devices, bootstyle="secondary")
        self.refresh_button.pack(side=LEFT)

        notebook = ttk.Notebook(main_frame)
        notebook.pack(fill=BOTH, expand=YES)

        self._create_robot_tab(notebook)
        self._create_appium_tab(notebook)
        self._create_logs_tab(notebook)
        self._create_connect_tab(notebook)
        self._create_about_tab(notebook)

    def _redirect_console(self):
        """Redirects stdout and stderr to the console widget."""
        console_redirector = ConsoleRedirector(self.console_output_text)
        sys.stdout = console_redirector
        sys.stderr = console_redirector

    def _create_robot_tab(self, parent: ttk.Notebook):
        """
        Creates the Robot Framework tab with a file navigator and Mirror Device button.
        """
        self.robot_tab_frame = ttk.Frame(parent, padding=10)
        parent.add(self.robot_tab_frame, text="Run tests")

        # Top control frame
        controls_frame = ttk.Frame(self.robot_tab_frame)
        controls_frame.pack(fill=X, pady=(0, 10))

        self.back_button = ttk.Button(controls_frame, text="< Back", command=self._navigate_back, state=DISABLED)
        self.back_button.pack(side=LEFT, padx=(0, 5))

        self.current_path_label = ttk.Label(controls_frame, text="", anchor="w")
        self.current_path_label.pack(side=LEFT, fill=X, expand=YES)
        
        # Test type selection
        test_type_frame = ttk.Frame(controls_frame)
        test_type_frame.pack(side=RIGHT)
        ttk.Radiobutton(test_type_frame, text="Suites", variable=self.test_type_var, value="Suites", command=self._on_test_type_change).pack(side=LEFT)
        ttk.Radiobutton(test_type_frame, text="Tests", variable=self.test_type_var, value="Tests", command=self._on_test_type_change).pack(side=LEFT, padx=5)


        # File list frame
        list_frame = ttk.Frame(self.robot_tab_frame)
        list_frame.pack(fill=BOTH, expand=YES, pady=(0, 10))

        self.robot_file_listbox = tk.Listbox(list_frame, font=("Segoe UI", 10), relief=FLAT, borderwidth=5)
        self.robot_file_listbox.pack(side=LEFT, fill=BOTH, expand=YES)
        self.robot_file_listbox.bind("<<ListboxSelect>>", self._on_file_select)

        scrollbar = ttk.Scrollbar(list_frame, orient=VERTICAL, command=self.robot_file_listbox.yview, bootstyle="round")
        scrollbar.pack(side=RIGHT, fill=Y)
        self.robot_file_listbox['yscrollcommand'] = scrollbar.set

        # Bottom execution frame
        run_frame = ttk.Frame(self.robot_tab_frame)
        run_frame.pack(fill=X)

        if self.scrcpy_path:
            self.mirror_button = ttk.Button(run_frame, text="Mirror device", command=self._mirror_device, bootstyle="primary-outline")
            self.mirror_button.pack(side=LEFT, padx=(0, 10))

        self.selected_file_label = ttk.Label(run_frame, text="No file selected.", font=("Segoe UI", 10, "italic"))
        self.selected_file_label.pack(side=LEFT, fill=X, expand=YES)
        
        self.run_test_button = ttk.Button(run_frame, text="Run Test", command=self._run_robot_test, bootstyle="primary", state=DISABLED)
        self.run_test_button.pack(side=RIGHT)
        
        self.scrcpy_var = tk.BooleanVar(value=True)
        scrcpy_switch = ttk.Checkbutton(run_frame, text="Use Scrcpy", variable=self.scrcpy_var, bootstyle="round-toggle")
        scrcpy_switch.pack(side=RIGHT, padx=10)
        
        self._on_test_type_change() # Initial population

    def _on_test_type_change(self):
        """Handles switching between 'Suites' and 'Tests' modes."""
        test_type = self.test_type_var.get()
        if test_type == 'Suites':
            self.current_path = SUITES_DIR
        else: # Tests
            self.current_path = TESTS_DIR
        
        self._update_robot_file_list()
        # Reset selection
        self.selected_robot_file = None
        self.selected_file_label.config(text="No file selected.")
        self.run_test_button.config(state=DISABLED)

    def _update_robot_file_list(self):
        """Updates the listbox with directories and relevant files."""
        self.robot_file_listbox.delete(0, END)
        
        test_type = self.test_type_var.get()
        if test_type == 'Suites':
            base_path = SUITES_DIR
            file_ext = ".txt"
            file_prefix = "[TXT]"
        else: # Tests
            base_path = TESTS_DIR
            file_ext = ".robot"
            file_prefix = "[ROBOT]"

        try:
            relative_path = self.current_path.relative_to(base_path)
            self.current_path_label.config(text=f".\\{relative_path}")
        except ValueError:
            self.current_path_label.config(text=str(self.current_path))

        # Enable/disable back button
        if self.current_path.resolve() == base_path.resolve():
            self.back_button.config(state=DISABLED)
        else:
            self.back_button.config(state=NORMAL)

        # Populate listbox
        if not self.current_path.exists():
            self.robot_file_listbox.insert(END, f"Directory not found: {self.current_path}")
            return

        items = sorted(os.listdir(self.current_path))
        dirs = [f"[DIR] {item}" for item in items if os.path.isdir(self.current_path / item)]
        files = [f"{file_prefix} {item}" for item in items if item.endswith(file_ext)]
        
        for item in dirs + files:
            self.robot_file_listbox.insert(END, item)
            
    def _navigate_back(self):
        """Navigates to the parent directory."""
        test_type = self.test_type_var.get()
        base_path = SUITES_DIR if test_type == 'Suites' else TESTS_DIR
        
        if self.current_path.resolve() != base_path.resolve():
            self.current_path = self.current_path.parent
            self._update_robot_file_list()
            # Reset selection
            self.selected_robot_file = None
            self.selected_file_label.config(text="No file selected.")
            self.run_test_button.config(state=DISABLED)

    def _on_file_select(self, event=None):
        """Handles selection in the file navigator listbox."""
        selection_indices = self.robot_file_listbox.curselection()
        if not selection_indices:
            return

        selected_item = self.robot_file_listbox.get(selection_indices[0])
        
        if selected_item.startswith("[DIR]"): # Directory
            dir_name = selected_item.split(" ", 1)[1]
            self.current_path = self.current_path / dir_name
            self._update_robot_file_list()
            # Reset selection when entering a new directory
            self.selected_robot_file = None
            self.selected_file_label.config(text="No file selected.")
            self.run_test_button.config(state=DISABLED)

        elif selected_item.startswith(("[TXT]", "[ROBOT]")): # File
            file_name = selected_item.split(" ", 1)[1]
            self.selected_robot_file = self.current_path / file_name
            self.selected_file_label.config(text=file_name)
            self.run_test_button.config(state=NORMAL)

    def _run_robot_test(self):
        if not self.selected_robot_file:
            messagebox.showwarning("No Selection", "Please select a test or suite file.")
            return

        selected_device_display = self.device_combobox.get()
        if not selected_device_display or "No devices" in selected_device_display:
            messagebox.showwarning("No Device", "Please select a target device.")
            return

        test_file_path = self.selected_robot_file
        suitename = test_file_path.stem
        device_tuple = self.devices_map[selected_device_display]
        use_scrcpy = self.scrcpy_var.get()
        test_type = self.test_type_var.get()

        TestRunnerWindow(self.root, test_file_path, suitename, device_tuple, use_scrcpy, test_type)
        
    def _mirror_device(self):
        """Opens a ScrcpyEmbedWindow for the selected device."""
        selected_device = self.device_combobox.get()
        if not selected_device or "No devices" in selected_device:
            messagebox.showwarning("No Device", "Please select a target device to mirror.")
            return

        udid = self.devices_map[selected_device][0]
        
        if sys.platform != "win32":
            messagebox.showerror("Unsupported OS", "Scrcpy embedding is only supported on Windows.")
            return
            
        command_template = f'"{self.scrcpy_path / "scrcpy.exe"}" -s {{udid}}'
        ScrcpyEmbedWindow(self.root, command_template, udid, f"Scrcpy - {selected_device}")

    def _create_appium_tab(self, parent: ttk.Notebook):
        """Creates the Appium Server control tab."""
        appium_tab = ttk.Frame(parent, padding=10)
        parent.add(appium_tab, text="Appium Server")

        # Main content frame
        output_frame = ttk.LabelFrame(appium_tab, text="Appium Server Output", padding=5)
        output_frame.pack(fill=BOTH, expand=YES)

        self.appium_output_text = ScrolledText(output_frame, wrap=WORD, state=DISABLED, autohide=True)
        self.appium_output_text.pack(fill=BOTH, expand=YES)

        # Bottom controls frame
        bottom_frame = ttk.Frame(appium_tab, padding=(0, 10))
        bottom_frame.pack(fill=X, side=BOTTOM)
        bottom_frame.columnconfigure(0, weight=1) # Make address column expandable

        # Frame for the server addresses - stored as an instance variable
        self.address_frame = ttk.Frame(bottom_frame)
        self.address_frame.grid(row=0, column=0, sticky="w")

        ttk.Label(self.address_frame, text="Server Addresses:").pack(anchor="w")
        ttk.Label(self.address_frame, textvariable=self.appium_url1_var, font=("Segoe UI", 9, "italic")).pack(anchor="w")
        ttk.Label(self.address_frame, textvariable=self.appium_url2_var, font=("Segoe UI", 9, "italic")).pack(anchor="w")
        self.address_frame.grid_remove() # Hide it initially

        self.appium_button = ttk.Button(bottom_frame, text="Start Server", command=self._toggle_appium_server, bootstyle="primary")
        self.appium_button.grid(row=0, column=1, sticky="e")

    def _toggle_appium_server(self):
        """Starts or stops the Appium server."""
        if self.appium_process and self.appium_process.poll() is None:
            # If our process is running, stop it
            self._stop_appium_server()
        else:
            # Otherwise, ensure the port is free and start a new one
            self._start_appium_server()

    def _start_appium_server(self):
        """Ensures port 4723 is free and starts the Appium server."""
        self.appium_button.config(state=DISABLED, text="Starting...")
        
        # Run the kill and start operations in a thread to keep the GUI responsive
        thread = threading.Thread(target=self._run_appium_thread)
        thread.daemon = True
        thread.start()

    def _stop_appium_server(self):
        """Stops the managed Appium server and ensures port 4723 is free."""
        self.appium_button.config(state=DISABLED, text="Stopping...")

        # Run the stop and kill operations in a thread
        thread = threading.Thread(target=self._stop_appium_thread)
        thread.daemon = True
        thread.start()

    def _kill_process_on_port(self, port: int):
        """Finds and forcefully terminates any process running on the specified port."""
        self.root.after(0, self._update_output_text, self.appium_output_text, f"\n--- Checking for processes on port {port} ---\n", False)
        try:
            if sys.platform == "win32":
                command = f"netstat -aon | findstr :{port}"
                process = subprocess.Popen(command, shell=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, encoding='utf-8', errors='replace', creationflags=subprocess.CREATE_NO_WINDOW)
                stdout, stderr = process.communicate()
                
                for line in stdout.strip().splitlines():
                    if 'LISTENING' in line:
                        parts = line.split()
                        pid = parts[-1]
                        self.root.after(0, self._update_output_text, self.appium_output_text, f"Found process with PID {pid} on port {port}. Terminating...\n", False)
                        subprocess.run(f"taskkill /PID {pid} /F", check=True, capture_output=True, creationflags=subprocess.CREATE_NO_WINDOW)
                        self.root.after(0, self._update_output_text, self.appium_output_text, f"Process {pid} terminated.\n", False)

            else:  # macOS and Linux
                command = f"lsof -ti :{port}"
                process = subprocess.Popen(command, shell=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, encoding='utf-8', errors='replace')
                stdout, stderr = process.communicate()

                for pid in stdout.strip().splitlines():
                    self.root.after(0, self._update_output_text, self.appium_output_text, f"Found process with PID {pid} on port {port}. Terminating...\n", False)
                    os.kill(int(pid), signal.SIGKILL)
                    self.root.after(0, self._update_output_text, self.appium_output_text, f"Process {pid} terminated.\n", False)
        except Exception as e:
            self.root.after(0, self._update_output_text, self.appium_output_text, f"Error while trying to kill process on port {port}: {e}\n", False)

    def _run_appium_thread(self):
        """The actual logic for killing old processes and running the new Appium server."""
        # First, ensure the port is free
        self._kill_process_on_port(4723)
        
        # Clear old URLs
        self.root.after(0, self.appium_url1_var.set, "")
        self.root.after(0, self.appium_url2_var.set, "")
        
        # Now, start the new server
        command = "appium --base-path=/wd/hub --relaxed-security"
        self.root.after(0, self._update_output_text, self.appium_output_text, f"Executing command:\n> {command}\n\n", True)
        
        try:
            self.appium_process = subprocess.Popen(
                command,
                shell=True,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                encoding='utf-8',
                errors='replace',
                creationflags=subprocess.CREATE_NEW_PROCESS_GROUP if sys.platform == "win32" else 0,
                preexec_fn=os.setsid if sys.platform != "win32" else None
            )
            self.root.after(0, lambda: self.appium_button.config(state=NORMAL, text="Stop Server", bootstyle="danger"))
            
            # Thread to read and display output
            output_thread = threading.Thread(target=self._pipe_process_output, args=(self.appium_process, self.appium_output_text))
            output_thread.daemon = True
            output_thread.start()

        except FileNotFoundError:
            self.root.after(0, self._update_output_text, self.appium_output_text, "FATAL ERROR: 'appium' command not found.\nPlease ensure Appium is installed and accessible in your system's PATH.", False)
            self.root.after(0, lambda: self.appium_button.config(state=NORMAL, text="Start Server", bootstyle="primary"))
        except Exception as e:
            self.root.after(0, self._update_output_text, self.appium_output_text, f"FATAL ERROR: Failed to start Appium process.\n{e}\n", False)
            self.root.after(0, lambda: self.appium_button.config(state=NORMAL, text="Start Server", bootstyle="primary"))
            
    def _stop_appium_thread(self):
        """The actual logic for stopping the Appium server process."""
        if self.appium_process and self.appium_process.poll() is None:
            self.root.after(0, self._update_output_text, self.appium_output_text, "\n--- Sending stop signal to managed process... ---\n", False)
            try:
                if sys.platform == "win32":
                    os.kill(self.appium_process.pid, signal.CTRL_C_EVENT)
                else:
                    os.killpg(os.getpgid(self.appium_process.pid), signal.SIGINT)
                
                # Wait a moment for graceful shutdown
                time.sleep(2)
            except Exception as e:
                self.root.after(0, self._update_output_text, self.appium_output_text, f"Error sending signal: {e}\n", False)
        
        # Ensure any process on the port is killed
        self._kill_process_on_port(4723)
        
        # Clear URLs, hide frame, and update button
        self.root.after(0, self.appium_url1_var.set, "")
        self.root.after(0, self.appium_url2_var.set, "")
        self.root.after(0, self.address_frame.grid_remove)
        self.root.after(0, lambda: self.appium_button.config(state=NORMAL, text="Start Server", bootstyle="primary"))
        self.root.after(0, self._update_output_text, self.appium_output_text, "\n--- Appium server stopped. ---\n", False)


    def _pipe_process_output(self, process: subprocess.Popen, output_widget: ScrolledText):
        """Reads output from a process and puts it into the GUI widget."""
        url_found_count = 0
        for line in iter(process.stdout.readline, ''):
            self.root.after(0, self._update_output_text, output_widget, line, False)
            
            # Check for server addresses
            if "http://" in line and "/wd/hub" in line:
                match = re.search(r'(http://.+/wd/hub)', line)
                if match:
                    url = match.group(1)
                    # Update the labels on the main thread, filling the first available slot
                    if url_found_count == 0:
                        self.root.after(0, self.appium_url1_var.set, url)
                        # After finding the first URL, show the address frame
                        self.root.after(0, lambda: self.address_frame.grid(row=0, column=0, sticky="w"))
                        url_found_count += 1
                    elif url_found_count == 1 and self.appium_url1_var.get() != url:
                        self.root.after(0, self.appium_url2_var.set, url)
                        url_found_count += 1


        process.stdout.close()
        self.root.after(0, self._update_output_text, output_widget, "\n--- PROCESS FINISHED ---\n", False)
        self.root.after(0, lambda: self.appium_button.config(state=NORMAL, text="Start Server", bootstyle="primary"))
        self.root.after(0, self.appium_url1_var.set, "")
        self.root.after(0, self.appium_url2_var.set, "")
        self.root.after(0, self.address_frame.grid_remove)

    def _create_logs_tab(self, parent: ttk.Notebook):
        """Creates the Test Logs summary tab."""
        logs_tab = ttk.Frame(parent, padding=10)
        parent.add(logs_tab, text="Tests logs")

        # --- Controls Frame ---
        controls_frame = ttk.Frame(logs_tab)
        controls_frame.pack(fill=X, pady=(0, 10))
        controls_frame.columnconfigure(1, weight=1) # Make the middle column expandable

        # --- Grouping Options ---
        self.log_grouping_var = tk.StringVar(value="Combined")
        grouping_frame = ttk.Frame(controls_frame)
        grouping_frame.grid(row=0, column=0, sticky="w")

        ttk.Label(grouping_frame, text="Group by:").pack(side=LEFT, padx=(0, 5))
        
        self.rb_combined = ttk.Radiobutton(grouping_frame, text="Combined", variable=self.log_grouping_var, value="Combined", command=self._refresh_logs_threaded)
        self.rb_combined.pack(side=LEFT)
        
        self.rb_device = ttk.Radiobutton(grouping_frame, text="Device", variable=self.log_grouping_var, value="Device", command=self._refresh_logs_threaded)
        self.rb_device.pack(side=LEFT, padx=5)

        self.rb_suite = ttk.Radiobutton(grouping_frame, text="Suite", variable=self.log_grouping_var, value="Suite", command=self._refresh_logs_threaded)
        self.rb_suite.pack(side=LEFT)

        # --- Loading Indicator ---
        self.logs_progressbar = ttk.Progressbar(controls_frame, mode='determinate', length=150)
        # The progress bar is managed by grid, not here.

        # --- Refresh Button ---
        self.refresh_logs_button = ttk.Button(controls_frame, text="Refresh Logs", command=self._refresh_logs_threaded)
        self.refresh_logs_button.grid(row=0, column=2, sticky="e")

        # --- Treeview Frame ---
        tree_frame = ttk.Frame(logs_tab)
        tree_frame.pack(fill=BOTH, expand=YES)

        self.logs_tree = ttk.Treeview(tree_frame, columns=("total", "pass", "fail"), show="tree headings")
        self.logs_tree.heading("#0", text="Item")
        self.logs_tree.heading("total", text="Total")
        self.logs_tree.heading("pass", text="Pass")
        self.logs_tree.heading("fail", text="Fail")
        
        self.logs_tree.column("#0", width=300)
        self.logs_tree.column("total", width=60, anchor=CENTER)
        self.logs_tree.column("pass", width=60, anchor=CENTER)
        self.logs_tree.column("fail", width=60, anchor=CENTER)

        self.logs_tree.pack(side=LEFT, fill=BOTH, expand=YES)
        
        scrollbar = ttk.Scrollbar(tree_frame, orient=VERTICAL, command=self.logs_tree.yview)
        scrollbar.pack(side=RIGHT, fill=Y)
        self.logs_tree.configure(yscrollcommand=scrollbar.set)

        self._refresh_logs_threaded() # Initial population

    def _refresh_logs_threaded(self):
        """Starts the log parsing in a background thread to keep the GUI responsive."""
        # Disable controls and show progress bar
        self.refresh_logs_button.config(state=DISABLED)
        for rb in [self.rb_combined, self.rb_device, self.rb_suite]:
            rb.config(state=DISABLED)
        
        self.logs_progressbar.grid(row=0, column=1, sticky="ew", padx=10)
        self.logs_progressbar['value'] = 0

        # Clear existing tree
        for i in self.logs_tree.get_children():
            self.logs_tree.delete(i)

        # Start the background thread
        thread = threading.Thread(target=self._parse_logs_thread)
        thread.daemon = True
        thread.start()

    def _parse_logs_thread(self):
        """
        Worker thread: Scans directories and parses XML files.
        This runs in the background.
        """
        parsed_data = []
        if not LOGS_DIR.exists():
            self.root.after(0, self._update_tree_with_data, [])
            return

        # First, find all output.xml files to calculate the total for the progress bar
        xml_files = list(LOGS_DIR.glob("**/output.xml"))
        total_files = len(xml_files)
        
        if total_files == 0:
            self.root.after(0, self._update_tree_with_data, [])
            return

        # Set the maximum value of the progress bar
        self.root.after(0, self.logs_progressbar.config, {'maximum': total_files})

        for i, output_xml in enumerate(xml_files):
            suite_dir = output_xml.parent
            device_dir = suite_dir.parent
            try:
                # Explicitly open with utf-8 encoding
                with open(output_xml, 'r', encoding='utf-8') as f:
                    tree = ET.parse(f)
                root = tree.getroot()
                stats = root.find(".//total/stat")
                if stats is not None:
                    passed = int(stats.attrib.get('pass', 0))
                    failed = int(stats.attrib.get('fail', 0))
                    parsed_data.append({
                        "device": device_dir.name,
                        "suite": suite_dir.name,
                        "pass": passed,
                        "fail": failed
                    })
            except ET.ParseError:
                parsed_data.append({
                    "device": device_dir.name,
                    "suite": f"{suite_dir.name} (XML Error)",
                    "pass": 0,
                    "fail": 0
                })
            
            # Update progress bar on the main thread
            self.root.after(0, self.logs_progressbar.config, {'value': i + 1})
        
        # Schedule the final GUI update to run on the main thread
        self.root.after(100, self._update_tree_with_data, parsed_data)

    def _update_tree_with_data(self, data):
        """
        GUI thread: Receives parsed data and populates the treeview
        based on the selected grouping.
        """
        # Hide progress bar and re-enable controls
        self.logs_progressbar.grid_remove()
        self.refresh_logs_button.config(state=NORMAL)
        for rb in [self.rb_combined, self.rb_device, self.rb_suite]:
            rb.config(state=NORMAL)

        grouping = self.log_grouping_var.get()

        if grouping == "Combined":
            self._render_combined_view(data)
        elif grouping == "Device":
            self._render_by_device_view(data)
        elif grouping == "Suite":
            self._render_by_suite_view(data)

    def _render_combined_view(self, data):
        """Renders the tree with suites nested under devices."""
        self.logs_tree.heading("#0", text="Device / Suite")
        devices = {}
        for item in data:
            device_name = item["device"]
            if device_name not in devices:
                devices[device_name] = self.logs_tree.insert("", END, text=device_name, open=True)
            
            total = item["pass"] + item["fail"]
            self.logs_tree.insert(devices[device_name], END, text=item["suite"], values=(total, item["pass"], item["fail"]))

    def _render_by_device_view(self, data):
        """Renders the tree with aggregated results per device."""
        self.logs_tree.heading("#0", text="Device")
        device_stats = {}
        for item in data:
            device_name = item["device"]
            if device_name not in device_stats:
                device_stats[device_name] = {"pass": 0, "fail": 0}
            device_stats[device_name]["pass"] += item["pass"]
            device_stats[device_name]["fail"] += item["fail"]

        for device, stats in sorted(device_stats.items()):
            total = stats["pass"] + stats["fail"]
            self.logs_tree.insert("", END, text=device, values=(total, stats["pass"], stats["fail"]))

    def _render_by_suite_view(self, data):
        """Renders the tree with aggregated results per suite."""
        self.logs_tree.heading("#0", text="Suite")
        suite_stats = {}
        for item in data:
            # Ignore XML error entries for aggregation
            if "(XML Error)" in item["suite"]:
                continue
            suite_name = item["suite"]
            if suite_name not in suite_stats:
                suite_stats[suite_name] = {"pass": 0, "fail": 0}
            suite_stats[suite_name]["pass"] += item["pass"]
            suite_stats[suite_name]["fail"] += item["fail"]

        for suite, stats in sorted(suite_stats.items()):
            total = stats["pass"] + stats["fail"]
            self.logs_tree.insert("", END, text=suite, values=(total, stats["pass"], stats["fail"]))

    def _create_connect_tab(self, parent: ttk.Notebook):
        """Creates the 'Connect' tab for wireless debugging."""
        connect_tab = ttk.Frame(parent, padding=20)
        parent.add(connect_tab, text="Connect")

        pair_frame = ttk.LabelFrame(connect_tab, text="Pair Device", padding=15)
        pair_frame.pack(fill=X, pady=(0, 20))

        ttk.Label(pair_frame, text="IP Address:").grid(row=0, column=0, padx=5, pady=5, sticky="w")
        self.pair_ip_entry = ttk.Entry(pair_frame, width=30)
        self.pair_ip_entry.grid(row=0, column=1, padx=5, pady=5, sticky="ew")

        ttk.Label(pair_frame, text="Port:").grid(row=1, column=0, padx=5, pady=5, sticky="w")
        self.pair_port_entry = ttk.Entry(pair_frame, width=10)
        self.pair_port_entry.grid(row=1, column=1, padx=5, pady=5, sticky="w")

        ttk.Label(pair_frame, text="Pairing Code:").grid(row=2, column=0, padx=5, pady=5, sticky="w")
        self.pair_code_entry = ttk.Entry(pair_frame, width=10)
        self.pair_code_entry.grid(row=2, column=1, padx=5, pady=5, sticky="w")

        self.pair_button = ttk.Button(pair_frame, text="Pair", command=self._pair_device, bootstyle="primary")
        self.pair_button.grid(row=3, column=1, padx=5, pady=10, sticky="e")
        pair_frame.columnconfigure(1, weight=1)

        connect_frame = ttk.LabelFrame(connect_tab, text="Connect Device", padding=15)
        connect_frame.pack(fill=X, pady=(0, 20))

        ttk.Label(connect_frame, text="IP Address:").grid(row=0, column=0, padx=5, pady=5, sticky="w")
        self.connect_ip_entry = ttk.Entry(connect_frame, width=30)
        self.connect_ip_entry.grid(row=0, column=1, padx=5, pady=5, sticky="ew")

        ttk.Label(connect_frame, text="Port:").grid(row=1, column=0, padx=5, pady=5, sticky="w")
        self.connect_port_entry = ttk.Entry(connect_frame, width=10)
        self.connect_port_entry.grid(row=1, column=1, padx=5, pady=5, sticky="w")

        self.disconnect_button = ttk.Button(connect_frame, text="Disconnect", command=self._disconnect_device, bootstyle="danger-outline")
        self.disconnect_button.grid(row=2, column=0, padx=5, pady=10, sticky="e")
        self.connect_button = ttk.Button(connect_frame, text="Connect", command=self._connect_device, bootstyle="primary")
        self.connect_button.grid(row=2, column=1, padx=5, pady=10, sticky="e")
        connect_frame.columnconfigure(1, weight=1)

        output_frame = ttk.LabelFrame(connect_tab, text="Output", padding=10)
        output_frame.pack(fill=BOTH, expand=YES)
        self.connect_output_text = ScrolledText(output_frame, wrap=WORD, state=DISABLED, autohide=True)
        self.connect_output_text.pack(fill=BOTH, expand=YES)

    def _pair_device(self):
        """Handles the logic for pairing a device."""
        ip = self.pair_ip_entry.get().strip()
        port = self.pair_port_entry.get().strip()
        code = self.pair_code_entry.get().strip()

        if not all([ip, port, code]):
            messagebox.showwarning("Input Required", "Please fill in all fields for pairing.")
            return

        command = f"adb pair {ip}:{port}"
        self._update_output_text(self.connect_output_text, f"Attempting to pair with {ip}:{port}...\n", clear=True)
        self.pair_button.config(state=DISABLED)

        thread = threading.Thread(target=self._run_pair_command_thread, args=(command, code, self.connect_output_text))
        thread.daemon = True
        thread.start()

    def _run_pair_command_thread(self, command: str, code: str, output_widget: ScrolledText):
        """Executes the pairing command in a separate thread."""
        try:
            process = subprocess.Popen(
                command,
                shell=True,
                stdin=subprocess.PIPE,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                encoding='utf-8',
                errors='replace',
                creationflags=subprocess.CREATE_NO_WINDOW if sys.platform == "win32" else 0
            )
            stdout, stderr = process.communicate(input=f"{code}\n")
            
            output = stdout + stderr
            self.root.after(0, self._update_output_text, output_widget, f"Result:\n{output.strip()}", False)

        except Exception as e:
            self.root.after(0, self._update_output_text, output_widget, f"An unexpected error occurred: {e}", False)
        
        finally:
            self.root.after(0, lambda: self.pair_button.config(state=NORMAL))
            self.root.after(100, self._refresh_devices)


    def _connect_device(self):
        """Handles the logic for connecting to a device."""
        ip = self.connect_ip_entry.get().strip()
        port = self.connect_port_entry.get().strip()

        if not all([ip, port]):
            messagebox.showwarning("Input Required", "Please fill in IP Address and Port to connect.")
            return
        
        command = f"adb connect {ip}:{port}"
        self._update_output_text(self.connect_output_text, f"Attempting to connect to {ip}:{port}...\n", clear=True)
        self.connect_button.config(state=DISABLED)

        thread = threading.Thread(target=self._run_command_and_update_gui, args=(command, self.connect_output_text, self.connect_button, True))
        thread.daemon = True
        thread.start()

    def _disconnect_device(self):
        """Handles the logic for connecting to a device."""
        ip = self.connect_ip_entry.get().strip()
        port = self.connect_port_entry.get().strip()

        if not ip and port:
            messagebox.showwarning("Input Required", "Please fill in IP Address to disconnect.")
            return
        elif not port and ip:
            messagebox.showwarning("Input Required", "Please fill in Port to disconnect.")
            return
        elif not all([ip, port]):
            command = "adb disconnect"
        else:
            command = f"adb disconnect {ip}:{port}"
        self._update_output_text(self.connect_output_text, f"Attempting to disconnect...\n", clear=True)
        self.disconnect_button.config(state=DISABLED)

        thread = threading.Thread(target=self._run_command_and_update_gui, args=(command, self.connect_output_text, self.disconnect_button, True))
        thread.daemon = True
        thread.start()

    def _create_about_tab(self, parent: ttk.Notebook):
        """Creates the 'About' tab with project info and credits."""
        about_tab = ttk.Frame(parent, padding=20)
        parent.add(about_tab, text="About")

        ttk.Label(about_tab, text="ADB & Scrcpy Runner", font=("Segoe UI", 18, "bold")).pack(pady=(0, 10))
        description = ("This application provides a graphical user interface for executing common "
                       "Android Debug Bridge (ADB) and Scrcpy commands on connected devices.")
        ttk.Label(about_tab, text=description, wraplength=600, justify=CENTER).pack(pady=(0, 25))

        credits_frame = ttk.LabelFrame(about_tab, text="Acknowledgements", padding=15)
        credits_frame.pack(fill=X, pady=(0, 10))

        credits_text = {
            "Android Debug Bridge (ADB):": "Developed by Google as part of the Android SDK.",
            "Scrcpy:": "An incredible screen mirroring application by Genymobile.",
            "ttkbootstrap:": "A modern theme extension for Tkinter by Israel Dryer.",
            "pywin32:": "Python for Windows Extensions by Mark Hammond."
        }

        for tool, credit in credits_text.items():
            credit_line = ttk.Frame(credits_frame)
            credit_line.pack(fill=X, pady=2)
            ttk.Label(credit_line, text=tool, font=("Segoe UI", 10, "bold")).pack(side=LEFT)
            ttk.Label(credit_line, text=f" {credit}").pack(side=LEFT)
        
        license_frame = ttk.LabelFrame(about_tab, text="License", padding=15)
        license_frame.pack(fill=BOTH, expand=YES, pady=(10, 0))

        license_text_widget = ScrolledText(license_frame, wrap=WORD, height=10, autohide=True)
        license_text_widget.pack(fill=BOTH, expand=YES)
        
        license_content = """MIT License

Copyright (c) 2024 Lucas de Eiroz Rodrigues

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE."""
        
        license_text_widget.insert(END, license_content)
        license_text_widget.text.config(state=DISABLED)
        
        console_frame = ttk.LabelFrame(about_tab, text="Console Output", padding=10)
        console_frame.pack(fill=X, pady=(10, 0))
        self.console_output_text = ScrolledText(console_frame, height=5, wrap=WORD, state=DISABLED, relief=FLAT, borderwidth=5, autohide=True, bootstyle="round")
        self.console_output_text.pack(fill=BOTH, expand=YES)
            
    def _initial_refresh(self):
        self._refresh_devices()

    def _refresh_devices(self):
        self.device_combobox['values'] = []
        self.device_combobox.set("Searching for devices...")
        self.refresh_button.config(state=DISABLED)
        
        thread = threading.Thread(target=self._get_devices_thread)
        thread.daemon = True
        thread.start()

    def _get_devices_thread(self):
        devices = get_connected_devices()
        self.root.after(0, self._update_device_list, devices)

    def _update_device_list(self, devices: List[Tuple[str, str, str]]):
        self.devices_map.clear()
        if devices:
            device_strings = []
            for udid, version, model in devices:
                display_name = f"{model} ({udid})"
                device_strings.append(display_name)
                self.devices_map[display_name] = (udid, version, model)
            
            self.device_combobox['values'] = device_strings
            self.device_combobox.set(device_strings[0])
        else:
            self.device_combobox.set("No devices found")
        self.refresh_button.config(state=NORMAL)
        
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

if __name__ == "__main__":
    if not SUITES_DIR.exists():
        SUITES_DIR.mkdir()
    if not TESTS_DIR.exists():
        TESTS_DIR.mkdir()
    if not LOGS_DIR.exists():
        LOGS_DIR.mkdir()
        
    hide_console()
    root = ttk.Window(themename="darkly")
    app = RobotRunnerApp(root)
    root.mainloop()
