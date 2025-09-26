import os
import sys
import subprocess
import signal
import re
import json
import zipfile
import shutil
import threading
import urllib.request
import time
import datetime
import ctypes
from typing import List, Tuple, Dict, Optional
from pathlib import Path
from queue import Queue, Empty
import tkinter as tk
from tkinter import messagebox
from lxml import etree as ET
import ttkbootstrap as ttk
from ttkbootstrap.scrolled import ScrolledText
from ttkbootstrap.tooltip import ToolTip
from ttkbootstrap.constants import *
from PIL import Image, ImageTk

# --- Internationalization Setup ---
from locales.i18n import gettext as translate, load_language

# --- Conditional import for pywin32 ---
if sys.platform == "win32":
    try:
        import win32gui
        import win32con
    except ImportError:
        messagebox.showerror(
            translate("dependency_missing"),
            translate("pywin32_required")
        )
        sys.exit(1)

# --- Constants ---
if getattr(sys, 'frozen', False):
    BASE_DIR = Path(sys.executable).parent
else:
    BASE_DIR = Path(__file__).resolve().parent

CONFIG_DIR = BASE_DIR / "config"
SETTINGS_FILE = CONFIG_DIR / "settings.json"

# --- Encoding for subprocess output ---
OUTPUT_ENCODING = 'mbcs' if sys.platform == "win32" else 'utf-8'

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
        self.is_inspecting = False # New attribute for inspector mode

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
        self.performance_monitor_is_minimized = tk.BooleanVar(value=False)
        self.last_performance_line_var = tk.StringVar()
        
        # --- Inspector Attributes ---
        self.inspector_is_visible = False
        self.elements_data_map = {} # To store full data of UI elements
        self.is_inspection_running = False # To prevent race conditions
        self.current_selected_element_data = None # To store data of currently selected element for XPath generation
        self.auto_refresh_thread = None
        self.inspector_auto_refresh_var = tk.BooleanVar(value=False)
        self.stop_auto_refresh_event = threading.Event()
        self.last_ui_dump_hash = None
        self.all_elements_list: List[Dict] = []
        self.current_dump_path: Optional[Path] = None
        self.xpath_search_var = tk.StringVar()
        self.is_dragging_locked_sash = False
        
        # --- Inspector Filter Attributes ---
        self.filter_by_resource_id_var = tk.BooleanVar(value=True)
        self.filter_by_text_var = tk.BooleanVar(value=True)
        self.filter_by_content_desc_var = tk.BooleanVar(value=True)
        self.filter_by_scrollview_var = tk.BooleanVar(value=True)
        self.filter_by_other_class_var = tk.BooleanVar(value=False)
        
        # --- Window Setup ---
        if title:
            window_title = title
        else:
            # Find the device model from the parent app's device list to correctly format the title
            device_model = next((d.get('model', 'Unknown') for d in self.parent_app.devices if d.get('udid') == self.udid), 'Unknown')
            window_title = translate("running_title", title=Path(run_path).name, model=device_model)

        self.title(window_title)
        self.geometry("1200x800")
        self.protocol("WM_DELETE_WINDOW", self._on_close)

        self._setup_widgets()

        if self.mode == 'test':
            self._start_test()

        # Pre-fetch aspect ratio in the background
        threading.Thread(target=self._fetch_initial_aspect_ratio, daemon=True).start()

        self.after(500, self._check_robot_output_queue) # Intervalo alterado para 500ms
        self.after(500, self._check_scrcpy_output_queue) # Intervalo alterado para 500ms
        self.after(500, self._check_performance_output_queue) # Intervalo alterado para 500ms

        # Store initial size to prevent unnecessary refreshes from non-resize <Configure> events
        self.update_idletasks()
        self.last_width = self.winfo_width()
        self.last_height = self.winfo_height()

        self.bind("<Configure>", self._on_window_resize)
            
    def _fetch_initial_aspect_ratio(self):
        """Fetches and stores the device's aspect ratio in the background on startup."""
        ratio = get_device_aspect_ratio(self.udid)
        if ratio:
            self.aspect_ratio = ratio
            self.scrcpy_output_queue.put(f"INFO: Pre-fetched device aspect ratio: {ratio:.4f}\n")
        else:
            self.scrcpy_output_queue.put("WARNING: Could not pre-fetch device aspect ratio.\n")
            
    # --- UI Setup ------------------------------------------------------------------
    def _setup_widgets(self):
        """Sets up the 3-pane widget layout for the window."""
        self.main_paned_window = ttk.PanedWindow(self, orient=HORIZONTAL)
        self.main_paned_window.pack(fill=BOTH, expand=YES)

        # --- 1. Left Pane (Outputs) ---
        self.left_pane_container = ttk.Frame(self.main_paned_window, padding=5)
        self.output_paned_window = ttk.PanedWindow(self.left_pane_container, orient=VERTICAL)
        self.output_paned_window.pack(fill=BOTH, expand=YES)

        # --- 2. Center Pane (Controls) ---
        self.center_pane_container = ttk.Frame(self.main_paned_window, padding=10)

        # Mirroring controls
        self.mirror_button = ttk.Button(self.center_pane_container, text=translate("start_mirroring"), command=self._toggle_mirroring, bootstyle="info")
        self.mirror_button.pack(fill=X, pady=5, padx=5)
        ToolTip(self.mirror_button, translate("start_mirroring_tooltip"))

        # ADB-dependent controls
        self.screenshot_button = ttk.Button(self.center_pane_container, text=translate("take_screenshot"), command=self._take_screenshot)
        self.screenshot_button.pack(fill=X, pady=5, padx=5)
        ToolTip(self.screenshot_button, translate("screenshot_tooltip"))
        
        self.record_button = ttk.Button(self.center_pane_container, text=translate("start_recording"), command=self._toggle_recording, bootstyle="primary")
        self.record_button.pack(fill=X, pady=5, padx=5)
        ToolTip(self.record_button, translate("start_recording_tooltip"))

        # --- Panes inside Left Pane ---

        # Robot Output (only for test mode)
        if self.mode == 'test':
            # Test controls (only for test mode)
            self.robot_output_frame = ttk.Frame(self.output_paned_window, padding=5)
            self.robot_output_text = ScrolledText(self.robot_output_frame, wrap=WORD, state=DISABLED, autohide=True)
            self.robot_output_text.pack(fill=BOTH, expand=YES)
            self.robot_output_text.text.tag_config("PASS", foreground="green")
            self.robot_output_text.text.tag_config("FAIL", foreground="red")
            self.robot_output_text.text.tag_config("INFO", foreground="yellow")
            self.robot_output_text.text.tag_config("LINK", foreground="cyan", underline=True)
            self.output_paned_window.add(self.robot_output_frame, weight=1)

        # Scrcpy Output
        self.scrcpy_output_frame = ttk.Frame(self.output_paned_window, padding=5)
        self.scrcpy_output_text = ScrolledText(self.scrcpy_output_frame, wrap=WORD, state=DISABLED, autohide=True)
        self.scrcpy_output_text.pack(fill=BOTH, expand=YES)

        # Performance Monitor Output & Controls
        self.performance_output_frame = ttk.Frame(self.output_paned_window, padding=5)

        monitor_controls_frame = ttk.Frame(self.performance_output_frame)
        monitor_controls_frame.pack(side=TOP, fill=X, pady=(0, 5), padx=5)
        monitor_controls_frame.columnconfigure(0, weight=1)
        monitor_controls_frame.columnconfigure(1, weight=1)
        monitor_controls_frame.columnconfigure(2, weight=0)

        self.performance_output_text = ScrolledText(self.performance_output_frame, wrap=WORD, state=DISABLED, autohide=True)
        self.performance_output_text.pack(fill=BOTH, expand=YES, padx=5, pady=(0,5))
        
        self.minimized_performance_label = ttk.Label(self.performance_output_frame, textvariable=self.last_performance_line_var, font=("Courier", 9))
        
        ttk.Label(monitor_controls_frame, text=translate("app_package")).grid(row=0, column=0, columnspan=3, sticky=W, pady=(0,2))
        self.app_package_combo = ttk.Combobox(monitor_controls_frame, values=self.parent_app.app_packages_var.get().split(','))
        self.app_package_combo.grid(row=1, column=0, columnspan=3, sticky="ew", pady=(0, 5))
        if self.app_package_combo['values']:
            self.app_package_combo.set(self.app_package_combo['values'][0])
        ToolTip(self.app_package_combo, text=translate("select_app_to_monitor_tooltip"))
        self.monitor_button = ttk.Button(monitor_controls_frame, text=translate("start_monitoring"), command=self._toggle_performance_monitor, bootstyle="success")
        self.monitor_button.grid(row=2, column=0, columnspan=2, sticky="ew", padx=(0, 2))
        ToolTip(self.monitor_button, text=translate("start_monitoring_tooltip"))
        
        self.toggle_minimize_perf_button = ttk.Button(monitor_controls_frame, text=translate("minimize_performance"), command=self._toggle_performance_minimize, state=DISABLED, bootstyle="secondary")
        self.toggle_minimize_perf_button.grid(row=2, column=2, sticky="ew", padx=(5,0))
        ToolTip(self.toggle_minimize_perf_button, text=translate("minimize_performance_tooltip"))

        # --- Controls in Center Pane ---

        # Visibility toggles
        self.toggle_scrcpy_out_button = ttk.Button(self.center_pane_container, text=translate("show_scrcpy_output"), command=lambda: self._toggle_output_visibility('scrcpy'), bootstyle="secondary")
        self.toggle_scrcpy_out_button.pack(fill=X, pady=5, padx=5)
        ToolTip(self.toggle_scrcpy_out_button, text=translate("show_scrcpy_output_tooltip"))
        
        self.toggle_perf_button = ttk.Button(self.center_pane_container, text=translate("show_performance"), command=lambda: self._toggle_output_visibility('performance'), bootstyle="secondary")
        self.toggle_perf_button.pack(fill=X, pady=5, padx=5)
        ToolTip(self.toggle_perf_button, text=translate("show_performance_tooltip"))
        
        # Inspector Controls (only for non-test mode)
        if self.mode != 'test':
            # --- Element Details Frame (moved to center pane) ---
            self.element_details_frame = ttk.Frame(self.center_pane_container, padding=5)
            # self.element_details_frame will be packed/unpacked dynamically
            self.element_details_text = ScrolledText(self.element_details_frame, wrap=WORD, state=DISABLED, autohide=True)
            self.element_details_text.pack(fill=BOTH, expand=YES)
            self.element_details_text.text.tag_configure("bold", font="-weight bold")

            # XPath Buttons Frame (moved to center pane)
            self.xpath_buttons_container = ttk.Frame(self.center_pane_container, padding=5)
            # self.xpath_buttons_container will be packed/unpacked dynamically
            self.xpath_buttons = {} # Dictionary to hold the dynamically created buttons

            separator = ttk.Separator(self.center_pane_container, orient=HORIZONTAL)
            separator.pack(fill=X, pady=10, padx=5)

            self.inspect_button = ttk.Button(self.center_pane_container, text=translate("start_inspector"), command=self._toggle_inspector_mode, bootstyle="primary")
            self.inspect_button.pack(fill=X, pady=5, padx=5)
            ToolTip(self.inspect_button, translate("inspector_tooltip"))

            # Create a container for all inspector-related widgets in the left pane
            self.inspector_controls_frame = ttk.Frame(self.output_paned_window)

            # Create a sub-frame for the top controls (refresh button and auto-refresh toggle)
            inspector_top_controls_frame = ttk.Frame(self.inspector_controls_frame)
            inspector_top_controls_frame.pack(side=TOP, fill=X, pady=(0, 5), padx=0)
            inspector_top_controls_frame.columnconfigure(0, weight=1) # Make button expand

            self.refresh_inspector_button = ttk.Button(inspector_top_controls_frame, text=translate("refresh"), command=self._start_inspection, state=DISABLED)
            self.refresh_inspector_button.grid(row=0, column=0, sticky="ew", padx=(0, 5))
            ToolTip(self.refresh_inspector_button, translate("refresh_tooltip"))

            # --- Attribute Filter Menu ---
            self.filter_menubutton = ttk.Menubutton(inspector_top_controls_frame, text=translate("inspector_filter_attributes"), bootstyle="outline-toolbutton")
            self.filter_menubutton.grid(row=0, column=1, sticky="ew", padx=5)
            filter_menu = tk.Menu(self.filter_menubutton, tearoff=False)
            self.filter_menubutton["menu"] = filter_menu
            ToolTip(self.filter_menubutton, text=translate("filter_elements_by_attributes_tooltip"))
            
            filter_menu.add_checkbutton(label=translate("filter_by_resource_id"), variable=self.filter_by_resource_id_var, command=self._update_element_tree_view)
            filter_menu.add_checkbutton(label=translate("filter_by_text"), variable=self.filter_by_text_var, command=self._update_element_tree_view)
            filter_menu.add_checkbutton(label=translate("filter_by_content_desc"), variable=self.filter_by_content_desc_var, command=self._update_element_tree_view)
            filter_menu.add_checkbutton(label=translate("filter_by_scrollview"), variable=self.filter_by_scrollview_var, command=self._update_element_tree_view)
            filter_menu.add_checkbutton(label=translate("filter_by_other_class"), variable=self.filter_by_other_class_var, command=self._update_element_tree_view)

            self.auto_refresh_check = ttk.Checkbutton(inspector_top_controls_frame, text=translate("inspector_auto_refresh"), variable=self.inspector_auto_refresh_var, bootstyle="round-toggle")
            self.auto_refresh_check.grid(row=0, column=2, sticky="e")
            ToolTip(self.auto_refresh_check, translate("inspector_auto_refresh_tooltip"))

            # --- Search Frame ---
            search_frame = ttk.Frame(self.inspector_controls_frame, padding=5)
            search_frame.pack(side=TOP, fill=X, pady=(5, 5))
            search_frame.columnconfigure(0, weight=1)

            self.xpath_search_entry = ttk.Entry(search_frame, textvariable=self.xpath_search_var)
            self.xpath_search_entry.grid(row=0, column=0, sticky="ew", padx=(0, 5))
            ToolTip(self.xpath_search_entry, translate("search_tooltip"))

            search_button_frame = ttk.Frame(search_frame)
            search_button_frame.grid(row=0, column=1, sticky="e")

            self.search_button = ttk.Button(search_button_frame, text=translate("search_button"), command=self._perform_xpath_search, bootstyle="primary")
            self.search_button.pack(side=LEFT)
            ToolTip(self.search_button, text=translate("search_inspector_element_tooltip"))
            
            self.clear_search_button = ttk.Button(search_button_frame, text=translate("clear_button"), command=self._clear_xpath_search, bootstyle="secondary")
            self.clear_search_button.pack(side=LEFT, padx=(5, 0))
            ToolTip(self.clear_search_button, translate("clear_tooltip"))

            self.elements_list_frame = ttk.Frame(self.inspector_controls_frame, padding=5)
            self.elements_list_frame.pack(side=TOP, fill=BOTH, expand=YES)

            self.elements_tree = ttk.Treeview(self.elements_list_frame, columns=("title",), show="headings")
            self.elements_tree.heading("title", text=translate("element"))
            self.elements_tree.column("title", width=300, anchor=W)
            self.elements_tree.pack(fill=BOTH, expand=YES)
            self.elements_tree.bind("<<TreeviewSelect>>", self._on_element_select)
            self.elements_tree.bind("<Button-1>", self._on_treeview_click)

            # --- Element Actions Frame ---
            self.element_actions_frame = ttk.LabelFrame(self.inspector_controls_frame, text=translate("inspector_element_actions"), padding=5)
            self.element_actions_frame.pack(side=TOP, fill=X, pady=(5, 0))
            self.element_actions_frame.columnconfigure((0, 1, 2, 3), weight=1)

            self.action_click_button = ttk.Button(self.element_actions_frame, text=translate("action_click"), command=lambda: self._perform_element_action("click"), state=DISABLED)
            self.action_click_button.grid(row=0, column=0, columnspan=2, sticky="ew", padx=2, pady=2)
            ToolTip(self.action_click_button, translate("action_click_tooltip"))

            self.action_long_click_button = ttk.Button(self.element_actions_frame, text=translate("action_long_click"), command=lambda: self._perform_element_action("long_click"), state=DISABLED)
            self.action_long_click_button.grid(row=0, column=2, columnspan=2, sticky="ew", padx=2, pady=2)
            ToolTip(self.action_long_click_button, translate("action_long_click_tooltip"))

            self.action_swipe_up_button = ttk.Button(self.element_actions_frame, text=translate("action_swipe_up"), command=lambda: self._perform_element_action("swipe_up"), state=DISABLED)
            self.action_swipe_up_button.grid(row=1, column=0, sticky="ew", padx=2, pady=2)
            ToolTip(self.action_swipe_up_button, translate("action_swipe_up_tooltip"))
            self.action_swipe_down_button = ttk.Button(self.element_actions_frame, text=translate("action_swipe_down"), command=lambda: self._perform_element_action("swipe_down"), state=DISABLED)
            self.action_swipe_down_button.grid(row=1, column=1, sticky="ew", padx=2, pady=2)
            ToolTip(self.action_swipe_down_button, translate("action_swipe_down_tooltip"))
            self.action_swipe_left_button = ttk.Button(self.element_actions_frame, text=translate("action_swipe_left"), command=lambda: self._perform_element_action("swipe_left"), state=DISABLED)
            self.action_swipe_left_button.grid(row=1, column=2, sticky="ew", padx=2, pady=2)
            ToolTip(self.action_swipe_left_button, translate("action_swipe_left_tooltip"))
            self.action_swipe_right_button = ttk.Button(self.element_actions_frame, text=translate("action_swipe_right"), command=lambda: self._perform_element_action("swipe_right"), state=DISABLED)
            self.action_swipe_right_button.grid(row=1, column=3, sticky="ew", padx=2, pady=2)
            ToolTip(self.action_swipe_right_button, translate("action_swipe_right_tooltip"))

        # Test controls (only for test mode)
        if self.mode == 'test':
            self.toggle_robot_button = ttk.Button(self.center_pane_container, text=translate("hide_test_output"), command=lambda: self._toggle_output_visibility('robot'), bootstyle="secondary")
            self.toggle_robot_button.pack(fill=X, pady=5, padx=5)
            ToolTip(self.toggle_robot_button, text=translate("hide_robot_output_tooltip"))
            
            separator = ttk.Separator(self.center_pane_container, orient=HORIZONTAL)
            separator.pack(fill=X, pady=10, padx=5)

            self.repeat_test_button = ttk.Button(self.center_pane_container, text=translate("repeat_test"), command=self._repeat_test)
            ToolTip(self.repeat_test_button, text=translate("repeat_test_tooltip"))
            self.close_button = ttk.Button(self.center_pane_container, text=translate("close"), command=self._on_close)
            ToolTip(self.close_button, text=translate("close_window_tooltip"))


            self.stop_test_button = ttk.Button(self.center_pane_container, text=translate("stop_test"), bootstyle="danger", command=self._stop_test)
            self.stop_test_button.pack(fill=X, pady=5, padx=5)
            ToolTip(self.stop_test_button, text=translate("stop_test_tooltip"))

        # --- 3. Right Pane (Screen Mirror / Inspector) ---
        self.right_pane_container = ttk.Frame(self.main_paned_window, padding=5)
        self.embed_frame = self.right_pane_container # for compatibility with old code

        # Inspector UI elements (only for non-test mode)
        if self.mode != 'test':
            self.inspector_paned_window = ttk.PanedWindow(self.right_pane_container, orient=VERTICAL)
            
            self.screenshot_canvas_frame = ttk.Frame(self.inspector_paned_window)
            self.screenshot_canvas = tk.Canvas(self.screenshot_canvas_frame, bg="black")
            self.screenshot_canvas.pack(fill=BOTH, expand=YES)
            self.screenshot_image_tk = None # To hold the PhotoImage object
            self.screenshot_canvas.bind("<Button-1>", self._on_canvas_click)
            self.screenshot_canvas.bind("<Configure>", self._on_inspector_canvas_resize) # New line

        # --- Add panes and set initial state ---
        self.main_paned_window.add(self.left_pane_container, weight=3)
        self.main_paned_window.add(self.center_pane_container, weight=0) # Set weight to 0 to make it "fixed"

        if self.mode != 'test':
             self.after(100, lambda: self.main_paned_window.sashpos(0, 0)) # Hide left pane
        
        # --- Finalize Layout Rules ---
        self.center_pane_container.update_idletasks()
        self.center_pane_width = self.center_pane_container.winfo_width()
        min_window_width = self.center_pane_width * 3
        self.minsize(width=min_window_width, height=500)

    # --- Visibility & Layout Toggles ---------------------------------------------
    def _toggle_output_visibility(self, output_type: str):
        """Shows or hides a specific output frame in the left pane."""
        frame_map = {
            'scrcpy': (self.scrcpy_output_frame, self.toggle_scrcpy_out_button, self.scrcpy_output_is_visible),
            'performance': (self.performance_output_frame, self.toggle_perf_button, self.performance_monitor_is_visible)
        }
        if self.mode == 'test':
            frame_map['robot'] = (self.robot_output_frame, self.toggle_robot_button, self.robot_output_is_visible)
        if output_type not in frame_map: return
        
        frame, button, is_visible = frame_map[output_type]
        
        show_keys = {
            'robot': 'show_test_output',
            'scrcpy': 'show_scrcpy_output',
            'performance': 'show_performance'
        }
        hide_keys = {
            'robot': 'hide_test_output',
            'scrcpy': 'hide_scrcpy_output',
            'performance': 'hide_performance'
        }

        if is_visible:
            self.output_paned_window.forget(frame)
            button.config(text=translate(show_keys[output_type]))
            ToolTip(button, translate(show_keys[output_type]))
        else:
            self.output_paned_window.add(frame, weight=1)
            button.config(text=translate(hide_keys[output_type]))
            ToolTip(button, translate(hide_keys[output_type]))

        # Update state variable
        if output_type == 'robot': self.robot_output_is_visible = not is_visible
        elif output_type == 'scrcpy': self.scrcpy_output_is_visible = not is_visible
        elif output_type == 'performance': self.performance_monitor_is_visible = not is_visible

        self.after(10, self._apply_layout_rules)

    def _on_window_resize(self, event=None):
        """Debounces resize events to adjust aspect ratio."""
        # Check if the size actually changed to avoid refreshes on focus change etc.
        current_width = self.winfo_width()
        current_height = self.winfo_height()
        if current_width == self.last_width and current_height == self.last_height:
            return
        self.last_width = current_width
        self.last_height = current_height

        if self.resize_job:
            self.after_cancel(self.resize_job)
        self.resize_job = self.after(150, self._apply_layout_rules)

    def _apply_layout_rules(self, event=None):
        """Applies layout rules to set sash positions based on visible panes and window size."""
        self.resize_job = None
        if not self.winfo_exists(): return

        self.update_idletasks()
        total_width = self.main_paned_window.winfo_width()
        total_height = self.main_paned_window.winfo_height()
        if total_height <= 1 or total_width <= 1:
            return

        is_right_visible = len(self.main_paned_window.panes()) == 3
        is_left_visible = bool(self.output_paned_window.panes())
        
        min_pane_width = 150 # A reasonable minimum

        try:
            # Case 1: All three panes are visible
            if is_left_visible and is_right_visible:
                ideal_right_width = int(total_height * self.aspect_ratio) if self.aspect_ratio else min_pane_width
                if ideal_right_width < min_pane_width: ideal_right_width = min_pane_width

                remaining_width = total_width - ideal_right_width
                if remaining_width < (min_pane_width * 2):
                    remaining_width = min_pane_width * 2

                left_width = int(remaining_width * (2/3))
                center_width = remaining_width - left_width
                
                self.main_paned_window.sashpos(0, left_width)
                self.main_paned_window.sashpos(1, left_width + center_width)

            # Case 2: Only right and center are visible
            elif not is_left_visible and is_right_visible:
                self.main_paned_window.sashpos(0, 0)
                ideal_right_width = int(total_height * self.aspect_ratio) if self.aspect_ratio else min_pane_width
                if ideal_right_width < min_pane_width: ideal_right_width = min_pane_width

                center_width = total_width - ideal_right_width
                if center_width < min_pane_width: center_width = min_pane_width
                self.main_paned_window.sashpos(1, center_width)

            # Case 3: Only left and center are visible
            elif is_left_visible and not is_right_visible:
                left_width = int(total_width * (2/3))
                self.main_paned_window.sashpos(0, left_width)

            # Case 4: Only center pane is visible
            elif not is_left_visible and not is_right_visible:
                # Collapse the left pane, making the center pane take up all the space
                self.main_paned_window.sashpos(0, 0)
        except tk.TclError:
            pass

    # --- Scrcpy Core Methods -----------------------------------------------------
    def _toggle_mirroring(self):
        if self.is_mirroring:
            self._stop_scrcpy()
        else:
            # If inspector is active, stop it first
            if self.is_inspecting:
                self._stop_inspector()
            self._start_scrcpy()

    def _start_scrcpy(self):
        """Starts the scrcpy process and adds the mirror pane."""
        if self.is_mirroring: return
        self.is_mirroring = True
        
        # If aspect ratio wasn't pre-fetched yet, get it now.
        if self.aspect_ratio is None:
            self.aspect_ratio = get_device_aspect_ratio(self.udid)
            if self.aspect_ratio:
                self.scrcpy_output_queue.put(f"INFO: Fetched aspect ratio on demand: {self.aspect_ratio:.4f} for mirroring.\n")
            else:
                self.scrcpy_output_queue.put("WARNING: Could not determine aspect ratio for mirroring.\n")
        
        self.main_paned_window.add(self.right_pane_container, weight=5)
        self.update_idletasks()
        
        # Apply layout rules to set initial sash positions correctly
        self.after(10, self._apply_layout_rules)

        if hasattr(self, 'inspect_button'):
            self.inspect_button.config(state=DISABLED)
        self.mirror_button.config(text=translate("stop_mirroring"), bootstyle="danger")
        ToolTip(self.mirror_button, text=translate("stop_mirroring_tooltip"))
        
        thread = threading.Thread(target=self._run_and_embed_scrcpy)
        thread.daemon = True
        thread.start()

    def _stop_scrcpy(self):
        """Stops the scrcpy process and removes the mirror pane."""
        if not self.is_mirroring: return
        self.is_mirroring = False

        # Reset scrcpy window handles and unbind events
        if self.scrcpy_hwnd:
            self.embed_frame.unbind("<Configure>")
            self.scrcpy_hwnd = None

        self.main_paned_window.forget(self.right_pane_container)
        # Re-apply layout for the remaining panes
        self.after(10, self._apply_layout_rules)

        self.mirror_button.config(text=translate("start_mirroring"), bootstyle="info")
        ToolTip(self.mirror_button, text=translate("start_mirroring_tooltip"))
        
        if self.scrcpy_process and self.scrcpy_process.poll() is None:
            self._terminate_process_tree(self.scrcpy_process.pid, "scrcpy")
            self.scrcpy_process = None
            self.scrcpy_output_queue.put(translate("scrcpy_stopped_by_user") + "\n")

        # Always reset the process handle
        self.scrcpy_process = None
        if hasattr(self, 'inspect_button'):
            self.inspect_button.config(state=NORMAL)

    def _toggle_inspector_mode(self):
        if self.is_inspecting:
            self._stop_inspector()
        else:
            # If mirroring is active, stop it first
            if self.is_mirroring:
                self._stop_scrcpy()
            self._start_inspector() # This sets up the UI
            # Schedule the first inspection to run after the UI has had a moment to draw itself
            self.after(100, self._start_inspection)

    def _start_inspector(self):
        """Configures the UI for inspector mode, but does not run the inspection itself."""
        if self.is_inspecting: return
        self.is_inspecting = True
        
        # If aspect ratio wasn't pre-fetched yet, get it now.
        if self.aspect_ratio is None:
            self.aspect_ratio = get_device_aspect_ratio(self.udid)
            if self.aspect_ratio:
                self.scrcpy_output_queue.put(f"INFO: Fetched aspect ratio on demand: {self.aspect_ratio:.4f} for inspector.\n")
            else:
                self.scrcpy_output_queue.put("WARNING: Could not determine aspect ratio for inspector.\n")
        
        # Update button states
        self.mirror_button.config(state=DISABLED)
        self.inspect_button.config(text=translate("stop_inspector"), bootstyle="danger")
        ToolTip(self.inspect_button, text=translate("stop_inspector_tooltip"))
        self.refresh_inspector_button.config(state=NORMAL)

        # Set a minimum width for the right pane and a starting size
        self.main_paned_window.add(self.right_pane_container, weight=5)
        self.update_idletasks()
        
        # Show inspector panes
        self.inspector_paned_window.pack(fill=BOTH, expand=YES)
        try:
            self.inspector_paned_window.add(self.screenshot_canvas_frame, weight=3)
        except tk.TclError:
            pass # Already added

        # Start auto-refresh thread
        self.stop_auto_refresh_event.clear()
        self.auto_refresh_thread = threading.Thread(target=self._auto_refresh_inspector_thread, daemon=True)
        self.auto_refresh_thread.start()

        # Pack the moved widgets into the center pane
        # Pack XPath buttons at the bottom first, so the details frame can expand above it.
        self.xpath_buttons_container.pack(side=BOTTOM, fill=X, pady=5, padx=5)
        self.element_details_frame.pack(fill=BOTH, expand=YES, pady=5, padx=5)
        
        # Add inspector controls to the left pane and apply layout
        try:
            self.output_paned_window.add(self.inspector_controls_frame, weight=1)
        except tk.TclError:
            pass # Already added
        
        self.after(10, self._apply_layout_rules)

    def _stop_inspector(self):
        if not self.is_inspecting: return
        self.is_inspecting = False

        # Hide inspector panes
        self.main_paned_window.forget(self.right_pane_container)
        self.after(10, self._apply_layout_rules)

        # Hide the moved widgets from the center pane
        self.element_details_frame.pack_forget()
        self.xpath_buttons_container.pack_forget()

        # Stop auto-refresh thread
        self.stop_auto_refresh_event.set()
        self.last_ui_dump_hash = None
        self.output_paned_window.forget(self.inspector_controls_frame)

        # Clear canvas and treeview
        self.screenshot_canvas.delete("all")
        for item in self.elements_tree.get_children():
            self.elements_tree.delete(item)
        
        # Clear XPath buttons
        self._update_xpath_buttons_state(None)

        # Restore button states
        self.mirror_button.config(state=NORMAL)
        self.inspect_button.config(text=translate("start_inspector"), bootstyle="primary")
        ToolTip(self.inspect_button, text=translate("start_inspector_tooltip"))
        self.refresh_inspector_button.config(state=DISABLED)

    def _auto_refresh_inspector_thread(self):
        """Checks for UI changes in the background and triggers a refresh if detected."""
        while not self.stop_auto_refresh_event.wait(5.0): # Wait for 5s, or until stop event is set
            if not self.is_inspecting: # Extra safety check
                break

            # Check if auto-refresh is enabled by the user
            if not self.inspector_auto_refresh_var.get():
                continue

            try:
                # Do not check if a refresh is already in progress.
                # The refresh button is disabled during refresh.
                if self.refresh_inspector_button['state'] == DISABLED:
                    continue

                # Using a different filename to avoid race conditions with manual refresh
                device_dump_path = "/sdcard/window_dump_autorefresh.xml"
                local_dump_path = self.parent_app.logs_dir / f"window_dump_autorefresh_{self.udid.replace(':', '-')}.xml"

                dump_cmd = f"adb -s {self.udid} shell uiautomator dump {device_dump_path}"
                success_dump, _output = execute_command(dump_cmd)
                if not success_dump:
                    continue # Silently fail

                pull_cmd = f"adb -s {self.udid} pull {device_dump_path} \"{local_dump_path}\""
                success_pull, _output = execute_command(pull_cmd)
                
                execute_command(f"adb -s {self.udid} shell rm {device_dump_path}")

                if not success_pull:
                    continue # Silently fail

                with open(local_dump_path, 'r', encoding='utf-8') as f:
                    current_dump_content = f.read()
                local_dump_path.unlink(missing_ok=True)

                current_hash = hash(current_dump_content)

                if self.last_ui_dump_hash is not None and current_hash != self.last_ui_dump_hash:
                    # UI has changed, trigger a refresh on the main thread
                    self.scrcpy_output_queue.put(translate("ui_change_detected_refreshing") + "\n")
                    self.after(0, self._start_inspection)
            except tk.TclError:
                # This can happen if the window is closed and widgets are destroyed
                # while the thread is running. Exit gracefully.
                break
            except Exception as e:
                print(f"Error in inspector auto-refresh thread: {e}")

    def _start_inspection(self):
        # Prevent multiple inspection threads from running at the same time
        if getattr(self, 'is_inspection_running', False):
            return
        self.is_inspection_running = True

        self.refresh_inspector_button.config(state=DISABLED, text=translate("refreshing"))
        ToolTip(self.refresh_inspector_button, text=translate("refreshing"))
        self.inspect_button.config(state=DISABLED, text=translate("refreshing"))
        ToolTip(self.inspect_button, text=translate("refreshing"))
        self.screenshot_canvas.delete("all")
        self.xpath_search_var.set("") # Clear search on refresh

        # Display updating message on canvas
        self.screenshot_canvas.update_idletasks()
        canvas_width = self.screenshot_canvas.winfo_width()

        # If the canvas hasn't been drawn yet, its size will be 1.
        # In that case, schedule this part of the function to run again shortly.
        if canvas_width <= 1:
            self.after(50, self._start_inspection)
            return
        canvas_height = self.screenshot_canvas.winfo_height()
        self.screenshot_canvas.create_text(
            canvas_width / 2, canvas_height / 2,
            text=translate("inspector_updating_screen"),
            font=("Helvetica", 16), fill=self.parent_app.style.colors.fg, tags="loading_text"
        )

        for item in self.elements_tree.get_children():
            self.elements_tree.delete(item)
        self.elements_data_map = {} # Clear previous data
        
        threading.Thread(target=self._perform_inspection_thread, daemon=True).start()

    def _perform_inspection_thread(self):
        try:
            # 1. Take screenshot
            screenshots_dir = self.parent_app.screenshots_dir
            screenshots_dir.mkdir(exist_ok=True)
            timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
            device_screenshot_path = "/sdcard/inspector_screenshot.png"
            local_screenshot_filename = f"inspector_screenshot_{self.udid.replace(':', '-')}_{timestamp}.png"
            local_screenshot_filepath = screenshots_dir / local_screenshot_filename

            self.scrcpy_output_queue.put(translate("inspector_screenshot_info") + "\n")
            capture_cmd = f"adb -s {self.udid} shell screencap -p {device_screenshot_path}"
            success_cap, out_cap = execute_command(capture_cmd)
            if not success_cap:
                self.scrcpy_output_queue.put(f"{translate('capture_screenshot_error')}\n{out_cap}\n")
                return
            pull_cmd = f"adb -s {self.udid} pull {device_screenshot_path} \"{local_screenshot_filepath}\""
            success_pull, out_pull = execute_command(pull_cmd)
            if not success_pull:
                self.scrcpy_output_queue.put(f"{translate('pull_screenshot_error')}\n{out_pull}\n")
                return
            execute_command(f"adb -s {self.udid} shell rm {device_screenshot_path}")
            self.scrcpy_output_queue.put(translate("screenshot_saved_success", path=local_screenshot_filepath) + "\n")

            # 2. Get UI dump with retry logic for robustness
            device_dump_path = "/sdcard/window_dump.xml"
            local_dump_filepath = self.parent_app.logs_dir / f"window_dump_{self.udid.replace(':', '-')}.xml"
            self.parent_app.logs_dir.mkdir(exist_ok=True)

            self.scrcpy_output_queue.put(translate("get_ui_dump_info") + "\n")

            dump_successful = False
            max_retries = 3
            last_dump_output = ""

            for i in range(max_retries):
                # Always clean up previous attempt's file before trying
                execute_command(f"adb -s {self.udid} shell rm {device_dump_path}")

                dump_cmd = f"adb -s {self.udid} shell uiautomator dump {device_dump_path}"
                success_dump, out_dump = execute_command(dump_cmd)
                last_dump_output = out_dump # Save the last output for error reporting

                # Check for explicit failure from the dump command itself
                if not success_dump or "ERROR" in out_dump:
                    self.scrcpy_output_queue.put(f"INFO: UI dump attempt {i+1}/{max_retries} failed explicitly. Retrying...\n")
                    time.sleep(0.5)
                    continue

                # Verify that the file was actually created on the device
                check_exists_cmd = f"adb -s {self.udid} shell ls {device_dump_path}"
                success_check, _unused = execute_command(check_exists_cmd)
                if success_check:
                    dump_successful = True
                    break  # Success! Exit the retry loop.
                else:
                    self.scrcpy_output_queue.put(f"INFO: UI dump file not found after attempt {i+1}/{max_retries}. Retrying...\n")
                    time.sleep(0.5)

            if not dump_successful:
                self.scrcpy_output_queue.put(f"{translate('get_ui_dump_error')}\n{last_dump_output}\n")
                return

            # If we reach here, the file exists. Proceed with pull.
            pull_dump_cmd = f"adb -s {self.udid} pull {device_dump_path} \"{local_dump_filepath}\""
            success_pull_dump, out_pull_dump = execute_command(pull_dump_cmd)
            if not success_pull_dump:
                self.scrcpy_output_queue.put(f"{translate('pull_ui_dump_error')}\n{out_pull_dump}\n")
                return
            execute_command(f"adb -s {self.udid} shell rm {device_dump_path}")
            self.scrcpy_output_queue.put(translate("ui_dump_saved_success", path=local_dump_filepath) + "\n")

            # Read dump content and store its hash for auto-refresh comparison
            try:
                with open(local_dump_filepath, 'r', encoding='utf-8') as f:
                    dump_content = f.read()
                self.last_ui_dump_hash = hash(dump_content)
            except Exception as e:
                self.scrcpy_output_queue.put(f"Warning: Could not read dump file for hashing: {e}\n")
                self.last_ui_dump_hash = None

            # 3. Process and display
            self.after(0, self._display_inspection_results, local_screenshot_filepath, local_dump_filepath)

        except Exception as e:
            self.scrcpy_output_queue.put(translate("fatal_inspection_error", error=e) + "\n")
        finally:
            # Always reset the state on the main thread when the thread finishes,
            # regardless of success or failure.
            self.after(0, self._on_inspection_finished)

    def _on_inspection_finished(self):
        """Resets the state after an inspection attempt is complete."""
        self.is_inspection_running = False
        # Only re-enable buttons if the inspector mode is still active.
        # This prevents re-enabling them if the user clicked "Stop Inspector"
        # while a refresh was in progress.
        if self.is_inspecting:
            self.refresh_inspector_button.config(state=NORMAL, text=translate("refresh"))
            ToolTip(self.refresh_inspector_button, text=translate("refresh"))
            self.inspect_button.config(state=NORMAL, text=translate("stop_inspector"))
            ToolTip(self.inspect_button, text=translate("stop_inspector_tooltip"))
            
    def _display_inspection_results(self, screenshot_path: Path, dump_path: Path):
        # Display screenshot
        try:
            img = Image.open(screenshot_path)
            self.screenshot_original_size = img.size
            
            # Resize image to fit canvas while maintaining aspect ratio
            self.screenshot_canvas.update_idletasks() # Ensure canvas dimensions are up-to-date
            canvas_width = self.screenshot_canvas.winfo_width()
            canvas_height = self.screenshot_canvas.winfo_height()

            if canvas_width == 1 or canvas_height == 1: # Canvas still not rendered correctly, try again
                self.after(100, lambda: self._display_inspection_results(screenshot_path, dump_path))
                return

            img_width, img_height = img.size
            aspect_ratio = img_width / img_height if img_height > 0 else 1

            if (canvas_width / aspect_ratio) <= canvas_height:
                new_width = canvas_width
                new_height = int(canvas_width / aspect_ratio)
            else:
                new_height = canvas_height
                new_width = int(canvas_height * aspect_ratio)
            img = img.resize((new_width, new_height), Image.LANCZOS)
            
            self.screenshot_current_size = img.size
            self.screenshot_image_tk = ImageTk.PhotoImage(img)
            self.screenshot_canvas.create_image(canvas_width / 2, canvas_height / 2, image=self.screenshot_image_tk, anchor=CENTER)

        except Exception as e:
            self.scrcpy_output_queue.put(translate("display_screenshot_error", error=e) + "\n")
            return

        # Parse XML
        try:
            # Use a recovering parser for potentially malformed UI dumps
            parser = ET.XMLParser(recover=True)
            tree = ET.parse(dump_path, parser)
            root = tree.getroot()
            
            self.current_dump_path = dump_path
            self.all_elements_list = []

            for node in root.iter():
                # Extract all relevant attributes
                self._parse_and_store_node(node)
            
            self._update_element_tree_view()

        except Exception as e:
            self.scrcpy_output_queue.put(translate("parse_ui_dump_error", error=e) + "\n")

    def _parse_and_store_node(self, node: ET.Element):
        """Parses a single XML node and adds it to the all_elements_list if valid."""
        # Start with a copy of all attributes from the XML node. This is the key change.
        element_full_data = dict(node.attrib)

        # Standardize some key names for internal use if they exist
        resource_id = element_full_data.get("resource-id")
        content_desc = element_full_data.get("content-desc")
        text = element_full_data.get("text")
        node_class = element_full_data.get("class")
        bounds_str = element_full_data.get("bounds")

        # Create a display title for the treeview, prioritizing more unique identifiers
        display_title = ""
        if resource_id:
            display_title = f"resource_id={resource_id.split('/')[-1]}"
        elif content_desc:
            display_title = f"accessibility_id={content_desc}"
        elif text:
            display_title = f"text={text}"
        elif node_class:
            display_title = f"class={node_class.split('.')[-1]}" # Keep this for display

        # Ensure we have a title to display
        if display_title:
            # Add our internal helper data to the dictionary
            element_full_data["display_title"] = display_title
            element_full_data["bounds_coords"] = self._parse_bounds(bounds_str)
            element_full_data["accessibility_id"] = content_desc

            self.all_elements_list.append(element_full_data)

    def _populate_elements_tree(self, elements_to_display: List[Dict]):
        """Clears and populates the elements treeview with the given list of elements."""
        for item in self.elements_tree.get_children():
            self.elements_tree.delete(item)
        self.elements_data_map.clear()

        if not elements_to_display:
            self.elements_tree.insert("", END, values=(translate("no_elements_found"),), tags=("no_elements",))
            return

        for element_data in elements_to_display:
            display_title = element_data.get("display_title", "Unknown")
            bounds_coords = element_data.get("bounds_coords")
            item_id = self.elements_tree.insert("", END, values=(display_title,), tags=("element", bounds_coords))
            self.elements_data_map[item_id] = element_data

    def _parse_bounds(self, bounds_str: str) -> Tuple[int, int, int, int]:
        # Example: [0,100][100,200]
        if not bounds_str: return 0, 0, 0, 0
        
        parts = re.findall(r'\d+', bounds_str)
        if len(parts) == 4:
            x1, y1, x2, y2 = map(int, parts)
            return x1, y1, x2 - x1, y2 - y1
        return 0, 0, 0, 0

    def _on_element_select(self, event):
        self.screenshot_canvas.delete("highlight") # Clear previous highlights
        
        selected_items = self.elements_tree.selection()
        if not selected_items: 
            self._update_xpath_buttons_state(None) # Disable buttons if nothing selected
            self._populate_element_details(None) # Clear details
            return

        item_id = selected_items[0]
        selected_element_data = self.elements_data_map.get(item_id)

        if selected_element_data:
            bounds_coords = selected_element_data.get("bounds_coords")
            if bounds_coords:
                x, y, width, height = bounds_coords
                
                # Scale coordinates to fit the displayed image
                original_img_width, original_img_height = self.screenshot_original_size
                current_img_width, current_img_height = self.screenshot_current_size

                scale_x = current_img_width / original_img_width
                scale_y = current_img_height / original_img_height

                scaled_x = x * scale_x
                scaled_y = y * scale_y
                scaled_width = width * scale_x
                scaled_height = height * scale_y

                # Calculate offset to center the image on the canvas
                canvas_width = self.screenshot_canvas.winfo_width()
                canvas_height = self.screenshot_canvas.winfo_height()
                offset_x = (canvas_width - current_img_width) / 2
                offset_y = (canvas_height - current_img_height) / 2

                # Draw rectangle
                self.screenshot_canvas.create_rectangle(
                    scaled_x + offset_x, scaled_y + offset_y,
                    scaled_x + scaled_width + offset_x, scaled_y + scaled_height + offset_y,
                    outline="red", width=2, tags="highlight"
                )
            
            self._update_xpath_buttons_state(selected_element_data) # Enable/update buttons
            self._update_element_actions_state(True) # Enable action buttons
            self._populate_element_details(selected_element_data)
        else:
            self._update_xpath_buttons_state(None) # Disable buttons if no data found
            self._update_element_actions_state(False) # Disable action buttons
            self._populate_element_details(None)

    def _update_element_actions_state(self, enabled: bool):
        """Enables or disables all element action buttons."""
        state = NORMAL if enabled else DISABLED
        for button in [self.action_click_button, self.action_long_click_button,
                       self.action_swipe_up_button, self.action_swipe_down_button,
                       self.action_swipe_left_button, self.action_swipe_right_button]:
            button.config(state=state)
    def _on_treeview_click(self, event):
        """Deselects the item if the user clicks on an empty area of the treeview."""
        # identify_row returns the item ID at the given y-coordinate, or an empty string
        item = self.elements_tree.identify_row(event.y)
        if not item:
            self.elements_tree.selection_set("")

    def _on_inspector_canvas_resize(self, event=None):
        """Redraws the selected element's highlight when the inspector canvas is resized."""
        if self.is_inspecting and self.elements_tree.selection():
            # Re-select the currently selected item to trigger redraw
            # Pass None as event, as it's not a direct selection event
            self._on_element_select(None)

    def _update_xpath_buttons_state(self, element_data: Optional[Dict]):
        """Creates/updates XPath copy buttons based on available element data."""
        self.current_selected_element_data = element_data

        # Clear existing buttons
        for button in self.xpath_buttons.values():
            button.destroy()
        self.xpath_buttons = {}

        if not element_data:
            return

        # Define which attributes to create buttons for
        attributes_to_check = ["resource_id", "text", "accessibility_id", "class"]
        
        for attr in attributes_to_check:
            attr_value = element_data.get(attr)
            # Don't show buttons for null or empty attributes
            if attr_value:
                # Truncate long values for display
                display_value = (attr_value[:30] + '...') if len(attr_value) > 33 else attr_value
                button_text = f"{attr.replace('_', ' ').title()}: {display_value}"
                
                button = ttk.Button(
                    self.xpath_buttons_container,
                    text=button_text,
                    command=lambda a=attr: self._copy_xpath(a)
                )
                ToolTip(button, translate("copy_xpath_tooltip", attr=attr, value=attr_value))
                # Align buttons vertically
                button.pack(side=TOP, fill=X, padx=2, pady=1)
                self.xpath_buttons[attr] = button

    def _generate_xpath(self, attribute_type: str) -> str:
        """Generates an XPath string for the currently selected element based on the attribute type."""
        if not self.current_selected_element_data:
            return ""

        element = self.current_selected_element_data
        xpath = ""

        if attribute_type == "id" and element.get("id"):
            xpath = f"//*[@id='{element["id"]}']"
        elif attribute_type == "resource_id" and element.get("resource_id"):
            xpath = f"//*[@resource-id='{element["resource_id"]}']"
        elif attribute_type == "accessibility_id" and element.get("accessibility_id"):
            xpath = f"//*[@content-desc='{element["accessibility_id"]}']"
        elif attribute_type == "text" and element.get("text"):
            xpath = f"//*[@text='{element["text"]}']"
        elif attribute_type == "class" and element.get("class"):
            xpath = f"//android.widget.{element["class"].split('.')[-1]}" # Simplified for common Android classes
        
        # Add a more generic fallback if specific attribute is not found but class is
        if not xpath and element.get("class"):
             xpath = f"//android.widget.{element["class"].split('.')[-1]}"

        return xpath

    def _populate_element_details(self, element_data: Optional[Dict]):
        """Populates the element details text view with all attributes."""
        self.element_details_text.text.config(state=NORMAL)
        self.element_details_text.text.delete("1.0", END)

        if element_data:
            # We don't want to show some internal data that is already represented elsewhere
            attributes_to_show = {
                k: v for k, v in element_data.items() 
                if k not in ["bounds_coords", "display_title"] and v is not None and v != ''
            }
            
            for key, value in sorted(attributes_to_show.items()):
                # Make the key bold
                self.element_details_text.text.insert(END, f"{key.replace('_', ' ').title()}: ", "bold")
                self.element_details_text.text.insert(END, f"{value}\n")
        
        self.element_details_text.text.config(state=DISABLED)

    def _copy_xpath(self, attribute_type: str):
        """Generates XPath and copies it to clipboard."""
        xpath = self._generate_xpath(attribute_type)
        if xpath:
            try:
                self.clipboard_clear()
                self.clipboard_append(xpath)
                messagebox.showinfo(translate("xpath_copied_title"), translate("xpath_copied_message", xpath=xpath), parent=self)
            except Exception as e:
                messagebox.showerror(translate("copy_error_title"), translate("copy_error_message", error=e), parent=self)
        else:
            messagebox.showwarning(translate("no_xpath_title"), translate("no_xpath_message"), parent=self)

    def _perform_xpath_search(self):
        """Filters the element list based on an XPath query against the last UI dump."""
        xpath_query = self.xpath_search_var.get()
        if not xpath_query or not self.current_dump_path:
            return

        try:
            # Use a recovering parser for potentially malformed UI dumps
            parser = ET.XMLParser(recover=True)
            tree = ET.parse(self.current_dump_path, parser)
            root = tree.getroot()
            # Use .xpath() for full XPath 1.0 support, which includes functions like starts-with()
            found_xml_nodes = root.xpath(xpath_query)
            found_bounds = {node.get("bounds") for node in found_xml_nodes}
            
            search_results = [
                element_data for element_data in self.all_elements_list
                if element_data.get("bounds") in found_bounds
            ]
            final_list = self._apply_inspector_filter(source_list=search_results)
            self._populate_elements_tree(final_list)
        except ET.XMLSyntaxError as e:
            messagebox.showerror(translate("parse_ui_dump_error"), str(e), parent=self)
        except ET.XPathSyntaxError as e:
            messagebox.showerror(translate("invalid_xpath_title"), translate("invalid_xpath_message", error=e), parent=self)

    def _clear_xpath_search(self):
        """Clears the XPath search and restores the full list of elements."""
        self.xpath_search_var.set("")
        self._update_element_tree_view()

    def _on_canvas_click(self, event):
        """Handles clicks on the inspector screenshot canvas."""
        if not self.is_inspecting or not hasattr(self, 'screenshot_original_size') or not self.screenshot_original_size:
            return

        # 1. Translate canvas coordinates to original image coordinates
        canvas_width = self.screenshot_canvas.winfo_width()
        canvas_height = self.screenshot_canvas.winfo_height()
        current_img_width, current_img_height = self.screenshot_current_size
        original_img_width, original_img_height = self.screenshot_original_size

        offset_x = (canvas_width - current_img_width) / 2
        offset_y = (canvas_height - current_img_height) / 2

        click_x_on_image = event.x - offset_x
        click_y_on_image = event.y - offset_y

        # 2. Check if the click is on the image and find the best matching element
        is_click_on_image = (0 <= click_x_on_image < current_img_width and 0 <= click_y_on_image < current_img_height)
        best_match = None
        if is_click_on_image:
            scale_x = original_img_width / current_img_width
            scale_y = original_img_height / current_img_height

            original_click_x = click_x_on_image * scale_x
            original_click_y = click_y_on_image * scale_y

            # Find the smallest element containing the click
            smallest_area = float('inf')

            for item_id, element_data in self.elements_data_map.items():
                bounds_coords = element_data.get("bounds_coords")
                if bounds_coords:
                    x, y, width, height = bounds_coords
                    if x <= original_click_x < x + width and y <= original_click_y < y + height:
                        area = width * height
                        if area < smallest_area:
                            smallest_area = area
                            best_match = {"item_id": item_id, "element_data": element_data}

        # 3. Handle the found element or deselect if no element was found
        if best_match:
            found_item_id = best_match["item_id"]
            found_element_data = best_match["element_data"]
            
            current_selection = self.elements_tree.selection()
            is_already_selected = current_selection and current_selection[0] == found_item_id

            if is_already_selected:
                bounds_coords = found_element_data.get("bounds_coords")
                if bounds_coords:
                    x, y, width, height = bounds_coords
                    center_x, center_y = x + width / 2, y + height / 2
                    threading.Thread(target=self._send_tap_to_device_and_refresh, args=(center_x, center_y), daemon=True).start()
            else:
                self.elements_tree.selection_set(found_item_id)
                self.elements_tree.see(found_item_id)
        else:
            # Click was on an empty area (or outside the image), deselect everything
            self.elements_tree.selection_set("")
            self.screenshot_canvas.delete("highlight")
            self._update_xpath_buttons_state(None)

    def _send_tap_to_device_and_refresh(self, x, y):
        """Sends a tap command to the device and then triggers an inspector refresh."""
        self.scrcpy_output_queue.put(translate("tap_info", x=int(x), y=int(y)) + "\n")
        command = f"adb -s {self.udid} shell input tap {int(x)} {int(y)}"
        success, output = execute_command(command)
        if not success:
            self.scrcpy_output_queue.put(translate("tap_error", output=output) + "\n")
        else:
            self.scrcpy_output_queue.put(translate("tap_success_refreshing") + "\n")
            self.after(500, self._start_inspection)

    def _perform_element_action(self, action_type: str):
        """
        Performs a specified action (click, long_click, swipe) on the selected element
        and triggers a refresh.
        """
        if not self.current_selected_element_data:
            return

        bounds_coords = self.current_selected_element_data.get("bounds_coords")
        if not bounds_coords:
            return

        x, y, width, height = bounds_coords
        center_x = x + width / 2
        center_y = y + height / 2

        # Disable buttons during action
        self._update_element_actions_state(False)
        self.scrcpy_output_queue.put(translate("performing_action", action=action_type) + "\n")

        # Run action in a thread to not block UI
        threading.Thread(target=self._execute_action_and_refresh, args=(action_type, x, y, width, height, center_x, center_y), daemon=True).start()

    def _execute_action_and_refresh(self, action_type: str, x, y, width, height, center_x, center_y):
        """Helper method that runs in a thread to execute an ADB command."""
        command = ""
        if action_type == "click":
            command = f"adb -s {self.udid} shell input tap {int(center_x)} {int(center_y)}"
        elif action_type == "long_click":
            command = f"adb -s {self.udid} shell input swipe {int(center_x)} {int(center_y)} {int(center_x)} {int(center_y)} 500" # 500ms duration
        elif action_type == "swipe_up":
            y_start, y_end = y + height * 0.8, y + height * 0.2
            command = f"adb -s {self.udid} shell input swipe {int(center_x)} {int(y_start)} {int(center_x)} {int(y_end)} 400"
        elif action_type == "swipe_down":
            y_start, y_end = y + height * 0.2, y + height * 0.8
            command = f"adb -s {self.udid} shell input swipe {int(center_x)} {int(y_start)} {int(center_x)} {int(y_end)} 400"
        elif action_type == "swipe_left":
            x_start, x_end = x + width * 0.8, x + width * 0.2
            command = f"adb -s {self.udid} shell input swipe {int(x_start)} {int(center_y)} {int(x_end)} {int(center_y)} 400"
        elif action_type == "swipe_right":
            x_start, x_end = x + width * 0.2, x + width * 0.8
            command = f"adb -s {self.udid} shell input swipe {int(x_start)} {int(center_y)} {int(x_end)} {int(center_y)} 400"

        if command:
            success, output = execute_command(command)
            if not success:
                self.scrcpy_output_queue.put(translate("action_error", action=action_type, output=output) + "\n")
            else:
                self.scrcpy_output_queue.put(translate("action_success_refreshing", action=action_type) + "\n")
                self.after(500, self._start_inspection)
        
        # Re-enable buttons on the main thread, regardless of outcome
        self.after(0, self._update_element_actions_state, True)

    def _apply_inspector_filter(self, source_list: Optional[List[Dict]] = None) -> List[Dict]:
        """
        Filters a list of UI elements based on the currently selected attribute filters.
        Returns the filtered list.
        """
        use_list = source_list if source_list is not None else self.all_elements_list
        if not use_list:
            return []

        # Check which filters are active
        active_filters = {
            "resource-id": self.filter_by_resource_id_var.get(),
            "accessibility_id": self.filter_by_content_desc_var.get(),
            "text": self.filter_by_text_var.get(),
            "scrollview": self.filter_by_scrollview_var.get(),
            "other_class": self.filter_by_other_class_var.get()
        }

        # If no filters are selected, show everything from the source list
        if not any(active_filters.values()):
            return use_list

        filtered_elements = []
        for element_data in use_list:
            # Check if the element has any of the attributes that are being filtered for
            if (active_filters["resource-id"] and element_data.get("resource-id")):
                filtered_elements.append(element_data)
            elif (active_filters["accessibility_id"] and element_data.get("accessibility_id")):
                filtered_elements.append(element_data)
            elif (active_filters["text"] and element_data.get("text")):
                filtered_elements.append(element_data)
            elif (active_filters["scrollview"] and "ScrollView" in element_data.get("class", "")):
                 filtered_elements.append(element_data)
            elif (active_filters["other_class"] and element_data.get("class") and "ScrollView" not in element_data.get("class", "")):
                # This logic ensures we only add it if it's a class-based element that isn't a ScrollView
                # and doesn't have the other, more specific, identifiers.
                if not (element_data.get("resource-id") or element_data.get("accessibility_id") or element_data.get("text")):
                    filtered_elements.append(element_data)

        
        return filtered_elements

    def _update_element_tree_view(self):
        """Applies the current filters to the master element list and updates the treeview."""
        if not self.is_inspecting:
            return
        filtered_list = self._apply_inspector_filter()
        self._populate_elements_tree(filtered_list)

    # --- Scrcpy Feature Methods ---

    def _run_and_embed_scrcpy(self):
        """Runs scrcpy, captures its output, and embeds its window."""
        try:
            self.unique_title = f"scrcpy_{int(time.time() * 1000)}"
            command_with_udid = self.command_template.format(udid=self.udid)
            command_to_run = f'{command_with_udid} -m 1024 -b 2M --max-fps=30 --no-audio --window-title="{self.unique_title}"'
            creationflags = subprocess.CREATE_NO_WINDOW if sys.platform == "win32" else 0
            
            self.scrcpy_process = subprocess.Popen(
                command_to_run, shell=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                text=True, encoding=OUTPUT_ENCODING, errors='replace', creationflags=creationflags
            )
            output_thread = threading.Thread(target=self._pipe_scrcpy_output_to_queue)
            output_thread.daemon = True
            output_thread.start()
            self._find_and_embed_window()
        except Exception as e:
            self.scrcpy_output_queue.put(translate("scrcpy_start_error", error=e) + "\n")
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
        lines_to_add = []
        while not self.scrcpy_output_queue.empty():
            try:
                line = self.scrcpy_output_queue.get_nowait()
                lines_to_add.append(line)
            except Empty:
                pass
        
        if lines_to_add:
            self.scrcpy_output_text.text.config(state=NORMAL)
            self.scrcpy_output_text.text.insert(END, "".join(lines_to_add))
            self.scrcpy_output_text.text.see(END)
            self.scrcpy_output_text.text.config(state=DISABLED)

        if self.is_mirroring and self.scrcpy_process and self.scrcpy_process.poll() is not None:
             self.scrcpy_output_queue.put(f"\n{translate('scrcpy_terminated_unexpectedly')}\n")
             self._stop_scrcpy()
        self.after(500, self._check_scrcpy_output_queue)

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
        self.scrcpy_output_queue.put(translate("scrcpy_find_window_error", title=self.unique_title) + "\n")
        self.after(0, self._stop_scrcpy)

    def _embed_window(self):
        if not self.scrcpy_hwnd or not self.is_mirroring: return
        try:
            if not win32gui.IsWindow(self.scrcpy_hwnd):
                self.scrcpy_output_queue.put(translate("scrcpy_embed_error_invalid_handle") + "\n")
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
            self.scrcpy_output_queue.put(translate("scrcpy_embedded_info", hwnd=self.scrcpy_hwnd) + "\n")
        except win32gui.error as e:
            self.scrcpy_output_queue.put(translate("scrcpy_embed_error_win32", error=e) + "\n")

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
        self.screenshot_button.config(state=DISABLED, text=translate("taking_screenshot"))
        threading.Thread(target=self._take_screenshot_thread, daemon=True).start()

    def _take_screenshot_thread(self):
        self.scrcpy_output_queue.put(translate("screenshot_info") + "\n")
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
                self.scrcpy_output_queue.put(f"{translate('capture_screenshot_error')}\n{out_cap}\n")
                return
            pull_cmd = f"adb -s {self.udid} pull {device_filename} \"{local_filepath}\""
            success_pull, out_pull = execute_command(pull_cmd)
            if not success_pull:
                self.scrcpy_output_queue.put(f"{translate('pull_screenshot_error')}\n{out_pull}\n")
            else:
                self.scrcpy_output_queue.put(translate("screenshot_saved_success", path=local_filepath) + "\n")
            execute_command(f"adb -s {self.udid} shell rm {device_filename}")
        finally:
            self.after(0, lambda: self.screenshot_button.config(state=NORMAL, text=translate("take_screenshot")))
            ToolTip(self.screenshot_button, text=translate("take_screenshot_tooltip"))

    def _toggle_recording(self):
        if not self.is_recording: self._start_recording()
        else: self._stop_recording()

    def _start_recording(self):
        self.record_button.config(state=DISABLED, text=translate("starting_recording"))
        ToolTip(self.record_button, text=translate("starting_recording_tooltip"))
        threading.Thread(target=self._start_recording_thread, daemon=True).start()

    def _start_recording_thread(self):
        recordings_dir = self.parent_app.recordings_dir
        recordings_dir.mkdir(exist_ok=True)
        timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
        device_filename = f"recording_{timestamp}.mp4"
        self.recording_device_path = f"/sdcard/{device_filename}"
        command_list = ["adb", "-s", self.udid, "shell", "screenrecord", self.recording_device_path]
        self.scrcpy_output_queue.put(translate("recording_start_info", command=' '.join(command_list)) + "\n")
        try:
            self.recording_process = subprocess.Popen(
                command_list, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True,
                encoding=OUTPUT_ENCODING, errors='replace',
                creationflags=subprocess.CREATE_NO_WINDOW if sys.platform == "win32" else 0
            )
            self.after(0, self._update_recording_ui, True)
        except Exception as e:
            self.scrcpy_output_queue.put(translate("recording_start_error", error=e) + "\n")
            self.after(0, lambda: self.record_button.config(state=NORMAL, text=translate("start_recording")))
            ToolTip(self.record_button, text=translate("start_recording_tooltip"))

    def _stop_recording(self):
        self.record_button.config(state=DISABLED, text=translate("stopping_recording"))
        ToolTip(self.record_button, text=translate("stopping_recording_tooltip"))
        threading.Thread(target=self._stop_recording_thread, daemon=True).start()

    def _stop_recording_thread(self):
        self.scrcpy_output_queue.put(translate("recording_stop_info") + "\n")
        if not self.recording_process or self.recording_process.poll() is not None:
            self.scrcpy_output_queue.put(translate("no_active_recording_error") + "\n")
            self.after(0, self._update_recording_ui, False)
            return
        try:
            self.recording_process.kill()
            self.scrcpy_output_queue.put(translate("recording_stopped_saving_info") + "\n")
        except subprocess.TimeoutExpired:
            self.scrcpy_output_queue.put(translate("recording_unresponsive_warning") + "\n")
            self.recording_process.kill()
        except Exception as e:
            self.scrcpy_output_queue.put(translate("recording_stop_error", error=e) + "\n")
            self.recording_process.kill()
        time.sleep(2)
        recordings_dir = self.parent_app.recordings_dir
        local_filename = Path(self.recording_device_path).name
        local_filepath = recordings_dir / f"{self.udid.replace(':', '-')}_{local_filename}"
        pull_cmd = f"adb -s {self.udid} pull {self.recording_device_path} \"{local_filepath}\""
        success_pull, out_pull = execute_command(pull_cmd)
        if not success_pull:
            self.scrcpy_output_queue.put(f"{translate('pull_recording_error')}\n{out_pull}\n")
        else:
            self.scrcpy_output_queue.put(translate("recording_saved_success", path=local_filepath) + "\n")
        execute_command(f"adb -s {self.udid} shell rm {self.recording_device_path}")
        self.after(0, self._update_recording_ui, False)

    def _update_recording_ui(self, is_recording: bool):
        self.is_recording = is_recording
        if is_recording:
            self.record_button.config(text=translate("stop_recording"), bootstyle="danger")
            ToolTip(self.record_button, text=translate("stop_recording_tooltip"))
        else:
            self.record_button.config(text=translate("start_recording"), bootstyle="primary")
            ToolTip(self.record_button, text=translate("start_recording_tooltip"))
        self.record_button.config(state=NORMAL)

    # --- Performance Monitor Methods ---------------------------------------------
    def _toggle_performance_monitor(self):
        if self.is_monitoring:
            self._stop_performance_monitor()
        else:
            self._start_performance_monitor()

    def _start_performance_monitor(self):
        app_package = self.app_package_combo.get()
        if not app_package:
            messagebox.showwarning(translate("input_error"), translate("select_app_package_warning"), parent=self)
            return
        self.is_monitoring = True
        self.stop_monitoring_event.clear()
        self.monitor_button.config(text=translate("stop_monitoring"), bootstyle="danger")
        ToolTip(self.monitor_button, text=translate("stop_monitoring_tooltip"))
        self.toggle_minimize_perf_button.config(state=NORMAL)
        self.app_package_combo.config(state=DISABLED)
        self.performance_output_text.text.config(state=NORMAL)
        self.performance_output_text.text.delete("1.0", END)
        self.last_performance_line_var.set("")
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
            self.monitor_button.config(text=translate("start_monitoring"), bootstyle="success")
            ToolTip(self.monitor_button, text=translate("start_monitoring_tooltip"))
            self.toggle_minimize_perf_button.config(state=DISABLED)
            self.app_package_combo.config(state="readonly")
            self.performance_output_queue.put(f"\n{translate('monitoring_stopped_by_user')}\n")
            self.last_performance_line_var.set("")

    def _check_performance_output_queue(self):
        items_to_process = []
        while not self.performance_output_queue.empty():
            try:
                item = self.performance_output_queue.get_nowait()
                items_to_process.append(item)
            except Empty:
                pass

        if items_to_process:
            log_content_batch = []
            self.performance_output_text.text.config(state=NORMAL)

            for item in items_to_process:
                line_to_log = ""
                if isinstance(item, dict):
                    line_to_log = (
                        f"{item['ts']:<10} | {item['elapsed']:<10} | CPU: {item['cpu']:<5} | "
                        f"RAM: {item['ram']:<7} | GPU: {item['gpu']:<10} | "
                        f"Missed Vsync: {item['vsync']:<1} | Janky: {item['janky']:<15} | "
                        f"FPS: {item['fps']:<4}\n"
                    )
                    janky_percent = item['janky'].split(' ')[0]
                    compact_line = (
                        f"CPU:{item['cpu']}% RAM:{item['ram']}MB GPU:{item['gpu']}KB "
                        f"Janky:{janky_percent} FPS:{item['fps']}"
                    )
                    self.last_performance_line_var.set(compact_line)
                elif isinstance(item, str):
                    line_to_log = item
                    if translate('monitoring_stopped_by_user') in item:
                        self.last_performance_line_var.set("")

                log_content_batch.append(line_to_log)

            # Batch update the GUI and log file
            self.performance_output_text.text.insert(END, "".join(log_content_batch))
            self.performance_output_text.text.see(END)
            self.performance_output_text.text.config(state=DISABLED)

            if self.performance_log_file:
                try:
                    with open(self.performance_log_file, 'a', encoding=OUTPUT_ENCODING) as f:
                        f.write("".join(log_content_batch))
                except Exception as e:
                    self.performance_output_queue.put(f"\n{translate('log_write_error', error=e)}\n")

        if self.is_monitoring and (self.performance_thread is None or not self.performance_thread.is_alive()):
             self._stop_performance_monitor()
        self.after(500, self._check_performance_output_queue)

    def _toggle_performance_minimize(self):
        """Toggles the performance monitor view between full log and a single line summary."""
        is_minimized = self.performance_monitor_is_minimized.get()
        
        if is_minimized:
            # Maximize
            self.minimized_performance_label.pack_forget()
            self.performance_output_text.pack(fill=BOTH, expand=YES, padx=5, pady=(0,5))
            self.toggle_minimize_perf_button.config(text=translate("minimize_performance"))
            ToolTip(self.toggle_minimize_perf_button, text=translate("minimize_performance_tooltip"))
            self.performance_monitor_is_minimized.set(False)
        else:
            # Minimize
            self.performance_output_text.pack_forget()
            self.minimized_performance_label.pack(fill=X, padx=5, pady=5)
            self.toggle_minimize_perf_button.config(text=translate("maximize_performance"))
            ToolTip(self.toggle_minimize_perf_button, text=translate("maximize_performance_tooltip"))
            self.performance_monitor_is_minimized.set(True)

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
        self.robot_output_text.text.delete("1.0", END)
        self.robot_output_text.text.config(state=DISABLED)

        self.repeat_test_button.pack_forget()
        self.close_button.pack_forget()

        self.stop_test_button.config(state=NORMAL)
        self.stop_test_button.pack(fill=X, pady=5, padx=5)
        ToolTip(self.stop_test_button, text=translate("stop_test_tooltip"))

    def _start_test(self):
        self._reset_ui_for_test_run()
        robot_thread = threading.Thread(target=self._run_robot_test)
        robot_thread.daemon = True
        robot_thread.start()

    def _run_robot_test(self):
        try:
            device_info = get_device_properties(self.udid)
            if not device_info:
                self.robot_output_queue.put(translate("get_device_info_error", udid=self.udid) + "\n")
                return

            file_path = Path(self.run_path)
            suite_name = file_path.stem
            self.cur_log_dir = self.parent_app.logs_dir / f"A{device_info['release']}_{device_info['model']}_{self.udid}" / suite_name
            self.cur_log_dir.mkdir(parents=True, exist_ok=True)
            
            timestamp_option = " --timestampoutputs" if self.parent_app.timestamp_logs_var.get() else ""
            
            base_command = (
                f'robot{timestamp_option} --split-log --logtitle "{device_info["release"]} - {device_info["model"]}" '
                f'-v udid:"{self.udid}" -v deviceName:"{device_info["model"]}" -v versao_OS:"{device_info["release"]}" '
                f'-d "{self.cur_log_dir}" --name "{suite_name}" '
            )
            if self.run_mode == "Suite":
                command = f'{base_command} --argumentfile ".\\{file_path}"'
            else:
                command = f'{base_command} ".\\{file_path}"'

            self.robot_output_queue.put(translate("executing_command", command=command))

            creationflags = subprocess.CREATE_NO_WINDOW if sys.platform == "win32" else 0
            self.robot_process = subprocess.Popen(
                command, shell=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                text=True, encoding=OUTPUT_ENCODING, errors='replace', creationflags=creationflags
            )
            for line in iter(self.robot_process.stdout.readline, ''):
                self.robot_output_queue.put(line)
            self.robot_process.stdout.close()
            return_code = self.robot_process.wait()
            self.robot_output_queue.put(translate("test_finished", code=return_code) + "\n")
            
        except Exception as e:
            self.robot_output_queue.put(translate("robot_run_fatal_error", error=e) + "\n")
        finally:
            self.after(0, self._on_test_finished)
            self.after(0, self.parent_app._on_period_change) # Refresh logs view for current period

    def _check_robot_output_queue(self):
        if self.mode != 'test': return
        
        lines_to_process = []
        while not self.robot_output_queue.empty():
            try:
                line = self.robot_output_queue.get_nowait()
                lines_to_process.append(line)
            except Empty:
                pass

        if lines_to_process:
            self.robot_output_text.text.config(state=NORMAL)
            for line in lines_to_process:
                 if line.strip().startswith(("Output:", "Log:", "Report:")):
                    parts = line.split(":", 1)
                    prefix = parts[0].strip() + ":"
                    path = parts[1].strip()

                    self.robot_output_text.text.insert(END, f"{prefix: <8}")

                    link_tag = f"LINK_{time.time()}"
                    self.robot_output_text.text.insert(END, path, ("LINK", link_tag))
                    self.robot_output_text.text.tag_bind(link_tag, "<Button-1>", lambda e, p=path: self._open_file_path(p))
                    self.robot_output_text.text.tag_bind(link_tag, "<Enter>", lambda e: self.robot_output_text.config(cursor="hand2"))
                    self.robot_output_text.text.tag_bind(link_tag, "<Leave>", lambda e: self.robot_output_text.config(cursor=""))
                    self.robot_output_text.text.insert(END, "\n")

                 else:
                    tag = None
                    if "| PASS |" in line: tag = "PASS"
                    elif "| FAIL |" in line: tag = "FAIL"
                    self.robot_output_text.text.insert(END, line, tag)

            self.robot_output_text.text.see(END)
            self.robot_output_text.text.config(state=DISABLED)

        self.after(500, self._check_robot_output_queue)

    def _open_file_path(self, path: str):
        """Callback to open a file path from a link in the text widget."""
        try:
            # Sanitize path, sometimes it might have extra characters
            clean_path = Path(path.strip())
            if clean_path.exists():
                os.startfile(clean_path)
            else:
                messagebox.showwarning(translate("file_not_found_title"), translate("file_not_found_message", path=clean_path), parent=self)
        except Exception as e:
            messagebox.showerror(translate("open_file_error_title"), translate("open_file_error_message", error=e), parent=self)

    def _stop_test(self):
        self.stop_test_button.config(state=DISABLED)
        self.robot_output_queue.put(f"\n{translate('stop_button_clicked')}\n")
        if self.robot_process and self.robot_process.poll() is None:
            # Use a thread to avoid blocking the UI while terminating
            thread = threading.Thread(target=self._terminate_process_tree, args=(self.robot_process.pid, "robot"))
            thread.daemon = True
            thread.start()
        else:
            self.robot_output_queue.put(translate("robot_process_already_finished") + "\n")

    def _stop_test_sync(self):
        """Synchronous version of stop_test for internal state changes."""
        self.robot_output_queue.put(f"\n{translate('stop_button_clicked')}\n")
        if self.robot_process and self.robot_process.poll() is None:
            self._terminate_process_tree(self.robot_process.pid, "robot")
        else:
            self.robot_output_queue.put(translate("robot_process_already_finished") + "\n")

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
                os.kill(os.getpid(pid), signal.SIGTERM)
            output_q = self.robot_output_queue if name == "robot" else self.scrcpy_output_queue
            output_q.put(translate("process_terminated_info", name=name.capitalize(), pid=pid) + "\n")
        except (subprocess.CalledProcessError, ProcessLookupError, FileNotFoundError) as e:
            print(translate("terminate_process_warning", name=name, pid=pid, e=e))

    def _on_close(self):
        if self._is_closing: return
        self._is_closing = True

        # Stop all background activities gracefully
        self._stop_all_activities()

        # Remove window from parent's active list
        key_to_remove = None
        for key, win in self.parent_app.active_command_windows.items():
            if win is self:
                key_to_remove = key
                break
        if key_to_remove:
            # Ensure the key exists before deleting
            if key_to_remove in self.parent_app.active_command_windows:
                del self.parent_app.active_command_windows[key_to_remove]

        self.destroy()

    def _on_close_reused(self):
        """Handles closing logic when the window is being reused for another task."""
        if self._is_closing: return
        self._is_closing = True
        self._stop_all_activities()
        key_to_remove = self.udid
        if key_to_remove in self.parent_app.active_command_windows:
            del self.parent_app.active_command_windows[key_to_remove]

        self.destroy()

    def _stop_all_activities(self):
        """Stops all running processes and threads associated with this window."""
        if self.mode == 'test' and self.robot_process and self.robot_process.poll() is None:
            self._stop_test_sync() # Use synchronous version to ensure it's stopped before next action
        if self.is_monitoring:
            self._stop_performance_monitor()
        if self.is_recording:
            self.scrcpy_output_queue.put(translate("stop_recording_on_close") + "\n")
            self._stop_recording() # This now handles threading internally
        if self.is_mirroring:
            self._stop_scrcpy()

