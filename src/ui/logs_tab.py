import tkinter as tk
import ttkbootstrap as ttk
from ttkbootstrap.constants import *
from ttkbootstrap.tooltip import ToolTip

from src.locales.i18n import gettext as translate


class LogsTabPage(ttk.Frame):
    """UI and logic for the 'Test Logs' tab. Widgets are created lazily."""
    def __init__(self, parent, app):
        super().__init__(parent, padding=10)
        self.app = app

    def setup_widgets(self):
        """Creates and places all the widgets in the tab."""
        logs_controls_frame = ttk.Frame(self)
        logs_controls_frame.pack(fill=X, pady=5)
        # Configure grid columns for the controls frame
        logs_controls_frame.columnconfigure(0, weight=1) # Left controls should expand
        logs_controls_frame.columnconfigure(1, weight=0) # Right controls should not expand

        ttk.Label(logs_controls_frame, text="Logs", font="-weight bold").grid(row=0, column=0, sticky="w", pady=(0, 5))

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
        self.reparse_button.pack(side=LEFT)
        ToolTip(self.reparse_button, translate("reparse_tooltip"))

        self.progress_frame = ttk.Frame(self)
        self.progress_label = ttk.Label(self.progress_frame, text=translate("parsing"))
        self.progress_bar = ttk.Progressbar(self.progress_frame, mode='determinate')
        ToolTip(self.progress_bar, translate("parsing_tooltip"))
        
        self.logs_tree = ttk.Treeview(self, columns=("suite", "status", "time"), show="headings")
        self.logs_tree.pack(fill=BOTH, expand=YES, pady=5)
        self.logs_tree.heading("suite", text=translate("log_tree_suite"))
        self.logs_tree.heading("status", text=translate("log_tree_status"))
        self.logs_tree.heading("time", text=translate("log_tree_time"))
        self.logs_tree.bind("<Double-1>", self.app._on_log_double_click)
        self.logs_tree.tag_configure("no_logs", foreground="gray")