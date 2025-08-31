import flet as ft
from app.state import app_state
from .run_view import RunView
from .devices_view import DevicesView
from .apk_manager_view import ApkManagerView
from .scheduler_view import SchedulerView
from .recorder_view import RecorderView
from .settings_view import SettingsView

class MainView(ft.Row):
    """The main application view, containing the navigation rail and content area."""
    def __init__(self, page: ft.Page):
        super().__init__(expand=True)
        self.page = page
        
        # Create instances of all views
        self.views = {
            "Run Tests": RunView(),
            "Devices": DevicesView(),
            "APK Manager": ApkManagerView(),
            "Scheduler": SchedulerView(),
            "Recorder": RecorderView(),
            "Settings": SettingsView(theme_update_callback=self.update_theme),
        }
        
        self.navigation_rail = ft.NavigationRail(
            selected_index=0,
            label_type=ft.NavigationRailLabelType.ALL,
            destinations=[
                # CORRECTED all icon paths below to use string names
                ft.NavigationRailDestination(icon="play_arrow_outlined", selected_icon="play_arrow", label="Run"),
                ft.NavigationRailDestination(icon="devices_other_outlined", selected_icon="devices_other", label="Devices"),
                ft.NavigationRailDestination(icon="install_mobile_outlined", selected_icon="install_mobile", label="APK"),
                ft.NavigationRailDestination(icon="schedule_outlined", selected_icon="schedule", label="Schedule"),
                ft.NavigationRailDestination(icon="videocam_outlined", selected_icon="videocam", label="Record"),
                ft.NavigationRailDestination(icon="settings_outlined", selected_icon="settings", label="Settings"),
            ],
            on_change=self.nav_change,
        )

        self.content_area = ft.Column(
            [self.views["Run Tests"]],
            expand=True,
            scroll=ft.ScrollMode.ADAPTIVE
        )

        self.controls = [
            self.navigation_rail,
            ft.VerticalDivider(width=1),
            self.content_area,
        ]

    def nav_change(self, e):
        """Handles navigation changes, swapping the content view."""
        selected_label = e.control.destinations[e.control.selected_index].label
        if selected_label == "Run": view_key = "Run Tests"
        elif selected_label == "Devices": view_key = "Devices"
        elif selected_label == "APK": view_key = "APK Manager"
        elif selected_label == "Schedule": view_key = "Scheduler"
        elif selected_label == "Record": view_key = "Recorder"
        else: view_key = "Settings"

        self.content_area.controls = [self.views[view_key]]
        self.page.update()

    def update_theme(self):
        """Updates the theme of the page and refreshes the view."""
        self.page.theme_mode = ft.ThemeMode.DARK if app_state.settings.theme == "dark" else ft.ThemeMode.LIGHT
        self.page.update()