# --- Page Object Classes for Tabs ---

class RunTabPage(ttk.Frame):
    """UI and logic for the 'Run Tests' tab."""
    def __init__(self, parent, app: "RobotRunnerApp"):
        super().__init__(parent, padding=10)
        self.app = app

        self._setup_widgets()
        self.on_run_mode_change()

    def _setup_widgets(self):
        device_frame = ttk.Frame(self, padding=10)
        device_frame.pack(fill=X, pady=5)
        device_frame.columnconfigure(0, weight=1)
        device_frame.columnconfigure(1, weight=0)
        
        # ttk.Label(device_frame, text=translate("select_devices")).pack(side=LEFT, padx=5)
        listbox_label = ttk.Label(device_frame, text=translate("select_devices"))
        listbox_label.grid(row=0, column=0, sticky=W)
        listbox_frame = ttk.Frame(device_frame)
        listbox_frame.grid(row=1, column=0, sticky="nsew")
        listbox_frame.columnconfigure(0, weight=1)
        
        # scrollbar = ttk.Scrollbar(listbox_frame, orient=VERTICAL)
        self.device_listbox = tk.Listbox(listbox_frame, selectmode=EXTENDED, exportselection=False, height=4)
        # scrollbar.config(command=self.device_listbox.yview)
        
        # scrollbar.pack(side=RIGHT, fill=Y)
        self.device_listbox.pack(side=LEFT, fill=BOTH, expand=YES)
        ToolTip(self.device_listbox, translate("devices_tooltip"))
        
        self.refresh_button = ttk.Button(device_frame, text=translate("refresh"), command=self.app._refresh_devices, bootstyle="secondary")
        self.refresh_button.grid(row=1, column=1, sticky="e", padx=5)
        self.refresh_button.columnconfigure(0, weight=0)
        ToolTip(self.refresh_button, translate("refresh_devices_tooltip"))

        test_frame = ttk.Frame(self, padding=10)
        test_frame.pack(fill=BOTH, expand=YES, pady=5)
        test_frame.columnconfigure(0, weight=1)
        test_frame.rowconfigure(1, weight=1)

        top_controls_frame = ttk.Frame(test_frame)
        top_controls_frame.grid(row=0, column=0, sticky="ew", padx=5, pady=2)
        top_controls_frame.columnconfigure(0, weight=1)

        self.selection_label = ttk.Label(top_controls_frame, text=translate("test_suites_txt"))
        self.selection_label.grid(row=0, column=0, sticky=W)
        
        mode_frame = ttk.Frame(top_controls_frame)
        mode_frame.grid(row=0, column=1, sticky="e")
        ttk.Radiobutton(mode_frame, text=translate("run_by_suite"), variable=self.app.run_mode_var, value="Suite", command=self.on_run_mode_change).pack(side=LEFT, padx=5)
        ttk.Radiobutton(mode_frame, text=translate("run_by_test"), variable=self.app.run_mode_var, value="Test", command=self.on_run_mode_change).pack(side=LEFT, padx=5)
        ToolTip(mode_frame, text=translate("select_run_mode_tooltip"))

        self.selection_listbox = tk.Listbox(test_frame, exportselection=False)
        self.selection_listbox.grid(row=1, column=0, padx=5, pady=2, sticky="nsew")
        self.selection_listbox.bind("<Double-1>", self.on_selection_listbox_double_click)

        run_frame = ttk.Frame(self, padding=10)
        run_frame.pack(fill=X, pady=5)
        run_frame.columnconfigure(1, weight=1)
        
        self.device_options_button = ttk.Button(run_frame, text=translate("device_toolbox"), command=self.app._mirror_device, bootstyle="info")
        self.device_options_button.grid(row=0, column=0, sticky="w", padx=5, pady=5)
        ToolTip(self.device_options_button, translate("device_toolbox_tooltip"))

        self.timestamp_check = ttk.Checkbutton(run_frame, text=translate("do_not_overwrite_logs"), variable=self.app.timestamp_logs_var)
        self.timestamp_check.grid(row=0, column=2, sticky="e", padx=(0, 10))
        ToolTip(self.timestamp_check, text=translate("timestamp_logs_tooltip"))

        self.run_button = ttk.Button(run_frame, text=translate("run_test"), command=self.app._run_test, bootstyle="success")
        self.run_button.grid(row=0, column=3, sticky="e", padx=5, pady=5)
        ToolTip(self.run_button, translate("run_test_tooltip"))

    def on_run_mode_change(self):
        """Handles the change of run mode and populates the listbox."""
        if self.app.run_mode_var.get() == "Suite":
            self.app.current_path = self.app.suites_dir
        else:
            self.app.current_path = self.app.tests_dir
        self.populate_selection_listbox()

    def populate_selection_listbox(self):
        """Populates the listbox based on the selected run mode and current path."""
        self.selection_listbox.delete(0, END)
        mode = self.app.run_mode_var.get()
        
        base_dir = self.app.suites_dir if mode == "Suite" else self.app.tests_dir
        
        if self.app.current_path != base_dir:
            self.selection_listbox.insert(END, translate("back_button"))

        items = sorted(list(self.app.current_path.iterdir()), key=lambda p: (not p.is_dir(), p.name.lower()))
        for item in items:
            if item.is_dir():
                self.selection_listbox.insert(END, translate("folder_prefix", name=item.name))
            elif mode == "Suite" and item.suffix == ".txt":
                self.selection_listbox.insert(END, item.name)
            elif mode == "Test" and item.suffix == ".robot":
                self.selection_listbox.insert(END, item.name)
        
        self.selection_label.config(text=translate("current_path_label", path=self.app.current_path))

    def on_selection_listbox_double_click(self, event):
        """Handles navigation in the listbox."""
        selected_indices = self.selection_listbox.curselection()
        if not selected_indices:
            return
        
        selected_item = self.selection_listbox.get(selected_indices[0])

        if selected_item == translate("back_button"):
            self.app.current_path = self.app.current_path.parent
        elif selected_item.startswith(translate("folder_prefix", name="").strip()):
            folder_name = selected_item.replace(translate("folder_prefix", name="").strip(), "").strip()
            self.app.current_path = self.app.current_path / folder_name
        
        self.populate_selection_listbox()

