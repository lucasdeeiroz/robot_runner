import flet as ft
import subprocess
import threading
import sys
import time
from pathlib import Path
from typing import Callable, Optional
from app.state import app_state
from app.core import adb_manager

class ExecutionView(ft.Column):
    """A self-contained view for running a test in its own window."""
    def __init__(self, page: ft.Page, run_mode: str, udid: str, run_path: str, close_window_callback: Callable):
        super().__init__(expand=True)
        self.page = page
        self.udid = udid
        self.run_mode = run_mode
        self.run_path = run_path
        self.close_window = close_window_callback

        self.page.appbar = ft.AppBar(title=ft.Text(f"Executing on {udid}"), leading=ft.IconButton(icon="close", on_click=lambda _: self.close_window()))

        self.output_pane_visible = True
        self.test_process: subprocess.Popen = None
        self.is_recording = False
        self.recording_process: Optional[subprocess.Popen] = None

        # --- Pane 1: Outputs ---
        self.test_output_log = ft.ListView(expand=True, spacing=2, auto_scroll=True)
        self.scrcpy_output_log = ft.ListView(expand=True, spacing=2, auto_scroll=True)
        
        self.output_tabs = ft.Tabs(
            selected_index=0,
            animation_duration=300,
            tabs=[
                ft.Tab(text="Test Output", content=self.test_output_log),
                ft.Tab(text="Scrcpy Output", content=self.scrcpy_output_log),
            ],
            expand=True,
        )
        self.left_pane = ft.Column([self.output_tabs], expand=3)

        # --- Pane 2: Controls ---
        self.mirror_button = ft.ElevatedButton("Start Mirroring", icon="screen_share", on_click=self._start_mirroring)
        self.screenshot_button = ft.ElevatedButton("Take Screenshot", icon="photo_camera", on_click=self._take_screenshot)
        self.record_button = ft.ElevatedButton("Start Recording", icon="videocam", on_click=self._toggle_recording)
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
        
        # --- Main Layout ---
        self.controls = [
            ft.Row(
                controls=[
                    self.left_pane,
                    ft.VerticalDivider(width=1),
                    self.center_pane,
                ],
                expand=True
            )
        ]

    def did_mount(self):
        threading.Thread(target=self._run_robot_test_thread, daemon=True).start()

    def _log(self, list_view: ft.ListView, message: str):
        list_view.controls.append(ft.Text(message, font_family="monospace", size=12))
        if self.page:
            self.page.update()

    def _log_scrcpy(self, message: str):
        self._log(self.scrcpy_output_log, message)

    def _toggle_output_pane(self, e):
        self.output_pane_visible = not self.output_pane_visible
        self.left_pane.visible = self.output_pane_visible
        self.page.update()

    def _start_mirroring(self, e):
        app_state.scrcpy_manager.start_mirroring(
            self.udid, 
            app_state.settings.scrcpy_args,
            log_callback=self._log_scrcpy
        )

    def _take_screenshot(self, e):
        timestamp = time.strftime("%Y%m%d-%H%M%S")
        screenshot_path = app_state.settings.screenshots_dir / f"{self.udid}_{timestamp}.png"
        app_state.settings.screenshots_dir.mkdir(parents=True, exist_ok=True)
        
        success, message = adb_manager.take_screenshot(self.udid, str(screenshot_path))
        self._log_scrcpy(f"[CMD] Take Screenshot: {message}")

    def _toggle_recording(self, e):
        self.is_recording = not self.is_recording
        if self.is_recording:
            self.recording_process = adb_manager.start_screen_recording(self.udid)
            if self.recording_process:
                self._log_scrcpy(f"[CMD] Started screen recording...")
                self.record_button.text = "Stop Recording"
                self.record_button.icon = "stop_circle"
                self.record_button.bgcolor = "red700"
            else:
                self._log_scrcpy(f"[ERROR] Failed to start screen recording.")
                self.is_recording = False # Reset state
        else:
            if self.recording_process:
                timestamp = time.strftime("%Y%m%d-%H%M%S")
                recording_path = app_state.settings.recordings_dir / f"{self.udid}_{timestamp}.mp4"
                app_state.settings.recordings_dir.mkdir(parents=True, exist_ok=True)
                
                success, message = adb_manager.stop_screen_recording(self.recording_process, self.udid, str(recording_path))
                self._log_scrcpy(f"[CMD] Stop Recording: {message}")
                self.recording_process = None
            
            self.record_button.text = "Start Recording"
            self.record_button.icon = "videocam"
            self.record_button.bgcolor = None
        self.page.update()

    def _stop_test(self, e):
        if self.test_process and self.test_process.poll() is None:
            self._log(self.test_output_log, "[INFO] Terminating test process...")
            self.test_process.terminate()
            self.stop_test_button.disabled = True
            self.page.update()

    def _run_robot_test_thread(self):
        try:
            device_info = adb_manager.get_device_info(self.udid)
            if not device_info:
                self._log(self.test_output_log, f"[FATAL ERROR] Could not get info for device {self.udid}")
                return

            run_path_obj = Path(self.run_path)
            suite_name = run_path_obj.stem
            sane_model = "".join(c for c in device_info.model if c.isalnum() or c in (' ', '_')).rstrip()
            sane_release = "".join(c for c in device_info.release if c.isalnum() or c in (' ', '_')).rstrip()
            log_dir_name = f'A{sane_release}_{sane_model}_{self.udid}'
            cur_log_dir = Path(app_state.settings.logs_dir) / log_dir_name
            cur_log_dir.mkdir(parents=True, exist_ok=True)

            base_command = (
                f'robot --split-log --logtitle "{device_info.release} - {device_info.model}" ' 
                f'-v udid:\"{self.udid}\" -v deviceName:\"{device_info.model}\" -v versao_OS:\"{device_info.release}\" ' 
                f'-d "{cur_log_dir}" --name "{suite_name}"'
            )
            
            try:
                project_root = Path.cwd()
                relative_run_path = run_path_obj.relative_to(project_root)
            except ValueError:
                relative_run_path = run_path_obj

            if self.run_mode == "Suite":
                command = f'{base_command} --argumentfile "{relative_run_path}"'
            else: # "Test"
                command = f'{base_command} "{relative_run_path}"'

            self._log(self.test_output_log, f"Executing command:\n{command}\n")
            
            self.test_process = subprocess.Popen(
                command, shell=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                text=True, encoding='utf-8', errors='replace', cwd=Path.cwd()
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
                self.stop_test_button.on_click = lambda _: self.close_window()
                self.stop_test_button.bgcolor = None
                self.stop_test_button.disabled = False
                self.page.update()
