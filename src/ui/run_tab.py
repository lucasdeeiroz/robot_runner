import tkinter as tk
import ttkbootstrap as ttk
from ttkbootstrap.constants import *
from ttkbootstrap.scrolled import ScrolledText
from ttkbootstrap.tooltip import ToolTip

from src.locales.i18n import gettext as translate


class RunTabPage(ttk.Frame):
    """UI and logic for the 'Run Tests' tab."""
    def __init__(self, parent, app):
        super().__init__(parent, padding=10)
        self.app = app

        self._setup_widgets()
        self.on_run_mode_change()

    def _setup_widgets(self):
        device_frame = ttk.LabelFrame(self, text=translate("device_selection"), padding=10)
        device_frame.pack(fill=X, pady=5)
        device_frame.columnconfigure(0, weight=1)
        
        ttk.Label(device_frame, text=translate("select_devices")).grid(row=0, column=0, sticky=W)
        listbox_frame = ttk.Frame(device_frame)
        listbox_frame.grid(row=1, column=0, sticky="nsew")
        listbox_frame.columnconfigure(0, weight=1)
        
        self.device_listbox = tk.Listbox(listbox_frame, selectmode=EXTENDED, exportselection=False, height=4)
        self.device_listbox.pack(side=LEFT, fill=BOTH, expand=YES)
        ToolTip(self.device_listbox, translate("devices_tooltip"))
        self.device_listbox.bind("<<ListboxSelect>>", self.app._on_device_select)
        
        self.refresh_button = ttk.Button(device_frame, text=translate("refresh"), command=self.app._refresh_devices, bootstyle="secondary")
        self.refresh_button.grid(row=1, column=1, sticky="e", padx=5)
        ToolTip(self.refresh_button, translate("refresh_devices_tooltip"))

        sub_notebook = ttk.Notebook(self)
        sub_notebook.pack(fill=BOTH, expand=YES, pady=5)
        tests_tab = ttk.Frame(sub_notebook, padding=10)
        adb_tab = ttk.Frame(sub_notebook, padding=10)
        sub_notebook.add(tests_tab, text=translate("tests_sub_tab"))
        sub_notebook.add(adb_tab, text=translate("adb_sub_tab"))

        self._setup_tests_tab(tests_tab)
        self._setup_adb_tab(adb_tab)

    def _setup_adb_tab(self, parent_frame: ttk.Frame):
        """Sets up the widgets for the ADB sub-tab."""
        parent_frame.rowconfigure(2, weight=1)
        parent_frame.columnconfigure(0, weight=1)

        wireless_frame = ttk.LabelFrame(parent_frame, text=translate("wireless_adb"), padding=10)
        wireless_frame.grid(row=0, column=0, sticky="ew", pady=5)
        wireless_frame.columnconfigure(0, weight=2); wireless_frame.columnconfigure(1, weight=1); wireless_frame.columnconfigure(2, weight=1)

        ttk.Label(wireless_frame, text=translate("ip_address")).grid(row=0, column=0, sticky=W, padx=5)
        ttk.Label(wireless_frame, text=translate("port")).grid(row=0, column=1, sticky=W, padx=5)
        ttk.Label(wireless_frame, text=translate("pairing_code")).grid(row=0, column=2, sticky=W, padx=5)

        self.ip_entry = ttk.Entry(wireless_frame, textvariable=self.app.adb_ip_var)
        self.ip_entry.grid(row=1, column=0, sticky="ew", padx=5, pady=(0, 5))
        self.port_entry = ttk.Entry(wireless_frame, textvariable=self.app.adb_port_var, width=8)
        self.port_entry.grid(row=1, column=1, sticky="ew", padx=5, pady=(0, 5))
        self.code_entry = ttk.Entry(wireless_frame, width=8)
        self.code_entry.grid(row=1, column=2, sticky="ew", padx=5, pady=(0, 5))
        
        button_frame = ttk.Frame(wireless_frame)
        button_frame.grid(row=2, column=0, columnspan=3, sticky="ew", pady=5)
        button_frame.columnconfigure((0, 1, 2), weight=1)
        
        self.disconnect_button = ttk.Button(button_frame, text=translate("disconnect"), command=self.app._disconnect_wireless_device, bootstyle="danger")
        self.disconnect_button.grid(row=0, column=0, sticky="ew", padx=(0, 5))
        self.pair_button = ttk.Button(button_frame, text=translate("pair"), command=self.app._pair_wireless_device, bootstyle="info")
        self.pair_button.grid(row=0, column=1, sticky="ew", padx=5)
        self.connect_button = ttk.Button(button_frame, text=translate("connect"), command=self.app._connect_wireless_device)
        self.connect_button.grid(row=0, column=2, sticky="ew", padx=(5, 0))

        manual_cmd_frame = ttk.LabelFrame(parent_frame, text=translate("manual_adb_command"), padding=10)
        manual_cmd_frame.grid(row=1, column=0, sticky="ew", pady=5)
        manual_cmd_frame.columnconfigure(0, weight=1)
        self.adb_command_entry = ttk.Entry(manual_cmd_frame)
        self.adb_command_entry.grid(row=0, column=0, sticky="ew", padx=5, pady=(0, 5))
        self.run_adb_button = ttk.Button(manual_cmd_frame, text=translate("run_command"), command=self.app._run_manual_adb_command, bootstyle="primary")
        self.run_adb_button.grid(row=1, column=0, sticky="ew", padx=5, pady=5)

        output_frame = ttk.LabelFrame(parent_frame, text=translate("adb_output"), padding=5)
        output_frame.grid(row=2, column=0, sticky="nsew", pady=5)
        output_frame.rowconfigure(0, weight=1); output_frame.columnconfigure(0, weight=1)
        self.adb_output_text = ScrolledText(output_frame, wrap=WORD, state=DISABLED, autohide=True)
        self.adb_output_text.grid(row=0, column=0, sticky="nsew")

    def _setup_tests_tab(self, parent_frame: ttk.Frame):
        """Sets up the widgets for the Tests sub-tab."""
        test_frame = ttk.Frame(parent_frame); test_frame.pack(fill=BOTH, expand=YES, pady=5)
        test_frame.columnconfigure(0, weight=1); test_frame.rowconfigure(1, weight=1)

        top_controls = ttk.Frame(test_frame); top_controls.grid(row=0, column=0, sticky="ew", padx=5, pady=2)
        top_controls.columnconfigure(0, weight=1)
        self.selection_label = ttk.Label(top_controls, text=translate("test_suites_txt")); self.selection_label.grid(row=0, column=0, sticky=W)
        mode_frame = ttk.Frame(top_controls); mode_frame.grid(row=0, column=1, sticky="e")
        ttk.Radiobutton(mode_frame, text=translate("run_by_suite"), variable=self.app.run_mode_var, value="Suite", command=self.on_run_mode_change).pack(side=LEFT, padx=5)
        ttk.Radiobutton(mode_frame, text=translate("run_by_test"), variable=self.app.run_mode_var, value="Test", command=self.on_run_mode_change).pack(side=LEFT, padx=5)

        self.selection_listbox = tk.Listbox(test_frame, exportselection=False); self.selection_listbox.grid(row=1, column=0, padx=5, pady=2, sticky="nsew")
        self.selection_listbox.bind("<Double-1>", self.on_selection_listbox_double_click)

        run_frame = ttk.Frame(parent_frame, padding=(0, 10, 0, 0)); run_frame.pack(fill=X, pady=5)
        run_frame.columnconfigure(1, weight=1)
        self.device_options_button = ttk.Button(run_frame, text=translate("device_toolbox"), command=self.app._mirror_device, bootstyle="info"); self.device_options_button.grid(row=0, column=0, sticky="w", padx=5, pady=5)
        self.timestamp_check = ttk.Checkbutton(run_frame, text=translate("do_not_overwrite_logs"), variable=self.app.timestamp_logs_var); self.timestamp_check.grid(row=0, column=2, sticky="e", padx=(0, 10))
        self.run_button = ttk.Button(run_frame, text=translate("run_test"), command=self.app._run_test, bootstyle="success"); self.run_button.grid(row=0, column=3, sticky="e", padx=5, pady=5)

    def on_run_mode_change(self):
        """Handles the change of run mode."""
        self.app.current_path = self.app.suites_dir if self.app.run_mode_var.get() == "Suite" else self.app.tests_dir
        self.populate_selection_listbox()

    def populate_selection_listbox(self):
        """Populates the listbox based on the current path."""
        self.selection_listbox.delete(0, END)
        mode = self.app.run_mode_var.get()
        base_dir = self.app.suites_dir if mode == "Suite" else self.app.tests_dir
        if self.app.current_path != base_dir: self.selection_listbox.insert(END, translate("back_button"))
        items = sorted(list(self.app.current_path.iterdir()), key=lambda p: (not p.is_dir(), p.name.lower()))
        for item in items:
            if item.is_dir(): self.selection_listbox.insert(END, translate("folder_prefix", name=item.name))
            elif (mode == "Suite" and item.suffix == ".txt") or (mode == "Test" and item.suffix == ".robot"): self.selection_listbox.insert(END, item.name)
        self.selection_label.config(text=translate("current_path_label", path=self.app.current_path))

    def on_selection_listbox_double_click(self, event):
        """Handles navigation in the listbox."""
        if not (selected_indices := self.selection_listbox.curselection()): return
        selected_item = self.selection_listbox.get(selected_indices[0])
        if selected_item == translate("back_button"): self.app.current_path = self.app.current_path.parent
        elif selected_item.startswith(translate("folder_prefix", name="").strip()):
            folder_name = selected_item.replace(translate("folder_prefix", name="").strip(), "").strip()
            self.app.current_path = self.app.current_path / folder_name
        self.populate_selection_listbox()