class AdbToolsTabPage(ttk.Frame):
    """UI and logic for the 'ADB Tools' tab."""
    def __init__(self, parent, app: "RobotRunnerApp"):
        super().__init__(parent, padding=10)
        self.app = app
        self._setup_widgets()

    def _setup_widgets(self):
        adb_tools_frame = ttk.Frame(self)
        adb_tools_frame.pack(fill=BOTH, expand=YES)
        adb_tools_frame.rowconfigure(2, weight=1)
        adb_tools_frame.columnconfigure(0, weight=1)

        wireless_frame = ttk.Frame(adb_tools_frame, padding=10)
        wireless_frame.grid(row=0, column=0, sticky="ew", pady=5)
        wireless_frame.columnconfigure(0, weight=2)
        wireless_frame.columnconfigure(1, weight=1)
        wireless_frame.columnconfigure(2, weight=1)

        ttk.Label(wireless_frame, text=translate("ip_address")).grid(row=0, column=0, sticky=W, padx=5)
        ttk.Label(wireless_frame, text=translate("port")).grid(row=0, column=1, sticky=W, padx=5)
        ttk.Label(wireless_frame, text=translate("pairing_code")).grid(row=0, column=2, sticky=W, padx=5)

        self.ip_entry = ttk.Entry(wireless_frame)
        self.ip_entry.grid(row=1, column=0, sticky="ew", padx=5, pady=(0, 5))
        ToolTip(self.ip_entry, text=translate("wireless_ip_tooltip"))

        self.port_entry = ttk.Entry(wireless_frame, width=8)
        self.port_entry.grid(row=1, column=1, sticky="ew", padx=5, pady=(0, 5))
        ToolTip(self.port_entry, text=translate("wireless_port_tooltip"))

        self.code_entry = ttk.Entry(wireless_frame, width=8)
        self.code_entry.grid(row=1, column=2, sticky="ew", padx=5, pady=(0, 5))
        ToolTip(self.code_entry, text=translate("wireless_code_tooltip"))
        
        button_frame = ttk.Frame(wireless_frame)
        button_frame.grid(row=2, column=0, columnspan=3, sticky="ew", pady=5)
        button_frame.columnconfigure(0, weight=1)
        button_frame.columnconfigure(1, weight=1)
        button_frame.columnconfigure(2, weight=1)
        
        self.disconnect_button = ttk.Button(button_frame, text=translate("disconnect"), command=self.app._disconnect_wireless_device, bootstyle="danger")
        self.disconnect_button.grid(row=0, column=0, sticky="ew", padx=5)
        ToolTip(self.disconnect_button, translate("disconnect_tooltip"))

        self.pair_button = ttk.Button(button_frame, text=translate("pair"), command=self.app._pair_wireless_device, bootstyle="info")
        self.pair_button.grid(row=0, column=1, sticky="ew", padx=5)
        ToolTip(self.pair_button, translate("pair_tooltip"))

        self.connect_button = ttk.Button(button_frame, text=translate("connect"), command=self.app._connect_wireless_device)
        self.connect_button.grid(row=0, column=2, sticky="ew", padx=5)
        ToolTip(self.connect_button, translate("connect_tooltip"))

        manual_cmd_frame = ttk.Frame(adb_tools_frame, padding=10)
        manual_cmd_frame.grid(row=1, column=0, sticky="ew", pady=5)
        manual_cmd_frame.columnconfigure(0, weight=1)

        ttk.Label(manual_cmd_frame, text=translate("adb_command_label")).grid(row=0, column=0, sticky=W, padx=5)
        self.adb_command_entry = ttk.Entry(manual_cmd_frame)
        self.adb_command_entry.grid(row=1, column=0, sticky="ew", padx=5, pady=(0, 5))
        ToolTip(self.adb_command_entry, translate("adb_command_tooltip"))

        self.run_adb_button = ttk.Button(manual_cmd_frame, text=translate("run_command"), command=self.app._run_manual_adb_command)
        self.run_adb_button.grid(row=2, column=0, sticky="ew", padx=5, pady=5)
        ToolTip(self.run_adb_button, translate("run_command_tooltip"))

        output_frame = ttk.LabelFrame(adb_tools_frame, text=translate("adb_output"), padding=5)
        output_frame.grid(row=2, column=0, sticky="nsew", pady=5)
        output_frame.rowconfigure(0, weight=1)
        output_frame.columnconfigure(0, weight=1)

        self.adb_tools_output_text = ScrolledText(output_frame, wrap=WORD, state=DISABLED, autohide=True)
        self.adb_tools_output_text.grid(row=0, column=0, sticky="nsew")

