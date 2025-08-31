import flet as ft
from pathlib import Path
from app.state import app_state
from app.core import adb_manager

class RunView(ft.Column):
    # ... (__init__ method is the same) ...
    def __init__(self):
        super().__init__(spacing=20, expand=True, scroll=ft.ScrollMode.ADAPTIVE)
        
        # --- State ---
        # Ensure current_path is initialized as a Path object
        self.current_path = Path(app_state.settings.suites_dir)
        self.run_mode = "Suite"
        # ... (rest of __init__)
        self.device_list = ft.ListView(expand=True, spacing=5, height=150)
        self.run_mode_radio = ft.RadioGroup(
            content=ft.Row([
                ft.Radio(value="Suite", label="Run by Suite"),
                ft.Radio(value="Test", label="Run by Test"),
            ]),
            value="Suite",
            on_change=self.on_run_mode_change
        )
        self.current_path_label = ft.Text(f"Path: {self.current_path}", weight=ft.FontWeight.BOLD)
        self.file_list = ft.ListView(expand=True, spacing=5, height=300)
        self.output_log = ft.ListView(expand=True, spacing=5, auto_scroll=True)

        self.controls = [
            ft.Text("Device Selection", size=18),
            ft.Container(
                content=self.device_list, 
                border=ft.border.all(1, "outlinevariant"), 
                border_radius=ft.border_radius.all(5),
                padding=10
            ),
            ft.IconButton(icon="refresh", on_click=self.refresh_devices, tooltip="Refresh Devices"),
            
            ft.Text("Test Selection", size=18),
            self.run_mode_radio,
            self.current_path_label,
            ft.Container(
                content=self.file_list, 
                border=ft.border.all(1, "outlinevariant"), 
                border_radius=ft.border_radius.all(5),
                padding=10
            ),
            
            ft.ElevatedButton(
                "Run Test", 
                icon="play_arrow", 
                on_click=self.run_test, 
                style=ft.ButtonStyle(bgcolor="green700", color="white")
            ),
            
            ft.Text("Execution Output", size=18),
            ft.Container(
                content=self.output_log,
                border=ft.border.all(1, "outlinevariant"), 
                border_radius=ft.border_radius.all(5),
                padding=10,
                expand=True
            ),
        ]

    def did_mount(self):
        """Called after the control is added to the page."""
        self.refresh_devices(None)
        self.populate_file_list()

    def on_run_mode_change(self, e):
        """Handles switching between Suite and Test mode."""
        self.run_mode = e.control.value
        if self.run_mode == "Suite":
            # IMPROVEMENT: Ensure it's a Path object
            self.current_path = Path(app_state.settings.suites_dir)
        else:
            # IMPROVEMENT: Ensure it's a Path object
            self.current_path = Path(app_state.settings.tests_dir)
        self.populate_file_list()

    # ... (rest of the class methods) ...
    def refresh_devices(self, e):
        """Loads connected devices into the device list."""
        self.device_list.controls.clear()
        devices = adb_manager.get_connected_devices()
        if not devices:
            self.device_list.controls.append(ft.Text("No devices found."))
        else:
            for device in devices:
                self.device_list.controls.append(
                    ft.Checkbox(label=f"{device.model} | Android {device.release} | {device.udid}", data=device.udid)
                )
        if self.page:
            self.update()

    def populate_file_list(self):
        """Populates the file list based on the current path and run mode."""
        self.current_path_label.value = f"Path: {self.current_path}"
        self.file_list.controls.clear()
        
        base_dir = Path(app_state.settings.suites_dir if self.run_mode == "Suite" else app_state.settings.tests_dir)
        if self.current_path != base_dir:
            self.file_list.controls.append(
                ft.ListTile(title=ft.Text("[..] Back"), leading=ft.Icon("arrow_upward"), on_click=self.navigate_up)
            )

        try:
            items = sorted(list(self.current_path.iterdir()), key=lambda p: (not p.is_dir(), p.name.lower()))
            for item in items:
                if item.is_dir():
                    self.file_list.controls.append(
                        ft.ListTile(title=ft.Text(item.name), leading=ft.Icon("folder"), data=item, on_click=self.navigate_down)
                    )
                elif self.run_mode == "Suite" and item.suffix == ".txt":
                    self.file_list.controls.append(
                        ft.ListTile(title=ft.Text(item.name), leading=ft.Icon("description_outlined")))
                elif self.run_mode == "Test" and item.suffix == ".robot":
                    self.file_list.controls.append(
                        ft.ListTile(title=ft.Text(item.name), leading=ft.Icon("smart_toy_outlined")))
        except FileNotFoundError:
            self.file_list.controls.append(ft.Text(f"Directory not found: {self.current_path}"))
        if self.page:
            self.update()

    def navigate_down(self, e):
        self.current_path = e.control.data
        self.populate_file_list()
    
    def navigate_up(self, e):
        self.current_path = self.current_path.parent
        self.populate_file_list()

    def run_test(self, e):
        """Navigates to the ExecutionView to run the test."""
        selected_devices = [cb.data for cb in self.device_list.controls if isinstance(cb, ft.Checkbox) and cb.value]
        
        # This view doesn't handle multiple device runs simultaneously yet.
        # We will run on the first selected device.
        if not selected_devices:
            self.page.snack_bar = ft.SnackBar(content=ft.Text("Please select at least one device."), bgcolor="orange")
            self.page.snack_bar.open = True
            self.page.update()
            return
            
        # A more robust selection method for files is needed. This is a placeholder.
        # We'll assume the first .robot or .txt file is the target.
        selected_file = None
        for item in self.file_list.controls:
            if isinstance(item, ft.ListTile):
                title = item.title.value
                if title.endswith(".robot") or title.endswith(".txt"):
                    selected_file = self.current_path / title
                    break
        
        if not selected_file:
            self.page.snack_bar = ft.SnackBar(content=ft.Text("Could not determine which file to run."), bgcolor="red")
            self.page.snack_bar.open = True
            self.page.update()
            return
        
        udid = selected_devices[0]
        
        # Store the path to pass to the next view and navigate
        self.page.client_storage.set("run_path", str(selected_file))
        self.page.go(f"/execute/{self.run_mode}/{udid}")