import flet as ft
from app.state import app_state
from typing import Callable
from pathlib import Path # Import the Path class

class SettingsView(ft.Column):
    """UI for application settings."""
    # ... (__init__ method is the same) ...
    def __init__(self, theme_update_callback: Callable):
        super().__init__(spacing=20, expand=True, scroll=ft.ScrollMode.ADAPTIVE)
        self.theme_update_callback = theme_update_callback

        # --- UI Controls mapped to AppSettings fields ---
        self.theme_dropdown = ft.Dropdown(
            label="Theme",
            options=[
                ft.dropdown.Option("dark"),
                ft.dropdown.Option("light"),
            ],
            value=app_state.settings.theme,
            on_change=self.on_theme_change
        )
        self.appium_command_field = ft.TextField(label="Appium Command", value=app_state.settings.appium_command)
        self.scrcpy_path_field = ft.TextField(label="Scrcpy Path", value=str(app_state.settings.scrcpy_path))
        self.suites_dir_field = ft.TextField(label="Suites Directory", value=str(app_state.settings.suites_dir))
        self.tests_dir_field = ft.TextField(label="Tests Directory", value=str(app_state.settings.tests_dir))
        self.logs_dir_field = ft.TextField(label="Logs Directory", value=str(app_state.settings.logs_dir))
        self.screenshots_dir_field = ft.TextField(label="Screenshots Directory", value=str(app_state.settings.screenshots_dir))
        self.recordings_dir_field = ft.TextField(label="Recordings Directory", value=str(app_state.settings.recordings_dir))
        self.app_packages_field = ft.TextField(label="App Packages (comma-separated)", value=app_state.settings.app_packages)
        
        self.controls = [
            ft.Text("Application Settings", size=24),
            self.theme_dropdown,
            ft.Text("Paths & Commands", size=18),
            self.appium_command_field,
            self.scrcpy_path_field,
            self.suites_dir_field,
            self.tests_dir_field,
            self.logs_dir_field,
            self.screenshots_dir_field,
            self.recordings_dir_field,
            self.app_packages_field,
            ft.Row(
                [ft.ElevatedButton("Save Settings", icon="save", on_click=self.save_settings)],
                alignment=ft.MainAxisAlignment.END
            )
        ]

    def on_theme_change(self, e):
        """Applies the theme immediately on change by calling the provided callback."""
        app_state.settings.theme = self.theme_dropdown.value
        self.theme_update_callback()
    
    def save_settings(self, e):
        """Reads values from fields, updates the state, and saves to file."""
        try:
            # Update the in-memory settings object from the UI fields
            app_state.settings.theme = self.theme_dropdown.value
            app_state.settings.appium_command = self.appium_command_field.value
            app_state.settings.scrcpy_path = self.scrcpy_path_field.value
            
            # CORRECTED: Convert string paths back to Path objects before assigning
            app_state.settings.suites_dir = Path(self.suites_dir_field.value)
            app_state.settings.tests_dir = Path(self.tests_dir_field.value)
            app_state.settings.logs_dir = Path(self.logs_dir_field.value)
            app_state.settings.screenshots_dir = Path(self.screenshots_dir_field.value)
            app_state.settings.recordings_dir = Path(self.recordings_dir_field.value)
            
            app_state.settings.app_packages = self.app_packages_field.value
            
            # Persist the changes to settings.json
            app_state.settings.save()

            # Provide user feedback
            self.page.snack_bar = ft.SnackBar(
                content=ft.Text("Settings saved successfully!"),
                bgcolor="green700"
            )
            self.page.snack_bar.open = True
            self.page.update()

        except Exception as ex:
            self.page.snack_bar = ft.SnackBar(
                content=ft.Text(f"Error saving settings: {ex}"),
                bgcolor="red700"
            )
            self.page.snack_bar.open = True
            self.page.update()