class LogsTabPage(ttk.Frame):
    """UI and logic for the 'Test Logs' tab. Widgets are created lazily."""
    def __init__(self, parent, app: "RobotRunnerApp"):
        super().__init__(parent, padding=10)
        self.app = app

    def setup_widgets(self):
        """Creates and places all the widgets in the tab."""
        logs_controls_frame = ttk.Frame(self)
        logs_controls_frame.pack(fill=X, pady=5)

        left_controls_frame = ttk.Frame(logs_controls_frame)
        left_controls_frame.pack(side=LEFT, fill=X, expand=True)

        ttk.Label(left_controls_frame, text=translate("group_by")).pack(side=LEFT, padx=(0,5))
        self.group_by_combobox = ttk.Combobox(left_controls_frame, textvariable=self.app.group_by_var,
                                              values=[translate("group_by_device"), translate("group_by_suite"), translate("group_by_status")], state="readonly", width=12)
        self.group_by_combobox.pack(side=LEFT, padx=(0, 15))
        self.group_by_combobox.bind("<<ComboboxSelected>>", self.app._on_group_by_selected)
        ToolTip(self.group_by_combobox, translate("group_by_tooltip"))

        ttk.Label(left_controls_frame, text=translate("period")).pack(side=LEFT, padx=(0,5))
        self.period_combobox = ttk.Combobox(left_controls_frame, textvariable=self.app.log_period_var,
                                        values=[translate("today"), translate("period_last_7_days"), translate("last_30_days"), translate("last_6_months"), translate("all_time")], state="readonly")
        self.period_combobox.pack(side=LEFT, padx=(0, 5))
        self.period_combobox.bind("<<ComboboxSelected>>", self.app._on_period_change)
        ToolTip(self.period_combobox, translate("period_tooltip"))

        right_controls_frame = ttk.Frame(logs_controls_frame)
        right_controls_frame.pack(side=RIGHT)

        self.log_cache_info_label = ttk.Label(right_controls_frame, text=translate("no_data_loaded"))
        self.log_cache_info_label.pack(side=LEFT, padx=(0, 10))

        self.reparse_button = ttk.Button(right_controls_frame, text=translate("reparse"),
                                    command=self.app._start_log_reparse,
                                    bootstyle="secondary")
        self.reparse_button.pack(side=LEFT)
        ToolTip(self.reparse_button, translate("reparse_tooltip"))

        self.progress_frame = ttk.Frame(self)
        self.progress_label = ttk.Label(self.progress_frame, text=translate("parsing"))
        self.progress_bar = ttk.Progressbar(self.progress_frame, mode='determinate')
        ToolTip(self.progress_bar, translate("parsing_tooltip"))
        
        logs_tree_frame = ttk.Frame(self)
        logs_tree_frame.pack(fill=BOTH, expand=YES, pady=5)

        scrollbar = ttk.Scrollbar(logs_tree_frame, orient=VERTICAL)
        
        self.logs_tree = ttk.Treeview(logs_tree_frame, columns=("suite", "status", "time"), show="headings", yscrollcommand=scrollbar.set)
        scrollbar.config(command=self.logs_tree.yview)
        
        self.logs_tree.heading("suite", text=translate("log_tree_suite"))
        self.logs_tree.heading("status", text=translate("log_tree_status"))
        self.logs_tree.heading("time", text=translate("log_tree_time"))
        
        scrollbar.pack(side=RIGHT, fill=Y)
        self.logs_tree.pack(side=LEFT, fill=BOTH, expand=YES)
        
        self.logs_tree.bind("<Double-1>", self.app._on_log_double_click)
        self.logs_tree.tag_configure("no_logs", foreground="gray")

