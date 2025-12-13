import tkinter as tk
import threading
import sys
# from pathlib import Path
import time
from tkinter import messagebox
import datetime
import re
import xml.etree.ElementTree as ET
# from typing import List
import ttkbootstrap as ttk
from ttkbootstrap.constants import BOTH, END, YES, WORD, NORMAL, DISABLED, LEFT, HORIZONTAL, VERTICAL, BOTTOM, TOP, SUNKEN, CENTER, EXTENDED, X, W
from typing import Dict
from ttkbootstrap.scrolled import ScrolledText
from ttkbootstrap.tooltip import ToolTip
from PIL import Image, ImageTk

from src.app_utils import execute_command
from src.locales.i18n import gettext as translate
# from src.ui.toast import Toast
from src.device_utils import get_device_ip, get_device_aspect_ratio

try:
    from pyngrok import ngrok
    from pyngrok.exception import PyngrokError
    PYNGROK_INSTALLED = True
    PYNGROK_ERROR_MESSAGE = ""
except (ImportError, ModuleNotFoundError) as e:
    PYNGROK_INSTALLED = False
    PYNGROK_ERROR_MESSAGE = (
        f"{translate('pyngrok_import_error_message')}\n\n"
        f"Error: {e}\n"
        f"Python: {sys.executable}"
    )


