import tkinter as tk
import threading
import sys
import time
from tkinter import messagebox
import ttkbootstrap as ttk
from ttkbootstrap.constants import *
from ttkbootstrap.scrolled import ScrolledText
from ttkbootstrap.tooltip import ToolTip

from src.app_utils import execute_command
from src.locales.i18n import gettext as translate
from src.ui.toast import Toast
from src.device_utils import get_device_ip

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
    def __init__(self, parent, app):
        super().__init__(parent, padding=10)
        self.app = app

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
        commands_tab = ttk.Frame(self.sub_notebook, padding=10)
        self.sub_notebook.add(tests_tab, text=translate("tests_sub_tab"))
        self.sub_notebook.add(connect_tab, text=translate("connect_sub_tab"))
        self.sub_notebook.add(commands_tab, text=translate("commands_sub_tab"))

        self._setup_tests_tab(tests_tab)
        self._setup_adb_tab(connect_tab)
        self._setup_commands_tab(commands_tab)

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
        self.adb_output_text = ScrolledText(output_frame, wrap=WORD, state=DISABLED, autohide=True)
        self.adb_output_text.grid(row=0, column=0, sticky="nsew")

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
        self.app.settings_tab._save_settings() # Trigger save

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
        # Make the row with the listbox expand, not the controls row.
        test_frame.rowconfigure(2, weight=1)

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
        udid = selected_device_str.split(" | ")[-1].split(" ")[0]
        
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