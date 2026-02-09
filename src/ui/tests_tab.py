import tkinter as tk
from typing import Dict
import ttkbootstrap as ttk
from ttkbootstrap.constants import BOTH, YES, LEFT, X
from ttkbootstrap.constants import BOTH, YES, LEFT, X
from ttkbootstrap.tooltip import ToolTip

from src.locales.i18n import gettext as translate


class TestsTabPage(ttk.Frame):
    """UI and logic for the 'Tests' tab. Widgets are created lazily."""
    def __init__(self, parent, app):
        super().__init__(parent, padding=10)
        self.app = app

    def setup_widgets(self):
        """Creates and places all the widgets in the tab."""
        tests_frame = ttk.Frame(self, padding=10)
        tests_frame.pack(fill=X, pady=5)
        tests_frame.columnconfigure(0, weight=1)

        ttk.Label(tests_frame, text=translate("tests_tab"), font="-weight bold").grid(row=0, column=0, sticky="w", pady=(0, 5))

        self.sub_notebook = ttk.Notebook(self)
        self.sub_notebook.pack(fill=BOTH, expand=YES, pady=5)
        logs_tab = ttk.Frame(self.sub_notebook, padding=10)
        self.sub_notebook.add(logs_tab, text=translate("tests_logs_sub_tab"))
        self.device_tabs: Dict[str, ttk.Frame] = {} # Map UDID to DeviceTab (Frame)

        self.setup_tests_logs_tab(logs_tab)

    def add_device_tab(self, udid: str, tab_widget: ttk.Frame, title: str):
        """Adds a new tab for a device."""
        self.sub_notebook.add(tab_widget, text=title)
        self.device_tabs[udid] = tab_widget
        self.sub_notebook.select(tab_widget)

    def remove_device_tab(self, udid: str):
        """Removes a device tab."""
        if udid in self.device_tabs:
            tab = self.device_tabs[udid]
            try:
                self.sub_notebook.forget(tab)
            except tk.TclError:
                pass # Tab might already be destroyed or not managed
            del self.device_tabs[udid]
            
            # Update busy state in parent app
            if hasattr(self.app, 'local_busy_devices') and udid in self.app.local_busy_devices:
                self.app.local_busy_devices.remove(udid)
                if hasattr(self.app, '_update_device_list'):
                    self.app.root.after(100, self.app._update_device_list)

    def focus_device_tab(self, udid: str):
        """Focuses the tab for the given UDID."""
        if udid in self.device_tabs:
            self.sub_notebook.select(self.device_tabs[udid])

    def setup_tests_logs_tab(self, parent_frame):
        """Creates and places all the widgets in the tab."""
        logs_controls_frame = ttk.Frame(parent_frame)
        logs_controls_frame.pack(fill=X, pady=5)
        # Configure grid columns for the controls frame
        logs_controls_frame.columnconfigure(0, weight=1) # Left controls should expand
        logs_controls_frame.columnconfigure(1, weight=0) # Right controls should not expand

        ttk.Label(logs_controls_frame, text=translate("analyze_logs"), font="-weight bold").grid(row=0, column=0, sticky="w", pady=(0, 5))

        left_controls_frame = ttk.Frame(logs_controls_frame)
        left_controls_frame.grid(row=1, column=0, sticky="ew")

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
        right_controls_frame.grid(row=1, column=1, sticky="e")

        self.log_cache_info_label = ttk.Label(right_controls_frame, text=translate("no_data_loaded"))
        self.log_cache_info_label.pack(side=LEFT, padx=(0, 10))

        self.reparse_button = ttk.Button(right_controls_frame, text=translate("reparse"), command=self.app._start_log_reparse, bootstyle="secondary")
        self.reparse_button.pack(side=LEFT, padx=(0, 5))
        ToolTip(self.reparse_button, translate("reparse_tooltip"))

        self.progress_frame = ttk.Frame(parent_frame)
        self.progress_label = ttk.Label(self.progress_frame, text=translate("parsing"))
        self.progress_bar = ttk.Progressbar(self.progress_frame, mode='determinate')
        ToolTip(self.progress_bar, translate("parsing_tooltip"))
        
        self.logs_tree = ttk.Treeview(parent_frame, columns=("suite", "status", "time"), show="headings")
        self.logs_tree.pack(fill=BOTH, expand=YES, pady=5)
        self.logs_tree.heading("suite", text=translate("log_tree_suite"))
        self.logs_tree.heading("status", text=translate("log_tree_status"))
        self.logs_tree.heading("time", text=translate("log_tree_time"))
        self.logs_tree.bind("<Double-1>", self.app._on_log_double_click)

        self.logs_tree.tag_configure("no_logs", foreground="gray")