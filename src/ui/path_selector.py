import tkinter as tk
from tkinter import filedialog
import ttkbootstrap as ttk
from ttkbootstrap.constants import *
from ttkbootstrap.tooltip import ToolTip

from src.locales.i18n import gettext as translate

class PathSelector(ttk.Frame):
    """
    A compound widget for selecting a directory path.
    It consists of a label, an entry field, and a 'Browse' button.
    """
    def __init__(self, parent, label_text: str, textvariable: tk.StringVar, tooltip_text: str):
        super().__init__(parent)
        self.textvariable = textvariable

        self.columnconfigure(1, weight=1)

        label = ttk.Label(self, text=label_text)
        label.grid(row=0, column=0, padx=(0, 10), pady=5, sticky=W)

        entry = ttk.Entry(self, textvariable=self.textvariable)
        entry.grid(row=0, column=1, padx=(0, 5), pady=5, sticky="ew")
        ToolTip(entry, tooltip_text)

        browse_button = ttk.Button(
            self,
            text=translate("browse_button"),
            command=self._browse_directory,
            bootstyle="secondary"
        )
        browse_button.grid(row=0, column=2, pady=5, sticky=E)

    def _browse_directory(self):
        """Opens a dialog to select a directory and updates the entry field."""
        directory = filedialog.askdirectory(initialdir=self.textvariable.get())
        if directory:
            self.textvariable.set(directory)