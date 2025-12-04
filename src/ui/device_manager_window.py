import tkinter as tk
import ttkbootstrap as ttk
from ttkbootstrap.constants import BOTH, YES
from typing import Dict

from src.locales.i18n import gettext as translate

class DeviceManagerWindow(tk.Toplevel):
    """
    A unified window to manage multiple device tabs.
    """
    def __init__(self, parent_app):
        super().__init__(parent_app.root)
        self.parent_app = parent_app
        self.title(translate("device_manager_title"))
        self.geometry("1200x800")
        
        # Maximize the window on startup
        import sys
        if sys.platform == "win32":
            self.state('zoomed')
        else: # For macOS and Linux
            self.attributes('-zoomed', True)
        
        self.notebook = ttk.Notebook(self)
        self.notebook.pack(fill=BOTH, expand=YES)
        
        self.device_tabs: Dict[str, ttk.Frame] = {} # Map UDID to DeviceTab (Frame)

        self.protocol("WM_DELETE_WINDOW", self._on_close)

    def add_device_tab(self, udid: str, tab_widget: ttk.Frame, title: str):
        """Adds a new tab for a device."""
        self.notebook.add(tab_widget, text=title)
        self.device_tabs[udid] = tab_widget
        self.notebook.select(tab_widget)

    def remove_device_tab(self, udid: str):
        """Removes a device tab."""
        if udid in self.device_tabs:
            tab = self.device_tabs[udid]
            self.notebook.forget(tab)
            del self.device_tabs[udid]
            
            # Update busy state in parent app
            if hasattr(self.parent_app, 'local_busy_devices') and udid in self.parent_app.local_busy_devices:
                self.parent_app.local_busy_devices.remove(udid)
                if hasattr(self.parent_app, '_update_device_list'):
                    self.parent_app.root.after(100, self.parent_app._update_device_list)

            # If no tabs left, close the window
            if not self.device_tabs:
                self.parent_app.device_manager = None
                self.destroy()

    def focus_device_tab(self, udid: str):
        """Focuses the tab for the given UDID."""
        if udid in self.device_tabs:
            self.notebook.select(self.device_tabs[udid])

    def _on_close(self):
        """Handles window closing."""
        # Close all tabs properly
        for udid, tab in list(self.device_tabs.items()):
            if hasattr(tab, '_on_close'):
                tab._on_close()
            
            # Update busy state in parent app
            if hasattr(self.parent_app, 'local_busy_devices') and udid in self.parent_app.local_busy_devices:
                self.parent_app.local_busy_devices.remove(udid)
        
        if hasattr(self.parent_app, '_update_device_list'):
            self.parent_app.root.after(100, self.parent_app._update_device_list)

        self.parent_app.device_manager = None
        self.destroy()