class SettingsTabPage(ttk.Frame):
    """UI and logic for the 'Settings' tab."""
    def __init__(self, parent, app: "RobotRunnerApp"):
        super().__init__(parent, padding=10)
        self.app = app
        self._setup_widgets()

    def _setup_widgets(self):
        settings_frame = ttk.Frame(self)
        settings_frame.pack(fill=BOTH, expand=YES)

        app_settings_frame = ttk.LabelFrame(settings_frame, text=translate("app_tool_paths"), padding=10)
        app_settings_frame.pack(fill=X, pady=5)
        app_settings_frame.columnconfigure(1, weight=1)

        ttk.Label(app_settings_frame, text=translate("appium_server")).grid(row=0, column=0, padx=5, pady=5, sticky=W)
        self.appium_status_label = ttk.Label(app_settings_frame, text=translate("appium_status_stopped"), bootstyle="danger")
        self.appium_status_label.grid(row=0, column=1, padx=5, pady=5, sticky=W)
        ToolTip(self.appium_status_label, text=translate("appium_status_tooltip"))

        self.toggle_appium_button = ttk.Button(app_settings_frame, text=translate("start_appium"), command=self.app._toggle_appium_server, bootstyle="primary")
        self.toggle_appium_button.grid(row=0, column=2, padx=5, pady=5)
        ToolTip(self.toggle_appium_button, translate("appium_toggle_tooltip"))

        ttk.Label(app_settings_frame, text=translate("appium_command")).grid(row=1, column=0, padx=5, pady=5, sticky=W)
        ttk.Entry(app_settings_frame, textvariable=self.app.appium_command_var).grid(row=1, column=1, columnspan=2, padx=5, pady=5, sticky=EW)
        
        dir_settings_frame = ttk.LabelFrame(settings_frame, text=translate("dir_path_settings"), padding=10)
        dir_settings_frame.pack(fill=X, pady=5)
        dir_settings_frame.columnconfigure(1, weight=1)
        dir_settings_frame.columnconfigure(3, weight=1)

        ttk.Label(dir_settings_frame, text=translate("suites_dir")).grid(row=0, column=0, padx=5, pady=2, sticky=W)
        ttk.Entry(dir_settings_frame, textvariable=self.app.suites_dir_var).grid(row=0, column=1, padx=5, pady=2, sticky=EW)
        ttk.Label(dir_settings_frame, text=translate("tests_dir")).grid(row=0, column=2, padx=5, pady=2, sticky=W)
        ttk.Entry(dir_settings_frame, textvariable=self.app.tests_dir_var).grid(row=0, column=3, padx=5, pady=2, sticky=EW)

        ttk.Label(dir_settings_frame, text=translate("screenshots_dir")).grid(row=1, column=0, padx=5, pady=2, sticky=W)
        ttk.Entry(dir_settings_frame, textvariable=self.app.screenshots_dir_var).grid(row=1, column=1, padx=5, pady=2, sticky=EW)
        ttk.Label(dir_settings_frame, text=translate("recordings_dir")).grid(row=1, column=2, padx=5, pady=2, sticky=W)
        ttk.Entry(dir_settings_frame, textvariable=self.app.recordings_dir_var).grid(row=1, column=3, padx=5, pady=2, sticky=EW)
        
        ttk.Label(dir_settings_frame, text=translate("logs_dir")).grid(row=2, column=0, padx=5, pady=2, sticky=W)
        ttk.Entry(dir_settings_frame, textvariable=self.app.logs_dir_var).grid(row=2, column=1, padx=5, pady=2, sticky=EW)
        ttk.Label(dir_settings_frame, text=translate("scrcpy_path")).grid(row=2, column=2, padx=5, pady=5, sticky=W)
        ttk.Entry(dir_settings_frame, textvariable=self.app.scrcpy_path_var).grid(row=2, column=3, padx=5, pady=5, sticky=EW)
        
        inspector_settings_frame = ttk.LabelFrame(settings_frame, text=translate("inspector_settings"), padding=10)
        inspector_settings_frame.pack(fill=X, pady=5)
        inspector_settings_frame.columnconfigure(1, weight=1)
        ttk.Label(inspector_settings_frame, text=translate("app_packages_label")).grid(row=6, column=0, padx=5, pady=5, sticky=W)
        app_packages_entry = ttk.Entry(inspector_settings_frame, textvariable=self.app.app_packages_var)
        app_packages_entry.grid(row=6, column=1, padx=5, pady=5, sticky=EW)
        ToolTip(app_packages_entry, translate("app_packages_tooltip"))

        bottom_frame = ttk.Frame(settings_frame)
        bottom_frame.pack(fill=X, pady=0, padx=0)
        bottom_frame.columnconfigure(0, weight=1)

        appearance_frame = ttk.LabelFrame(bottom_frame, text=translate("appearance") + " " + translate("theme_restart_required"), padding=10)
        appearance_frame.grid(row=0, column=0, sticky="ew", pady=5, padx=0)
        appearance_frame.columnconfigure(1, weight=1)

        ttk.Label(appearance_frame, text=translate("theme")).grid(row=0, column=0, padx=5, pady=2, sticky=W)
        theme_combo = ttk.Combobox(appearance_frame, textvariable=self.app.theme_var, values=["darkly", "litera"], state="readonly")
        theme_combo.grid(row=0, column=1, padx=5, pady=2, sticky=W)
        ToolTip(theme_combo, translate("theme_tooltip"))
        
        ttk.Label(appearance_frame, text=translate("language_label")).grid(row=0, column=2, padx=5, pady=2, sticky=W)
        self.language_combo = ttk.Combobox(appearance_frame, state="readonly", values=list(self.app.LANGUAGES.values()))
        self.language_combo.grid(row=0, column=3, padx=5, pady=2, sticky=W)
        self.language_combo.bind("<<ComboboxSelected>>", self.app._on_language_select)
        ToolTip(self.language_combo, translate("language_tooltip"))
        
        current_lang_code = self.app.language_var.get()
        current_lang_name = self.app.LANGUAGES.get(current_lang_code, "English")
        self.language_combo.set(current_lang_name)

        save_button = ttk.Button(bottom_frame, text=translate("save_settings"), command=self.app._save_settings, bootstyle="success")
        save_button.grid(row=0, column=1, sticky="e", padx=10)
        ToolTip(save_button, translate("save_settings_tooltip"))

        output_frame = ttk.LabelFrame(settings_frame, text=translate("appium_server_output"), padding=5)
        output_frame.pack(fill=BOTH, expand=YES, pady=5)
        self.appium_output_text = ScrolledText(output_frame, wrap=WORD, state=DISABLED, autohide=True)
        self.appium_output_text.pack(fill=BOTH, expand=YES)

