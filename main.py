import os
import subprocess
import sys
import signal
import re
import json
import threading
import urllib.request
import time
import datetime
from typing import List, Dict, Optional
from pathlib import Path
import tkinter as tk
from tkinter import messagebox
from lxml import etree as ET
import ttkbootstrap as ttk
from ttkbootstrap.scrolled import ScrolledText
from ttkbootstrap.constants import *

# --- Internationalization Setup ---
from src.locales.i18n import gettext as translate

from src.shell_manager import AdbShellManager
from src.app_utils import (
    execute_command, SETTINGS_FILE, BASE_DIR, OUTPUT_ENCODING
)
from src.device_utils import (
    get_connected_devices, find_scrcpy, _prompt_download_scrcpy,
    _parse_appium_command, get_device_ip
)
from src.log_parser import get_generation_time
from src.ui.run_command_window import RunCommandWindow
from src.ui.run_tab import RunTabPage
from src.ui.logs_tab import LogsTabPage
from src.ui.settings_tab import SettingsTabPage
from src.ui.about_tab import AboutTabPage

# --- Constants ---
CONFIG_DIR = BASE_DIR / "config"

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
        self.shell_manager = AdbShellManager()
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
        self.root.after(500, self._start_initial_log_parse)
    
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
        self.group_by_var = tk.StringVar(value=translate("group_by_device"))
        self.log_period_var = tk.StringVar(value=translate("period_last_7_days"))
        # --- Performance Monitor ---
        self.app_packages_var = tk.StringVar()
        self.timestamp_logs_var = tk.BooleanVar(value=False)
        # --- Internationalization ---
        self.adb_ip_var = tk.StringVar()
        self.adb_port_var = tk.StringVar()
        self.language_var = tk.StringVar()
        self.current_path = Path() # Initialize current_path
    
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
        self.settings_tab = SettingsTabPage(self.notebook, self)
        self.about_tab = AboutTabPage(self.notebook, self)

        self.notebook.add(self.run_tab, text=translate("execute_tab"))
        self.notebook.add(self.logs_tab, text=translate("logs_tab"))
        self.notebook.add(self.settings_tab, text=translate("settings_tab"))
        self.notebook.add(self.about_tab, text=translate("about_tab"))
        
        self.notebook.bind("<<NotebookTabChanged>>", self._on_tab_change)

        self.status_bar = ttk.Frame(self.root, padding=(5, 2), relief=SUNKEN)
        self.status_bar.pack(side=BOTTOM, fill=X)
        self.status_var = tk.StringVar(value=translate("initializing"))
        self.status_label = ttk.Label(self.status_bar, textvariable=self.status_var)
        self.status_label.pack(side=LEFT)
    
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

    def _on_language_select(self, event=None): # This method is now in SettingsTabPage
        """Updates the language_var with the code corresponding to the selected language name."""
        selected_name = self.settings_tab.language_combo.get()
        for code, name in self.LANGUAGES.items():
            if name == selected_name:
                self.language_var.set(code)
                break

    def _get_expanded_path_setting(self, settings: Dict, key: str, default: str) -> str:
        """Gets a path from settings, expands custom and environment variables, and returns it."""
        path_value = settings.get(key, default)
        # First, replace the custom %CUR_DIR% placeholder (case-insensitive)
        # The lambda function prevents re.sub from misinterpreting backslashes in the path as escape sequences (e.g., \U in C:\Users).
        path_value = re.sub(r'%CUR_DIR%', lambda m: str(BASE_DIR), path_value, flags=re.IGNORECASE)
        # Then, expand standard environment variables like %USERPROFILE% or $HOME
        return os.path.expandvars(path_value)

    def _load_settings(self): # This method is now in SettingsTabPage
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

        self.appium_command_var.set(self._get_expanded_path_setting(settings, "appium_command", "appium --base-path=/wd/hub --relaxed-security"))
        self.scrcpy_path_var.set(self._get_expanded_path_setting(settings, "scrcpy_path", ""))
        self.suites_dir_var.set(self._get_expanded_path_setting(settings, "suites_dir", "suites"))
        self.tests_dir_var.set(self._get_expanded_path_setting(settings, "tests_dir", "tests"))
        self.logs_dir_var.set(self._get_expanded_path_setting(settings, "logs_dir", "logs"))
        self.screenshots_dir_var.set(self._get_expanded_path_setting(settings, "screenshots_dir", str(BASE_DIR / "screenshots")))
        self.recordings_dir_var.set(self._get_expanded_path_setting(settings, "recordings_dir", str(BASE_DIR / "recordings")))
        self.theme_var.set(settings.get("theme", "darkly"))
        self.language_var.set(settings.get("language", "en_US"))
        # --- Performance Monitor ---
        self.app_packages_var.set(settings.get("app_packages", "com.android.chrome"))
        
        self.initial_theme = self.theme_var.get()
        self.initial_language = self.language_var.get()

    def _save_settings(self): # This method is now in SettingsTabPage
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
        
    def _on_close(self): # This method is now in SettingsTabPage
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
            
            self.shell_manager.close_all()

            self.root.destroy()
            
    def _terminate_process_tree(self, pid: int, name: str): # This method is now in SettingsTabPage
        """Forcefully terminates a process and its entire tree."""
        try:
            if sys.platform == "win32":
                subprocess.run(
                    f"taskkill /PID {pid} /T /F",
                    check=True,
                    capture_output=True,
                    creationflags=subprocess.CREATE_NO_WINDOW
                )
            else: # POSIX systems
                os.kill(pid, signal.SIGTERM)
            print(translate("appium_terminate_info", pid=pid))
        except (subprocess.CalledProcessError, ProcessLookupError, FileNotFoundError) as e:
            print(translate("appium_terminate_warning", pid=pid, e=e))

    def _on_test_suite_select(self, event): # This method is now in RunTabPage
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
            
    def _run_test(self): # This method is now in RunTabPage
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

    def _run_test_thread(self, selected_devices: List[str], path_to_run: str, run_mode: str): # This method is now in RunTabPage
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

    def _create_run_command_window(self, udid: str, path_to_run: str, run_mode: str): # This method is now in RunTabPage
        """Helper to safely create the RunCommandWindow from the main GUI thread."""
        # Centralized Resource Management: If a window for this UDID already exists, close it before creating a new one.
        if udid in self.active_command_windows and self.active_command_windows[udid].winfo_exists():
            win = self.active_command_windows[udid]
            win._on_close() # This will stop activities and remove the window from the dict.

        # If no window exists, create a new one.
        win = RunCommandWindow(self, udid, mode='test', run_path=path_to_run, run_mode=run_mode)
        self.active_command_windows[udid] = win

    def _on_device_select(self, event=None): # This method is now in RunTabPage
        """Callback when a device is selected in the listbox."""
        selected_indices = self.run_tab.device_listbox.curselection()
        if not selected_indices:
            return

        # Use the first selected device for IP lookup
        selected_device_str = self.run_tab.device_listbox.get(selected_indices[0])
        udid = selected_device_str.split(" | ")[-1].split(" ")[0]
        
        # Check if the device is already connected via Wi-Fi (udid will be an IP:Port)
        if ":" in udid:
            ip, port = udid.split(":")
            self.adb_ip_var.set(ip)
            self.adb_port_var.set(port)
        else:
            # For USB devices, fetch the IP but leave the port blank for the user to fill.
            threading.Thread(target=self._fetch_and_set_device_ip, args=(udid,), daemon=True).start()

    def _fetch_and_set_device_ip(self, udid: str): # This method is now in RunTabPage
        """Fetches the wlan0 IP address of a USB device and updates the GUI."""
        ip_address = get_device_ip(udid)
        if ip_address:
            self.root.after(0, self.adb_ip_var.set, ip_address)
            # Clear the port field, as it's dynamic and should be entered by the user.
            self.root.after(0, self.adb_port_var.set, "") # Clear previous port
            # Automatically try to find the port for this IP
            threading.Thread(target=self._find_and_set_mdns_port, args=(ip_address,), daemon=True).start()
    
    def _find_and_set_mdns_port(self, ip_address: str):
        """
        Runs 'adb mdns services' in the background to find the port for a given IP.
        Updates the port entry if a match is found.
        """
        command = "adb mdns services"
        success, output = execute_command(command)

        if success:
            for line in output.splitlines():
                # Check if the line contains the IP and the adb service identifier
                if ip_address in line and "_adb-tls-connect._tcp" in line:
                    # Extract the port from the ip:port part
                    match = re.search(r"(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}):(\d+)", line)
                    if match:
                        found_ip = match.group(1)
                        found_port = match.group(2)
                        if found_ip == ip_address:
                            self.root.after(0, self.adb_port_var.set, found_port)
                            break # Found it, no need to continue

    def _pair_wireless_device(self): # This method is now in RunTabPage
        """Pairs with a device wirelessly using a pairing code."""
        ip = self.run_tab.ip_entry.get()
        port = self.run_tab.port_entry.get()
        code = self.run_tab.code_entry.get()

        if not all([ip, port, code]):
            messagebox.showwarning(translate("input_error"), translate("input_error_pair"))
            return

        command = f"adb pair {ip}:{port} {code}"
        self.run_tab.pair_button.config(state=DISABLED)
        # For now, we don't have a dedicated output on this tab, so we just run it.
        self._update_output_text(self.run_tab.adb_output_text, f"> {command}\n", True)
        threading.Thread(target=self._run_command_and_update_gui, args=(command, self.run_tab.adb_output_text, self.run_tab.pair_button, True), daemon=True).start()

    def _connect_wireless_device(self): # This method is now in RunTabPage
        """Attempts to connect to a device wirelessly via ADB."""
        ip = self.run_tab.ip_entry.get()
        port = self.run_tab.port_entry.get()
        
        if not all([ip, port]):
            messagebox.showwarning(translate("input_error"), translate("input_error_connect"))
            return

        command = f"adb connect {ip}:{port}"
        self.run_tab.connect_button.config(state=DISABLED)
        self._update_output_text(self.run_tab.adb_output_text, f"> {command}\n", True)
        threading.Thread(target=self._run_command_and_update_gui, args=(command, self.run_tab.adb_output_text, self.run_tab.connect_button, True), daemon=True).start()

    def _disconnect_wireless_device(self): # This method is now in RunTabPage
        """Disconnects a specific wireless device or all of them."""
        ip = self.run_tab.ip_entry.get()
        port = self.run_tab.port_entry.get()
        
        if ip and port:
            command = f"adb disconnect {ip}:{port}"
        else:
            command = "adb disconnect"

        self.run_tab.disconnect_button.config(state=DISABLED)
        self._update_output_text(self.run_tab.adb_output_text, f"> {command}\n", True)
        threading.Thread(target=self._run_command_and_update_gui, args=(command, self.run_tab.adb_output_text, self.run_tab.disconnect_button, True), daemon=True).start()

    def _mirror_device(self): # This method is now in RunTabPage
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

    def _mirror_device_thread(self, selected_devices: List[str]): # This method is now in RunTabPage
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

    def _create_mirror_window(self, udid: str, model: str): # This method is now in RunTabPage
        """Helper to create the mirror window on the main thread."""
        win = RunCommandWindow(self, udid, mode='mirror', title=translate("mirror_title", model=model))
        self.active_command_windows[udid] = win

    def _refresh_devices(self): # This method is now in RunTabPage
        """Refreshes the list of connected ADB devices."""
        self.status_var.set(translate("refreshing"))
        self.run_tab.refresh_button.config(state=DISABLED, text=translate("refreshing"))
        thread = threading.Thread(target=self._get_devices_thread)
        thread.daemon = True
        thread.start()

    def _get_devices_thread(self): # This method is now in RunTabPage
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

    def _update_device_list(self): # This method is now in RunTabPage
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
        
    def _check_scrcpy_version(self): # This method is now in RunTabPage
        """Checks for scrcpy and offers to download if not found."""
        if sys.platform != "win32": return
        
        def check_thread():
            scrcpy_path = find_scrcpy()
            if not scrcpy_path:
                self.root.after(0, self._prompt_download_scrcpy)
            else:
                self.scrcpy_path_var.set(str(scrcpy_path))

        threading.Thread(target=check_thread, daemon=True).start()

    def _prompt_download_scrcpy(self): # This method is now in RunTabPage
        _prompt_download_scrcpy(self)

    def _toggle_appium_server(self): # This method is now in SettingsTabPage
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

    def _start_appium_server(self, silent: bool = False): # This method is now in SettingsTabPage
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
    def _appium_server_handler(self, silent: bool): # This method is now in SettingsTabPage
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
                preexec_fn=os.setsid if sys.platform != "win32" else None # type: ignore
            )

            # Rename disposable variables to avoid conflict with the `translate` function
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

    def _run_manual_adb_command(self): # This method is now in RunTabPage
        """Runs a manual ADB command entered by the user."""
        selected_device_indices = self.run_tab.device_listbox.curselection()
        if not selected_device_indices:
            messagebox.showerror(translate("open_file_error_title"), translate("no_device_selected"), parent=self.root)
            return

        # Use the first selected device for the manual command
        selected_device_str = self.run_tab.device_listbox.get(selected_device_indices[0])
        udid = selected_device_str.split(" | ")[-1].split(" ")[0]

        command = self.run_tab.adb_command_entry.get()
        if not command:
            return
        
        # Check if the user is trying to target a specific device, which we will override.
        if "-s" in command.split():
            messagebox.showwarning(translate("input_error"), "The -s <udid> flag is added automatically based on your selection. Please remove it from the command.", parent=self.root)
            return
        
        full_command = f"adb -s {udid} {command}"
        self.run_tab.run_adb_button.config(state=DISABLED)
        self._update_output_text(self.run_tab.adb_output_text, f"> {full_command}\n", True)
        
        thread = threading.Thread(target=self._run_command_and_update_gui, args=(full_command, self.run_tab.adb_output_text, self.run_tab.run_adb_button))
        thread.daemon = True
        thread.start()

    def _check_appium_version(self): # This method is now in SettingsTabPage
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

    def _is_appium_running(self) -> bool: # This method is now in SettingsTabPage
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

    def _wait_for_appium_startup(self, timeout: int = 20) -> bool: # This method is now in SettingsTabPage
        """Waits for the Appium server to become available after starting."""
        start_time = time.time()
        while time.time() - start_time < timeout:
            if self._is_appium_running():
                return True
            time.sleep(0.5)
        return False

    def _get_cache_path_for_period(self, period: str) -> Path: # This method is now in LogsTabPage
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

    def _start_log_reparse(self): # This method is now in LogsTabPage
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

    def _start_initial_log_parse(self): # This method is now in LogsTabPage
        """Starts an initial, silent log parse in the background for the default period."""
        # This method is designed to run silently on startup to pre-cache logs.
        # It does not provide any UI feedback (progress bar, etc.).
        period = self.log_period_var.get() # Default is "Last 7 Days"
        thread = threading.Thread(target=self._parse_logs_thread, args=(period, True), daemon=True)
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

    def _parse_logs_thread(self, period: str, silent: bool = False): # This method is now in LogsTabPage
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
            
            if not silent:
                self.root.after(0, self._update_parse_progress, i + 1, total_files)

        cache_file_to_save = self._get_cache_path_for_period(period)
        try:
            with open(cache_file_to_save, 'w', encoding=OUTPUT_ENCODING) as f:
                json.dump(all_results, f, indent=4)
        except Exception as e:
            print(f"Error writing to log cache file: {e}")
            
        if not silent:
            self.root.after(0, self._finalize_parsing, all_results)

    def _update_parse_progress(self, current, total): # This method is now in LogsTabPage
        """Updates the progress bar and label from the main thread."""
        if total > 0:
            percentage = (current / total) * 100
            self.logs_tab.progress_bar['value'] = percentage
            self.logs_tab.progress_label.config(text=translate("parsing_progress", current=current, total=total))
        else:
            self.logs_tab.progress_label.config(text=translate("no_log_files_found"))
            self.logs_tab.progress_bar['value'] = 100

    def _finalize_parsing(self, results): # This method is now in LogsTabPage
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

    def _display_logs(self, log_data: List[Dict]): # This method is now in LogsTabPage
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
    
    def _on_group_by_selected(self, event=None): # This method is now in LogsTabPage
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
            
    def _run_command_and_update_gui(self, command: str, output_widget: Optional[ScrolledText], button: ttk.Button, refresh_on_success: bool = False): # This method is now in RunTabPage
        success, output = execute_command(command)
        if output_widget:
            if not output:
                self.root.after(0, self._update_output_text, output_widget, f"\nResult: {success}\n", False)
            else:
                self.root.after(0, self._update_output_text, output_widget, f"\nResult:\n{output}\n", False)
        
        if success and refresh_on_success:
            self.root.after(100, self._refresh_devices)
            
        self.root.after(0, lambda: button.config(state=NORMAL))

    def _update_output_text(self, widget: Optional[ScrolledText], result: str, clear: bool): # This method is now in SettingsTabPage
        if not widget: return
        widget.text.config(state=NORMAL)
        if clear:
            widget.delete("1.0", END)
        widget.insert(END, result)
        widget.text.config(state=DISABLED)
        widget.see(END)