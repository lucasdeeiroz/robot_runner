import json
import tkinter as tk
from tkinter import messagebox
import ttkbootstrap as ttk
from ttkbootstrap.constants import *
from ttkbootstrap.scrolled import ScrolledText
from ttkbootstrap.tooltip import ToolTip

from src.locales.i18n import gettext as translate
from src.app_utils import (
    SETTINGS_FILE, CONFIG_DIR
)
from src.ui.path_selector import PathSelector

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
        tests_tab = ttk.Frame(settings_notebook, padding=10)

        # Add tabs to the notebook
        settings_notebook.add(app_tab, text=translate("app_settings_tab"))
        settings_notebook.add(appium_tab, text=translate("appium_settings_tab"))
        settings_notebook.add(mirror_tab, text=translate("mirror_settings_tab"))
        settings_notebook.add(monitor_tab, text=translate("monitor_settings_tab"))
        settings_notebook.add(tests_tab, text=translate("tests_settings_tab"))

        # Populate each tab
        self._setup_app_tab(app_tab)
        self._setup_appium_tab(appium_tab)
        self._setup_mirror_tab(mirror_tab)
        self._setup_monitor_tab(monitor_tab)
        self._setup_tests_tab(tests_tab)

    def _save_settings(self):
        """Saves current settings to the settings.json file."""
        CONFIG_DIR.mkdir(exist_ok=True)
        settings = {
            "appium_command": self.model.appium_options_var.get(),
            "scrcpy_path": self.model.scrcpy_path_var.get(),
            "suites_dir": self.model.suites_dir_var.get(),
            "tests_dir": self.model.tests_dir_var.get(),
            "scrcpy_options": self.model.scrcpy_options_var.get(),
            "robot_options": self.model.robot_options_var.get(),
            "logs_dir": self.model.logs_dir_var.get(),
            "screenshots_dir": self.model.screenshots_dir_var.get(),
            "recordings_dir": self.model.recordings_dir_var.get(),
            "theme": self.model.theme_var.get(),
            "language": self.model.language_var.get(),
            "app_packages": self.model.app_packages_var.get(),
            "common_adb_commands": self.model.common_adb_commands
        }
        try:
            with open(SETTINGS_FILE, 'w') as f:
                json.dump(settings, f, indent=4)
            
            self.callbacks.get('update_paths_from_settings', lambda: None)()
            
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

    def _on_language_select(self, event=None):
        """Updates the language_var with the code corresponding to the selected language name."""
        selected_name = self.language_combo.get()
        for code, name in self.model.LANGUAGES.items():
            if name == selected_name:
                self.model.language_var.set(code)
                break

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

        logs_selector = PathSelector(test_dirs_frame, translate("logs_dir"), self.model.logs_dir_var, translate("logs_dir_tooltip"))
        logs_selector.grid(row=2, column=0, columnspan=2, sticky="ew")

        # --- Robot Options ---
        ttk.Label(parent_frame, text=translate("robot_command_options"), font="-weight bold").grid(row=2, column=0, columnspan=2, sticky="w", pady=(10, 5))
        robot_options_frame = ttk.Frame(parent_frame, padding=10, borderwidth=0, relief="solid")
        robot_options_frame.grid(row=3, column=0, columnspan=2, sticky="ew", pady=10)
        robot_options_frame.columnconfigure(0, weight=1)

        robot_options_entry = ttk.Entry(robot_options_frame, textvariable=self.model.robot_options_var)
        robot_options_entry.pack(fill=X, expand=YES, padx=5, pady=5)
        ToolTip(robot_options_entry, translate("robot_options_tooltip"))