class AboutTabPage(ttk.Frame):
    """UI and logic for the 'About' tab."""
    def __init__(self, parent, app: "RobotRunnerApp"):
        super().__init__(parent, padding=10)
        self.app = app
        self._setup_widgets()

    def _setup_widgets(self):
        about_frame = ttk.Frame(self)
        about_frame.pack(fill=BOTH, expand=YES, padx=10, pady=5)

        title_label = ttk.Label(about_frame, text=translate("about_title"), font="-size 20 -weight bold")
        title_label.pack(pady=(0, 10))
        ToolTip(title_label, translate("app_author_tooltip"))

        desc_label = ttk.Label(about_frame, text=translate("about_subtitle"), wraplength=500)
        desc_label.pack(pady=(0, 20))

        tools_frame = ttk.LabelFrame(about_frame, text=translate("acknowledgements"), padding=10)
        tools_frame.pack(fill=X, pady=5)

        tools_text = translate("acknowledgements_text")
        ttk.Label(tools_frame, text=tools_text, justify=LEFT).pack(anchor=W)

        license_frame = ttk.LabelFrame(about_frame, text=translate("license"), padding=10)
        license_frame.pack(fill=BOTH, expand=YES, pady=5)
        
        license_text = translate("mit_license_text")
        license_st = ScrolledText(license_frame, wrap=WORD, autohide=True)
        license_st.pack(fill=BOTH, expand=YES)
        license_st.insert(END, license_text)
        license_st.text.config(state=DISABLED)

