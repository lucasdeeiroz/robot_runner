import json
import subprocess
import sys
import re
import webbrowser
# import tkinter as tk
from tkinter import messagebox
import ttkbootstrap as ttk
from ttkbootstrap.constants import BOTH, YES, WORD, DISABLED, RIGHT, BOTTOM, X, W, NORMAL
from ttkbootstrap.scrolled import ScrolledText
from ttkbootstrap.tooltip import ToolTip

from src.locales.i18n import gettext as translate
from src.app_utils import (
    SETTINGS_FILE, CONFIG_DIR
)
from src.ui.path_selector import PathSelector

from pathlib import Path

class SettingsTabPage(ttk.Frame):
    """UI and logic for the 'Settings' tab."""
    def __init__(self, parent, data_model, callbacks: dict = None):
        super().__init__(parent, padding=10)
        self.model = data_model
        self.callbacks = callbacks if callbacks is not None else {}

        self._setup_widgets()

    def _setup_widgets(self):
        # --- Container for the save button, packed FIRST to reserve space at the bottom ---
        button_container = ttk.Frame(self)
        button_container.pack(side=BOTTOM, fill=X, pady=(10, 0))
        save_button = ttk.Button(button_container, text=translate("save_settings"), command=self._save_settings, bootstyle="primary")
        save_button.pack(side=RIGHT) # Align to the right within its container
        ToolTip(save_button, translate("save_settings_tooltip"))

        # Main notebook for settings categories
        # Packed SECOND to fill the remaining space
        settings_notebook = ttk.Notebook(self)
        settings_notebook.pack(fill=BOTH, expand=YES, pady=5)

        # Create frames for each tab
        app_tab = ttk.Frame(settings_notebook, padding=10)

        appium_tab = ttk.Frame(settings_notebook, padding=10)
        mirror_tab = ttk.Frame(settings_notebook, padding=10)
        monitor_tab = ttk.Frame(settings_notebook, padding=10)
        monitor_tab = ttk.Frame(settings_notebook, padding=10)
        tests_tab = ttk.Frame(settings_notebook, padding=10)
        ai_tab = ttk.Frame(settings_notebook, padding=10)

        # Add tabs to the notebook
        settings_notebook.add(app_tab, text=translate("app_settings_tab"))
        settings_notebook.add(appium_tab, text=translate("appium_settings_tab"))
        settings_notebook.add(mirror_tab, text=translate("mirror_settings_tab"))
        settings_notebook.add(monitor_tab, text=translate("monitor_settings_tab"))
        settings_notebook.add(monitor_tab, text=translate("monitor_settings_tab"))
        settings_notebook.add(tests_tab, text=translate("tests_settings_tab"))
        # settings_notebook.add(ai_tab, text=translate("ai_settings_tab"))

        # Populate each tab
        self._setup_app_tab(app_tab)
        self._setup_appium_tab(appium_tab)
        self._setup_mirror_tab(mirror_tab)
        self._setup_monitor_tab(monitor_tab)
        self._setup_monitor_tab(monitor_tab)
        self._setup_tests_tab(tests_tab)
        self._setup_ai_tab(ai_tab)

    def _save_settings(self):
        """Saves current settings to the settings.json file."""
        CONFIG_DIR.mkdir(exist_ok=True)
        settings = {
            "appium_command": self.model.appium_options_var.get(),
            "scrcpy_path": self.model.scrcpy_path_var.get(),
            "suites_dir": self.model.suites_dir_var.get(),
            "tests_dir": self.model.tests_dir_var.get(),
            "resources_dir": self.model.resources_dir_var.get(),
            "scrcpy_options": self.model.scrcpy_options_var.get(),
            "robot_options": self.model.robot_options_var.get(),
            "logs_dir": self.model.logs_dir_var.get(),
            "logcat_dir": self.model.logcat_dir_var.get(),
            "screenshots_dir": self.model.screenshots_dir_var.get(),
            "recordings_dir": self.model.recordings_dir_var.get(),
            "theme": self.model.theme_var.get(),
            "language": self.model.language_var.get(),
            "app_packages": self.model.app_packages_var.get(),
            "generate_allure_report": self.model.generate_allure_var.get(),
            "generate_allure_report": self.model.generate_allure_var.get(),
            "common_adb_commands": self.model.common_adb_commands,
            "ai_api_key": self.model.ai_api_key_var.get(),
            "ai_model_name": self.model.ai_model_name_var.get()
        }
        try:
            with open(SETTINGS_FILE, 'w') as f:
                json.dump(settings, f, indent=4)
            
            self.callbacks.get('update_paths_from_settings', lambda: None)()
            self.callbacks.get('update_ai_settings', lambda: None)()
            
            if self.model.initial_theme != self.model.theme_var.get() or self.model.initial_language != self.model.language_var.get():
                messagebox.showinfo(translate("restart_required_title"), translate("restart_required_message"))
                self.model.initial_theme = self.model.theme_var.get()
                self.model.initial_language = self.model.language_var.get()
            
            self.callbacks.get('show_toast', lambda *args, **kwargs: None)(translate("settings_saved_title"), translate("settings_saved_message"), "success")

        except IOError as e:
            self.callbacks.get('show_toast', lambda *args, **kwargs: None)(translate("open_file_error_title"), translate("save_settings_error", e=e), "danger")

    def _setup_app_tab(self, parent_frame):
        """Populates the 'App' settings tab."""
        parent_frame.columnconfigure(1, weight=1)

        # --- Other Dirs ---
        ttk.Label(parent_frame, text=translate("adb_configs"), font="-weight bold").grid(row=0, column=0, columnspan=2, sticky="w", pady=(10, 5))
        adb_frame = ttk.Frame(parent_frame, padding=10)
        adb_frame.grid(row=1, column=0, columnspan=2, sticky="ew", pady=10)
        adb_frame.columnconfigure(1, weight=1)

        screenshots_selector = PathSelector(adb_frame, translate("screenshots_dir"), self.model.screenshots_dir_var, translate("screenshots_dir_tooltip"))
        screenshots_selector.grid(row=0, column=0, columnspan=2, sticky="ew")

        recordings_selector = PathSelector(adb_frame, translate("recordings_dir"), self.model.recordings_dir_var, translate("recordings_dir_tooltip"))
        recordings_selector.grid(row=1, column=0, columnspan=2, sticky="ew")

        self.restart_adb_button = ttk.Button(adb_frame, text=translate("restart_adb_server"), command=self.callbacks.get('restart_adb_server'), bootstyle="warning")
        self.restart_adb_button.grid(row=2, column=0, sticky="w", padx=5, pady=5)
        ToolTip(self.restart_adb_button, translate("restart_adb_server_tooltip"))
    
        # --- Appearance ---
        ttk.Label(parent_frame, text=translate("appearance"), font="-weight bold").grid(row=2, column=0, columnspan=2, sticky="w", pady=(0, 5))
        appearance_frame = ttk.Frame(parent_frame, padding=10, borderwidth=0, relief="solid")
        appearance_frame.grid(row=3, column=0, columnspan=2, sticky="ew", pady=(0, 10))
        appearance_frame.columnconfigure(1, weight=1)

        ttk.Label(appearance_frame, text=translate("theme")).grid(row=0, column=0, padx=5, pady=5, sticky=W)
        theme_combo = ttk.Combobox(appearance_frame, textvariable=self.model.theme_var, values=self.model.style.theme_names())
        theme_combo.grid(row=0, column=1, padx=5, pady=5, sticky="ew")
        ToolTip(theme_combo, translate("theme_tooltip"))

        ttk.Label(appearance_frame, text=translate("language_label")).grid(row=1, column=0, padx=5, pady=5, sticky=W)
        self.language_combo = ttk.Combobox(appearance_frame, values=list(self.model.LANGUAGES.values()))
        self.language_combo.set(self.model.LANGUAGES.get(self.model.language_var.get(), "English"))
        self.language_combo.grid(row=1, column=1, padx=5, pady=5, sticky="ew")
        self.language_combo.bind("<<ComboboxSelected>>", self._on_language_select)
        ToolTip(self.language_combo, translate("language_tooltip"))

        self._setup_system_versions(parent_frame)

    def _on_language_select(self, event=None):
        """Updates the language_var with the code corresponding to the selected language name."""
        selected_name = self.language_combo.get()
        for code, name in self.model.LANGUAGES.items():
            if name == selected_name:
                self.model.language_var.set(code)
                break

    def _setup_system_versions(self, parent_frame):
        """Populates the 'System Versions' section."""
        ttk.Label(parent_frame, text=translate("system_versions"), font="-weight bold").grid(row=4, column=0, columnspan=2, sticky="w", pady=(10, 5))
        versions_frame = ttk.Frame(parent_frame, padding=10, borderwidth=0, relief="solid")
        versions_frame.grid(row=5, column=0, columnspan=2, sticky="ew", pady=(0, 10))
        versions_frame.columnconfigure(1, weight=1)

        self.version_labels = {}
        tools = ["ADB", "Appium", "UiAutomator2", "Scrcpy", "Robot Framework", "Allure"]
        
        for i, tool in enumerate(tools):
            ttk.Label(versions_frame, text=f"{tool}:").grid(row=i, column=0, padx=5, pady=2, sticky=W)
            label = ttk.Label(versions_frame, text=translate("loading"))
            label.grid(row=i, column=1, padx=5, pady=2, sticky=W)
            self.version_labels[tool] = label

        # Fetch versions in a separate thread to avoid freezing UI
        import threading
        threading.Thread(target=self._fetch_system_versions, daemon=True).start()

    def _fetch_system_versions(self):
        """Fetches versions of system tools."""
        def get_version(cmd):
            try:
                # Use shell=True to find commands in PATH (especially on Windows for .cmd/.bat)
                # Join list to string if shell=True for better compatibility
                if isinstance(cmd, list):
                    cmd_str = subprocess.list2cmdline(cmd)
                else:
                    cmd_str = cmd
                
                # Force UTF-8 encoding and replace errors to avoid crashing on special chars like checkmarks
                result = subprocess.run(
                    cmd_str, 
                    capture_output=True, 
                    text=True, 
                    check=True, 
                    shell=True, 
                    encoding='utf-8',
                    errors='replace',
                    creationflags=subprocess.CREATE_NO_WINDOW if sys.platform == "win32" else 0
                )
                output = result.stdout.strip()
                if not output:
                    output = result.stderr.strip()
                return output.split('\n')[0] # Take first line
            except Exception as e:
                # print(f"Error fetching version for {cmd}: {e}") # Debugging
                return translate("not_found")

        # ADB
        adb_version = get_version(["adb", "--version"])
        self._update_version_label("ADB", adb_version)

        # Appium
        appium_setting = self.model.appium_options_var.get()
        # If setting starts with '-' (args) or is empty, use default 'appium'
        if not appium_setting or appium_setting.strip().startswith("-"):
             appium_cmd = ["appium", "--version"]
        else:
             # Assume it's a command/path
             appium_cmd = appium_setting.split() + ["--version"]
        
        appium_version = get_version(appium_cmd)
        self._update_version_label("Appium", appium_version)

        # UiAutomator2
        try:
            # Similar logic for driver list
            if not appium_setting or appium_setting.strip().startswith("-"):
                base_cmd = ["appium"]
            else:
                base_cmd = appium_setting.split()
            
            # Use --json for machine-readable output
            cmd = base_cmd + ["driver", "list", "--installed", "--json"]
            
            if isinstance(cmd, list):
                cmd_str = subprocess.list2cmdline(cmd)
            else:
                cmd_str = cmd
            
            result = subprocess.run(
                cmd_str, 
                capture_output=True, 
                text=True, 
                check=True, 
                shell=True, 
                encoding='utf-8',
                errors='replace',
                creationflags=subprocess.CREATE_NO_WINDOW if sys.platform == "win32" else 0
            )
            
            try:
                # Parse JSON output
                drivers_info = json.loads(result.stdout)
                # Structure might be { "uiautomator2": { "version": "x.x.x", ... } } or similar depending on Appium version
                # Or sometimes it returns a list. Let's inspect typical output structure or handle loosely.
                # Typical Appium 2 output: {"uiautomator2": {"version": "2.29.4", "pkgName": "appium-uiautomator2-driver", ...}}
                
                if "uiautomator2" in drivers_info:
                    uia2_version = drivers_info["uiautomator2"].get("version", "Installed")
                else:
                    uia2_version = translate("not_found")
            except json.JSONDecodeError:
                # Fallback to text parsing if JSON fails (e.g. older Appium)
                if "uiautomator2" in result.stdout:
                    import re
                    match = re.search(r"uiautomator2@([\d\.]+)", result.stdout)
                    uia2_version = match.group(1) if match else "Installed"
                else:
                    uia2_version = translate("not_found")

        except Exception:
            uia2_version = translate("not_found")
        self._update_version_label("UiAutomator2", uia2_version)

        # Scrcpy
        scrcpy_path = self.model.scrcpy_path_var.get()
        scrcpy_version = translate("not_found")
        
        if scrcpy_path and scrcpy_path.lower() != "scrcpy":
            exe_name = "scrcpy.exe" if sys.platform == "win32" else "scrcpy"
            scrcpy_cmd = [str(Path(scrcpy_path) / exe_name), "--version"]
            scrcpy_version = get_version(scrcpy_cmd)
        
        # Fallback to PATH if not found or if path was just "scrcpy"
        if scrcpy_version == translate("not_found"):
             scrcpy_version = get_version(["scrcpy", "--version"])

        # Scrcpy output might be multiline, just take the version number usually on first line
        if "scrcpy" in scrcpy_version.lower():
             try:
                 parts = scrcpy_version.split()
                 if len(parts) > 1:
                    scrcpy_version = parts[1] # scrcpy 2.0 -> 2.0
             except IndexError:
                 pass

        self._update_version_label("Scrcpy", scrcpy_version)

        # Robot Framework
        try:
            import robot
            robot_version = robot.__version__
        except ImportError:
            # Fallback to subprocess if import fails (unlikely if running in same env)
            robot_version = get_version(["robot", "--version"])
            if robot_version == translate("not_found"):
                 robot_version = get_version([sys.executable, "-m", "robot", "--version"])

        self._update_version_label("Robot Framework", robot_version)

        # Allure
        allure_version = get_version(["allure", "--version"])
        self._update_version_label("Allure", allure_version)

    def _update_version_label(self, tool, version):
        """Updates the version label in the UI thread."""
        if tool in self.version_labels:
             self.after(0, lambda: self.version_labels[tool].config(text=version))

    def _setup_appium_tab(self, parent_frame):
        """Populates the 'Appium' settings tab."""
        parent_frame.columnconfigure(0, weight=1)

        # --- Appium Command ---
        ttk.Label(parent_frame, text=translate("app_tool_paths"), font="-weight bold").grid(row=0, column=0, sticky="w", pady=(0, 5))
        appium_cmd_frame = ttk.Frame(parent_frame, padding=10, borderwidth=0, relief="solid")
        appium_cmd_frame.grid(row=1, column=0, sticky="ew", pady=(0, 10))
        appium_cmd_frame.columnconfigure(1, weight=1)

        ttk.Label(appium_cmd_frame, text=translate("appium_command")).grid(row=0, column=0, padx=5, pady=5, sticky=W)
        appium_cmd_entry = ttk.Entry(appium_cmd_frame, textvariable=self.model.appium_options_var)
        appium_cmd_entry.grid(row=0, column=1, padx=5, pady=5, sticky="ew")
        appium_cmd_entry.grid(row=0, column=1, padx=5, pady=5, sticky="ew")
        ToolTip(appium_cmd_entry, translate("appium_command_tooltip"))


        # --- Appium Server Control ---
        self.appium_status_label = ttk.Label(appium_cmd_frame, text=translate("appium_status_stopped"), bootstyle="danger")
        self.appium_status_label.grid(row=0, column=1, padx=(0, 10), pady=5, sticky="e")
        ToolTip(self.appium_status_label, translate("appium_status_tooltip"))

        self.toggle_appium_button = ttk.Button(appium_cmd_frame, text=translate("start_appium"), command=self.callbacks.get('toggle_appium_server'), bootstyle="primary")
        self.toggle_appium_button.grid(row=1, column=1, padx=5, pady=5, sticky="e")
        ToolTip(self.toggle_appium_button, translate("appium_toggle_tooltip"))

        # --- Appium Output ---
        ttk.Label(parent_frame, text=translate("appium_server_output"), font="-weight bold").grid(row=2, column=0, sticky="w", pady=(10, 5))
        output_frame = ttk.Frame(parent_frame, padding=5, borderwidth=0, relief="solid")
        output_frame.grid(row=3, column=0, sticky="nsew")
        output_frame.rowconfigure(0, weight=1)
        output_frame.columnconfigure(0, weight=1)
        self.appium_output_text = ScrolledText(output_frame, wrap=WORD, state=DISABLED, autohide=True)
        self.appium_output_text.pack(fill=BOTH, expand=YES)

        parent_frame.rowconfigure(3, weight=1) # Make the output area expand
        
    def _setup_mirror_tab(self, parent_frame):
        """Populates the 'Mirror' settings tab."""
        parent_frame.columnconfigure(1, weight=1)

        ttk.Label(parent_frame, text=translate("app_tool_paths"), font="-weight bold").grid(row=0, column=0, columnspan=2, sticky="w", pady=(0, 5))
        mirror_paths_frame = ttk.Frame(parent_frame, padding=10, borderwidth=0, relief="solid")
        mirror_paths_frame.grid(row=1, column=0, columnspan=2, sticky="ew", pady=(0, 10))
        mirror_paths_frame.columnconfigure(1, weight=1)

        # Using PathSelector for scrcpy path
        scrcpy_selector = PathSelector(mirror_paths_frame, translate("scrcpy_path"), self.model.scrcpy_path_var, translate("scrcpy_path_tooltip"))
        scrcpy_selector.grid(row=0, column=0, columnspan=2, sticky="ew")
        

        # --- Scrcpy Options ---
        scrcpy_options_frame = ttk.Frame(mirror_paths_frame)
        scrcpy_options_frame.grid(row=1, column=0, columnspan=2, sticky="ew", pady=(10,0))
        scrcpy_options_frame.columnconfigure(1, weight=1)

        ttk.Label(scrcpy_options_frame, text=translate("scrcpy_command_options")).grid(row=0, column=0, padx=5, pady=5, sticky=W)
        scrcpy_options_entry = ttk.Entry(scrcpy_options_frame, textvariable=self.model.scrcpy_options_var)
        scrcpy_options_entry.grid(row=0, column=1, padx=5, pady=5, sticky="ew")
        ToolTip(scrcpy_options_entry, translate("scrcpy_options_tooltip"))

    def _setup_monitor_tab(self, parent_frame):
        """Populates the 'Monitor' settings tab."""
        parent_frame.columnconfigure(1, weight=1)

        ttk.Label(parent_frame, text=translate("performance_monitor"), font="-weight bold").grid(row=0, column=0, columnspan=2, sticky="w", pady=(0, 5))
        perf_monitor_frame = ttk.Frame(parent_frame, padding=10, borderwidth=0, relief="solid")
        perf_monitor_frame.grid(row=1, column=0, columnspan=2, sticky="ew", pady=(0, 10))
        perf_monitor_frame.columnconfigure(1, weight=1)

        ttk.Label(perf_monitor_frame, text=translate("app_packages_label")).grid(row=0, column=0, padx=5, pady=5, sticky=W)
        app_packages_entry = ttk.Entry(perf_monitor_frame, textvariable=self.model.app_packages_var)
        app_packages_entry.grid(row=0, column=1, padx=5, pady=5, sticky="ew")
        ToolTip(app_packages_entry, translate("app_packages_tooltip"))

    def _setup_tests_tab(self, parent_frame):
        """Populates the 'Tests' settings tab."""
        parent_frame.columnconfigure(1, weight=1)

        ttk.Label(parent_frame, text=translate("dir_path_settings"), font="-weight bold").grid(row=0, column=0, columnspan=2, sticky="w", pady=(0, 5))
        test_dirs_frame = ttk.Frame(parent_frame, padding=10, borderwidth=0, relief="solid")
        test_dirs_frame.grid(row=1, column=0, columnspan=2, sticky="ew", pady=(0, 10))
        test_dirs_frame.columnconfigure(1, weight=1)

        suites_selector = PathSelector(test_dirs_frame, translate("suites_dir"), self.model.suites_dir_var, translate("suites_dir_tooltip"))
        suites_selector.grid(row=0, column=0, columnspan=2, sticky="ew")

        tests_selector = PathSelector(test_dirs_frame, translate("tests_dir"), self.model.tests_dir_var, translate("tests_dir_tooltip"))
        tests_selector.grid(row=1, column=0, columnspan=2, sticky="ew")

        resources_selector = PathSelector(test_dirs_frame, translate("resources_dir"), self.model.resources_dir_var, translate("resources_dir_tooltip"))
        resources_selector.grid(row=2, column=0, columnspan=2, sticky="ew")

        logs_selector = PathSelector(test_dirs_frame, translate("logs_dir"), self.model.logs_dir_var, translate("logs_dir_tooltip"))
        logs_selector.grid(row=3, column=0, columnspan=2, sticky="ew")

        logcat_selector = PathSelector(test_dirs_frame, translate("logcat_dir"), self.model.logcat_dir_var, translate("logcat_dir_tooltip"))
        logcat_selector.grid(row=4, column=0, columnspan=2, sticky="ew")

        # --- Robot Options ---
        ttk.Label(parent_frame, text=translate("robot_command_options"), font="-weight bold").grid(row=2, column=0, columnspan=2, sticky="w", pady=(10, 5))
        robot_options_frame = ttk.Frame(parent_frame, padding=10, borderwidth=0, relief="solid")
        robot_options_frame.grid(row=3, column=0, columnspan=2, sticky="ew", pady=10)
        robot_options_frame.columnconfigure(0, weight=1)

        robot_options_entry = ttk.Entry(robot_options_frame, textvariable=self.model.robot_options_var)
        robot_options_entry.pack(fill=X, expand=YES, padx=5, pady=5)
        ToolTip(robot_options_entry, translate("robot_options_tooltip"))

        # --- Allure Report ---
        self.allure_checkbox = ttk.Checkbutton(robot_options_frame, text=translate("generate_allure_report"), variable=self.model.generate_allure_var, state=DISABLED)
        self.allure_checkbox.pack(fill=X, padx=5, pady=5)
        ToolTip(self.allure_checkbox, translate("generate_allure_report_tooltip"))

        # Check initial state (in case version was already fetched)
        self.update_allure_checkbox_state()

    def update_allure_checkbox_state(self):
        """Updates the state of the Allure checkbox based on version detection."""
        if getattr(self.model, 'allure_version', None):
            self.allure_checkbox.config(state=NORMAL)
        else:
            self.allure_checkbox.config(state=DISABLED)
            self.model.generate_allure_var.set(False) # Uncheck if disabled

    def _setup_ai_tab(self, parent_frame):
        """Populates the 'AI' settings tab."""
        parent_frame.columnconfigure(1, weight=1)

        ttk.Label(parent_frame, text=translate("ai_configuration"), font="-weight bold").grid(row=0, column=0, columnspan=2, sticky="w", pady=(0, 5))
        ai_config_frame = ttk.Frame(parent_frame, padding=10, borderwidth=0, relief="solid")
        ai_config_frame.grid(row=1, column=0, columnspan=2, sticky="ew", pady=(0, 10))
        ai_config_frame.columnconfigure(1, weight=1)

        # API Key
        ttk.Label(ai_config_frame, text=translate("ai_api_key")).grid(row=0, column=0, padx=5, pady=5, sticky=W)
        
        api_key_frame = ttk.Frame(ai_config_frame)
        api_key_frame.grid(row=0, column=1, padx=5, pady=5, sticky="ew")
        api_key_frame.columnconfigure(0, weight=1)

        api_key_entry = ttk.Entry(api_key_frame, textvariable=self.model.ai_api_key_var, show="*")
        api_key_entry.grid(row=0, column=0, sticky="ew")
        ToolTip(api_key_entry, translate("ai_api_key_tooltip"))

        get_key_button = ttk.Button(api_key_frame, text=translate("get_api_key"), command=lambda: webbrowser.open("https://aistudio.google.com/app/apikey"), bootstyle="link")
        get_key_button.grid(row=0, column=1, padx=(5, 0))
        ToolTip(get_key_button, translate("get_api_key_tooltip"))

        # Model Name
        ttk.Label(ai_config_frame, text=translate("ai_model_name")).grid(row=1, column=0, padx=5, pady=5, sticky=W)
        model_combo = ttk.Combobox(ai_config_frame, textvariable=self.model.ai_model_name_var, values=[
            "gemini-2.5-flash",
            "gemini-2.5-flash-lite",
            "gemini-2.5-pro",
            "gemini-3-pro-preview"
        ])
        model_combo.grid(row=1, column=1, padx=5, pady=5, sticky="ew")
        ToolTip(model_combo, translate("ai_model_name_tooltip"))
