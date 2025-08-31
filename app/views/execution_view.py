import flet as ft
import subprocess
import threading
from app.state import app_state

class ExecutionView(ft.View):
    """
    A view that provides a three-pane layout for running tests and managing a device.
    Equivalent to the original RunCommandWindow.
    """
    def __init__(self, page: ft.Page, udid: str, run_path: str, run_mode: str = "Test"):
        super().__init__(
            route=f"/execute/{udid}",
            # Add an AppBar to this view for consistency and a back button
            appbar=ft.AppBar(title=ft.Text(f"Executing on {udid}"), leading=ft.IconButton(icon="arrow_back", on_click=lambda _: page.go("/"))),
        )
        self.page = page
        self.udid = udid
        self.run_mode = run_mode  # "Test" or "Suite"
        self.run_path = run_path

        # --- State Management ---
        self.is_mirroring = False
        self.is_recording = False
        self.output_pane_visible = True
        self.test_process: subprocess.Popen = None

        # --- Pane 1: Outputs ---
        self.test_output_log = ft.ListView(expand=True, spacing=2, auto_scroll=True)
        self.scrcpy_output_log = ft.ListView(expand=True, spacing=2, auto_scroll=True)
        
        self.output_tabs = ft.Tabs(
            selected_index=0,
            animation_duration=300,
            tabs=[
                ft.Tab(text="Test Output", content=self.test_output_log),
                ft.Tab(text="Scrcpy Output", content=self.scrcpy_output_log),
                ft.Tab(text="Performance", content=ft.Text("Performance monitor UI would go here.")),
            ],
            expand=True,
        )
        self.left_pane = ft.Column([self.output_tabs], expand=3)

        # --- Pane 2: Controls ---
        self.mirror_button = ft.ElevatedButton("Start Mirroring", icon="screen_share", on_click=self._toggle_mirroring)
        self.screenshot_button = ft.ElevatedButton("Take Screenshot", icon="photo_camera", on_click=self._take_screenshot, disabled=True)
        self.record_button = ft.ElevatedButton("Start Recording", icon="videocam", on_click=self._toggle_recording, disabled=True)
        self.stop_test_button = ft.ElevatedButton("Stop Test", icon="stop", on_click=self._stop_test, bgcolor="red700", color="white")
        
        self.center_pane = ft.Column(
            controls=[
                ft.Text("Controls", size=18),
                self.mirror_button,
                self.screenshot_button,
                self.record_button,
                ft.Divider(),
                ft.ElevatedButton("Toggle Outputs", icon="visibility", on_click=self._toggle_output_pane),
                ft.Divider(),
                self.stop_test_button,
            ],
            expand=1,
            spacing=10,
            horizontal_alignment=ft.CrossAxisAlignment.CENTER
        )
        
        # --- Pane 3: Screen Mirror Placeholder ---
        # CORRECTED HERE: Use the theme color string "outlinevariant"
        self.mirror_status_icon = ft.Icon("smartphone", size=100, color="outlinevariant")
        self.mirror_status_text = ft.Text("Mirroring is inactive.", size=16)
        
        self.right_pane = ft.Column(
            controls=[
                self.mirror_status_icon,
                self.mirror_status_text
            ],
            expand=4,
            horizontal_alignment=ft.CrossAxisAlignment.CENTER,
            alignment=ft.MainAxisAlignment.CENTER
        )

        # --- Main Layout ---
        self.controls = [
            ft.Row(
                controls=[
                    self.left_pane,
                    ft.VerticalDivider(width=1),
                    self.center_pane,
                    ft.VerticalDivider(width=1),
                    self.right_pane,
                ],
                expand=True
            )
        ]

    def did_mount(self):
        """Start the test execution in a background thread once the view is mounted."""
        threading.Thread(target=self._run_robot_test_thread, daemon=True).start()

    def _log(self, list_view: ft.ListView, message: str):
        """A thread-safe method to add messages to a ListView."""
        list_view.controls.append(ft.Text(message, font_family="monospace", size=12))
        if self.page:
            self.page.update()

    def _toggle_output_pane(self, e):
        self.output_pane_visible = not self.output_pane_visible
        self.left_pane.visible = self.output_pane_visible
        self.page.update()

    def _toggle_mirroring(self, e):
        self.is_mirroring = not self.is_mirroring
        if self.is_mirroring:
            app_state.scrcpy_manager.start_mirroring(self.udid)
            self.mirror_button.text = "Stop Mirroring"
            self.mirror_button.icon = "stop_screen_share"
            self.screenshot_button.disabled = False
            self.record_button.disabled = False
            self.mirror_status_icon.name = "phonelink_ring"
            self.mirror_status_icon.color = "green"
            self.mirror_status_text.value = "Mirroring is active in a separate window."
        else:
            app_state.scrcpy_manager.stop_mirroring()
            self.mirror_button.text = "Start Mirroring"
            self.mirror_button.icon = "screen_share"
            self.screenshot_button.disabled = True
            self.record_button.disabled = True
            self.mirror_status_icon.name = "smartphone"
            # CORRECTED HERE: Reset to the theme color string
            self.mirror_status_icon.color = "outlinevariant"
            self.mirror_status_text.value = "Mirroring is inactive."
        self.page.update()

    def _take_screenshot(self, e):
        self._log(self.scrcpy_output_log, "[INFO] Taking screenshot...")
        
    def _toggle_recording(self, e):
        self.is_recording = not self.is_recording
        if self.is_recording:
            self.record_button.text = "Stop Recording"
            self.record_button.icon = "stop_circle"
            self.record_button.bgcolor = "red700"
            self._log(self.scrcpy_output_log, "[INFO] Started recording...")
        else:
            self.record_button.text = "Start Recording"
            self.record_button.icon = "videocam"
            self.record_button.bgcolor = None
            self._log(self.scrcpy_output_log, "[INFO] Stopped recording...")
        self.page.update()

    def _stop_test(self, e):
        if self.test_process and self.test_process.poll() is None:
            self._log(self.test_output_log, "[INFO] Terminating test process...")
            self.test_process.terminate()
            self.stop_test_button.disabled = True
            self.page.update()

    def _run_robot_test_thread(self):
        """Executes the robot framework test in a background thread."""
        try:
            base_command = (
                f'robot --split-log --logtitle "{device_info["release"]} - {device_info["model"]}" '
                f'-v udid:"{self.udid}" -v deviceName:"{device_info["model"]}" -v versao_OS:"{device_info["release"]}" '
                f'-d "{cur_log_dir}" --name "{suite_name}" '
            )
            if self.run_mode == "Suite":
                command = f'{base_command} --argumentfile ".\\{self.run_path}"'
            else:
                command = f'{base_command} ".\\{self.run_path}"'
            self._log(self.test_output_log, f"Executing command:\n{command}\n")
            
            self.test_process = subprocess.Popen(
                command, shell=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                text=True, encoding='utf-8', errors='replace'
            )
            
            for line in iter(self.test_process.stdout.readline, ''):
                self._log(self.test_output_log, line.strip())
            
            self.test_process.stdout.close()
            return_code = self.test_process.wait()
            self._log(self.test_output_log, f"\n--- Test finished with return code: {return_code} ---")
            
        except Exception as e:
            self._log(self.test_output_log, f"\n[FATAL ERROR] Failed to run test: {e}")
        finally:
            if self.page:
                self.stop_test_button.text = "Close"
                self.stop_test_button.icon = "close"
                self.stop_test_button.on_click = lambda _: self.page.go("/")
                self.stop_test_button.bgcolor = None
                self.stop_test_button.disabled = False
                self.page.update()