# --- Main Application Class ---
class RobotRunnerApp:
    ''' Main application window '''
    def __init__(self, root: ttk.Window):
        self.root = root
        self.root.title(translate("app_title"))
        self.root.geometry("1000x700")
        self.root.protocol("WM_DELETE_WINDOW", self._on_close)
        
        # --- Language mapping ---
        self.LANGUAGES = {
            "en_US": "English",
            "pt_BR": "Português (Brasil)",
            "es_ES": "Español"
        }

        self.devices: List[Dict[str, str]] = []
        self.appium_process: Optional[subprocess.Popen] = None
        self.active_command_windows: Dict[str, tk.Toplevel] = {}
        self.parsed_logs_data: Optional[List[Dict]] = None
        self.logs_tab_initialized = False
        self._is_closing = False
        self.appium_version: Optional[str] = None

        self._setup_string_vars()
        self._load_settings()
        self._update_paths_from_settings()
        
        self._initialize_dirs_and_files()
        
        self._setup_style()
        self._create_widgets()
        
        self.root.after(100, self._refresh_devices)
        self.root.after(200, self._check_scrcpy_version)
        self.root.after(300, self._check_appium_version)

    def _setup_string_vars(self):
        """Initializes all Tkinter StringVars."""
        self.scrcpy_path_var = tk.StringVar()
        self.appium_command_var = tk.StringVar()
        self.run_mode_var = tk.StringVar(value=translate("run_mode_suite"))
        self.suites_dir_var = tk.StringVar()
        self.tests_dir_var = tk.StringVar()
        self.logs_dir_var = tk.StringVar()
        self.screenshots_dir_var = tk.StringVar()
        self.recordings_dir_var = tk.StringVar()
        self.theme_var = tk.StringVar()
        self.group_by_var = tk.StringVar(value=translate("group_by_device"))
        self.log_period_var = tk.StringVar(value=translate("period_last_7_days"))
        # --- Performance Monitor ---
        self.app_packages_var = tk.StringVar()
        self.timestamp_logs_var = tk.BooleanVar(value=False)
        # --- Internationalization ---
        self.language_var = tk.StringVar()

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

        self.run_tab = RunTabPage(self.notebook, self)
        self.logs_tab = LogsTabPage(self.notebook, self)
        self.adb_tools_tab = AdbToolsTabPage(self.notebook, self)
        self.settings_tab = SettingsTabPage(self.notebook, self)
        self.about_tab = AboutTabPage(self.notebook, self)

        self.notebook.add(self.run_tab, text=translate("run_tests_tab"))
        self.notebook.add(self.logs_tab, text=translate("logs_tab"))
        self.notebook.add(self.adb_tools_tab, text=translate("adb_tools_tab"))
        self.notebook.add(self.settings_tab, text=translate("settings_tab"))
        self.notebook.add(self.about_tab, text=translate("about_tab"))
        
        self.notebook.bind("<<NotebookTabChanged>>", self._on_tab_change)

        self.status_bar = ttk.Frame(self.root, padding=(5, 2), relief=SUNKEN)
        self.status_bar.pack(side=BOTTOM, fill=X)
        self.status_var = tk.StringVar(value=translate("initializing"))
        ttk.Label(self.status_bar, textvariable=self.status_var).pack(side=LEFT)

    def _on_tab_change(self, event):
        """Callback for when a notebook tab is changed."""
        selected_tab_index = self.notebook.index(self.notebook.select())
        if selected_tab_index == 1 and not self.logs_tab_initialized: # Logs Tab is at index 1
            self.logs_tab.setup_widgets()
            self.logs_tab_initialized = True
            self._on_period_change()

    def _initialize_dirs_and_files(self):
        """Creates necessary directories and files on startup."""
        CONFIG_DIR.mkdir(exist_ok=True)
        self.suites_dir.mkdir(exist_ok=True)
        self.tests_dir.mkdir(exist_ok=True)
        self.logs_dir.mkdir(exist_ok=True)

    def _on_language_select(self, event=None):
        """Updates the language_var with the code corresponding to the selected language name."""
        selected_name = self.settings_tab.language_combo.get()
        for code, name in self.LANGUAGES.items():
            if name == selected_name:
                self.language_var.set(code)
                break

    def _load_settings(self):
        """Loads settings from the settings.json file."""
        try:
            if SETTINGS_FILE.exists():
                with open(SETTINGS_FILE, 'r') as f:
                    settings = json.load(f)
            else:
                settings = {}
        except (json.JSONDecodeError, IOError) as e:
            print(translate("error_loading_settings", e=e))
            settings = {}

        self.appium_command_var.set(settings.get("appium_command", "appium --base-path=/wd/hub --relaxed-security"))
        self.scrcpy_path_var.set(settings.get("scrcpy_path", "scrcpy"))
        self.suites_dir_var.set(settings.get("suites_dir", "suites"))
        self.tests_dir_var.set(settings.get("tests_dir", "tests"))
        self.logs_dir_var.set(settings.get("logs_dir", "logs"))
        self.screenshots_dir_var.set(settings.get("screenshots_dir", "screenshots"))
        self.recordings_dir_var.set(settings.get("recordings_dir", "recordings"))
        self.theme_var.set(settings.get("theme", "darkly"))
        self.language_var.set(settings.get("language", "en_US"))
        # --- Performance Monitor ---
        self.app_packages_var.set(settings.get("app_packages", "com.android.chrome"))
        
        self.initial_theme = self.theme_var.get()
        self.initial_language = self.language_var.get()

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
            "language": self.language_var.get(),
            # --- Performance Monitor ---
            "app_packages": self.app_packages_var.get()
        }
        try:
            with open(SETTINGS_FILE, 'w') as f:
                json.dump(settings, f, indent=4)
            
            self._update_paths_from_settings()
            
            if self.initial_theme != self.theme_var.get() or self.initial_language != self.language_var.get():
                messagebox.showinfo(translate("restart_required_title"), translate("restart_required_message"), parent=self.root)
                self.initial_theme = self.theme_var.get()
                self.initial_language = self.language_var.get()
            else:
                messagebox.showinfo(translate("settings_saved_title"), translate("settings_saved_message"), parent=self.root)

        except IOError as e:
            messagebox.showerror(translate("open_file_error_title"), translate("save_settings_error", e=e), parent=self.root)
        
    def _on_close(self):
        """Handles the main window closing event."""
        if messagebox.askokcancel(translate("quit_title"), translate("quit_message")):
            self._is_closing = True
            
            if self.appium_process:
                self.status_var.set(translate("stopping_appium_message"))
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
                os.kill(os.getpid(pid), signal.SIGTERM)
            print(translate("appium_terminate_info", pid=pid))
        except (subprocess.CalledProcessError, ProcessLookupError, FileNotFoundError) as e:
            print(translate("appium_terminate_warning", pid=pid, e=e))

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
        """
        Validates selections and starts the test execution process in a background thread
        to keep the UI responsive.
        """
        try:
            selected_device_indices = self.run_tab.device_listbox.curselection()
            if not selected_device_indices:
                messagebox.showerror(translate("open_file_error_title"), translate("no_device_selected"), parent=self.root)
                return

            selected_devices = [self.run_tab.device_listbox.get(i) for i in selected_device_indices]
            if any(translate("no_devices_found") in s for s in selected_devices):
                messagebox.showerror(translate("open_file_error_title"), translate("no_device_selected"), parent=self.root)
                return

            # Check for busy devices
            busy_devices_selected = [s for s in selected_devices if translate("device_busy") in s]
            if busy_devices_selected:
                if not messagebox.askyesno(translate("busy_device_warning_title"),
                                           translate("busy_device_warning_message", devices=''.join(busy_devices_selected)),
                                           parent=self.root):
                    return

            selected_indices = self.run_tab.selection_listbox.curselection()
            if not selected_indices:
                messagebox.showerror(translate("open_file_error_title"), translate("no_test_file_selected"), parent=self.root)
                return

            selected_filename = self.run_tab.selection_listbox.get(selected_indices[0])
            if selected_filename.startswith("["):  # It's a folder or back button
                messagebox.showwarning(translate("invalid_selection_title"), translate("invalid_selection_message"), parent=self.root)
                return

            run_mode = self.run_mode_var.get()
            path_to_run = self.current_path / selected_filename

            if not path_to_run.exists():
                messagebox.showerror(translate("open_file_error_title"), translate("file_not_found_error", path=path_to_run), parent=self.root)
                return

            # All checks passed, start the background thread
            thread = threading.Thread(target=self._run_test_thread, args=(selected_devices, str(path_to_run), run_mode))
            thread.daemon = True
            thread.start()

        except Exception as e:
            messagebox.showerror(translate("execution_error"), translate("unexpected_error", error=e), parent=self.root)

    def _run_test_thread(self, selected_devices: List[str], path_to_run: str, run_mode: str):
        """
        This method runs in a background thread to prevent UI freezing.
        It ensures Appium is running, then schedules the creation of test windows on the main thread.
        """
        try:
            self.root.after(0, self.run_tab.run_button.config, {'state': DISABLED, 'text': translate("checking_appium")})
            
            if not self._is_appium_running():
                self.root.after(0, self.status_var.set, translate("appium_not_found_starting"))
                self.root.after(0, self.run_tab.run_button.config, {'text': translate("starting_appium")})
                self._start_appium_server(silent=True)
                if not self._wait_for_appium_startup(timeout=30):
                    self.root.after(0, messagebox.showerror, translate("appium_error_title"), translate("appium_start_fail_error"))
                    self.root.after(0, self.status_var.set, translate("ready"))
                    return
                self.root.after(0, self.status_var.set, translate("appium_started_running_tests"))

            # 2. Schedule the creation of a RunCommandWindow for each device on the main thread
            for device_str in selected_devices:
                udid_with_status = device_str.split(" | ")[-1]
                udid = udid_with_status.split(" ")[0]
                
                self.root.after(0, self.run_tab.run_button.config, {'text': translate("opening_udid", udid=udid)})
                self.root.after(0, self._create_run_command_window, udid, path_to_run, run_mode)
                
                time.sleep(2)
        finally:
            # Restore the button to its original state after the loop
            self.root.after(0, self.run_tab.run_button.config, {'state': NORMAL, 'text': translate("run_test")})

    def _create_run_command_window(self, udid: str, path_to_run: str, run_mode: str):
        """Helper to safely create the RunCommandWindow from the main GUI thread."""
        # Centralized Resource Management: If a window for this UDID already exists, close it before creating a new one.
        if udid in self.active_command_windows and self.active_command_windows[udid].winfo_exists():
            win = self.active_command_windows[udid]
            win._on_close() # This will stop activities and remove the window from the dict.

        # If no window exists, create a new one.
        win = RunCommandWindow(self, udid, mode='test', run_path=path_to_run, run_mode=run_mode)
        self.active_command_windows[udid] = win

    def _pair_wireless_device(self):
        """Pairs with a device wirelessly using a pairing code."""
        ip = self.adb_tools_tab.ip_entry.get()
        port = self.adb_tools_tab.port_entry.get()
        code = self.adb_tools_tab.code_entry.get()

        if not all([ip, port, code]):
            messagebox.showwarning(translate("input_error"), translate("input_error_pair"))
            return

        command = f"adb pair {ip}:{port} {code}"
        self.adb_tools_tab.pair_button.config(state=DISABLED)
        self._update_output_text(self.adb_tools_tab.adb_tools_output_text, f"> {command}\n", True)
        
        thread = threading.Thread(target=self._run_command_and_update_gui, args=(command, self.adb_tools_tab.adb_tools_output_text, self.adb_tools_tab.pair_button, True))
        thread.daemon = True
        thread.start()

    def _connect_wireless_device(self):
        """Attempts to connect to a device wirelessly via ADB."""
        ip = self.adb_tools_tab.ip_entry.get()
        port = self.adb_tools_tab.port_entry.get()
        
        if not all([ip, port]):
            messagebox.showwarning(translate("input_error"), translate("input_error_connect"))
            return

        command = f"adb connect {ip}:{port}"
        self.adb_tools_tab.connect_button.config(state=DISABLED)
        self._update_output_text(self.adb_tools_tab.adb_tools_output_text, f"> {command}\n", True)
        
        thread = threading.Thread(target=self._run_command_and_update_gui, args=(command, self.adb_tools_tab.adb_tools_output_text, self.adb_tools_tab.connect_button, True))
        thread.daemon = True
        thread.start()

    def _disconnect_wireless_device(self):
        """Disconnects a specific wireless device or all of them."""
        ip = self.adb_tools_tab.ip_entry.get()
        port = self.adb_tools_tab.port_entry.get()
        
        if ip and port:
            command = f"adb disconnect {ip}:{port}"
        else:
            command = "adb disconnect"

        self.adb_tools_tab.disconnect_button.config(state=DISABLED)
        self._update_output_text(self.adb_tools_tab.adb_tools_output_text, f"> {command}\n", True)
        
        thread = threading.Thread(target=self._run_command_and_update_gui, args=(command, self.adb_tools_tab.adb_tools_output_text, self.adb_tools_tab.disconnect_button, True))
        thread.daemon = True
        thread.start()

    def _mirror_device(self):    
        selected_device_indices = self.run_tab.device_listbox.curselection()
        if not selected_device_indices:
            messagebox.showerror(translate("open_file_error_title"), translate("no_device_selected"))
            return
        
        selected_devices = [self.run_tab.device_listbox.get(i) for i in selected_device_indices]
        if any(translate("no_devices_found") in s for s in selected_devices):
            messagebox.showerror(translate("open_file_error_title"), translate("no_device_selected"))
            return

        # Disable the button immediately
        self.run_tab.device_options_button.config(state=DISABLED)

        # Start a thread to handle the sequential opening
        thread = threading.Thread(target=self._mirror_device_thread, args=(selected_devices,))
        thread.daemon = True
        thread.start()

    def _mirror_device_thread(self, selected_devices: List[str]):
        """Opens a separate toolbox window for each selected device with a delay."""
        try:
            for i, selected_device_str in enumerate(selected_devices):
                parts = selected_device_str.split(" | ")
                model = parts[1].strip()
                udid_with_status = parts[-1]
                udid = udid_with_status.split(" ")[0]

                # Centralized Resource Management: If a window for this UDID already exists, close it before creating a new one.
                if udid in self.active_command_windows and self.active_command_windows[udid].winfo_exists():
                    self.root.after(0, self.active_command_windows[udid]._on_close)
                    time.sleep(0.5) # Give it a moment to close

                # Update button text on the main thread
                self.root.after(0, self.run_tab.device_options_button.config, {'text': translate("opening_udid", udid=udid)})

                # Create the new window on the main thread
                self.root.after(0, self._create_mirror_window, udid, model)

                # Wait before opening the next one, but not after the last one
                if i < len(selected_devices) - 1:
                    time.sleep(2)
        finally:
            # Restore the button to its original state after the loop
            self.root.after(0, self.run_tab.device_options_button.config, {'state': NORMAL, 'text': translate("device_toolbox")})

    def _create_mirror_window(self, udid: str, model: str):
        """Helper to create the mirror window on the main thread."""
        win = RunCommandWindow(self, udid, mode='mirror', title=translate("mirror_title", model=model))
        self.active_command_windows[udid] = win

    def _refresh_devices(self):
        """Refreshes the list of connected ADB devices."""
        self.status_var.set(translate("refreshing"))
        self.run_tab.refresh_button.config(state=DISABLED, text=translate("refreshing"))
        thread = threading.Thread(target=self._get_devices_thread)
        thread.daemon = True
        thread.start()

    def _get_devices_thread(self):
        """Gets device list in a background thread to avoid freezing the GUI."""
        appium_command = self.appium_command_var.get()

        # Determine if we should even attempt to check Appium.
        # We attempt a check if the app started it, or if it was detected at launch.
        appium_might_be_running = (self.appium_process and self.appium_process.poll() is None) or (self.appium_version is not None)

        # Now, if we think it might be running, we do the actual network check to confirm.
        should_check_busy_devices = False
        if appium_might_be_running:
            should_check_busy_devices = self._is_appium_running()

        self.devices = get_connected_devices(appium_command, check_busy_devices=should_check_busy_devices)
        self.root.after(0, self._update_device_list)

    def _update_device_list(self):
        """Updates the device listbox with the found devices."""
        selected_indices = self.run_tab.device_listbox.curselection()
        self.run_tab.device_listbox.delete(0, END)
        if self.devices:
            self.run_tab.device_listbox.config(state=NORMAL)
            for i, d in enumerate(self.devices):
                status_text = translate("device_busy") if d.get('status') == "Busy" else ""
                device_string = f"Android {d['release']} | {d['model']} | {d['udid']} {status_text}"
                self.run_tab.device_listbox.insert(END, device_string)
                
                color = "red" if d.get('status') == "Busy" else "#43b581" # Use a less jarring green
                self.run_tab.device_listbox.itemconfig(i, foreground=color)

            # Restore selection
            for index in selected_indices:
                if index < self.run_tab.device_listbox.size():
                    self.run_tab.device_listbox.selection_set(index)
            if not self.run_tab.device_listbox.curselection() and self.run_tab.device_listbox.size() > 0:
                 self.run_tab.device_listbox.selection_set(0)
        else:
            self.run_tab.device_listbox.insert(END, translate("no_devices_found"))
            self.run_tab.device_listbox.config(state=DISABLED)
        
        self.run_tab.refresh_button.config(state=NORMAL, text=translate("refresh"))
        # Only set status to ready if it was refreshing, to not overwrite other statuses
        if translate("refreshing") in self.status_var.get():
            self.status_var.set(translate("ready"))
        
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
        if messagebox.askyesno(translate("scrcpy_not_found_title"), translate("scrcpy_not_found_message")):
            self.status_var.set(translate("downloading_scrcpy"))
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
                self.root.after(0, messagebox.showerror, translate("download_error_title"), translate("download_error_no_release"))
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
                shutil.rmtree(temp_extract_dir)

            zip_path.unlink()
            
            new_scrcpy_path = scrcpy_dir / "scrcpy.exe"
            self.scrcpy_path_var.set(str(new_scrcpy_path))
            self.root.after(0, messagebox.showinfo, translate("success_title"), translate("scrcpy_download_success", path=scrcpy_dir))

        except Exception as e:
            self.root.after(0, messagebox.showerror, translate("download_failed_title"), translate("scrcpy_download_error", error=e))
        finally:
            self.root.after(0, self.status_var.set, translate("ready"))

    def _toggle_appium_server(self):
        """Starts or stops the Appium server via the Settings tab button."""
        # If we have a process handle, we can stop it.
        if self.appium_process and self.appium_process.poll() is None:
            self.status_var.set(translate("stopping_appium_message"))
            self.settings_tab.toggle_appium_button.config(state=DISABLED)
            
            # Use a thread to avoid blocking while terminating
            thread = threading.Thread(target=self._terminate_process_tree, args=(self.appium_process.pid, "Appium"))
            thread.daemon = True
            thread.start()
        # If there's no process handle, check if a server is running externally before starting.
        elif self._is_appium_running():
             messagebox.showwarning(translate("appium_running_title"), translate("appium_running_message"))
        else:
            self._start_appium_server(silent=False)

    def _start_appium_server(self, silent: bool = False):
        """
        Starts the Appium server in a background thread.
        If silent, UI button states are not changed directly.
        """
        if not silent:
            self.status_var.set(translate("appium_status_starting"))
            self.settings_tab.toggle_appium_button.config(state=DISABLED)
        
        thread = threading.Thread(target=self._appium_server_handler, args=(silent,))
        thread.daemon = True
        thread.start()

    def _appium_server_handler(self, silent: bool):
        """
        The core handler for running the Appium server process and piping its output.
        This method runs in a separate thread.
        """
        try:
            command = self.appium_command_var.get()
            # Clear and show command in output only when user starts it manually
            clear_output = not silent
            self.root.after(0, self._update_output_text, self.settings_tab.appium_output_text, f"> {command}\n", clear_output)
            
            creationflags = subprocess.CREATE_NO_WINDOW if sys.platform == "win32" else 0
            self.appium_process = subprocess.Popen(
                command, shell=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                text=True, encoding=OUTPUT_ENCODING, errors='replace', creationflags=creationflags,
                preexec_fn=os.setsid if sys.platform != "win32" else None
            )

            # Renomeamos as variáveis descartáveis para não conflitarem com a função de tradução `translate`
            _host, port, _base_path = _parse_appium_command(command)

            # Update UI state
            self.root.after(0, lambda: self.settings_tab.appium_status_label.configure(text=translate("appium_status_running", port=port), bootstyle="success"))
            self.root.after(0, lambda: self.settings_tab.toggle_appium_button.configure(text=translate("stop_appium"), bootstyle="danger", state=NORMAL))
            if not silent:
                self.root.after(0, self.status_var.set, translate("appium_started_running_tests")) # Assuming a key for this status

            # Pipe output to the GUI
            for line in iter(self.appium_process.stdout.readline, ''):
                if self._is_closing or self.appium_process.poll() is not None:
                    break
                self.root.after(0, self._update_output_text, self.settings_tab.appium_output_text, line, False)
            
            if self.appium_process:
                self.appium_process.stdout.close()
                self.appium_process.wait()

        except FileNotFoundError:
            self.root.after(0, messagebox.showerror, translate("open_file_error_title"), translate("appium_command_not_found"))
            self.root.after(0, lambda: self.settings_tab.appium_status_label.configure(text=translate("appium_status_error"), bootstyle="danger"))
        except Exception as e:
            self.root.after(0, messagebox.showerror, translate("open_file_error_title"), translate("appium_start_generic_error", error=e))
            self.root.after(0, lambda: self.settings_tab.appium_status_label.configure(text=translate("appium_status_error"), bootstyle="danger"))
        finally:
            self.appium_process = None
            if not self._is_closing:
                # Always reset the UI to a consistent 'stopped' state
                self.root.after(0, lambda: self.settings_tab.appium_status_label.configure(text=translate("appium_status_stopped"), bootstyle="danger"))
                self.root.after(0, lambda: self.settings_tab.toggle_appium_button.configure(text=translate("start_appium"), bootstyle="primary", state=NORMAL))
                if not silent:
                    self.root.after(0, self.status_var.set, translate("ready")) # Assuming a key for this status

    def _run_manual_adb_command(self):
        """Runs a manual ADB command entered by the user."""
        command = self.adb_tools_tab.adb_command_entry.get()
        if not command:
            return
        
        full_command = f"adb {command}"
        self.adb_tools_tab.run_adb_button.config(state=DISABLED)
        self._update_output_text(self.adb_tools_tab.adb_tools_output_text, f"> {full_command}\n", True)
        
        thread = threading.Thread(target=self._run_command_and_update_gui, args=(full_command, self.adb_tools_tab.adb_tools_output_text, self.adb_tools_tab.run_adb_button))
        thread.daemon = True
        thread.start()

    def _check_appium_version(self):
        """Checks the installed Appium version in a background thread."""
        def check_thread():
            try:
                command = "appium --version"
                success, output = execute_command(command)
                if success and output:
                    version_match = re.search(r'(\d+\.\d+\.\d+)', output)
                    if version_match:
                        self.appium_version = version_match.group(1)
                        self.root.after(0, lambda: self.status_var.set(translate("ready_with_appium_version", version=self.appium_version)))
                    else:
                        self.appium_version = "Unknown"
                        self.root.after(0, lambda: self.status_var.set(translate("ready_appium_version_unknown")))
                else:
                    self.appium_version = None
                    self.root.after(0, lambda: messagebox.showwarning(
                        translate("appium_not_found_title"),
                        translate("appium_not_found_message")
                    ))
                    self.root.after(0, lambda: self.status_var.set(translate("ready_appium_not_found")))
            except Exception as e:
                self.appium_version = None
                self.root.after(0, lambda: self.status_var.set(translate("error_checking_appium_version", error=e)))

        threading.Thread(target=check_thread, daemon=True).start()

    def _is_appium_running(self) -> bool:
        """Checks if the Appium server is running and accessible by checking its status endpoint."""
        command = self.appium_command_var.get()
        host, port, base_path = _parse_appium_command(command)

        # Appium 1.x used /wd/hub/status, Appium 2+ uses /status
        # We'll try the configured path first, then the fallback.
        primary_path = f"{base_path}/status".replace('//', '/')
        primary_url = f"http://{host}:{port}{primary_path}"
        
        try:
            with urllib.request.urlopen(primary_url, timeout=2) as response:
                return response.status == 200
        except Exception:
            # If the primary URL fails and no base path was explicitly set,
            # try the legacy /wd/hub/status endpoint.
            if not re.search(r'--base-path', command):
                legacy_url = f"http://{host}:{port}/wd/hub/status"
                try:
                    with urllib.request.urlopen(legacy_url, timeout=2) as response:
                        return response.status == 200
                except Exception:
                    return False
            return False

    def _wait_for_appium_startup(self, timeout: int = 20) -> bool:
        """Waits for the Appium server to become available after starting."""
        start_time = time.time()
        while time.time() - start_time < timeout:
            if self._is_appium_running():
                return True
            time.sleep(0.5)
        return False

    def _get_cache_path_for_period(self, period: str) -> Path:
        """Returns the specific cache file path for a given period."""
        period_map = {
            translate("today"): "today",
            translate("period_last_7_days"): "7d",
            translate("last_30_days"): "30d",
            translate("last_6_months"): "6m",
            translate("all_time"): "all"
        }
        suffix = period_map.get(period, "all")
        return self.logs_dir / f"parsed_logs_cache_{suffix}.json"

    def _start_log_reparse(self):
        """Starts the log parsing process based on the selected period."""
        if not self.logs_tab_initialized:
            self.logs_tab.setup_widgets()
            self.logs_tab_initialized = True

        self.logs_tab.group_by_combobox.config(state=DISABLED)
        self.logs_tab.period_combobox.config(state=DISABLED)
        self.logs_tab.reparse_button.config(state=DISABLED)
        self.logs_tab.progress_frame.pack(fill=X, pady=5)
        self.logs_tab.progress_label.pack(side=LEFT, padx=(0, 5))
        self.logs_tab.progress_bar.pack(side=LEFT, fill=X, expand=YES)

        selected_period = self.log_period_var.get()
        thread = threading.Thread(target=self._parse_logs_thread, args=(selected_period,))
        thread.daemon = True
        thread.start()

    def _on_period_change(self, event=None):
        """Handles period selection change by attempting to load a cache file."""
        if not self.logs_tab_initialized: return

        period = self.log_period_var.get()
        cache_file = self._get_cache_path_for_period(period)

        for item in self.logs_tab.logs_tree.get_children():
            self.logs_tab.logs_tree.delete(item)
        self.parsed_logs_data = []

        if cache_file.exists():
            try:
                with open(cache_file, 'r', encoding=OUTPUT_ENCODING) as f:
                    self.parsed_logs_data = json.load(f)
                
                mtime = os.path.getmtime(cache_file)
                mtime_str = datetime.datetime.fromtimestamp(mtime).strftime('%Y-%m-%d %H:%M:%S')
                self.logs_tab.log_cache_info_label.config(text=translate("cache_from_date", date=mtime_str))
                
                self._display_logs(self.parsed_logs_data)
            except (json.JSONDecodeError, IOError) as e:
                self.logs_tab.log_cache_info_label.config(text=translate("cache_load_error", error=e))
                self.parsed_logs_data = []
        else:
            self.logs_tab.log_cache_info_label.config(text=translate("no_cache_for_period"))
            self._display_logs([])

    def _parse_logs_thread(self, period: str):
        """Parses logs in a background thread based on the selected period."""
        # Recursively find all possible output.xml files, timestamped or not. This is the most robust way.
        all_xml_files = list(self.logs_dir.glob("**/output*.xml"))
        
        # --- Filter files based on the selected period using the reliable 'generated' timestamp ---
        now = datetime.datetime.now()
        xml_files_to_parse = []

        if period == translate("all_time"):
            xml_files_to_parse = all_xml_files
        else:
            today_date = now.date() if period == translate("today") else None
            time_delta = None
            
            if period == translate("period_last_7_days"):
                time_delta = datetime.timedelta(days=7)
            elif period == translate("last_30_days"):
                time_delta = datetime.timedelta(days=30)
            elif period == translate("last_6_months"):
                time_delta = datetime.timedelta(days=180)

            cutoff_time = now - time_delta if time_delta else None

            for f in all_xml_files:
                gen_time = get_generation_time(f)
                if gen_time:
                    if (today_date and gen_time.date() == today_date) or \
                       (cutoff_time and gen_time >= cutoff_time):
                        xml_files_to_parse.append(f)

        total_files = len(xml_files_to_parse)
        all_results = []

        for i, xml_file in enumerate(xml_files_to_parse):
            try:
                tree = ET.parse(xml_file)
                root = tree.getroot()

                # Robustly get the device directory name regardless of path depth.
                relative_path = xml_file.relative_to(self.logs_dir)
                if len(relative_path.parts) > 1:
                    device_dir_name = relative_path.parts[0]
                else:
                    device_dir_name = "Unknown_Device"

                device_parts = device_dir_name.split('_')
                if len(device_parts) > 2:
                    device = " ".join(device_parts[1:-1])
                else:
                    device = device_dir_name

                # Iterate over ALL test elements in the document to handle nested suites.
                for test_element in root.iter("test"):
                    suite_element = test_element.getparent()
                    suite_name = suite_element.get("name", "Unknown_Suite")

                    # Determine the correct log file name (handles timestamped logs)
                    log_filename = xml_file.name.replace("output", "log").replace(".xml", ".html")
                    log_path = xml_file.parent / log_filename

                    test_name = test_element.get("name", "Unknown_Test")
                    status_element = test_element.find("status")

                    # Robustness: Handle cases where a test might not have a status (e.g., crashed)
                    if status_element is not None:
                        status = status_element.get("status", "UNKNOWN")
                        elapsed_element = status_element.get("elapsed", "0")
                    else:
                        status = "ERROR" # Assign a default error status for incomplete logs
                        elapsed_element = "0"
                    
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
                        "log_path": str(log_path)
                    })
            except ET.ParseError:
                print(f"Warning: Could not parse {xml_file}")
            except Exception as e:
                print(f"Error processing log file {xml_file}: {e}")
            
            self.root.after(0, self._update_parse_progress, i + 1, total_files)

        cache_file_to_save = self._get_cache_path_for_period(period)
        try:
            with open(cache_file_to_save, 'w', encoding=OUTPUT_ENCODING) as f:
                json.dump(all_results, f, indent=4)
        except Exception as e:
            print(f"Error writing to log cache file: {e}")
            
        self.root.after(0, self._finalize_parsing, all_results)

    def _update_parse_progress(self, current, total):
        """Updates the progress bar and label from the main thread."""
        if total > 0:
            percentage = (current / total) * 100
            self.logs_tab.progress_bar['value'] = percentage
            self.logs_tab.progress_label.config(text=translate("parsing_progress", current=current, total=total))
        else:
            self.logs_tab.progress_label.config(text=translate("no_log_files_found"))
            self.logs_tab.progress_bar['value'] = 100

    def _finalize_parsing(self, results):
        """Called on the main thread after parsing is complete."""
        self.parsed_logs_data = results
        self.logs_tab.progress_label.pack_forget()
        self.logs_tab.progress_bar.pack_forget()
        self.logs_tab.progress_frame.pack_forget()
        self.logs_tab.group_by_combobox.config(state="readonly")
        self.logs_tab.period_combobox.config(state="readonly")
        self.logs_tab.reparse_button.config(state=NORMAL)
        
        now_str = datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        self.logs_tab.log_cache_info_label.config(text=translate("parsing_complete", count=len(results)))
        
        self._display_logs(results)

    def _display_logs(self, log_data: List[Dict]):
        """Displays the parsed log data in the Treeview."""
        for item in self.logs_tab.logs_tree.get_children():
            self.logs_tab.logs_tree.delete(item)

        if not log_data:
            self.logs_tab.logs_tree.insert("", END, values=(translate("no_logs_found"), "", ""), tags=("no_logs",))
            return

        group_by = self.group_by_var.get()
        grouped_data = {}

        for result in log_data:
            key = ""
            if group_by == translate("group_by_device"):
                key = result.get("device", "Unknown Device")
            elif group_by == translate("group_by_suite"):
                key = result.get("suite", "Unknown Suite")
            elif group_by == translate("group_by_status"):
                key = result.get("status", "UNKNOWN")
            
            if key not in grouped_data:
                grouped_data[key] = []
            grouped_data[key].append(result)

        for group, results in sorted(grouped_data.items()):
            parent_id = self.logs_tab.logs_tree.insert("", END, text=group, values=(group, "", ""), open=True)

            if group_by == translate("group_by_device"):
                suites_in_group = {}
                for res in results:
                    suite_key = res.get("suite", "Unknown Suite")
                    if suite_key not in suites_in_group:
                        suites_in_group[suite_key] = []
                    suites_in_group[suite_key].append(res)
                
                self.logs_tab.logs_tree.heading("suite", text=translate("log_tree_suite_test"))
                for suite_name, tests in sorted(suites_in_group.items()):
                    indented_suite_name = f"    {suite_name}"
                    suite_id = self.logs_tab.logs_tree.insert(parent_id, END, text=suite_name, values=(indented_suite_name, "", ""), open=True)
                    for test in tests:
                        test_display_name = f"        - {test['test']}"
                        self.logs_tab.logs_tree.insert(suite_id, END, values=(test_display_name, test["status"], test["time"]),
                                              tags=(test["status"], test["log_path"]))
            else:
                if group_by == translate("group_by_suite"):
                    self.logs_tab.logs_tree.heading("suite", text=translate("log_tree_test"))
                elif group_by == translate("group_by_status"):
                    self.logs_tab.logs_tree.heading("suite", text=translate("log_tree_device_suite"))

                for result in results:
                    first_col_val = result["test"]
                    if group_by == translate("group_by_status"):
                        first_col_val = f'{result["device"]} / {result["suite"]}'
                    
                    indented_val = f"    {first_col_val}"
                    self.logs_tab.logs_tree.insert(parent_id, END, values=(indented_val, result["status"], result["time"]),
                                          tags=(result["status"], result["log_path"]))
        
        self.logs_tab.logs_tree.tag_configure("PASS", foreground="green")
        self.logs_tab.logs_tree.tag_configure("FAIL", foreground="red")
        self.logs_tab.logs_tree.tag_configure("SKIP", foreground="orange")

    def _on_group_by_selected(self, event=None):
        """Handles changing the grouping of logs."""
        if self.parsed_logs_data is not None:
            self._display_logs(self.parsed_logs_data)

    def _on_log_double_click(self, event):
        """Opens the log.html file in the default web browser."""
        try:
            item_id = self.logs_tab.logs_tree.selection()[0]
            item_tags = self.logs_tab.logs_tree.item(item_id, "tags")
            if "no_logs" in item_tags: return # Do nothing for the placeholder message
            if len(item_tags) > 1:
                log_path = item_tags[1]
                if Path(log_path).exists():
                    os.startfile(log_path)
                else:
                    messagebox.showwarning(translate("file_not_found_title"), translate("log_open_error", path=log_path))
        except IndexError:
            pass
        except Exception as e:
            messagebox.showerror(translate("open_file_error_title"), translate("log_open_error_generic", error=e))
            
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
            encoding=OUTPUT_ENCODING,
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

