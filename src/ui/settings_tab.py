import ttkbootstrap as ttk
from ttkbootstrap.constants import *
from ttkbootstrap.scrolled import ScrolledText
from ttkbootstrap.tooltip import ToolTip

from src.locales.i18n import gettext as translate


class SettingsTabPage(ttk.Frame):
    """UI and logic for the 'Settings' tab."""
    def __init__(self, parent, app):
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
        dir_settings_frame.columnconfigure(1, weight=1); dir_settings_frame.columnconfigure(3, weight=1)

        ttk.Label(dir_settings_frame, text=translate("suites_dir")).grid(row=0, column=0, padx=5, pady=2, sticky=W)
        ttk.Entry(dir_settings_frame, textvariable=self.app.suites_dir_var).grid(row=0, column=1, padx=5, pady=2, sticky=EW)
        ttk.Label(dir_settings_frame, text=translate("tests_dir")).grid(row=0, column=2, padx=5, pady=2, sticky=W)
        ttk.Entry(dir_settings_frame, textvariable=self.app.tests_dir_var).grid(row=0, column=3, padx=5, pady=2, sticky=EW)
        ttk.Label(dir_settings_frame, text=translate("logs_dir")).grid(row=2, column=0, padx=5, pady=2, sticky=W)
        ttk.Entry(dir_settings_frame, textvariable=self.app.logs_dir_var).grid(row=2, column=1, padx=5, pady=2, sticky=EW)
        ttk.Label(dir_settings_frame, text=translate("scrcpy_path")).grid(row=2, column=2, padx=5, pady=5, sticky=W)
        ttk.Entry(dir_settings_frame, textvariable=self.app.scrcpy_path_var).grid(row=2, column=3, padx=5, pady=5, sticky=EW)
        
        inspector_settings_frame = ttk.LabelFrame(settings_frame, text=translate("inspector_settings"), padding=10)
        inspector_settings_frame.pack(fill=X, pady=5)
        inspector_settings_frame.columnconfigure(1, weight=1)
        ttk.Label(inspector_settings_frame, text=translate("app_packages_label")).grid(row=0, column=0, padx=5, pady=5, sticky=W)
        ttk.Entry(inspector_settings_frame, textvariable=self.app.app_packages_var).grid(row=0, column=1, padx=5, pady=5, sticky=EW)

        bottom_frame = ttk.Frame(settings_frame); bottom_frame.pack(fill=X, pady=0, padx=0); bottom_frame.columnconfigure(0, weight=1)
        appearance_frame = ttk.LabelFrame(bottom_frame, text=translate("appearance") + " " + translate("theme_restart_required"), padding=10)
        appearance_frame.grid(row=0, column=0, sticky="ew", pady=5, padx=0); appearance_frame.columnconfigure(1, weight=1)
        ttk.Label(appearance_frame, text=translate("theme")).grid(row=0, column=0, padx=5, pady=2, sticky=W)
        ttk.Combobox(appearance_frame, textvariable=self.app.theme_var, values=["darkly", "litera"], state="readonly").grid(row=0, column=1, padx=5, pady=2, sticky=W)
        ttk.Label(appearance_frame, text=translate("language_label")).grid(row=0, column=2, padx=5, pady=2, sticky=W)
        self.language_combo = ttk.Combobox(appearance_frame, state="readonly", values=list(self.app.LANGUAGES.values())); self.language_combo.grid(row=0, column=3, padx=5, pady=2, sticky=W)
        self.language_combo.bind("<<ComboboxSelected>>", self.app._on_language_select)
        self.language_combo.set(self.app.LANGUAGES.get(self.app.language_var.get(), "English"))

        ttk.Button(bottom_frame, text=translate("save_settings"), command=self.app._save_settings, bootstyle="success").grid(row=0, column=1, sticky="e", padx=10)

        output_frame = ttk.LabelFrame(settings_frame, text=translate("appium_server_output"), padding=5)
        output_frame.pack(fill=BOTH, expand=YES, pady=5)
        self.appium_output_text = ScrolledText(output_frame, wrap=WORD, state=DISABLED, autohide=True)
        self.appium_output_text.pack(fill=BOTH, expand=YES)