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

class SettingsTabPage(ttk.Frame):
    """UI and logic for the 'Settings' tab."""
    def __init__(self, parent, app):
        super().__init__(parent, padding=10)
        self.app = app

        self._setup_widgets()

    def _setup_widgets(self):
        # --- Save Button (Moved to the top to be packed first) ---
        save_button = ttk.Button(self, text=translate("save_settings"), command=self._save_settings, bootstyle="primary")
        save_button.pack(side=BOTTOM, fill=X, pady=(10, 0))
        ToolTip(save_button, translate("save_settings_tooltip"))

        # Main notebook for settings categories
        settings_notebook = ttk.Notebook(self)
        settings_notebook.pack(fill=BOTH, expand=YES, pady=5)

        # Create frames for each tab
        app_tab = ttk.Frame(settings_notebook, padding=10)
        appium_tab = ttk.Frame(settings_notebook, padding=10)
        mirror_tab = ttk.Frame(settings_notebook, padding=10)
        inspector_tab = ttk.Frame(settings_notebook, padding=10)
        tests_tab = ttk.Frame(settings_notebook, padding=10)

        # Add tabs to the notebook
        settings_notebook.add(app_tab, text=translate("app_settings_tab"))
        settings_notebook.add(appium_tab, text=translate("appium_settings_tab"))
        settings_notebook.add(mirror_tab, text=translate("mirror_settings_tab"))
        settings_notebook.add(inspector_tab, text=translate("inspector_settings_tab"))
        settings_notebook.add(tests_tab, text=translate("tests_settings_tab"))

        # Populate each tab
        self._setup_app_tab(app_tab)
        self._setup_appium_tab(appium_tab)
        self._setup_mirror_tab(mirror_tab)
        self._setup_inspector_tab(inspector_tab)
        self._setup_tests_tab(tests_tab)

    def _save_settings(self):
        """Saves current settings to the settings.json file."""
        CONFIG_DIR.mkdir(exist_ok=True)
        settings = {
            "appium_command": self.app.appium_options_var.get(),
            "scrcpy_path": self.app.scrcpy_path_var.get(),
            "suites_dir": self.app.suites_dir_var.get(),
            "tests_dir": self.app.tests_dir_var.get(),
            "scrcpy_options": self.app.scrcpy_options_var.get(),
            "robot_options": self.app.robot_options_var.get(),
            "logs_dir": self.app.logs_dir_var.get(),
            "screenshots_dir": self.app.screenshots_dir_var.get(),
            "recordings_dir": self.app.recordings_dir_var.get(),
            "theme": self.app.theme_var.get(),
            "language": self.app.language_var.get(),
            # --- Performance Monitor ---
            "app_packages": self.app.app_packages_var.get(),
            "common_adb_commands": self.app.common_adb_commands
        }
        try:
            with open(SETTINGS_FILE, 'w') as f:
                json.dump(settings, f, indent=4)
            
            self.app._update_paths_from_settings()
            
            if self.app.initial_theme != self.app.theme_var.get() or self.app.initial_language != self.app.language_var.get():
                messagebox.showinfo(translate("restart_required_title"), translate("restart_required_message"), parent=self.app.root)
                self.app.initial_theme = self.app.theme_var.get()
                self.app.initial_language = self.app.language_var.get()
            else:
                messagebox.showinfo(translate("settings_saved_title"), translate("settings_saved_message"), parent=self.app.root)

        except IOError as e:
            messagebox.showerror(translate("open_file_error_title"), translate("save_settings_error", e=e), parent=self.app.root)

    def _setup_app_tab(self, parent_frame):
        """Populates the 'App' settings tab."""
        parent_frame.columnconfigure(1, weight=1)

        # --- Appearance ---
        appearance_frame = ttk.LabelFrame(parent_frame, text=translate("appearance"), padding=10)
        appearance_frame.grid(row=0, column=0, columnspan=2, sticky="ew", pady=(0, 10))
        appearance_frame.columnconfigure(1, weight=1)

        ttk.Label(appearance_frame, text=translate("theme")).grid(row=0, column=0, padx=5, pady=5, sticky=W)
        theme_combo = ttk.Combobox(appearance_frame, textvariable=self.app.theme_var, values=self.app.style.theme_names())
        theme_combo.grid(row=0, column=1, padx=5, pady=5, sticky="ew")
        ToolTip(theme_combo, translate("theme_tooltip"))

        ttk.Label(appearance_frame, text=translate("language_label")).grid(row=1, column=0, padx=5, pady=5, sticky=W)
        self.language_combo = ttk.Combobox(appearance_frame, values=list(self.app.LANGUAGES.values()))
        self.language_combo.set(self.app.LANGUAGES.get(self.app.language_var.get(), "English"))
        self.language_combo.grid(row=1, column=1, padx=5, pady=5, sticky="ew")
        self.language_combo.bind("<<ComboboxSelected>>", self._on_language_select)
        ToolTip(self.language_combo, translate("language_tooltip"))

        self._setup_adb_and_dirs_section(parent_frame)

    def _on_language_select(self, event=None):
        """Updates the language_var with the code corresponding to the selected language name."""
        selected_name = self.language_combo.get()
        for code, name in self.app.LANGUAGES.items():
            if name == selected_name:
                self.app.language_var.set(code)
                break

    def _setup_adb_and_dirs_section(self, parent_frame):
        adb_frame = ttk.LabelFrame(parent_frame, text="ADB Server", padding=10)
        adb_frame.grid(row=1, column=0, columnspan=2, sticky="ew", pady=10)
        adb_frame.columnconfigure(0, weight=1)

        self.restart_adb_button = ttk.Button(adb_frame, text=translate("restart_adb_server"), command=self.app._restart_adb_server, bootstyle="warning")
        self.restart_adb_button.pack(fill=X, expand=YES, padx=5, pady=5)
        ToolTip(self.restart_adb_button, translate("restart_adb_server_tooltip"))
    
        # --- Other Dirs ---
        other_dirs_frame = ttk.LabelFrame(parent_frame, text=translate("dir_path_settings"), padding=10)
        other_dirs_frame.grid(row=2, column=0, columnspan=2, sticky="ew", pady=10)
        other_dirs_frame.columnconfigure(1, weight=1)

        ttk.Label(other_dirs_frame, text=translate("screenshots_dir")).grid(row=0, column=0, padx=5, pady=2, sticky=W)
        screenshots_entry = ttk.Entry(other_dirs_frame, textvariable=self.app.screenshots_dir_var)
        screenshots_entry.grid(row=0, column=1, padx=5, pady=2, sticky="ew")
        ToolTip(screenshots_entry, translate("screenshots_dir_tooltip"))

        ttk.Label(other_dirs_frame, text=translate("recordings_dir")).grid(row=1, column=0, padx=5, pady=2, sticky=W)
        recordings_entry = ttk.Entry(other_dirs_frame, textvariable=self.app.recordings_dir_var)
        recordings_entry.grid(row=1, column=1, padx=5, pady=2, sticky="ew")
        ToolTip(recordings_entry, translate("recordings_dir_tooltip"))

    def _setup_appium_tab(self, parent_frame):
        """Populates the 'Appium' settings tab."""
        parent_frame.rowconfigure(2, weight=1)
        parent_frame.columnconfigure(0, weight=1)

        # --- Appium Command ---
        appium_cmd_frame = ttk.LabelFrame(parent_frame, text=translate("app_tool_paths"), padding=10)
        appium_cmd_frame.grid(row=0, column=0, sticky="ew", pady=(0, 10))
        appium_cmd_frame.columnconfigure(1, weight=1)

        ttk.Label(appium_cmd_frame, text=translate("appium_command")).grid(row=0, column=0, padx=5, pady=5, sticky=W)
        appium_cmd_entry = ttk.Entry(appium_cmd_frame, textvariable=self.app.appium_options_var)
        appium_cmd_entry.grid(row=0, column=1, padx=5, pady=5, sticky="ew")
        ToolTip(appium_cmd_entry, translate("appium_command_tooltip"))

        # --- Appium Server Control ---
        server_frame = ttk.LabelFrame(parent_frame, text=translate("appium_server"), padding=10)
        server_frame.grid(row=1, column=0, sticky="ew", pady=(0, 10))
        server_frame.columnconfigure(1, weight=1)

        self.appium_status_label = ttk.Label(server_frame, text=translate("appium_status_stopped"), bootstyle="danger")
        self.appium_status_label.grid(row=0, column=0, padx=5, pady=5, sticky=W)
        ToolTip(self.appium_status_label, translate("appium_status_tooltip"))

        self.toggle_appium_button = ttk.Button(server_frame, text=translate("start_appium"), command=self.app._toggle_appium_server, bootstyle="primary")
        self.toggle_appium_button.grid(row=0, column=1, padx=5, pady=5, sticky="e")
        ToolTip(self.toggle_appium_button, translate("appium_toggle_tooltip"))

        # --- Appium Output ---
        output_frame = ttk.LabelFrame(parent_frame, text=translate("appium_server_output"), padding=5)
        output_frame.grid(row=2, column=0, sticky="nsew")
        output_frame.rowconfigure(0, weight=1)
        output_frame.columnconfigure(0, weight=1)

        self.appium_output_text = ScrolledText(output_frame, wrap=WORD, state=DISABLED, autohide=True)
        self.appium_output_text.pack(fill=BOTH, expand=YES)

    def _setup_mirror_tab(self, parent_frame):
        """Populates the 'Mirror' settings tab."""
        parent_frame.columnconfigure(1, weight=1)

        mirror_paths_frame = ttk.LabelFrame(parent_frame, text=translate("app_tool_paths"), padding=10)
        mirror_paths_frame.grid(row=0, column=0, columnspan=2, sticky="ew", pady=(0, 10))
        mirror_paths_frame.columnconfigure(1, weight=1)

        ttk.Label(mirror_paths_frame, text=translate("scrcpy_path")).grid(row=0, column=0, padx=5, pady=5, sticky=W)
        scrcpy_path_entry = ttk.Entry(mirror_paths_frame, textvariable=self.app.scrcpy_path_var)
        scrcpy_path_entry.grid(row=0, column=1, padx=5, pady=5, sticky="ew")
        ToolTip(scrcpy_path_entry, translate("scrcpy_path_tooltip"))

        # --- Scrcpy Options ---
        scrcpy_options_frame = ttk.LabelFrame(parent_frame, text=translate("scrcpy_command_options"), padding=10)
        scrcpy_options_frame.grid(row=1, column=0, columnspan=2, sticky="ew", pady=10)
        scrcpy_options_frame.columnconfigure(0, weight=1)

        scrcpy_options_entry = ttk.Entry(scrcpy_options_frame, textvariable=self.app.scrcpy_options_var)
        scrcpy_options_entry.pack(fill=X, expand=YES, padx=5, pady=5)
        ToolTip(scrcpy_options_entry, translate("scrcpy_options_tooltip"))



    def _setup_inspector_tab(self, parent_frame):
        """Populates the 'Inspector' settings tab."""
        parent_frame.columnconfigure(1, weight=1)

        perf_monitor_frame = ttk.LabelFrame(parent_frame, text=translate("performance_monitor"), padding=10)
        perf_monitor_frame.grid(row=0, column=0, columnspan=2, sticky="ew", pady=(0, 10))
        perf_monitor_frame.columnconfigure(1, weight=1)

        ttk.Label(perf_monitor_frame, text=translate("app_packages_label")).grid(row=0, column=0, padx=5, pady=5, sticky=W)
        app_packages_entry = ttk.Entry(perf_monitor_frame, textvariable=self.app.app_packages_var)
        app_packages_entry.grid(row=0, column=1, padx=5, pady=5, sticky="ew")
        ToolTip(app_packages_entry, translate("app_packages_tooltip"))

    def _setup_tests_tab(self, parent_frame):
        """Populates the 'Tests' settings tab."""
        parent_frame.columnconfigure(1, weight=1)

        test_dirs_frame = ttk.LabelFrame(parent_frame, text=translate("dir_path_settings"), padding=10)
        test_dirs_frame.grid(row=0, column=0, columnspan=2, sticky="ew", pady=(0, 10))
        test_dirs_frame.columnconfigure(1, weight=1)

        ttk.Label(test_dirs_frame, text=translate("suites_dir")).grid(row=0, column=0, padx=5, pady=2, sticky=W)
        suites_dir_entry = ttk.Entry(test_dirs_frame, textvariable=self.app.suites_dir_var)
        suites_dir_entry.grid(row=0, column=1, padx=5, pady=2, sticky="ew")
        ToolTip(suites_dir_entry, translate("suites_dir_tooltip"))

        ttk.Label(test_dirs_frame, text=translate("tests_dir")).grid(row=1, column=0, padx=5, pady=2, sticky=W)
        tests_dir_entry = ttk.Entry(test_dirs_frame, textvariable=self.app.tests_dir_var)
        tests_dir_entry.grid(row=1, column=1, padx=5, pady=2, sticky="ew")
        ToolTip(tests_dir_entry, translate("tests_dir_tooltip"))

        ttk.Label(test_dirs_frame, text=translate("logs_dir")).grid(row=2, column=0, padx=5, pady=2, sticky=W)
        logs_dir_entry = ttk.Entry(test_dirs_frame, textvariable=self.app.logs_dir_var)
        logs_dir_entry.grid(row=2, column=1, padx=5, pady=2, sticky="ew")
        ToolTip(logs_dir_entry, translate("logs_dir_tooltip"))

        # --- Robot Options ---
        robot_options_frame = ttk.LabelFrame(parent_frame, text=translate("robot_command_options"), padding=10)
        robot_options_frame.grid(row=1, column=0, columnspan=2, sticky="ew", pady=10)
        robot_options_frame.columnconfigure(0, weight=1)

        robot_options_entry = ttk.Entry(robot_options_frame, textvariable=self.app.robot_options_var)
        robot_options_entry.pack(fill=X, expand=YES, padx=5, pady=5)
        ToolTip(robot_options_entry, translate("robot_options_tooltip"))