class RunTabPage(ttk.Frame):
    """UI and logic for the 'Run Tests' tab."""
    def __init__(self, parent, app, callbacks: dict = None):
        super().__init__(parent, padding=10)
        self.app = app
        self.callbacks = callbacks if callbacks is not None else {}

        # Ensure the common_adb_commands attribute exists on the app object to prevent AttributeError
        if not hasattr(self.app, 'common_adb_commands'):
            self.app.common_adb_commands = []
            
        self.parent_app = self.app # Alias for compatibility with existing code

        # --- Inspector Attributes ---
        self.udid = None # Current device UDID for inspector
        self.aspect_ratio = None
        self.is_inspecting = False
        self.inspector_is_visible = False
        self.elements_data_map = {}
        self.is_inspection_running = False
        self.current_selected_element_data = None
        self.auto_refresh_thread = None
        self.inspector_auto_refresh_var = ttk.BooleanVar(value=False)
        self.stop_auto_refresh_event = threading.Event()
        self.last_ui_dump_hash = None
        self.all_elements_list: List[Dict] = []
        self.current_dump_path: Optional[Path] = None
        self.xpath_search_var = ttk.StringVar()
        
        self.filter_by_resource_id_var = ttk.BooleanVar(value=True)
        self.filter_by_text_var = ttk.BooleanVar(value=True)
        self.filter_by_content_desc_var = ttk.BooleanVar(value=True)
        self.filter_by_scrollview_var = ttk.BooleanVar(value=True)
        self.filter_by_other_class_var = ttk.BooleanVar(value=False)

        self.remote_conn_mode_var = tk.StringVar(value="host")
        self._setup_widgets()
        self.on_run_mode_change()

    def _setup_widgets(self):
        device_frame = ttk.Frame(self, padding=10)
        device_frame.pack(fill=X, pady=5)
        device_frame.columnconfigure(0, weight=1)
        
        ttk.Label(device_frame, text=translate("select_devices"), font="-weight bold").grid(row=0, column=0, sticky="w", pady=(0, 5))
        listbox_frame = ttk.Frame(device_frame)
        listbox_frame.grid(row=1, column=0, sticky="nsew")
        listbox_frame.columnconfigure(0, weight=1)
        
        self.device_listbox = tk.Listbox(listbox_frame, selectmode=EXTENDED, exportselection=False, height=4)
        self.device_listbox.pack(side=LEFT, fill=BOTH, expand=YES)
        ToolTip(self.device_listbox, translate("devices_tooltip"))
        self.device_listbox.bind("<<ListboxSelect>>", self._on_device_select)
        
        self.refresh_button = ttk.Button(device_frame, text=translate("refresh"), command=self.app._refresh_devices, bootstyle="secondary")
        self.refresh_button.grid(row=1, column=1, sticky="e", padx=5)
        ToolTip(self.refresh_button, translate("refresh_devices_tooltip"))

        self.sub_notebook = ttk.Notebook(self)
        self.sub_notebook.pack(fill=BOTH, expand=YES, pady=5)
        tests_tab = ttk.Frame(self.sub_notebook, padding=10)
        connect_tab = ttk.Frame(self.sub_notebook, padding=10)
        inspector_tab = ttk.Frame(self.sub_notebook, padding=10)
        commands_tab = ttk.Frame(self.sub_notebook, padding=10)
        self.sub_notebook.add(tests_tab, text=translate("tests_sub_tab"))
        self.sub_notebook.add(connect_tab, text=translate("connect_sub_tab"))
        self.device_tabs: Dict[str, ttk.Frame] = {} # Map UDID to DeviceTab (Frame)
        self.sub_notebook.add(inspector_tab, text=translate("inspector_sub_tab"))
        self.sub_notebook.add(commands_tab, text=translate("commands_sub_tab"))

        self._setup_tests_tab(tests_tab)
        self._setup_adb_tab(connect_tab)
        self._setup_inspector_tab(inspector_tab)
        self._setup_commands_tab(commands_tab)
        # self.protocol("WM_DELETE_WINDOW", self._on_close) # Invalid for Frame


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
            if hasattr(self.parent_app, 'local_busy_devices') and udid in self.parent_app.local_busy_devices:
                self.parent_app.local_busy_devices.remove(udid)
                if hasattr(self.parent_app, '_update_device_list'):
                    self.parent_app.root.after(100, self.parent_app._update_device_list)



    def focus_device_tab(self, udid: str):
        """Focuses the tab for the given UDID."""
        if udid in self.device_tabs:
            self.sub_notebook.select(self.device_tabs[udid])

    def _setup_adb_tab(self, parent_frame: ttk.Frame):
        """Sets up the widgets for the ADB sub-tab."""
        # Add a spacer frame that will expand, keeping all other widgets packed at the top.
        spacer = ttk.Frame(parent_frame)
        spacer.grid(row=10, column=0, sticky="nsew") # Place it at a high row index
        parent_frame.rowconfigure(10, weight=1)
        parent_frame.columnconfigure(0, weight=1)

        ttk.Label(parent_frame, text=translate("wireless_adb"), font="-weight bold").grid(row=0, column=0, sticky="w", pady=(0, 5))
        wireless_frame = ttk.Frame(parent_frame, padding=10, borderwidth=0, relief="solid")
        wireless_frame.grid(row=1, column=0, sticky="ew", pady=5)
        wireless_frame.columnconfigure(0, weight=2)
        wireless_frame.columnconfigure(1, weight=1)
        wireless_frame.columnconfigure(2, weight=1)

        ttk.Label(wireless_frame, text=translate("ip_address")).grid(row=1, column=0, sticky="w", padx=5)
        ttk.Label(wireless_frame, text=translate("port")).grid(row=1, column=1, sticky=W, padx=5)
        ttk.Label(wireless_frame, text=translate("pairing_code")).grid(row=1, column=2, sticky=W, padx=5)

        self.ip_entry = ttk.Entry(wireless_frame, textvariable=self.app.adb_ip_var)
        self.ip_entry.grid(row=2, column=0, sticky="ew", padx=5, pady=(0, 5))
        ToolTip(self.ip_entry, text=translate("wireless_ip_tooltip"))
        self.port_entry = ttk.Entry(wireless_frame, textvariable=self.app.adb_port_var, width=8)
        self.port_entry.grid(row=2, column=1, sticky="ew", padx=5, pady=(0, 5))
        ToolTip(self.port_entry, text=translate("wireless_port_tooltip"))
        self.code_entry = ttk.Entry(wireless_frame, width=8)
        self.code_entry.grid(row=2, column=2, sticky="ew", padx=5, pady=(0, 5))
        ToolTip(self.code_entry, text=translate("wireless_code_tooltip"))
        
        
        button_frame = ttk.Frame(wireless_frame)
        button_frame.grid(row=3, column=0, columnspan=3, sticky="ew", pady=5)
        button_frame.columnconfigure((0, 1, 2), weight=1)
        
        self.disconnect_button = ttk.Button(button_frame, text=translate("disconnect"), command=self.app._disconnect_wireless_device, bootstyle="danger")
        self.disconnect_button.grid(row=0, column=0, sticky="ew", padx=(0, 5))
        ToolTip(self.disconnect_button, text=translate("disconnect_tooltip"))
        self.pair_button = ttk.Button(button_frame, text=translate("pair"), command=self.app._pair_wireless_device, bootstyle="info")
        self.pair_button.grid(row=0, column=1, sticky="ew", padx=5)
        ToolTip(self.pair_button, text=translate("pair_tooltip"))
        self.connect_button = ttk.Button(button_frame, text=translate("connect"), command=self.app._connect_wireless_device)
        self.connect_button.grid(row=0, column=2, sticky="ew", padx=(5, 0))
        ToolTip(self.connect_button, text=translate("connect_tooltip"))

        self.mdns_info_label = ttk.Label(wireless_frame, text="", bootstyle="warning", wraplength=400)
        self.mdns_info_label.grid(row=4, column=0, columnspan=3, sticky="ew", padx=5, pady=(5, 0))
        self.mdns_info_label.grid_remove() # Hide it by default

        self._setup_remote_conn_tab(parent_frame)

    def _setup_inspector_tab(self, parent_frame: ttk.Frame):
        """Sets up the widgets for the Inspector sub-tab."""
        # Main container for the 3-pane inspector layout
        self.main_paned_window = ttk.Panedwindow(parent_frame, orient=HORIZONTAL)
        self.main_paned_window.pack(fill=BOTH, expand=YES)

        # 1. Left controls container
        self.output_paned_window = ttk.Frame(self.main_paned_window)
        self.main_paned_window.add(self.output_paned_window, weight=1)

        # 2. Center details container
        self.center_pane_container = ttk.Frame(self.main_paned_window)
        self.main_paned_window.add(self.center_pane_container, weight=2)

        # 3. Right screenshot container (initially created but added/removed dynamically)
        self.right_pane_container = ttk.Frame(self.main_paned_window)
        
        self._setup_inspector_left_pane()
        self._setup_inspector_center_pane()
        self._setup_inspector_right_pane()

    def _toggle_output_visibility(self, mode: str):
        """
        Toggles or sets the visibility of the output/inspector areas.
        Currently a placeholder/helper to satisfy calls in _start/_stop_inspector.
        """
        # Ideally this would manage the 'output' visibility if it was shared.
        # For now we just ensure the layout is refreshed or appropriate panes are shown.
        if mode == 'inspector':
            # Ensure the inspector layout is valid
            pass

    def _setup_inspector_left_pane(self):
        """Sets up inspector-specific controls in the left pane."""
        self.inspector_controls_frame = ttk.Frame(self.output_paned_window)
        self.inspector_controls_frame.pack(fill=BOTH, expand=YES)

        top_controls = ttk.Frame(self.inspector_controls_frame)
        top_controls.pack(side=TOP, fill=X, pady=(0, 5))
        top_controls.columnconfigure(0, weight=1)

        self.refresh_inspector_button = ttk.Button(top_controls, text=translate("refresh"), command=self._start_inspection, state=DISABLED)
        self.refresh_inspector_button.grid(row=0, column=0, sticky="ew", padx=(0, 5))
        ToolTip(self.refresh_inspector_button, translate("refresh_tooltip"))

        self.inspect_button = ttk.Button(top_controls, text=translate("start_inspector"), command=self._toggle_inspector, bootstyle="primary")
        self.inspect_button.grid(row=0, column=1, sticky="ew", padx=5)
        # ToolTip added dynamically based on state


        self.filter_menubutton = ttk.Menubutton(top_controls, text=translate("inspector_filter_attributes"), bootstyle="outline-toolbutton")
        self.filter_menubutton.grid(row=0, column=2, sticky="ew", padx=5)
        filter_menu = ttk.Menu(self.filter_menubutton, tearoff=False)
        ToolTip(self.filter_menubutton, text=translate("filter_elements_by_attributes_tooltip"))
        self.filter_menubutton["menu"] = filter_menu
        filter_menu.add_checkbutton(label=translate("filter_by_resource_id"), variable=self.filter_by_resource_id_var, command=self._update_element_tree_view)
        filter_menu.add_checkbutton(label=translate("filter_by_text"), variable=self.filter_by_text_var, command=self._update_element_tree_view)
        filter_menu.add_checkbutton(label=translate("filter_by_content_desc"), variable=self.filter_by_content_desc_var, command=self._update_element_tree_view)
        filter_menu.add_checkbutton(label=translate("filter_by_scrollview"), variable=self.filter_by_scrollview_var, command=self._update_element_tree_view)
        filter_menu.add_checkbutton(label=translate("filter_by_other_class"), variable=self.filter_by_other_class_var, command=self._update_element_tree_view)

        self.auto_refresh_check = ttk.Checkbutton(top_controls, text=translate("inspector_auto_refresh"), variable=self.inspector_auto_refresh_var, bootstyle="round-toggle")
        self.auto_refresh_check.grid(row=0, column=3, sticky="e")
        ToolTip(self.auto_refresh_check, translate("inspector_auto_refresh_tooltip"))

        search_frame = ttk.Frame(self.inspector_controls_frame, padding=5)
        search_frame.pack(side=TOP, fill=X, pady=5)
        search_frame.columnconfigure(0, weight=1)
        self.xpath_search_entry = ttk.Entry(search_frame, textvariable=self.xpath_search_var)
        self.xpath_search_entry.grid(row=0, column=0, sticky="ew", padx=(0, 5))
        ToolTip(self.xpath_search_entry, translate("search_tooltip"))
        search_button_frame = ttk.Frame(search_frame)
        search_button_frame.grid(row=0, column=1, sticky="e")
        self.search_button = ttk.Button(search_button_frame, text=translate("search_button"), command=self._perform_xpath_search, bootstyle="primary")
        self.search_button.pack(side=LEFT)
        ToolTip(self.search_button, text=translate("search_inspector_element_tooltip"))
        self.clear_search_button = ttk.Button(search_button_frame, text=translate("clear_button"), command=self._clear_xpath_search, bootstyle="secondary")
        self.clear_search_button.pack(side=LEFT, padx=(5, 0))
        ToolTip(self.clear_search_button, text=translate("clear_tooltip"))

        elements_list_frame = ttk.Frame(self.inspector_controls_frame, padding=5)
        elements_list_frame.pack(side=TOP, fill=BOTH, expand=YES)
        self.elements_tree = ttk.Treeview(elements_list_frame, columns=("title",), show="headings")
        self.elements_tree.heading("title", text=translate("element"))
        self.elements_tree.column("title", width=300, anchor=W)
        self.elements_tree.pack(fill=BOTH, expand=YES)
        self.elements_tree.bind("<<TreeviewSelect>>", self._on_element_select)
        self.elements_tree.bind("<Button-1>", self._on_treeview_click)

        ttk.Label(self.inspector_controls_frame, text=translate("inspector_element_actions"), font="-weight bold").pack(side=TOP, fill=X, pady=(10, 2), padx=5)
        actions_frame = ttk.Frame(self.inspector_controls_frame, padding=(5,0,5,5))
        actions_frame.pack(side=TOP, fill=X)
        actions_frame.columnconfigure((0, 1, 2, 3), weight=1) # type: ignore
        self.action_click_button = ttk.Button(actions_frame, text=translate("action_click"), command=lambda: self._perform_element_action("click"), state=DISABLED)
        self.action_click_button.grid(row=0, column=0, columnspan=2, sticky="ew", padx=2, pady=2)
        ToolTip(self.action_click_button, text=translate("action_click_tooltip"))
        self.action_long_click_button = ttk.Button(actions_frame, text=translate("action_long_click"), command=lambda: self._perform_element_action("long_click"), state=DISABLED)
        self.action_long_click_button.grid(row=0, column=2, columnspan=2, sticky="ew", padx=2, pady=2)
        ToolTip(self.action_long_click_button, text=translate("action_long_click_tooltip"))
        self.action_swipe_up_button = ttk.Button(actions_frame, text=translate("action_swipe_up"), command=lambda: self._perform_element_action("swipe_up"), state=DISABLED)
        self.action_swipe_up_button.grid(row=1, column=0, sticky="ew", padx=2, pady=2)
        ToolTip(self.action_swipe_up_button, text=translate("action_swipe_up_tooltip"))
        self.action_swipe_down_button = ttk.Button(actions_frame, text=translate("action_swipe_down"), command=lambda: self._perform_element_action("swipe_down"), state=DISABLED)
        self.action_swipe_down_button.grid(row=1, column=1, sticky="ew", padx=2, pady=2)
        ToolTip(self.action_swipe_down_button, text=translate("action_swipe_down_tooltip"))
        self.action_swipe_left_button = ttk.Button(actions_frame, text=translate("action_swipe_left"), command=lambda: self._perform_element_action("swipe_left"), state=DISABLED)
        self.action_swipe_left_button.grid(row=1, column=2, sticky="ew", padx=2, pady=2)
        ToolTip(self.action_swipe_left_button, text=translate("action_swipe_left_tooltip"))
        self.action_swipe_right_button = ttk.Button(actions_frame, text=translate("action_swipe_right"), command=lambda: self._perform_element_action("swipe_right"), state=DISABLED)
        self.action_swipe_right_button.grid(row=1, column=3, sticky="ew", padx=2, pady=2)
        ToolTip(self.action_swipe_right_button, text=translate("action_swipe_right_tooltip"))

    def _setup_inspector_center_pane(self):
        """Sets up inspector-specific controls in the center pane."""
        self.element_details_frame = ttk.Frame(self.center_pane_container, padding=5)
        self.element_details_text = ScrolledText(self.element_details_frame, wrap=WORD, state=DISABLED, autohide=False)
        self.element_details_text.pack(fill=BOTH, expand=YES)
        self.element_details_text.text.tag_configure("bold", font="-weight bold")
        
        self.xpath_buttons_container = ttk.Frame(self.center_pane_container)
        self.xpath_buttons = {}
        self.xpath_buttons_container.pack(side=BOTTOM, fill=X, pady=5, padx=5)

    def _setup_inspector_right_pane(self):
        """Sets up the inspector's screenshot canvas in the right pane."""
        self.inspector_paned_window = ttk.Panedwindow(self.right_pane_container, orient=VERTICAL)
        self.screenshot_canvas_frame = ttk.Frame(self.inspector_paned_window)
        self.screenshot_canvas = ttk.Canvas(self.screenshot_canvas_frame, bg="black")
        self.screenshot_canvas.pack(fill=BOTH, expand=YES)
        self.screenshot_image_tk = None
        self.screenshot_canvas.bind("<Button-1>", self._on_canvas_click)
        self.screenshot_canvas.bind("<Configure>", self._on_inspector_canvas_resize)

    def _toggle_inspector(self):
        """Toggles the inspector on/off."""
        if not self.udid:
           self.app.show_toast(translate("error"), translate("no_device_selected_inspector"), bootstyle="danger")
           return

        if self.is_inspecting:
            self._stop_inspector()
        else:
            self._start_inspector()



    def _start_inspector(self):
        """Configures the UI for inspector mode."""
        if self.is_inspecting: 
            return
        self.is_inspecting = True
        if self.aspect_ratio is None:
            self.aspect_ratio = get_device_aspect_ratio(self.udid) or (9/16)
        self.element_details_frame.pack(fill=BOTH, expand=YES, pady=5, padx=5)
        
        self.inspect_button.config(text=translate("stop_inspector"), bootstyle="danger")
        self.refresh_inspector_button.config(state=NORMAL)

        self.main_paned_window.add(self.right_pane_container, weight=3)
        self.update_idletasks()
        
        self.inspector_paned_window.pack(fill=BOTH, expand=YES)
        try: self.inspector_paned_window.add(self.screenshot_canvas_frame, weight=3) # type: ignore
        except tk.TclError: pass

        self.stop_auto_refresh_event.clear()
        self.auto_refresh_thread = threading.Thread(target=self._auto_refresh_inspector_thread, daemon=True)
        self.auto_refresh_thread.start()

        self._toggle_output_visibility('inspector')
        self._toggle_output_visibility('inspector')
        self.after(50, self._wait_for_canvas_and_inspect)
        self.after(100, self._adjust_inspector_sash) # Force initial resize

    def _adjust_inspector_sash(self):
        """Manually adjusts the sash position to enforce the aspect ratio for the right pane."""
        if not self.is_inspecting: return
        
        self.update_idletasks()
        total_width = self.main_paned_window.winfo_width()
        total_height = self.main_paned_window.winfo_height()
        
        if total_width <= 1 or total_height <= 1:
            self.after(100, self._adjust_inspector_sash)
            return

        # Target ratio is 9:16 (0.5625) or whatever the screenshot is
        aspect = getattr(self, 'aspect_ratio', 9/16)
        
        # Calculate target width for the right pane based on available height
        # Right pane (pane 2) should be approximately height * aspect
        target_right_pane_width = int(total_height * aspect)
        
        # Limit max width to 50% of screen to avoid hiding other panels completely
        target_right_pane_width = min(target_right_pane_width, int(total_width * 0.5))
        
        # Calculate sash position (total - right_pane)
        # We need to set the sash between pane 1 (center) and pane 2 (right)
        # Since we have 3 panes (0, 1, 2), we adjust sash at index 1.
        target_sash_pos = total_width - target_right_pane_width
        
        try:
            self.main_paned_window.sashpos(1, target_sash_pos)
        except tk.TclError:
            pass # Pane might not be ready yet

    def _wait_for_canvas_and_inspect(self):
        """Waits until the inspector canvas has a valid size before inspecting."""
        if not self.is_inspecting: return
        if self.screenshot_canvas.winfo_width() > 1: self._start_inspection()
        else: self.after(50, self._wait_for_canvas_and_inspect)

    def _stop_inspector(self):
        if not self.is_inspecting: return
        self.is_inspecting = False
        self.element_details_frame.pack_forget()

        self.main_paned_window.forget(self.right_pane_container)
        
        try: self.inspector_paned_window.remove(self.screenshot_canvas_frame) # type: ignore
        except tk.TclError: pass

        self.stop_auto_refresh_event.set()
        self.last_ui_dump_hash = None
        self._toggle_output_visibility('inspector')

        self.screenshot_canvas.delete("all")
        for item in self.elements_tree.get_children(): self.elements_tree.delete(item)
        
        self._update_locator_buttons(None)
        self._populate_element_details(None)

        self.inspect_button.config(text=translate("start_inspector"), bootstyle="primary")
        self.refresh_inspector_button.config(state=DISABLED)

    def _auto_refresh_inspector_thread(self):
        """Checks for UI changes in the background and triggers a refresh."""
        while not self.stop_auto_refresh_event.wait(5.0):
            if not self.is_inspecting or not self.inspector_auto_refresh_var.get() or self.refresh_inspector_button['state'] == DISABLED:
                continue
            try:
                device_dump_path = "/sdcard/window_dump_autorefresh.xml"
                local_dump_path = self.parent_app.logs_dir / f"window_dump_autorefresh_{self.udid.replace(':', '-')}.xml"
                if execute_command(f"adb -s {self.udid} shell uiautomator dump {device_dump_path}")[0] and \
                   execute_command(f"adb -s {self.udid} pull {device_dump_path} \"{local_dump_path}\"")[0]:
                    execute_command(f"adb -s {self.udid} shell rm {device_dump_path}")
                    with open(local_dump_path, 'r', encoding='utf-8') as f: current_hash = hash(f.read())
                    local_dump_path.unlink(missing_ok=True)
                    if self.last_ui_dump_hash is not None and current_hash != self.last_ui_dump_hash:
                        self.after(0, self._start_inspection)
            except Exception as e: print(f"Error in inspector auto-refresh thread: {e}")

    def _start_inspection(self):
        if getattr(self, 'is_inspection_running', False): return
        self.is_inspection_running = True

        self.refresh_inspector_button.config(state=DISABLED, text=translate("refreshing"))
        self.inspect_button.config(state=DISABLED, text=translate("refreshing"))
        self.screenshot_canvas.delete("all")
        self.xpath_search_var.set("")

        self.screenshot_canvas.update_idletasks()
        w, h = self.screenshot_canvas.winfo_width(), self.screenshot_canvas.winfo_height()
        if w <= 1:
            self.after(50, self._start_inspection)
            return
        self.screenshot_canvas.create_text(w / 2, h / 2, text=translate("inspector_updating_screen"), font=("Helvetica", 16), fill=self.parent_app.style.colors.fg, tags="loading_text")

        for item in self.elements_tree.get_children(): self.elements_tree.delete(item)
        self.elements_data_map = {}
        
        threading.Thread(target=self._perform_inspection_thread, daemon=True).start()

    def _perform_inspection_thread(self):
        try:
            shell_manager = self.parent_app.shell_manager
            timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
            
            # 1. Screenshot
            dev_sc_path = "/sdcard/inspector_screenshot.png"
            local_sc_path = self.parent_app.screenshots_dir / f"inspector_screenshot_{self.udid.replace(':', '-')}_{timestamp}.png"
            shell_manager.execute(self.udid, f"screencap -p {dev_sc_path}")
            if not execute_command(f"adb -s {self.udid} pull {dev_sc_path} \"{local_sc_path}\"")[0]:
                print(f"{translate('pull_screenshot_error')}\n")
                return
            shell_manager.execute(self.udid, f"rm {dev_sc_path}")

            # 2. UI Dump
            dev_dump_path = "/sdcard/window_dump.xml"
            local_dump_path = self.parent_app.logs_dir / f"window_dump_{self.udid.replace(':', '-')}.xml"
            if not shell_manager.execute(self.udid, f"uiautomator dump {dev_dump_path}"):
                return
            if execute_command(f"adb -s {self.udid} pull {dev_dump_path} \"{local_dump_path}\"")[0]:
                pass
            else:
                print(f"{translate('pull_ui_dump_error')}\n")
                return
            shell_manager.execute(self.udid, f"rm {dev_dump_path}")

            with open(local_dump_path, 'r', encoding='utf-8') as f: self.last_ui_dump_hash = hash(f.read())

            # 3. Process and display
            self.after(0, self._display_inspection_results, local_sc_path, local_dump_path)
        except Exception as e:
            print(translate("fatal_inspection_error", error=e) + "\n")
            self.after(0, self._on_inspection_finished)

    def _on_inspection_finished(self):
        """Resets the state after an inspection attempt."""
        self.is_inspection_running = False
        if self.is_inspecting:
            self.refresh_inspector_button.config(state=NORMAL, text=translate("refresh"))
            self.inspect_button.config(state=NORMAL, text=translate("stop_inspector"))
            
    def _display_inspection_results(self, screenshot_path: Path, dump_path: Path):
        try:
            self.current_screenshot_path = screenshot_path
            self.current_dump_path = dump_path

            self.current_image_object = Image.open(screenshot_path)
            self.screenshot_original_size = self.current_image_object.size
            img_w, img_h = self.current_image_object.size
            self.aspect_ratio = img_w / img_h if img_h > 0 else 1
            
            self._refresh_canvas_image()

            try:
                parser = ET.XMLParser()
            except AttributeError:
                parser = None # Fallback for some python versions if needed, or just use default
            
            if parser:
                 root = ET.parse(dump_path, parser).getroot()
            else:
                 root = ET.parse(dump_path).getroot()
                 
            self.all_elements_list = [self._parse_and_store_node(node) for node in root.iter() if self._parse_and_store_node(node)]
            self._update_element_tree_view()
        except Exception as e:
            print(translate("display_screenshot_error", error=e) + "\n")
        finally:
            self._on_inspection_finished()

    def _refresh_canvas_image(self):
        """Refreshes the screenshot on the canvas using the cached image object."""
        if not hasattr(self, 'current_image_object') or not self.current_image_object: 
            return
        
        self.screenshot_canvas.update_idletasks()
        canvas_w, canvas_h = self.screenshot_canvas.winfo_width(), self.screenshot_canvas.winfo_height()
        if canvas_w <= 1: 
            self.after(100, self._refresh_canvas_image)
            return

        aspect = self.aspect_ratio
        new_w, new_h = (canvas_w, int(canvas_w / aspect)) if (canvas_w / aspect) <= canvas_h else (int(canvas_h * aspect), canvas_h)
        
        img = self.current_image_object.resize((new_w, new_h), Image.Resampling.LANCZOS)
        
        self.screenshot_current_size = img.size
        self.screenshot_image_tk = ImageTk.PhotoImage(img)
        self.screenshot_canvas.delete("screenshot") # Clear previous screenshot
        self.screenshot_canvas.config(width=new_w, height=new_h)
        self.screenshot_canvas.create_image(new_w / 2, new_h / 2, image=self.screenshot_image_tk, anchor=CENTER, tags="screenshot")
        
        # Adjust sash again if image dimensions changed significantly
        self.after(10, self._adjust_inspector_sash)


    def _parse_and_store_node(self, node: ET.Element) -> Optional[Dict]:
        """Parses an XML node and returns its data dictionary if valid."""
        data = dict(node.attrib)
        res_id, c_desc, text, n_class = data.get("resource-id"), data.get("content-desc"), data.get("text"), data.get("class")
        
        title = ""
        if res_id: title = f"id={res_id.split('/')[-1]}"
        elif c_desc: title = f"desc={c_desc}"
        elif text: title = f"text={(text[:40] + '...') if len(text) > 43 else text}"
        elif n_class: title = f"class={n_class.split('.')[-1]}"

        if title:
            data["display_title"] = title
            data["bounds_coords"] = self._parse_bounds(data.get("bounds"))
            data["accessibility_id"] = c_desc
            
            # Calculate Full XPath
            try:
                data["xpath"] = self._get_appium_xpath(node)
            except Exception:
                data["xpath"] = ""
                
            return data
        return None

    def _get_appium_xpath(self, node) -> str:
        """Generates an Appium-friendly XPath using class names and resource-ids."""
        path_segments = []
        current = node
        
        while current is not None:
            res_id = current.get("resource-id")
            class_name = current.get("class")
            
            # If we reached the hierarchy root, stop and return absolute path
            if not class_name and current.tag == "hierarchy":
                 return "/hierarchy" + "".join(path_segments)

            if not class_name:
                class_name = current.tag # Fallback

            # Use resource-id as anchor if available
            if res_id:
                anchor = f'//{class_name}[@resource-id="{res_id}"]'
                return anchor + "".join(path_segments)
            
            # Calculate index among preceding siblings with SAME class
            # Note: Appium indices are 1-based
            index = 1
            for sib in current.itersiblings(preceding=True):
                if sib.get("class") == class_name:
                    index += 1
            
            segment = f"/{class_name}"
            if index > 1:
                segment += f"[{index}]"
            
            path_segments.insert(0, segment)
            current = current.getparent()
            
        return "".join(path_segments)

    def _populate_elements_tree(self, elements_to_display: List[Dict]):
        """Populates the elements treeview."""
        for item in self.elements_tree.get_children(): self.elements_tree.delete(item)
        self.elements_data_map.clear()

        if not elements_to_display:
            self.elements_tree.insert("", END, values=(translate("no_elements_found"),), tags=("no_elements",))
            return

        for el_data in elements_to_display:
            item_id = self.elements_tree.insert("", END, values=(el_data.get("display_title", "Unknown"),), tags=("element",))
            self.elements_data_map[item_id] = el_data

    def _parse_bounds(self, bounds_str: str) -> Optional[Tuple[int, int, int, int]]:
        if not bounds_str: return None
        parts = re.findall(r'\d+', bounds_str)
        if len(parts) == 4:
            x1, y1, x2, y2 = map(int, parts)
            return x1, y1, x2 - x1, y2 - y1
        return None

    def _on_element_select(self, event):
        self.screenshot_canvas.delete("highlight")
        selected = self.elements_tree.selection()
        if not selected:
            self._update_locator_buttons(None)
            self._populate_element_details(None)
            return

        el_data = self.elements_data_map.get(selected[0])
        if el_data and (bounds := el_data.get("bounds_coords")):
            x, y, w, h = bounds
            orig_w, orig_h = self.screenshot_original_size
            curr_w, curr_h = self.screenshot_current_size
            scale_x, scale_y = curr_w / orig_w, curr_h / orig_h
            scaled_x, scaled_y, scaled_w, scaled_h = x * scale_x, y * scale_y, w * scale_x, h * scale_y
            offset_x, offset_y = (self.screenshot_canvas.winfo_width() - curr_w) / 2, (self.screenshot_canvas.winfo_height() - curr_h) / 2
            self.screenshot_canvas.create_rectangle(scaled_x + offset_x, scaled_y + offset_y, scaled_x + scaled_w + offset_x, scaled_y + scaled_h + offset_y, outline="red", width=2, tags="highlight")
        
        self._update_locator_buttons(el_data)
        self._update_element_actions_state(bool(el_data))
        self._populate_element_details(el_data)

    def _update_element_actions_state(self, enabled: bool):
        """Enables or disables all element action buttons."""
        state = NORMAL if enabled else DISABLED
        for button in [self.action_click_button, self.action_long_click_button, self.action_swipe_up_button, self.action_swipe_down_button, self.action_swipe_left_button, self.action_swipe_right_button]:
            button.config(state=state)

    def _on_treeview_click(self, event):
        """Deselects item if user clicks on an empty area."""
        if not self.elements_tree.identify_row(event.y): self.elements_tree.selection_set("")

    def _on_inspector_canvas_resize(self, event=None):
        """Redraws screenshot and highlight on canvas resize."""
        self.screenshot_canvas.delete("highlight")
        if self.is_inspecting and hasattr(self, 'current_screenshot_path') and self.current_screenshot_path:
            self._refresh_canvas_image()
            if self.elements_tree.selection(): self._on_element_select(None)

    def _update_locator_buttons(self, element_data: Optional[Dict]):
        """Creates/updates locator copy buttons (Accessibility ID, UiSelector, XPath)."""
        self.current_selected_element_data = element_data
        for button in self.xpath_buttons.values(): button.destroy()
        self.xpath_buttons.clear()

        if not element_data: return

        locators = self._generate_locators(element_data)

        for label, value, tooltip in locators:
            btn = ttk.Button(self.xpath_buttons_container, text=label, command=lambda v=value: self._copy_locator(v))
            ToolTip(btn, tooltip)
            btn.pack(side=TOP, fill=X, padx=2, pady=1)
            self.xpath_buttons[label] = btn

    def _generate_locators(self, data: Dict) -> List[Tuple[str, str, str]]:
        """Generates a list of (Label, Value, Tooltip) tuples for locators."""
        locators = []
        
        # 1. Appium Accessibility ID
        if content_desc := data.get("content-desc"):
            locators.append(("Appium: Accessibility ID", content_desc, f"Copy content-desc: '{content_desc}'"))

        # 2. UiAutomator2 UiSelectors
        if res_id := data.get("resource-id"):
            val = f'new UiSelector().resourceId("{res_id}")'
            locators.append(("UiAutomator2: Resource ID", val, f"Copy UiSelector: {val}"))
        
        if text := data.get("text"):
            val = f'new UiSelector().text("{text}")'
            locators.append(("UiAutomator2: Text", val, f"Copy UiSelector: {val}"))
            
        if content_desc:
            val = f'new UiSelector().description("{content_desc}")'
            locators.append(("UiAutomator2: Description", val, f"Copy UiSelector: {val}"))
            
        if class_name := data.get("class"):
            val = f'new UiSelector().className("{class_name}")'
            locators.append(("UiAutomator2: Class Name", val, f"Copy UiSelector: {val}"))

        # 3. XPath (Fallback/Specific)
        for attr in ["resource-id", "text", "content-desc", "class"]:
            if attr_value := data.get(attr):
                xpath = f"//{attr_value}" if attr == "class" else f"//*[@{attr}='{attr_value}']"
                display_val = (attr_value[:20] + '...') if len(attr_value) > 23 else attr_value
                locators.append((f"XPath: {attr.replace('_', ' ').title()}", xpath, f"Copy XPath: {xpath}"))

        # 4. Full XPath
        if full_xpath := data.get("xpath"):
             locators.append(("Full XPath", full_xpath, f"Copy Full XPath: {full_xpath}"))

        return locators

    def _copy_locator(self, value: str):
        """Copies the locator value to clipboard."""
        if value:
            self.clipboard_clear()
            self.clipboard_append(value)
            self.parent_app.show_toast(translate("xpath_copied_title"), translate("xpath_copied_message", xpath=value), bootstyle="success")

    def _populate_element_details(self, element_data: Optional[Dict]):
        """Populates the element details text view."""
        self.element_details_text.text.config(state=NORMAL)
        self.element_details_text.text.delete("1.0", END)
        if element_data:
            attrs_to_show = {k: v for k, v in element_data.items() if k not in ["bounds_coords", "display_title"] and v}
            for key, value in sorted(attrs_to_show.items()):
                self.element_details_text.text.insert(END, f"{key.replace('_', ' ').title()}: ", "bold")
                self.element_details_text.text.insert(END, f"{value}\n")
        self.element_details_text.text.config(state=DISABLED)



    def _perform_xpath_search(self):
        """Filters the element list based on an XPath query."""
        if not (xpath_query := self.xpath_search_var.get()) or not self.current_dump_path: return
        try:
            root = ET.parse(self.current_dump_path).getroot()
            found_bounds = {node.get("bounds") for node in root.xpath(xpath_query)}
            search_results = [el for el in self.all_elements_list if el.get("bounds") in found_bounds]
            self._populate_elements_tree(self._apply_inspector_filter(source_list=search_results))
        except ET.XPathSyntaxError as e:
            self.parent_app.show_toast(translate("invalid_xpath_title"), translate("invalid_xpath_message", error=e), bootstyle="danger")

    def _clear_xpath_search(self):
        """Clears the XPath search."""
        self.xpath_search_var.set("")
        self._update_element_tree_view()

    def _on_canvas_click(self, event):
        """Handles clicks on the inspector screenshot canvas."""
        if not self.is_inspecting or not hasattr(self, 'screenshot_original_size'): return

        canvas_w, canvas_h = self.screenshot_canvas.winfo_width(), self.screenshot_canvas.winfo_height()
        curr_w, curr_h = self.screenshot_current_size
        orig_w, orig_h = self.screenshot_original_size
        offset_x, offset_y = (canvas_w - curr_w) / 2, (canvas_h - curr_h) / 2
        click_x, click_y = event.x - offset_x, event.y - offset_y

        best_match = None
        if 0 <= click_x < curr_w and 0 <= click_y < curr_h:
            orig_click_x, orig_click_y = click_x * (orig_w / curr_w), click_y * (orig_h / curr_h)
            smallest_area = float('inf')
            for item_id, el_data in self.elements_data_map.items():
                if (bounds := el_data.get("bounds_coords")):
                    x, y, w, h = bounds
                    if x <= orig_click_x < x + w and y <= orig_click_y < y + h and (area := w * h) < smallest_area:
                        smallest_area, best_match = area, {"item_id": item_id, "element_data": el_data}

        if best_match:
            if self.elements_tree.selection() and self.elements_tree.selection()[0] == best_match["item_id"]:
                x, y, w, h = best_match["element_data"]["bounds_coords"]
                threading.Thread(target=self._send_tap_to_device_and_refresh, args=(x + w / 2, y + h / 2), daemon=True).start()
            else:
                self.elements_tree.selection_set(best_match["item_id"])
                self.elements_tree.see(best_match["item_id"])
        else:
            self.elements_tree.selection_set("")
            self.screenshot_canvas.delete("highlight")
            self._update_locator_buttons(None)

    def _send_tap_to_device_and_refresh(self, x, y):
        """Sends a tap command and triggers an inspector refresh."""
        self.scrcpy_output_queue.put(f"{translate('tap_info', x=int(x), y=int(y))}\n")
        if execute_command(f"adb -s {self.udid} shell input tap {int(x)} {int(y)}")[0]:
            self.parent_app.show_toast(translate("inspector"), translate("tap_success_refreshing"), bootstyle="info")
            self.scrcpy_output_queue.put(f"{translate('tap_success_refreshing')}\n")
            self.after(500, self._start_inspection)

    def _perform_element_action(self, action_type: str):
        """Performs an action on the selected element."""
        if not self.current_selected_element_data or not (bounds := self.current_selected_element_data.get("bounds_coords")): return
        self._update_element_actions_state(False)
        self.scrcpy_output_queue.put(translate("performing_action", action=action_type) + "\n")
        threading.Thread(target=self._execute_action_and_refresh, args=(action_type, *bounds), daemon=True).start()

    def _execute_action_and_refresh(self, action_type: str, x, y, width, height):
        """Helper method to execute an ADB command in a thread."""
        cx, cy = x + width / 2, y + height / 2
        cmd = ""
        if action_type == "click": cmd = f"input tap {int(cx)} {int(cy)}"
        elif action_type == "long_click": cmd = f"input swipe {int(cx)} {int(cy)} {int(cx)} {int(cy)} 500"
        elif action_type == "swipe_up": cmd = f"input swipe {int(cx)} {int(y + height * 0.8)} {int(cx)} {int(y + height * 0.2)} 400"
        elif action_type == "swipe_down": cmd = f"input swipe {int(cx)} {int(y + height * 0.2)} {int(cx)} {int(y + height * 0.8)} 400"
        elif action_type == "swipe_left": cmd = f"input swipe {int(x + width * 0.8)} {int(cy)} {int(x + width * 0.2)} {int(cy)} 400"
        elif action_type == "swipe_right": cmd = f"input swipe {int(x + width * 0.2)} {int(cy)} {int(x + width * 0.8)} {int(cy)} 400"

        if cmd:
            # Use persistent shell for lower latency
            self.parent_app.shell_manager.execute(self.udid, cmd)
            self.parent_app.show_toast(translate("inspector"), translate("action_success_refreshing", action=action_type), bootstyle="info")
            self.scrcpy_output_queue.put(f"{translate('action_success_refreshing', action=action_type)}\n")
            self.after(500, self._start_inspection)
        self.after(0, self._update_element_actions_state, True)

    def _apply_inspector_filter(self, source_list: Optional[List[Dict]] = None) -> List[Dict]:
        """Filters a list of UI elements based on attribute filters."""
        use_list = source_list if source_list is not None else self.all_elements_list
        if not use_list: return []
        filters = {"resource-id": self.filter_by_resource_id_var.get(), "accessibility_id": self.filter_by_content_desc_var.get(), "text": self.filter_by_text_var.get(), "scrollview": self.filter_by_scrollview_var.get(), "other_class": self.filter_by_other_class_var.get()}
        if not any(filters.values()): return use_list
        
        filtered = []
        for el in use_list:
            if (filters["resource-id"] and el.get("resource-id")) or \
               (filters["accessibility_id"] and el.get("accessibility_id")) or \
               (filters["text"] and el.get("text")) or \
               (filters["scrollview"] and "ScrollView" in el.get("class", "")) or \
               (filters["other_class"] and el.get("class") and "ScrollView" not in el.get("class", "") and not (el.get("resource-id") or el.get("accessibility_id") or el.get("text"))):
                filtered.append(el)
        return filtered

    def _update_element_tree_view(self):
        """Applies filters and updates the treeview."""
        if self.is_inspecting: self._populate_elements_tree(self._apply_inspector_filter())

    def _setup_commands_tab(self, parent_frame: ttk.Frame):
        """Sets up the widgets for the Commands sub-tab."""
        # Configure rows to ensure only the output area expands
        parent_frame.rowconfigure(0, weight=0) # Label
        parent_frame.rowconfigure(1, weight=0) # Entry
        parent_frame.rowconfigure(2, weight=0) # Buttons frame
        parent_frame.rowconfigure(3, weight=0) # Label
        parent_frame.rowconfigure(4, weight=1) # Output area
        parent_frame.columnconfigure(1, weight=1) # Allow right column to expand

        # Manual Command Entry
        ttk.Label(parent_frame, text=translate("manual_adb_command"), font="-weight bold").grid(row=0, column=0, columnspan=2, sticky="w", pady=(0, 5))
        self.adb_command_entry = ttk.Entry(parent_frame)
        self.adb_command_entry.grid(row=1, column=0, columnspan=2, sticky="ew", padx=5, pady=(0,5))
        ToolTip(self.adb_command_entry, text=translate("adb_command_tooltip"))

        # Common Commands and Buttons Frame
        cmd_actions_frame = ttk.Frame(parent_frame)
        cmd_actions_frame.grid(row=2, column=0, columnspan=2, sticky="ew", pady=5)
        cmd_actions_frame.columnconfigure(0, weight=1) # Let combobox expand

        # Common Commands Combobox
        self.common_adb_commands_combo = ttk.Combobox(cmd_actions_frame, values=self.app.common_adb_commands, state="readonly")
        self.common_adb_commands_combo.grid(row=0, column=0, sticky="ew", padx=(5, 10))
        self.common_adb_commands_combo.set(translate("common_adb_commands_placeholder"))
        self.common_adb_commands_combo.bind("<<ComboboxSelected>>", self._on_common_command_select)
        ToolTip(self.common_adb_commands_combo, text=translate("common_adb_commands_label"))

        # Action Buttons
        self.add_common_cmd_button = ttk.Button(cmd_actions_frame, text=translate("add_to_common_commands_button"), command=self._add_to_common_commands, bootstyle="info-outline")
        self.add_common_cmd_button.grid(row=0, column=1, sticky="e", padx=5)
        ToolTip(self.add_common_cmd_button, text=translate("add_to_common_commands_tooltip"))

        self.run_adb_button = ttk.Button(cmd_actions_frame, text=translate("run_command"), command=self.app._run_manual_adb_command, bootstyle="primary")
        self.run_adb_button.grid(row=0, column=2, sticky="e", padx=5)
        ToolTip(self.run_adb_button, text=translate("run_command_tooltip"))
        
        # ADB Output
        ttk.Label(parent_frame, text=translate("adb_output"), font="-weight bold").grid(row=3, column=0, columnspan=2, sticky="w", pady=(10, 5))
        output_frame = ttk.Frame(parent_frame, padding=5, borderwidth=0, relief="solid")
        output_frame.grid(row=4, column=0, columnspan=2, sticky="nsew", pady=5)
        output_frame.rowconfigure(0, weight=1)
        output_frame.columnconfigure(0, weight=1)
        self.adb_output_text = ScrolledText(output_frame, wrap=WORD, state=DISABLED, autohide=False)
        self.adb_output_text.grid(row=0, column=0, sticky="nsew")
        
        # Add a placeholder text
        self.adb_output_text.text.config(state=NORMAL)
        self.adb_output_text.text.insert("1.0", translate("select_output_placeholder"))
        self.adb_output_text.text.config(state=DISABLED)
        self.adb_output_text.text.tag_configure("placeholder", foreground="gray")
        self.adb_output_text.text.tag_add("placeholder", "1.0", "end")

    def _on_common_command_select(self, event=None):
        """Fills the manual command entry with the selected common command."""
        selected_command = self.common_adb_commands_combo.get()
        self.adb_command_entry.delete(0, END)
        self.adb_command_entry.insert(0, selected_command)

    def _add_to_common_commands(self):
        """Adds the command from the entry to the common commands list and saves it."""
        command_to_add = self.adb_command_entry.get().strip()
        if not command_to_add: # Using Toast instead of messagebox
            self.app.show_toast(translate("no_command_to_add_title"), translate("no_command_to_add_message"), "warning")
            return
        if command_to_add in self.app.common_adb_commands: # Using Toast instead of messagebox
            self.app.show_toast(translate("command_already_exists_title"), translate("command_already_exists_message", command=command_to_add), "info")
            return
        
        self.app.common_adb_commands.append(command_to_add)
        self.common_adb_commands_combo['values'] = self.app.common_adb_commands
        # Use a callback to break the circular dependency with settings_tab.
        self.callbacks.get('save_settings', lambda: self.app.show_toast("Error", "Save callback not configured.", "danger"))()

    def _setup_remote_conn_tab(self, parent_frame: ttk.Frame):
        """Sets up the widgets for the Remote Connection (ngrok) sub-tab."""
        ttk.Label(parent_frame, text=translate("remote_connection_ngrok"), font="-weight bold").grid(row=5, column=0, sticky="w", pady=(20, 5))
        remote_frame = ttk.Frame(parent_frame, padding=10, borderwidth=0, relief="solid")
        remote_frame.grid(row=6, column=0, sticky="ew", pady=5)
        remote_frame.columnconfigure(1, weight=1)

        # Mode Selection
        mode_frame = ttk.Frame(remote_frame)
        mode_frame.grid(row=0, column=0, columnspan=2, sticky="w", pady=(0, 10))
        ttk.Radiobutton(mode_frame, text=translate("remote_mode_host"), variable=self.remote_conn_mode_var, value="host", command=self._on_remote_mode_change).pack(side=LEFT, padx=(0, 10))
        ttk.Radiobutton(mode_frame, text=translate("remote_mode_client"), variable=self.remote_conn_mode_var, value="client", command=self._on_remote_mode_change).pack(side=LEFT)

        # Host Controls
        self.host_frame = ttk.Frame(remote_frame)
        self.host_frame.grid(row=1, column=0, columnspan=2, sticky="ew")
        self.host_frame.columnconfigure(1, weight=1)
        ttk.Label(self.host_frame, text=translate("remote_host_url_label")).grid(row=0, column=0, sticky="w", padx=(0, 5))
        self.ngrok_url_entry = ttk.Entry(self.host_frame, state="readonly")
        self.ngrok_url_entry.grid(row=0, column=1, sticky="ew")
        self.ngrok_url_entry.bind("<Button-1>", self._copy_ngrok_url)
        self.start_host_button = ttk.Button(self.host_frame, text=translate("remote_start_host_button"), command=self._start_ngrok_host_session, bootstyle="primary")
        self.start_host_button.grid(row=1, column=1, sticky="e", pady=(5,0))

        # Client Controls
        self.client_frame = ttk.Frame(remote_frame)
        self.client_frame.grid(row=1, column=0, columnspan=2, sticky="ew")
        self.client_frame.columnconfigure(1, weight=1)
        ttk.Label(self.client_frame, text=translate("remote_client_url_label")).grid(row=0, column=0, sticky="w", padx=(0, 5))
        self.remote_url_entry = ttk.Entry(self.client_frame)
        self.remote_url_entry.grid(row=0, column=1, sticky="ew")
        self.connect_client_button = ttk.Button(self.client_frame, text=translate("remote_connect_client_button"), command=self._connect_to_remote_host, bootstyle="primary")
        self.connect_client_button.grid(row=1, column=1, sticky="e", pady=(5,0))

        self._on_remote_mode_change() # Set initial visibility

    def _copy_ngrok_url(self, event=None):
        """Copies the ngrok public URL to the clipboard when the entry is clicked."""
        url = self.ngrok_url_entry.get()
        # Check if it's a valid ngrok URL and not a status message
        if "ngrok.io" in url:
            self.app.root.clipboard_clear()
            self.app.root.clipboard_append(url)
            self.app.show_toast(
                title=translate("url_copied_title"),
                message=translate("url_copied_message", url=url),
                bootstyle="info"
            )

    def _on_remote_mode_change(self):
        """Shows/hides Host/Client controls based on selection."""
        if self.remote_conn_mode_var.get() == "host":
            self.host_frame.grid()
            self.client_frame.grid_remove()
        else:
            self.host_frame.grid_remove()
            self.client_frame.grid()

    def _start_ngrok_host_session(self):
        """Starts the ngrok host session in a background thread."""
        if not PYNGROK_INSTALLED:
            messagebox.showerror(translate("dependency_missing"), PYNGROK_ERROR_MESSAGE)
            return

        if self.app.ngrok_tunnel:
            self._stop_ngrok_host_session()
            return

        selected_indices = self.device_listbox.curselection()
        if not selected_indices:
            self.app.show_toast(translate("open_file_error_title"), translate("no_device_selected"), "warning")
            return

        self.start_host_button.config(state=DISABLED)
        threading.Thread(target=self._ngrok_host_thread, args=(selected_indices[0],), daemon=True).start()

    def _ngrok_host_thread(self, device_index: int):
        """The logic for setting up the ngrok host tunnel."""
        try:
            device_str = self.device_listbox.get(device_index)
            udid = device_str.split(" | ")[-1].split(" ")[0]
            device_port = 5555 + device_index

            self.app.root.after(0, lambda: self.ngrok_url_entry.config(state=NORMAL))
            self.app.root.after(0, self.ngrok_url_entry.delete, 0, END)
            self.app.root.after(0, self.ngrok_url_entry.insert, 0, translate("remote_status_starting_tcpip"))
            self.app.root.after(0, lambda: self.ngrok_url_entry.config(state="readonly"))

            # 1. Set device to TCP/IP mode
            execute_command(f"adb -s {udid} tcpip {device_port}")
            time.sleep(1) # Give ADB a moment

            # 2. Start ngrok tunnel
            self.app.root.after(0, lambda: self.ngrok_url_entry.config(state=NORMAL))
            self.app.root.after(0, self.ngrok_url_entry.delete, 0, END)
            self.app.root.after(0, self.ngrok_url_entry.insert, 0, translate("remote_status_starting_tunnel"))
            self.app.root.after(0, lambda: self.ngrok_url_entry.config(state="readonly"))

            self.app.ngrok_tunnel = ngrok.connect(5037, "tcp")
            public_url = self.app.ngrok_tunnel.public_url.replace("tcp://", "")

            # 3. Update UI with URL and button state
            self.app.root.after(0, lambda: self.ngrok_url_entry.config(state=NORMAL))
            self.app.root.after(0, self.ngrok_url_entry.delete, 0, END)
            self.app.root.after(0, self.ngrok_url_entry.insert, 0, public_url)
            self.app.root.after(0, lambda: self.ngrok_url_entry.config(state="readonly"))
            self.app.root.after(0, lambda: self.start_host_button.configure(
                text=translate("remote_stop_host_button"),
                bootstyle="danger",
                state=NORMAL
            ))

        except PyngrokError as e:
            self.app.root.after(0, messagebox.showerror, translate("remote_error_title"), translate("remote_error_ngrok", error=e))
            self._reset_host_ui()
        except Exception as e:
            self.app.root.after(0, messagebox.showerror, translate("remote_error_title"), translate("remote_error_generic", error=e))
            self._reset_host_ui()

    def _stop_ngrok_host_session(self):
        """Stops the ngrok tunnel and resets the device."""
        if self.app.ngrok_tunnel:
            ngrok.disconnect(self.app.ngrok_tunnel.public_url)
            ngrok.kill()
            self.app.ngrok_tunnel = None

        # Revert all devices to USB mode as we don't track which one was used
        execute_command("adb devices -l | awk 'NR>1 {print $1}' | xargs -I {} adb -s {} usb")
        self._reset_host_ui()
        self.app.show_toast(translate("remote_session_stopped_title"), translate("remote_session_stopped_message"), "info")

    def _reset_host_ui(self):
        """Resets the host UI elements to their initial state."""
        self.app.root.after(0, lambda: self.start_host_button.configure(
            text=translate("remote_start_host_button"),
            bootstyle="primary",
            state=NORMAL
        ))
        self.app.root.after(0, lambda: self.ngrok_url_entry.config(state=NORMAL))
        self.app.root.after(0, self.ngrok_url_entry.delete, 0, END)
        self.app.root.after(0, lambda: self.ngrok_url_entry.config(state="readonly"))

    def _connect_to_remote_host(self):
        """Connects to a remote ngrok host address."""
        remote_url = self.remote_url_entry.get().strip()
        if not remote_url:
            self.app.show_toast(translate("input_error"), translate("remote_error_no_url"), "warning")
            return

        command = f"adb connect {remote_url}"
        self.connect_client_button.config(state=DISABLED)
        self.app._update_output_text(self.adb_output_text, f"> {command}\n", True)
        threading.Thread(target=self.app._run_command_and_update_gui, args=(command, self.adb_output_text, self.connect_client_button, True), daemon=True).start()

    def _setup_tests_tab(self, parent_frame: ttk.Frame):
        """Sets up the widgets for the Tests sub-tab."""
        # Configure parent_frame to use grid and allow expansion
        parent_frame.columnconfigure(0, weight=1)
        parent_frame.rowconfigure(1, weight=1) # The row with the listbox should expand

        ttk.Label(parent_frame, text=translate("execute_tests"), font="-weight bold").grid(row=0, column=0, sticky="w", pady=(0, 5))
        
        test_frame = ttk.Frame(parent_frame) # This frame will contain the listbox and its controls
        test_frame.grid(row=1, column=0, sticky="nsew", pady=5)
        test_frame.columnconfigure(0, weight=1) 
        # Make the row with the listbox (row 1) expand, not the controls row (row 0).
        test_frame.rowconfigure(1, weight=1)

        top_controls = ttk.Frame(test_frame)
        top_controls.grid(row=0, column=0, sticky="ew", padx=5, pady=2)
        top_controls.columnconfigure(0, weight=1)
        self.selection_label = ttk.Label(top_controls, text=translate("test_suites_txt"))
        self.selection_label.grid(row=0, column=0, sticky="w")
        mode_frame = ttk.Frame(top_controls)
        mode_frame.grid(row=0, column=1, sticky="e")
        ttk.Radiobutton(mode_frame, text=translate("run_by_suite"), variable=self.app.run_mode_var, value="Suite", command=self.on_run_mode_change).pack(side=LEFT, padx=5)
        ttk.Radiobutton(mode_frame, text=translate("run_by_test"), variable=self.app.run_mode_var, value="Test", command=self.on_run_mode_change).pack(side=LEFT, padx=5)
        ToolTip(mode_frame, text=translate("select_run_mode_tooltip"))

        self.selection_listbox = tk.Listbox(test_frame, exportselection=False)
        self.selection_listbox.grid(row=1, column=0, padx=5, pady=2, sticky="nsew")
        self.selection_listbox.bind("<Double-1>", self.on_selection_listbox_double_click)

        run_frame = ttk.Frame(parent_frame, padding=(0, 10, 0, 0)) # This frame contains the main action buttons
        run_frame.grid(row=2, column=0, sticky="ew", pady=5)
        run_frame.columnconfigure(1, weight=1) # Make the middle space expand
        
        # Buttons are aligned according to the new rule
        self.device_options_button = ttk.Button(run_frame, text=translate("device_toolbox"), command=self.app._mirror_device, bootstyle="info-outline")
        self.device_options_button.grid(row=0, column=0, sticky="w", padx=5, pady=5)
        ToolTip(self.device_options_button, text=translate("device_toolbox_tooltip"))
        self.timestamp_check = ttk.Checkbutton(run_frame, text=translate("do_not_overwrite_logs"), variable=self.app.timestamp_logs_var)
        self.timestamp_check.grid(row=0, column=2, sticky="e", padx=5, pady=5)
        ToolTip(self.timestamp_check, text=translate("timestamp_logs_tooltip"))
        self.run_button = ttk.Button(run_frame, text=translate("run_test"), command=self.app._run_test, bootstyle="primary")
        self.run_button.grid(row=0, column=3, sticky="e", padx=5, pady=5)
        ToolTip(self.run_button, text=translate("run_test_tooltip"))

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

    def _on_device_select(self, event=None):
        """Callback when a device is selected in the listbox."""
        selected_indices = self.device_listbox.curselection()
        if not selected_indices:
            return

        self.mdns_info_label.grid_remove() # Hide info label on new selection
        # Use the first selected device for IP lookup
        selected_device_str = self.device_listbox.get(selected_indices[0])
        selected_device_str = self.device_listbox.get(selected_indices[0])
        udid = selected_device_str.split(" | ")[-1].split(" ")[0]
        self.udid = udid # Store for inspector
        self.aspect_ratio = None # Reset aspect ratio for new device
        
        # Check if the device is already connected via Wi-Fi (udid will be an IP:Port)
        if ":" in udid:
            ip, port = udid.split(":")
            self.app.adb_ip_var.set(ip)
            self.app.adb_port_var.set(port)
        else:
            # For USB devices, fetch the IP and then try to find the wireless debugging port via mDNS.
            threading.Thread(target=self._fetch_ip_and_find_port, args=(udid,), daemon=True).start()

    def _fetch_ip_and_find_port(self, udid: str):
        """Fetches the IP of a USB device and then searches for its mDNS wireless port."""
        ip_address = get_device_ip(udid)
        if ip_address:
            self.app.root.after(0, self.app.adb_ip_var.set, ip_address)
            self.app.root.after(0, self.app.adb_port_var.set, translate("finding_wireless_port"))
            threading.Thread(target=self.app._find_and_set_mdns_port, args=(udid, ip_address), daemon=True).start()