def get_connected_devices(appium_command: Optional[str] = None, check_busy_devices: bool = False) -> List[Dict[str, str]]:
    """Returns a list of dictionaries, each representing a connected device."""
    busy_udids = set()
    if check_busy_devices:
        busy_udids = _get_busy_udids(appium_command)

    success, output = execute_command("adb devices -l")
    if not success:
        return []
    
    devices = []
    lines = output.strip().splitlines()[1:]
    for line in lines:
        if "device" in line and "unauthorized" not in line:
            parts = line.split()
            udid = parts[0]
            properties = get_device_properties(udid)
            if properties:
                properties['status'] = "Busy" if udid in busy_udids else "Available"
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

def get_device_aspect_ratio(udid: str) -> Optional[float]:
    """Gets the device's physical screen aspect ratio using 'wm size'."""
    success, output = execute_command(f"adb -s {udid} shell wm size")
    if success:
        match = re.search(r'Physical size:\s*(\d+)x(\d+)', output)
        if match:
            width, height = int(match.group(1)), int(match.group(2))
            if height > 0:
                return width / height
    return None

# --- Performance Monitor Helper Functions (Optimized for Persistent Shell) ---

def execute_on_persistent_shell(process: subprocess.Popen, command: str) -> str:
    """
    Executes a command on a persistent adb shell process and reads the output.
    """
    if process.poll() is not None:
        return "Error: Shell process is not running."

    # A unique marker to signal the end of a command's output
    end_marker = "ROBOT_RUNNER_CMD_DONE"
    
    # Write the command, followed by the end marker, to the shell's stdin
    process.stdin.write(f"{command}\n")
    process.stdin.write(f"echo {end_marker}\n")
    process.stdin.flush()

    output_lines = []
    while True:
        try:
            # Use a timeout to prevent blocking indefinitely if the shell hangs
            line = process.stdout.readline()
            if not line: # Shell closed
                break
            if end_marker in line:
                break
            output_lines.append(line)
        except (IOError, ValueError): # Catches errors if the pipe is closed
            break
            
    return "".join(output_lines).strip()

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

def get_surface_view_name(shell_process: subprocess.Popen, app_package: str) -> str:
    """Finds the full name of the SurfaceView layer for the app package using a persistent shell."""
    output = execute_on_persistent_shell(shell_process, "dumpsys SurfaceFlinger --list")
    blast_match = re.search(r'(SurfaceView\[.*?{}\S*?\(BLAST\)#\d+)'.format(re.escape(app_package)), output)
    if blast_match:
        return blast_match.group(1)
    match = re.search(r'(SurfaceView\[.*?{}.*?#\d+)'.format(re.escape(app_package)), output)
    return match.group(1) if match else ""

def get_surface_fps(shell_process: subprocess.Popen, surface_name: str, last_timestamps: set) -> tuple[str, set]:
    """Calculates FPS by comparing frame timestamps using a persistent shell."""
    if not surface_name:
        return "N/A", last_timestamps
    output = execute_on_persistent_shell(shell_process, f"dumpsys SurfaceFlinger --latency '{surface_name}'")
    lines = output.splitlines()
    current_timestamps = {int(parts[2]) for line in lines[1:] if len(parts := line.split()) == 3 and parts[0] != '0'}
    if not last_timestamps:
        return "0.00", current_timestamps
    new_frames_count = len(current_timestamps - last_timestamps)
    return f"{float(new_frames_count):.2f}", current_timestamps

def run_performance_monitor(udid: str, app_package: str, output_queue: Queue, stop_event: threading.Event):
    """Continuously monitors app performance and puts the output in a queue."""
    shell_process = None
    try:
        # --- Start the persistent shell ---
        creationflags = subprocess.CREATE_NO_WINDOW if sys.platform == "win32" else 0
        shell_process = subprocess.Popen(
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

        output_queue.put(f"Starting monitoring for app '{app_package}' on device '{udid}'...\n")
        header = f"{'Timestamp':<10} | {'Elapsed':<10} | {'CPU':<5} | {'RAM':<7} | {'GPU':<10} | {'Missed Vsync':<1} | {'Janky':<15} | {'FPS':<4}\n"
        output_queue.put(header)
        output_queue.put("-" * len(header) + "\n")

        # Reset gfxinfo once at the beginning
        execute_on_persistent_shell(shell_process, f"dumpsys gfxinfo {app_package} reset")
        time.sleep(0.2)

        last_timestamps = set()
        start_time = time.time()

        while not stop_event.is_set():
            elapsed_seconds = time.time() - start_time
            elapsed_time_str = time.strftime("%M:%S", time.gmtime(elapsed_seconds))
            ts = time.strftime("%H:%M:%S")

            # --- Execute commands on the persistent shell ---
            ram_output = execute_on_persistent_shell(shell_process, f"dumpsys meminfo {app_package}")
            ram_mb = "N/A"
            if "TOTAL" in ram_output and (match := re.search(r"TOTAL\s+(\d+)", ram_output)):
                ram_mb = f"{int(match.group(1)) / 1024:.2f}"

            # Using 'top' is more efficient for CPU than 'dumpsys cpuinfo' in a loop
            cpu_output = execute_on_persistent_shell(shell_process, f"top -n 1 -b")
            cpu_percent = "N/A"
            # Check for shell errors before parsing
            if "Error" not in cpu_output and "not found" not in cpu_output:
                for line in cpu_output.splitlines():
                    if app_package in line:
                        parts = line.strip().split()
                        if parts and '%' in parts[0]:
                            cpu_percent = parts[0].replace('%', '')
                            break
            
            gfx_output = execute_on_persistent_shell(shell_process, f"dumpsys gfxinfo {app_package}")
            jank_info = "0.00% (0/0)"
            if jank_match := re.search(r"Janky frames: (\d+) \(([\d.]+)%\)", gfx_output):
                total_frames = (re.search(r"Total frames rendered: (\d+)", gfx_output) or '?').group(1)
                jank_info = f"{jank_match.group(2)}% ({jank_match.group(1)}/{total_frames})"

            gpu_mem_kb = "N/A"
            if gpu_mem_match := re.search(r"Total GPU memory usage:\s+\d+ bytes, ([\d.]+) (KB|MB)", gfx_output):
                value, unit = float(gpu_mem_match.group(1)), gpu_mem_match.group(2)
                gpu_mem_kb = f"{value * 1024:.2f}" if unit == "MB" else f"{value:.2f}"

            missed_vsync = (re.search(r"Number Missed Vsync: (\d+)", gfx_output) or "N/A").group(1)

            surface_name = get_surface_view_name(shell_process, app_package)
            surface_fps, last_timestamps = get_surface_fps(shell_process, surface_name, last_timestamps)

            perf_data = {
                "ts": ts,
                "elapsed": elapsed_time_str,
                "cpu": cpu_percent,
                "ram": ram_mb,
                "gpu": gpu_mem_kb,
                "vsync": missed_vsync,
                "janky": jank_info,
                "fps": surface_fps
            }
            output_queue.put(perf_data)
            
            # The loop is now much faster, so we need to add a sleep to control the update frequency
            time.sleep(1)

    except Exception as e:
        output_queue.put(f"ERROR in monitoring loop: {e}. Retrying...\n")
        time.sleep(2)
    finally:
        if shell_process:
            shell_process.terminate()

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

def _parse_appium_command(appium_command: Optional[str]) -> Tuple[str, int, str]:
    """Parses the Appium command string to extract host, port, and base path."""
    host = "127.0.0.1"
    port = 4723
    base_path = "" # Represents '/'

    if appium_command:
        parts = appium_command.split()
        try:
            if "--address" in parts:
                host = parts[parts.index("--address") + 1]
        except IndexError:
            pass
        try:
            if "--port" in parts:
                port = int(parts[parts.index("--port") + 1])
        except (IndexError, ValueError):
            pass
        try:
            if "--base-path" in parts:
                base_path = parts[parts.index("--base-path") + 1]
        except IndexError:
            pass
        
        # Also handle --arg=value
        for part in parts:
            if part.startswith("--address="):
                host = part.split("=")[1]
            if part.startswith("--port="):
                try:
                    port = int(part.split("=")[1])
                except (IndexError, ValueError):
                    pass
            if part.startswith("--base-path="):
                base_path = part.split("=")[1]

        # Ensure base_path starts with a slash if it exists
        if base_path and not base_path.startswith('/'):
            base_path = '/' + base_path
            
    return host, port, base_path

def _get_busy_udids(appium_command: Optional[str]) -> set:
    """
    Checks Appium server for active sessions and returns a set of UDIDs for devices in use.
    Handles different Appium versions (1.x, 2.x, 3.x) and custom base paths.
    """
    host, port, base_path = _parse_appium_command(appium_command)

    # Build an ordered list of potential session endpoint paths to try.
    potential_paths = []
    
    # Priority 1: Appium 3.x style with base path (e.g., /wd/hub/appium/sessions)
    potential_paths.append(f"{base_path}/appium/sessions")
    
    # Priority 2: Appium 2.x style with base path (e.g., /wd/hub/sessions)
    potential_paths.append(f"{base_path}/sessions")

    # Priority 3: Appium 3.x default (e.g., /appium/sessions)
    potential_paths.append("/appium/sessions")
    
    # Priority 4: Appium 2.x default (e.g., /sessions)
    potential_paths.append("/sessions")

    # Priority 5: Legacy Appium 1.x (e.g., /wd/hub/sessions)
    potential_paths.append("/wd/hub/sessions")

    # Create unique, ordered list of full URLs
    urls_to_try = []
    seen_urls = set()
    for path in potential_paths:
        # Normalize path to prevent duplicates and fix slashes
        url = f"http://{host}:{port}{path}".replace('//', '/')
        if "http:/" in url and "http://" not in url:
            url = url.replace("http:/", "http://")

        if url not in seen_urls:
            urls_to_try.append(url)
            seen_urls.add(url)

    for endpoint in urls_to_try:
        try:
            with urllib.request.urlopen(endpoint, timeout=2) as response:
                if response.status == 200:
                    data = json.loads(response.read().decode())
                    busy_udids = set()
                    # W3C (Appium 2+) returns {"value": [...]}, some older versions might differ.
                    sessions = data.get('value', [])
                    if not isinstance(sessions, list):
                        sessions = []

                    for session in sessions:
                        caps = session.get('capabilities', {})
                        udid = caps.get('udid') or caps.get('appium:udid')
                        if udid:
                            busy_udids.add(udid)
                    return busy_udids
        except Exception:
            continue # Try the next endpoint if one fails
            
    return set()

def get_generation_time(xml_file: Path) -> Optional[datetime.datetime]:
    """
    Quickly gets the 'generated' timestamp from an output.xml file using regex for performance.
    Falls back to the file's modification time if regex fails.
    """
    try:
        with open(xml_file, 'r', encoding='utf-8', errors='ignore') as f:
            # Read only the first 512 bytes, as the 'generated' attribute is near the start.
            chunk = f.read(512)
            match = re.search(r'generated="(\d{8} \d{2}:\d{2}:\d{2}\.\d{3,})"', chunk)
            if match:
                generated_str = match.group(1)
                # The string might have more than 6 digits for microseconds, but strptime %f handles it.
                return datetime.datetime.strptime(generated_str, '%Y%m%d %H:%M:%S.%f')
    except (IOError, ValueError):
        pass  # Ignore errors and fall back to mtime.

    # Fallback to the file's modification time if the fast method fails.
    try:
        return datetime.datetime.fromtimestamp(xml_file.stat().st_mtime)
    except Exception:
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

def load_language_setting():
    """Loads the language from settings.json before the main window is created."""
    try:
        if SETTINGS_FILE.exists():
            with open(SETTINGS_FILE, 'r') as f:
                settings = json.load(f)
                return settings.get("language", "en_US")
        return "en_US"
    except Exception:
        return "en_US"

# --- Main Execution ---
if __name__ == "__main__":
    # High DPI awareness for Windows
    if sys.platform == "win32":
        try:
            ctypes.windll.shcore.SetProcessDpiAwareness(1)
        except Exception:
            pass
    
    # Load settings before creating the window
    language = load_language_setting()
    load_language(language) # This sets up the translations
    theme = load_theme_setting()
    
    app = ttk.Window(themename=theme)
    gui = RobotRunnerApp(app)
    app.mainloop()