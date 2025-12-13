import datetime
import os
import subprocess
import sys
import threading
import time
import signal
import re
from pathlib import Path
from queue import Empty, Queue
from typing import Dict, List, Optional, Tuple

import tkinter as tk
import ttkbootstrap as ttk
from lxml import etree as ET
from PIL import Image, ImageTk
from ttkbootstrap.constants import BOTH, END, YES, WORD, NORMAL, DISABLED, LEFT, HORIZONTAL, VERTICAL, BOTTOM, TOP, SUNKEN, CENTER, X, W
from ttkbootstrap.scrolled import ScrolledText
from ttkbootstrap.tooltip import ToolTip

from src.app_utils import OUTPUT_ENCODING, execute_command
from src.device_utils import get_device_aspect_ratio, get_device_properties
from src.locales.i18n import gettext as translate
from src.performance_monitor import run_performance_monitor
from src.log_writer import LogWriter

if sys.platform == "win32":
    try:
        import win32con
        import win32gui
    except ImportError:
        # This case is handled in the main app, but as a fallback:
        print("PyWin32 not installed. Scrcpy embedding will not work.")
        win32gui = None


class DeviceTab(ttk.Frame):
    """
    A unified Toplevel window for running tests and mirroring devices.
    Features a three-pane layout: Outputs, Controls, and Screen Mirror.
    """
    def __init__(self, parent_notebook, parent_app, udid: str, mode: str, run_path: Optional[str] = None, title: Optional[str] = None, run_mode: Optional[str] = None):
        super().__init__(parent_notebook)
        self.parent_app = parent_app
        self.udid = udid
        self.mode = mode
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
        self.scrcpy_process = None
        self.scrcpy_hwnd = None
        self.aspect_ratio = None
        self.resize_job = None
        self.is_recording = False
        self.recording_process = None
        self.last_width, self.last_height = 0, 0
        self.recording_device_path = ""
        self.scrcpy_output_is_visible = False
        self.scrcpy_output_queue = Queue()

        self.center_pane_width = 150 # Default width
        # --- Performance Monitor Attributes ---
        self.performance_monitor_is_visible = False
        self.is_monitoring = False
        self.performance_thread = None
        self.stop_monitoring_event = threading.Event()
        self.performance_output_queue = Queue()
        self.performance_log_file = None
        self.performance_monitor_is_minimized = ttk.BooleanVar(value=False)
        self.last_performance_line_var = ttk.StringVar()

        # --- Package Logging Attributes ---
        self.package_log_is_visible = False
        self.is_logging_package = False
        self.package_log_thread = None
        self.stop_package_log_event = threading.Event()
        self.package_log_output_queue = Queue()
        self.package_log_file: Optional[Path] = None
        
        # Async Log Writer
        self.log_writer = LogWriter()
        self.log_writer.start()
        self.package_log_level_var = ttk.StringVar(value="Debug")
        self.clear_logcat_before_start_var = ttk.BooleanVar(value=True)
        self.LOG_LEVELS = {
            "Verbose": "V", "Debug": "D", "Info": "I", "Warning": "W", "Error": "E"
        }
        
        # --- Window Setup ---
        device_info = get_device_properties(self.udid) or {}
        device_model = device_info.get('model', 'Unknown')
        device_version = device_info.get('release', '')

        # Use the provided title, or generate one based on the mode.
        window_title = title or translate("running_title", suite=Path(run_path).name, version=device_version, model=device_model)
        # self.title(window_title) # Title is handled by the tab manager
        # self.state('zoomed')  # Maximiza a janela na inicialização - Not needed for Frame

        self.bind("<Configure>", self._on_window_resize)
        self.bind("<Configure>", self._on_window_resize)
        # self.protocol("WM_DELETE_WINDOW", self._on_close) # Not needed for Frame


        self._initialize_ui()

    def _initialize_ui(self):
        """Initializes the UI components."""
        self._setup_widgets()

        if self.mode == 'test':
            self._start_test()

        self.after(100, self._check_robot_output_queue)
        self.after(100, self._check_scrcpy_output_queue)
        self.after(100, self._check_performance_output_queue)
        self.after(100, self._check_package_log_queue)

    def _setup_widgets(self):
        """Sets up the 3-pane widget layout for the window."""
        self.main_paned_window = ttk.Panedwindow(self, orient=HORIZONTAL)
        self.main_paned_window.pack(fill=BOTH, expand=YES)

        # --- Status Bar ---
        self.status_bar = ttk.Frame(self, padding=(5, 2), relief=SUNKEN)
        self.status_bar.pack(side=BOTTOM, fill=X, padx=5, pady=(0, 5))
        self.status_var = tk.StringVar()
        self.status_label = ttk.Label(self.status_bar, textvariable=self.status_var, anchor=W)
        self.status_label.pack(side=LEFT, fill=X, expand=YES)
        # --- 1. Left Pane (Outputs) ---
        self.left_pane_container = ttk.Frame(self.main_paned_window, padding=5)
        self.output_paned_window = ttk.Panedwindow(self.left_pane_container, orient=VERTICAL)
        self.placeholder_frame = ttk.Frame(self.left_pane_container)
        placeholder_label = ttk.Label(self.placeholder_frame, text=translate("select_output_placeholder"), justify=CENTER, anchor=CENTER, wraplength=300)
        placeholder_label.pack(fill=BOTH, expand=YES, padx=20, pady=20)

        # --- 2. Center Pane (Controls) ---
        self.center_pane_container = ttk.Frame(self.main_paned_window, padding=10)
        self._setup_center_pane_controls()

        # --- Panes inside Left Pane ---
        self._setup_left_pane_outputs()

        # --- 3. Right Pane (Screen Mirror) ---
        self.right_pane_container = ttk.Frame(self.main_paned_window, padding=5)
        self.embed_frame = self.right_pane_container

        # --- Add panes and set initial state ---
        self.main_paned_window.add(self.left_pane_container, weight=3)
        self.main_paned_window.add(self.center_pane_container, weight=0)

        self._update_left_pane_visibility()

        if self.mode == 'mirror':
             self.after(100, lambda: self.main_paned_window.sashpos(0, 0))
        
        self.after(50, self._set_center_pane_width)

    def _set_center_pane_width(self):
        """Sets the center pane width after the window is fully drawn."""
        if not self.winfo_exists(): return
        self.center_pane_container.update_idletasks() # Ensure widgets are drawn
        width = self.center_pane_container.winfo_width()
        if width > 1: self.center_pane_width = width

    def _setup_center_pane_controls(self):
        """Sets up the control buttons in the center pane."""
        self.mirror_button = ttk.Button(self.center_pane_container, text=translate("start_mirroring"), command=self._toggle_mirroring, bootstyle="info")
        self.mirror_button.pack(fill=X, pady=5, padx=5)
        ToolTip(self.mirror_button, translate("start_mirroring_tooltip"))

        self.screenshot_button = ttk.Button(self.center_pane_container, text=translate("take_screenshot"), command=self._take_screenshot)
        self.screenshot_button.pack(fill=X, pady=5, padx=5)
        ToolTip(self.screenshot_button, translate("screenshot_tooltip"))
        
        self.record_button = ttk.Button(self.center_pane_container, text=translate("start_recording"), command=self._toggle_recording, bootstyle="primary")
        self.record_button.pack(fill=X, pady=5, padx=5)
        ToolTip(self.record_button, translate("start_recording_tooltip"))

        self.toggle_scrcpy_out_button = ttk.Button(self.center_pane_container, text=translate("show_scrcpy_output"), command=lambda: self._toggle_output_visibility('scrcpy'), bootstyle="secondary")
        self.toggle_scrcpy_out_button.pack(fill=X, pady=5, padx=5)
        ToolTip(self.toggle_scrcpy_out_button, text=translate("show_scrcpy_output_tooltip"))
        
        self.toggle_perf_button = ttk.Button(self.center_pane_container, text=translate("show_performance"), command=lambda: self._toggle_output_visibility('performance'), bootstyle="secondary")
        self.toggle_perf_button.pack(fill=X, pady=5, padx=5)
        ToolTip(self.toggle_perf_button, text=translate("show_performance_tooltip"))
        
        self.toggle_package_log_button = ttk.Button(self.center_pane_container, text=translate("show_package_log"), command=lambda: self._toggle_output_visibility('package_log'), bootstyle="secondary")
        self.toggle_package_log_button.pack(fill=X, pady=5, padx=5)
        ToolTip(self.toggle_package_log_button, text=translate("show_package_log_tooltip"))

        if self.mode == 'test':
            self._setup_test_mode_center_pane()
        elif self.mode == 'toolbox':
            # Toolbox might want a close button too
            self.close_button = ttk.Button(self.center_pane_container, text=translate("close"), command=self._on_close)
            self.close_button.pack(fill=X, pady=5, padx=5)
            ToolTip(self.close_button, text=translate("close_window_tooltip"))

    def _setup_test_mode_center_pane(self):
        """Sets up test-mode-specific controls in the center pane."""
        self.toggle_robot_button = ttk.Button(self.center_pane_container, text=translate("hide_test_output"), command=lambda: self._toggle_output_visibility('robot'), bootstyle="secondary")
        self.toggle_robot_button.pack(fill=X, pady=5, padx=5)
        ToolTip(self.toggle_robot_button, text=translate("hide_robot_output_tooltip"))

        self.repeat_test_button = ttk.Button(self.center_pane_container, text=translate("repeat_test"), command=self._repeat_test)
        ToolTip(self.repeat_test_button, text=translate("repeat_test_tooltip"))
        self.close_button = ttk.Button(self.center_pane_container, text=translate("close"), command=self._on_close)
        ToolTip(self.close_button, text=translate("close_window_tooltip"))

        self.stop_test_button = ttk.Button(self.center_pane_container, text=translate("stop_test"), bootstyle="danger", command=self._stop_test)
        self.stop_test_button.pack(fill=X, pady=5, padx=5)
        ToolTip(self.stop_test_button, text=translate("stop_test_tooltip"))

    def _setup_left_pane_outputs(self):
        """Sets up the various output frames in the left pane."""
        if self.mode == 'test':
            self.robot_output_frame = ttk.Frame(self.output_paned_window, padding=5)
            self.robot_output_text = ScrolledText(self.robot_output_frame, wrap=WORD, state=DISABLED, autohide=False)
            self.robot_output_text.pack(fill=BOTH, expand=YES)
            self.robot_output_text.text.tag_config("PASS", foreground="green")
            self.robot_output_text.text.tag_config("FAIL", foreground="red")
            self.robot_output_text.text.tag_config("LINK", foreground="cyan", underline=True)
            self.output_paned_window.add(self.robot_output_frame, weight=1)

        self.scrcpy_output_frame = ttk.Frame(self.output_paned_window, padding=5)
        self.scrcpy_output_text = ScrolledText(self.scrcpy_output_frame, wrap=WORD, state=DISABLED, autohide=False)
        self.scrcpy_output_text.pack(fill=BOTH, expand=YES)

        self._setup_performance_output_frame()
        self._setup_package_log_output_frame()

    def _setup_performance_output_frame(self):
        """Sets up the performance monitor output and controls."""
        self.performance_output_frame = ttk.Frame(self.output_paned_window, padding=5)
        controls_frame = ttk.Frame(self.performance_output_frame)
        controls_frame.pack(side=TOP, fill=X, pady=(0, 5), padx=5)
        controls_frame.columnconfigure(0, weight=1)

        self.performance_output_text = ScrolledText(self.performance_output_frame, wrap=WORD, state=DISABLED, autohide=False)
        self.performance_output_text.pack(fill=BOTH, expand=YES, padx=5, pady=(0,5))
        self.minimized_performance_label = ttk.Label(self.performance_output_frame, textvariable=self.last_performance_line_var, font=("Courier", 9))
        
        ttk.Label(controls_frame, text=translate("app_package")).grid(row=0, column=0, columnspan=3, sticky=W, pady=(0,2))
        self.app_package_combo = ttk.Combobox(controls_frame, values=self.parent_app.app_packages_var.get().split(','))
        self.app_package_combo.grid(row=1, column=0, columnspan=3, sticky="ew", pady=(0, 5))
        if self.app_package_combo['values']: self.app_package_combo.set(self.app_package_combo['values'][0])
        ToolTip(self.app_package_combo, text=translate("select_app_to_monitor_tooltip"))

        self.monitor_button = ttk.Button(controls_frame, text=translate("start_monitoring"), command=self._toggle_performance_monitor, bootstyle="success")
        self.monitor_button.grid(row=2, column=0, columnspan=2, sticky="ew", padx=(0, 2))
        ToolTip(self.monitor_button, text=translate("start_monitoring_tooltip"))
        
        self.toggle_minimize_perf_button = ttk.Button(controls_frame, text=translate("minimize_performance"), command=self._toggle_performance_minimize, state=DISABLED, bootstyle="secondary")
        self.toggle_minimize_perf_button.grid(row=2, column=2, sticky="ew", padx=(5,0))
        ToolTip(self.toggle_minimize_perf_button, text=translate("minimize_performance_tooltip"))

    def _setup_package_log_output_frame(self):
        """Sets up the package-specific logcat output and controls."""
        self.package_log_output_frame = ttk.Frame(self.output_paned_window, padding=5)
        controls_frame = ttk.Frame(self.package_log_output_frame)
        controls_frame.pack(side=TOP, fill=X, pady=(0, 5))
        controls_frame.columnconfigure(1, weight=1) # Allow package combo to expand

        self.package_log_output_text = ScrolledText(self.package_log_output_frame, wrap=WORD, state=DISABLED, autohide=False)
        self.package_log_output_text.pack(fill=BOTH, expand=YES, padx=5, pady=(0,5))

        # Row 0: Labels
        ttk.Label(controls_frame, text=translate("app_package")).grid(row=0, column=0, columnspan=2, sticky="w", padx=5)
        ttk.Label(controls_frame, text=translate("log_level")).grid(row=0, column=2, sticky="w", padx=5)

        # Row 1: Comboboxes and Button
        packages = self.parent_app.app_packages_var.get().split(',')
        all_option = translate('all_packages_option')
        self.package_log_combo = ttk.Combobox(controls_frame, values=[all_option] + packages, state="readonly", width=20)
        self.package_log_combo.grid(row=1, column=0, columnspan=2, sticky="ew", padx=5)
        self.package_log_combo.set(self.package_log_combo['values'][0])
        self.package_log_level_combo = ttk.Combobox(controls_frame, textvariable=self.package_log_level_var, values=list(self.LOG_LEVELS.keys()), state="readonly", width=10)
        self.package_log_level_combo.grid(row=1, column=2, sticky="ew", padx=5)
        self.log_package_button = ttk.Button(controls_frame, text=translate("start_logging"), command=self._toggle_package_logging, bootstyle="success")
        self.log_package_button.grid(row=1, column=3, sticky="e", padx=5)

        # Row 2: Clear logcat checkbox
        clear_logcat_check = ttk.Checkbutton(controls_frame, text=translate("clear_logcat_on_start"), variable=self.clear_logcat_before_start_var, bootstyle="round-toggle")
        clear_logcat_check.grid(row=2, column=0, columnspan=4, sticky="w", padx=5, pady=(5,0))
        ToolTip(clear_logcat_check, translate("clear_logcat_on_start_tooltip"))

    # --- Visibility & Layout Toggles ---
    def _update_left_pane_visibility(self):
        """Shows/hides the placeholder in the left pane based on content."""
        if not self.output_paned_window.panes():
            self.output_paned_window.pack_forget()
            self.placeholder_frame.pack(in_=self.left_pane_container, fill=BOTH, expand=YES)
        else:
            self.placeholder_frame.pack_forget()
            self.output_paned_window.pack(in_=self.left_pane_container, fill=BOTH, expand=YES)

    def _toggle_output_visibility(self, output_type: str):
        """Shows or hides a specific output frame in the left pane."""
        frame_map = {
            'scrcpy': (self.scrcpy_output_frame, self.toggle_scrcpy_out_button, self.scrcpy_output_is_visible),
            'performance': (self.performance_output_frame, self.toggle_perf_button, self.performance_monitor_is_visible),
            'package_log': (self.package_log_output_frame, self.toggle_package_log_button, self.package_log_is_visible)
        }
        if self.mode == 'test':
            frame_map['robot'] = (self.robot_output_frame, self.toggle_robot_button, self.robot_output_is_visible)
        
        if output_type not in frame_map: return
        
        frame, button, is_visible = frame_map[output_type]
        
        show_keys = {'robot': 'show_test_output', 'scrcpy': 'show_scrcpy_output', 'performance': 'show_performance', 'package_log': 'show_package_log'}
        hide_keys = {'robot': 'hide_test_output', 'scrcpy': 'hide_scrcpy_output', 'performance': 'hide_performance', 'package_log': 'hide_package_log'}

        if is_visible:
            self.output_paned_window.forget(frame)
            button.config(text=translate(show_keys[output_type]))
        else:
            self.output_paned_window.add(frame, weight=1)
            button.config(text=translate(hide_keys[output_type]))

        # Update state variable
        if output_type == 'robot': self.robot_output_is_visible = not is_visible
        elif output_type == 'scrcpy': self.scrcpy_output_is_visible = not is_visible
        elif output_type == 'performance': self.performance_monitor_is_visible = not is_visible
        elif output_type == 'package_log': self.package_log_is_visible = not is_visible

        self._update_left_pane_visibility()
        self.after(10, self._apply_layout_rules)
        self._on_window_resize()

    def _apply_layout_rules(self, event=None):
        """Applies layout rules to set sash positions based on visible panes."""
        self.resize_job = None
        if not self.winfo_exists(): return

        self.update_idletasks()
        total_width = self.main_paned_window.winfo_width()
        if total_width <= 1: return

        is_right_visible = len(self.main_paned_window.panes()) == 3
        is_left_visible = bool(self.output_paned_window.panes())
        
        min_pane_width = 150

        try:
            # --- Rule 1: Right pane has priority ---
            ideal_right_width = 0
            if is_right_visible and self.aspect_ratio:
                ideal_right_width = int(self.winfo_height() * self.aspect_ratio)
                if ideal_right_width < min_pane_width: ideal_right_width = min_pane_width

            # --- Distribute remaining space ---
            remaining_width = total_width - ideal_right_width
            left_width = 0
            center_width = 0

            if is_left_visible: # Left and Center are visible
                # Rule 1.1 & 2: Left gets 2/3, Center gets 1/3 of the remaining space
                left_width = int(remaining_width * (2/3))
                center_width = remaining_width - left_width
            else: # Only Center is visible (besides the possible Right pane)
                # Rule 1.2 & 3: Center takes all remaining space
                center_width = remaining_width

            # --- Enforce minimum widths to prevent panes from disappearing ---
            if is_left_visible and left_width < min_pane_width:
                left_width = min_pane_width
                center_width = remaining_width - left_width
            if center_width < self.center_pane_width: # Center should at least have its default width
                center_width = self.center_pane_width
                if is_left_visible:
                    left_width = remaining_width - center_width
            if left_width < 0: left_width = 0

            # --- Apply Sash Positions ---
            self.main_paned_window.sashpos(0, left_width)
            if is_right_visible:
                self.main_paned_window.sashpos(1, left_width + center_width)

        except (tk.TclError, ValueError):
            pass

    def _on_window_resize(self, event=None):
        """Debounces resize events to adjust layout."""
        current_width, current_height = self.winfo_width(), self.winfo_height()
        if current_width == self.last_width and current_height == self.last_height: return
        self.last_width, self.last_height = current_width, current_height

        if self.resize_job: self.after_cancel(self.resize_job)
        self.resize_job = self.after(150, self._apply_layout_rules)

    # --- Scrcpy Core Methods ---
    def _toggle_mirroring(self):
        if self.is_mirroring: self._stop_scrcpy()
        else:
            self.set_aspect_ratio()

    def set_aspect_ratio(self):
        """Calculates aspect ratio and then starts mirroring."""
        if self.is_mirroring: return
        self.scrcpy_output_queue.put(translate("calculating_aspect_ratio") + "\n")
        self.mirror_button.config(state=DISABLED)
        threading.Thread(target=self._calculate_and_start_mirroring, daemon=True).start()

    def _calculate_and_start_mirroring(self):
        """Worker thread to get aspect ratio and trigger mirroring."""
        ratio = get_device_aspect_ratio(self.udid)
        if ratio:
            self.aspect_ratio = ratio
            self.scrcpy_output_queue.put(f"INFO: {translate('aspect_ratio_calculated')}: {ratio:.4f}\n")
            self.after(0, self._start_mirroring_after_aspect_ratio)
        else:
            self.scrcpy_output_queue.put(f"WARNING: {translate('aspect_ratio_error')}\n")
            self.after(0, lambda: self.mirror_button.config(state=NORMAL))

    def _start_mirroring_after_aspect_ratio(self):
        """Starts the scrcpy process on the main thread."""
        if self.is_mirroring: return
        self.is_mirroring = True

        self.main_paned_window.add(self.right_pane_container, weight=5)
        self.update_idletasks()
        self.after(10, self._apply_layout_rules)
        self._on_window_resize() # Trigger layout recalculation with the new aspect ratio

        self.mirror_button.config(state=NORMAL, text=translate("stop_mirroring"), bootstyle="danger")
        ToolTip(self.mirror_button, text=translate("stop_mirroring_tooltip"))

        threading.Thread(target=self._run_and_embed_scrcpy, args=(self.embed_frame.winfo_id(),), daemon=True).start()

    def _stop_scrcpy(self):
        """Stops the scrcpy process."""
        if not self.is_mirroring: return
        self.is_mirroring = False

        if self.scrcpy_hwnd: self.embed_frame.unbind("<Configure>")
        self.scrcpy_hwnd = None

        self.main_paned_window.forget(self.right_pane_container)
        self.after(10, self._apply_layout_rules)

        self.mirror_button.config(text=translate("start_mirroring"), bootstyle="info")
        ToolTip(self.mirror_button, text=translate("start_mirroring_tooltip"))
        
        if self.scrcpy_process and self.scrcpy_process.poll() is None:
            self._terminate_process_tree(self.scrcpy_process.pid, "scrcpy")
            self.scrcpy_output_queue.put(translate("scrcpy_stopped_by_user") + "\n")

        self.scrcpy_process = None

    # --- Scrcpy Feature Methods ---
    def _run_and_embed_scrcpy(self, container_id: int):
        """Runs scrcpy, captures output, and embeds its window."""
        try:
            cmd_template = self.parent_app.scrcpy_path_var.get() + " -s {udid} --window-title=\"{title}\""
            self.unique_title = f"scrcpy_{int(time.time() * 1000)}"
            scrcpy_opt = self.parent_app.scrcpy_options_var.get()
            command = f'{cmd_template.format(udid=self.udid, title=self.unique_title)} {scrcpy_opt}'
            creationflags = subprocess.CREATE_NO_WINDOW if sys.platform == "win32" else 0
            
            self.scrcpy_process = subprocess.Popen(command, shell=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, encoding=OUTPUT_ENCODING, errors='replace', creationflags=creationflags)
            threading.Thread(target=self._pipe_scrcpy_output_to_queue, daemon=True).start()
            
            # Give scrcpy a moment to initialize, especially on the first run. This helps prevent race conditions.
            time.sleep(1)
            if sys.platform == "win32": self._find_and_embed_window(container_id)
        except Exception as e:
            self.scrcpy_output_queue.put(translate("scrcpy_start_error", error=e) + "\n")
            self.after(0, self._stop_scrcpy)

    def _pipe_scrcpy_output_to_queue(self):
        if not self.scrcpy_process or not self.scrcpy_process.stdout: return
        for line in iter(self.scrcpy_process.stdout.readline, ''): self.scrcpy_output_queue.put(line)
        try: self.scrcpy_process.stdout.close()
        except (IOError, AttributeError): pass

    def _check_scrcpy_output_queue(self):
        lines = []
        while not self.scrcpy_output_queue.empty():
            try: lines.append(self.scrcpy_output_queue.get_nowait())
            except Empty: pass
        if lines:
            self.scrcpy_output_text.text.config(state=NORMAL)
            self.scrcpy_output_text.text.insert(END, "".join(lines))
            self.scrcpy_output_text.text.see(END)
            self.scrcpy_output_text.text.config(state=DISABLED)
            # Update status bar with the last non-empty line
            last_line = next((line.strip() for line in reversed(lines) if line.strip()), None)
            if last_line: self.status_var.set(last_line)
        if self.is_mirroring and self.scrcpy_process and self.scrcpy_process.poll() is not None:
             self.scrcpy_output_queue.put(f"\n{translate('scrcpy_terminated_unexpectedly')}\n")
             self._stop_scrcpy()
        self.after(500, self._check_scrcpy_output_queue)

    def _find_and_embed_window(self, container_id: int):
        start_time = time.time()
        while time.time() - start_time < 30: # Increased timeout for slower connections
            if not self.is_mirroring: return
            hwnd = win32gui.FindWindow(None, self.unique_title)
            if hwnd:
                self.scrcpy_hwnd = hwnd
                self.after(0, self._embed_window, container_id)
                return
            time.sleep(0.2)
        self.scrcpy_output_queue.put(translate("scrcpy_find_window_error", title=self.unique_title) + "\n")
        self.after(0, self._stop_scrcpy)

    def _embed_window(self, container_id: int):
        if not self.scrcpy_hwnd or not self.is_mirroring or not win32gui: return
        
        # Wait for the container to be fully realized by the window manager
        if not container_id or container_id == 0:
            self.after(50, self._embed_window, self.embed_frame.winfo_id())
            return

        try:
            # win32con is imported at the top of the file if win32gui is available
            if not win32gui.IsWindow(self.scrcpy_hwnd):
                self.scrcpy_output_queue.put(translate("scrcpy_embed_error_invalid_handle") + "\n")
                return
            win32gui.SetParent(self.scrcpy_hwnd, container_id)
            style = win32gui.GetWindowLong(self.scrcpy_hwnd, win32con.GWL_STYLE)
            new_style = style & ~win32con.WS_CAPTION & ~win32con.WS_THICKFRAME
            win32gui.SetWindowLong(self.scrcpy_hwnd, win32con.GWL_STYLE, new_style)
            self.embed_frame.update_idletasks()
            win32gui.MoveWindow(self.scrcpy_hwnd, 0, 0, self.embed_frame.winfo_width(), self.embed_frame.winfo_height(), True) # type: ignore
            self.embed_frame.bind("<Configure>", self._resize_child)
            self.scrcpy_output_queue.put(translate("scrcpy_embedded_info", hwnd=self.scrcpy_hwnd) + "\n")
        except win32gui.error as e: self.scrcpy_output_queue.put(translate("scrcpy_embed_error_win32", error=e) + "\n")

    def _resize_child(self, event): # type: ignore
        if self.scrcpy_hwnd and win32gui:
            try: win32gui.MoveWindow(self.scrcpy_hwnd, 0, 0, event.width, event.height, True)
            except win32gui.error as e:
                if e.winerror == 1400:
                    self.scrcpy_hwnd = None
                    self.embed_frame.unbind("<Configure>")
                else: raise

    def _take_screenshot(self):
        self.screenshot_button.config(state=DISABLED, text=translate("taking_screenshot"))
        threading.Thread(target=self._take_screenshot_thread, daemon=True).start()

    def _take_screenshot_thread(self):
        screenshots_dir = self.parent_app.screenshots_dir
        screenshots_dir.mkdir(exist_ok=True)
        timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
        dev_path, local_path = "/sdcard/screenshot.png", screenshots_dir / f"screenshot_{self.udid.replace(':', '-')}_{timestamp}.png"
        try:
            # Use persistent shell for creation
            self.parent_app.shell_manager.execute(self.udid, f"screencap -p {dev_path}")
            
            # Pull must still be done via ADB normal command
            if execute_command(f"adb -s {self.udid} pull {dev_path} \"{local_path}\"")[0]:
                self.parent_app.show_toast(translate("success_title"), translate("screenshot_saved_success", path=local_path), bootstyle="success")
                self.scrcpy_output_queue.put(f"{translate('screenshot_saved_success', path=local_path)}\n")
            else: 
                self.parent_app.show_toast(translate("error_title"), translate("capture_screenshot_error"), bootstyle="danger")
                self.scrcpy_output_queue.put(f"{translate('capture_screenshot_error')}\n")
            
            # Use persistent shell for cleanup
            self.parent_app.shell_manager.execute(self.udid, f"rm {dev_path}")
        finally:
            self.after(0, lambda: self.screenshot_button.config(state=NORMAL, text=translate("take_screenshot")))

    def _toggle_recording(self):
        if not self.is_recording: self._start_recording()
        else: self._stop_recording()

    def _start_recording(self):
        self.record_button.config(state=DISABLED, text=translate("starting_recording"))
        threading.Thread(target=self._start_recording_thread, daemon=True).start()

    def _start_recording_thread(self):
        recordings_dir = self.parent_app.recordings_dir
        recordings_dir.mkdir(exist_ok=True)
        self.recording_device_path = f"/sdcard/recording_{datetime.datetime.now().strftime('%Y%m%d_%H%M%S')}.mp4"
        command = ["adb", "-s", self.udid, "shell", "screenrecord", self.recording_device_path] # type: ignore
        self.scrcpy_output_queue.put(translate("recording_start_info", command=' '.join(command)) + "\n")
        try:
            self.recording_process = subprocess.Popen(command, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, encoding=OUTPUT_ENCODING, errors='replace', creationflags=subprocess.CREATE_NO_WINDOW if sys.platform == "win32" else 0)
            self.after(0, self._update_recording_ui, True)
        except Exception as e:
            self.scrcpy_output_queue.put(translate("recording_start_error", error=e) + "\n")
            self.after(0, self._update_recording_ui, False)

    def _stop_recording(self):
        self.record_button.config(state=DISABLED, text=translate("stopping_recording"))
        threading.Thread(target=self._stop_recording_thread, daemon=True).start()

    def _stop_recording_thread(self):
        if not self.recording_process or self.recording_process.poll() is not None:
            self.scrcpy_output_queue.put(translate("no_active_recording_error") + "\n")
            self.after(0, self._update_recording_ui, False)
            return
        try:
            self.recording_process.kill()
            self.scrcpy_output_queue.put(translate("recording_stopped_saving_info") + "\n")
        except Exception as e: self.scrcpy_output_queue.put(translate("recording_stop_error", error=e) + "\n")
        time.sleep(2)
        local_path = self.parent_app.recordings_dir / f"{self.udid.replace(':', '-')}_{Path(self.recording_device_path).name}"
        if execute_command(f"adb -s {self.udid} pull {self.recording_device_path} \"{local_path}\"")[0]:
            self.parent_app.show_toast(translate("success_title"), translate("recording_saved_success", path=local_path), bootstyle="success")
            self.scrcpy_output_queue.put(f"{translate('recording_saved_success', path=local_path)}\n")
        else: 
            self.parent_app.show_toast(translate("error_title"), translate("pull_recording_error"), bootstyle="danger")
            self.scrcpy_output_queue.put(f"{translate('pull_recording_error')}\n")
        execute_command(f"adb -s {self.udid} shell rm {self.recording_device_path}")
        self.after(0, self._update_recording_ui, False)

    def _update_recording_ui(self, is_recording: bool):
        self.is_recording = is_recording
        if is_recording: self.record_button.config(text=translate("stop_recording"), bootstyle="danger")
        else: self.record_button.config(text=translate("start_recording"), bootstyle="primary")
        self.record_button.config(state=NORMAL)

    # --- Performance Monitor Methods ---
    def _toggle_performance_monitor(self):
        if self.is_monitoring: self._stop_performance_monitor()
        else: self.after(0, self._start_performance_monitor)

    def _start_performance_monitor(self):
        if not (app_package := self.app_package_combo.get()):
            self.parent_app.show_toast(translate("input_error"), translate("select_app_package_warning"), bootstyle="warning")
            return
        self.is_monitoring = True
        self.stop_monitoring_event.clear()
        self.monitor_button.config(text=translate("stop_monitoring"), bootstyle="danger")
        self.toggle_minimize_perf_button.config(state=NORMAL)
        self.app_package_combo.config(state=DISABLED)
        self.performance_output_text.text.config(state=NORMAL)
        self.performance_output_text.text.delete("1.0", END)
        self.performance_output_text.text.config(state=DISABLED)
        self.last_performance_line_var.set("")
        log_dir = self.parent_app.logs_dir
        log_dir.mkdir(exist_ok=True)
        self.performance_log_file = log_dir / f"performance_log_{app_package.split('.')[-1]}_{self.udid.replace(':', '-')}.txt"
        self.performance_thread = threading.Thread(target=run_performance_monitor, args=(self.parent_app.shell_manager, self.udid, app_package, self.performance_output_queue, self.stop_monitoring_event), daemon=True)
        self.performance_thread.start()
        
    def _stop_performance_monitor(self):
        if self.is_monitoring:
            self.parent_app.shell_manager.close(self.udid)
            self.stop_monitoring_event.set()
            self.is_monitoring = False
            self.monitor_button.config(text=translate("start_monitoring"), bootstyle="success")
            self.toggle_minimize_perf_button.config(state=DISABLED)
            self._toggle_performance_minimize(force_maximize=True) # Ensure view is maximized
            self.app_package_combo.config(state="readonly")
            self.performance_output_queue.put(f"\n{translate('monitoring_stopped_by_user')}\n")
            self.last_performance_line_var.set("")

    def _check_performance_output_queue(self):
        items = []
        max_batch = 100
        count = 0
        while not self.performance_output_queue.empty() and count < max_batch:
            try: 
                items.append(self.performance_output_queue.get_nowait())
                count += 1
            except Empty: pass
            
        if items:
            log_batch = []
            self.performance_output_text.text.config(state=NORMAL)
            for item in items:
                line = ""
                if isinstance(item, dict):
                    line = f"{item['ts']:<10} | {item['elapsed']:<10} | CPU: {item['cpu']:<5} | RAM: {item['ram']:<7} | GPU: {item['gpu']:<10} | Missed Vsync: {item['vsync']:<1} | Janky: {item['janky']:<15} | FPS: {item['fps']:<4}\n"
                    self.last_performance_line_var.set(f"CPU:{item['cpu']}% RAM:{item['ram']}MB GPU:{item['gpu']}KB Janky:{item['janky'].split(' ')[0]} FPS:{item['fps']}")
                elif isinstance(item, str):
                    line = item
                    if translate('monitoring_stopped_by_user') in item: self.last_performance_line_var.set("")
                log_batch.append(line)
            
            self.performance_output_text.text.insert(END, "".join(log_batch))
            
            # Truncate
            max_lines = 2000
            num_lines = int(self.performance_output_text.text.index('end-1c').split('.')[0])
            if num_lines > max_lines:
                 self.performance_output_text.text.delete("1.0", f"{num_lines - max_lines}.0")

            self.performance_output_text.text.see(END)
            self.performance_output_text.text.config(state=DISABLED)
            if self.performance_log_file:
                self.log_writer.write(self.performance_log_file, "".join(log_batch), encoding=OUTPUT_ENCODING)
        
        if self.is_monitoring and (not self.performance_thread or not self.performance_thread.is_alive()): self._stop_performance_monitor()
        self.after(500, self._check_performance_output_queue)

    def _toggle_performance_minimize(self, force_maximize: bool = False):
        """Toggles the performance monitor view."""
        is_minimized = self.performance_monitor_is_minimized.get()
        if force_maximize:
            is_minimized = True # Force the "if is_minimized" block to run

        if is_minimized:
            self.minimized_performance_label.pack_forget()
            self.performance_output_text.pack(fill=BOTH, expand=YES, padx=5, pady=(0,5))
            self.toggle_minimize_perf_button.config(text=translate("minimize_performance"))
        else:
            self.performance_output_text.pack_forget()
            self.minimized_performance_label.pack(fill=X, padx=5, pady=5)
            self.toggle_minimize_perf_button.config(text=translate("maximize_performance"))
        self.performance_monitor_is_minimized.set(not is_minimized)

    # --- Package Logging Methods ---
    def _toggle_package_logging(self):
        """Starts or stops logging for a specific package."""
        if self.is_logging_package:
            self._stop_package_logging()
        else:
            self._start_package_logging()

    def _start_package_logging(self):
        """Starts the logcat thread for the selected package."""
        if not (app_package := self.package_log_combo.get()):
            self.parent_app.show_toast(translate("input_error"), translate("select_app_package_warning"), bootstyle="warning")
            return
        
        app_package = app_package.strip() # Sanitize input
        
        log_level_name = self.package_log_level_var.get()
        log_level_code = self.LOG_LEVELS.get(log_level_name, "D") # Default to Debug

        # Clear logcat if the option is selected
        if self.clear_logcat_before_start_var.get():
            self.package_log_output_queue.put(f"--- {translate('clearing_logcat_buffer')} ---\n")
            execute_command(f"adb -s {self.udid} logcat -c")

        device_info = get_device_properties(self.udid)
        if not device_info:
            self.package_log_output_queue.put(f"{translate('get_device_info_error', udid=self.udid)}\n")
            return

        # Create and prepare the log file
        logcat_base_dir = Path(self.parent_app.logcat_dir_var.get()) or "logcat_logs"
        device_log_dir = logcat_base_dir / f"A{device_info['release']}_{device_info['model']}_{self.udid.split(':')[0]}"
        device_log_dir.mkdir(parents=True, exist_ok=True)

        is_all_packages = app_package == translate('all_packages_option')
        timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
        filename_part = "all_packages" if is_all_packages else app_package.replace('.', '_')
        filename = f"logcat_{filename_part}_{self.udid.replace(':', '-')}_{timestamp}.txt"
        self.package_log_file = device_log_dir / filename

        header_package_name = translate('all_packages_header') if is_all_packages else app_package
        header = f"--- Logcat for {header_package_name} (Level: {log_level_name}) on {self.udid} started at {timestamp} ---\n"
        self.package_log_output_queue.put(header)
        self.package_log_output_queue.put(f"--- {translate('log_file_saving_to', path=self.package_log_file)} ---\n\n")

        self.is_logging_package = True
        self.stop_package_log_event.clear()
        self.log_package_button.config(text=translate("stop_logging"), bootstyle="danger")
        self.package_log_combo.config(state=DISABLED)
        self.package_log_level_combo.config(state=DISABLED)

        # Clear previous logs
        self.package_log_output_text.text.config(state=NORMAL)
        self.package_log_output_text.text.delete("1.0", END)
        self.package_log_output_text.text.config(state=DISABLED)

        self.package_log_thread = threading.Thread(target=self._run_logcat_for_package, args=(app_package, log_level_code), daemon=True)
        self.package_log_thread.start()

    def _stop_package_logging(self):
        """Stops the logcat thread."""
        if self.is_logging_package:
            self.stop_package_log_event.set()
            self.is_logging_package = False
            self.log_package_button.config(text=translate("start_logging"), bootstyle="success")
            self.package_log_combo.config(state="readonly")
            self.package_log_level_combo.config(state="readonly")
            self.package_log_file = None # Stop writing to the file
            self.package_log_output_queue.put(f"\n--- {translate('logging_stopped_by_user')} ---\n")

    def _run_logcat_for_package(self, package_name: str, log_level: str):
        """Executes 'adb logcat' for a specific package and pipes output to a queue."""
        package_name = package_name.strip()
        try:
            # Handle the "All" packages case
            if package_name == translate('all_packages_option'):
                logcat_command = f"adb -s {self.udid} logcat \"*:{log_level}\""
                self.package_log_output_queue.put(f"--- Debug: Executing {logcat_command} ---\n")
                process = subprocess.Popen(logcat_command, shell=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, encoding=OUTPUT_ENCODING, errors='replace', creationflags=subprocess.CREATE_NO_WINDOW if sys.platform == "win32" else 0)
            else:
                # --- Adaptive Logcat Strategy ---
                # 1. Try the modern '--app' method first. It's more robust if supported.
                logcat_command = f"adb -s {self.udid} logcat --app={package_name} \"*:{log_level}\""
                self.package_log_output_queue.put(f"--- Debug: Executing {logcat_command} ---\n")
                process = subprocess.Popen(logcat_command, shell=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, encoding=OUTPUT_ENCODING, errors='replace', creationflags=subprocess.CREATE_NO_WINDOW if sys.platform == "win32" else 0)
    
                # Check for immediate failure, which indicates an unsupported command on older Android.
                time.sleep(0.5) # Give the process a moment to fail
                if process.poll() is not None:
                    output = process.stdout.read() if process.stdout else ""
                    if "unknown option" in output.lower() or "unrecognized option" in output.lower():
                        self.package_log_output_queue.put(f"--- {translate('logcat_fallback_info', method='--app')} ---\n")
                        
                        # 2. Fallback to the classic PID-based method.
                        pid_command = f"adb -s {self.udid} shell pidof -s {package_name}"
                        pid_process = subprocess.run(pid_command, shell=True, capture_output=True, text=True, encoding=OUTPUT_ENCODING, errors='replace')
                        pid = pid_process.stdout.strip()
    
                        if pid and pid.isdigit():
                            logcat_command = f"adb -s {self.udid} logcat --pid={pid} \"*:{log_level}\""
                            self.package_log_output_queue.put(f"--- Debug: Executing {logcat_command} ---\n")
                            process = subprocess.Popen(logcat_command, shell=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, encoding=OUTPUT_ENCODING, errors='replace', creationflags=subprocess.CREATE_NO_WINDOW if sys.platform == "win32" else 0)
                        else:
                            # 3. If PID also fails, stop the operation.
                            self.package_log_output_queue.put(f"--- {translate('logcat_pid_error', package_name=package_name)} ---\n")
                            self.after(0, self._stop_package_logging)
                            return
                    else:
                        # The process failed for another reason
                        self.package_log_output_queue.put(output)
                        self.after(0, self._stop_package_logging)
                        return
            

            while not self.stop_package_log_event.is_set() and process.poll() is None:
                line = process.stdout.readline() # type: ignore
                if line: self.package_log_output_queue.put(line)
                else: break
            
            if process.poll() is None: process.terminate()

        except Exception as e:
            self.package_log_output_queue.put(f"{translate('logcat_generic_error', error=e)}\n")
        finally:
            self.after(0, self._stop_package_logging)

    # --- Robot Test Methods ---
    def _on_test_finished(self):
        """Configures UI when test is finished."""
        # Add a safety check to ensure the window and widgets still exist.
        if not self.winfo_exists():
            return
        self.stop_test_button.pack_forget()
        self.repeat_test_button.pack(fill=X, pady=5, padx=5)
        self.close_button.pack(fill=X, pady=5, padx=5)

    def _repeat_test(self): self._start_test()

    def _reset_ui_for_test_run(self):
        """Resets the UI for a test run."""
        self.robot_output_text.text.config(state=NORMAL)
        self.robot_output_text.text.delete("1.0", END)
        self.robot_output_text.text.config(state=DISABLED)
        self.repeat_test_button.pack_forget()
        self.close_button.pack_forget()
        self.stop_test_button.config(state=NORMAL)
        self.stop_test_button.pack(fill=X, pady=5, padx=5)

    def _start_test(self):
        self._reset_ui_for_test_run()
        threading.Thread(target=self._run_robot_test, daemon=True).start()

    def _run_robot_test(self):
        try:
            device_info = get_device_properties(self.udid)
            if not device_info:
                self.robot_output_queue.put(translate("get_device_info_error", udid=self.udid) + "\n")
                return

            suite_name = Path(self.run_path).stem
            self.cur_log_dir = self.parent_app.logs_dir / f"A{device_info['release']}_{device_info['model']}_{self.udid.split(':')[0]}" / suite_name
            self.cur_log_dir.mkdir(parents=True, exist_ok=True)
            
            ts_opt = " --timestampoutputs" if self.parent_app.timestamp_logs_var.get() else ""
            robot_opt = self.parent_app.robot_options_var.get()

            base_cmd = f'robot{ts_opt} {robot_opt} --logtitle "{device_info["release"]} - {device_info["model"]}" -v udid:"{self.udid}" -v deviceName:"{device_info["model"]}" -v versao_OS:"{device_info["release"]}" -d "{self.cur_log_dir}" --name "{suite_name}"'
            
            # The self.run_path is already an absolute path, so it should be used directly.
            # Enclosing it in quotes handles paths with spaces.
            if self.run_mode == "Suite":
                command = f'{base_cmd} --argumentfile "{self.run_path}"'
            else:
                command = f'{base_cmd} "{self.run_path}"'

            self.robot_output_queue.put(translate("executing_command", command=command))

            creationflags = subprocess.CREATE_NO_WINDOW if sys.platform == "win32" else 0
            self.robot_process = subprocess.Popen(command, shell=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, encoding=OUTPUT_ENCODING, errors='replace', creationflags=creationflags)
            for line in iter(self.robot_process.stdout.readline, ''):
                self.robot_output_queue.put(line)
            self.robot_process.stdout.close()
            return_code = self.robot_process.wait()
            self.robot_output_queue.put(translate("test_finished", code=return_code) + "\n")
        except Exception as e:
            self.robot_output_queue.put(translate("robot_run_fatal_error", error=e) + "\n")
        finally:
            self.after(0, self._on_test_finished)
            self.after(0, self.parent_app._on_period_change)

    def _check_robot_output_queue(self):
        if self.mode != 'test': return
        lines = []
        while not self.robot_output_queue.empty():
            try: lines.append(self.robot_output_queue.get_nowait())
            except Empty: pass
        if lines:
            self.robot_output_text.text.config(state=NORMAL)
            for line in lines:
                 # Trigger device list refresh when Appium session actually starts.
                 if "INFO" in line and "Opening application" in line:
                     self.after(0, self.parent_app._refresh_devices)

                 if line.strip().startswith(("Output:", "Log:", "Report:")):
                    prefix, path = line.split(":", 1)
                    self.robot_output_text.text.insert(END, f"{prefix.strip() + ':': <8}")
                    link_tag = f"LINK_{time.time()}"
                    self.robot_output_text.text.insert(END, path.strip(), ("LINK", link_tag))
                    self.robot_output_text.text.tag_bind(link_tag, "<Button-1>", lambda e, p=path.strip(): self._open_file_path(p))
                    self.robot_output_text.text.tag_bind(link_tag, "<Enter>", lambda e: self.robot_output_text.config(cursor="hand2"))
                    self.robot_output_text.text.tag_bind(link_tag, "<Leave>", lambda e: self.robot_output_text.config(cursor=""))
                    self.robot_output_text.text.insert(END, "\n")
                 else:
                    tag = "PASS" if "| PASS |" in line else "FAIL" if "| FAIL |" in line else None
                    self.robot_output_text.text.insert(END, line, tag)
            self.robot_output_text.text.see(END)
            self.robot_output_text.text.config(state=DISABLED)
        self.after(500, self._check_robot_output_queue)

    def _check_package_log_queue(self):
        """Checks the package log queue and updates the text widget."""
        lines = []
        # Limit processing to avoid freezing the UI if queue is huge
        max_batch = 1000
        count = 0
        while not self.package_log_output_queue.empty() and count < max_batch:
            try: 
                lines.append(self.package_log_output_queue.get_nowait())
                count += 1
            except Empty: pass
            
        if lines:
            self.package_log_output_text.text.config(state=NORMAL)
            self.package_log_output_text.text.insert(END, "".join(lines))
            
            # Truncate if too long to save memory
            max_lines = 5000
            num_lines = int(self.package_log_output_text.text.index('end-1c').split('.')[0])
            if num_lines > max_lines:
                 self.package_log_output_text.text.delete("1.0", f"{num_lines - max_lines}.0")

            self.package_log_output_text.text.see(END)
            self.package_log_output_text.text.config(state=DISABLED)

            # Write to the log file if it's active
            if self.package_log_file:
                self.log_writer.write(self.package_log_file, "".join(lines), encoding=OUTPUT_ENCODING)
        
        # Check again sooner if we hit the batch limit, otherwise wait standard time
        next_check = 100 if count >= max_batch else 500
        self.after(next_check, self._check_package_log_queue)

    def _open_file_path(self, path: str):
        """Opens a file path from a link."""
        try:
            clean_path = Path(path)
            if clean_path.exists(): os.startfile(clean_path)
            else: self.parent_app.show_toast(translate("file_not_found_title"), translate("file_not_found_message", path=clean_path), bootstyle="warning")
        except Exception as e: self.parent_app.show_toast(translate("open_file_error_title"), translate("open_file_error_message", error=e), bootstyle="danger")

    def _stop_test(self):
        self.stop_test_button.config(state=DISABLED)
        self.robot_output_queue.put(f"\n{translate('stop_button_clicked')}\n")
        if self.robot_process and self.robot_process.poll() is None:
            threading.Thread(target=self._terminate_process_tree, args=(self.robot_process.pid, "robot"), daemon=True).start()

    def _stop_test_sync(self):
        """Synchronous version of stop_test."""
        if self.robot_process and self.robot_process.poll() is None:
            self._terminate_process_tree(self.robot_process.pid, "robot")

    # --- Window Management ---
    def _terminate_process_tree(self, pid: int, name: str):
        """Forcefully terminates a process and its tree."""
        try:
            if sys.platform == "win32":
                subprocess.run(f"taskkill /PID {pid} /T /F", check=True, capture_output=True, creationflags=subprocess.CREATE_NO_WINDOW)
            else:
                os.kill(pid, signal.SIGTERM)
            output_q = self.robot_output_queue if name == "robot" else self.scrcpy_output_queue
            output_q.put(translate("process_terminated_info", name=name.capitalize(), pid=pid) + "\n")
        except Exception as e: print(translate("terminate_process_warning", name=name, pid=pid, e=e))

    def _on_close(self):
        if self._is_closing: return
        self._is_closing = True
        self._stop_all_activities()
        self.parent_app.shell_manager.close(self.udid)
        
        # Remove from local busy set for instant UI feedback
        if self.udid in self.parent_app.local_busy_devices:
            self.parent_app.local_busy_devices.remove(self.udid)
            
        # Trigger a fast UI update instead of a slow full refresh
        self.parent_app.root.after(0, self.parent_app._update_device_list)
        # Delegate removal to RunTabPage
        if hasattr(self.parent_app, 'run_tab') and self.parent_app.run_tab:
            self.parent_app.run_tab.remove_device_tab(self.udid)
        
        self.destroy()

    def _stop_all_activities(self):
        """Stops all running processes and threads."""
        if self.mode == 'test' and self.robot_process and self.robot_process.poll() is None: self._stop_test_sync()
        if self.is_monitoring: self._stop_performance_monitor()
        if self.is_recording: self._stop_recording()
        if self.is_mirroring: self._stop_scrcpy()
        if self.is_logging_package: self._stop_package_logging()
        if hasattr(self, 'log_writer'): self.log_writer.stop()
