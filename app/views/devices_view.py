import flet as ft
from app.core import adb_manager
from app.state import app_state

class DevicesView(ft.Column):
    """UI for the Device Management feature."""
    def __init__(self):
        super().__init__(spacing=20, expand=True)
        self.device_table = ft.DataTable(
            columns=[
                ft.DataColumn(ft.Text("Model")),
                ft.DataColumn(ft.Text("UDID")),
                ft.DataColumn(ft.Text("Android Ver.")),
                ft.DataColumn(ft.Text("Battery")),
                ft.DataColumn(ft.Text("Status")),
                ft.DataColumn(ft.Text("Actions")),
            ],
            rows=[]
        )
        self.controls = [
            ft.Row([
                ft.Text("Connected Devices", size=24),
                ft.IconButton(icon="refresh", on_click=self.refresh_devices, tooltip="Refresh Devices")
            ]),
            ft.Column([self.device_table], scroll=ft.ScrollMode.ADAPTIVE, expand=True)
        ]
        # DO NOT load data here in __init__

    def did_mount(self):
        """Called after the control is added to the page."""
        self.refresh_devices(None)

    def refresh_devices(self, e):
        devices = adb_manager.get_connected_devices()
        self.device_table.rows.clear()
        for device in devices:
            self.device_table.rows.append(
                ft.DataRow(cells=[
                    ft.DataCell(ft.Text(device.model)),
                    ft.DataCell(ft.Text(device.udid)),
                    ft.DataCell(ft.Text(device.release)),
                    ft.DataCell(ft.Text(device.battery)),
                    ft.DataCell(ft.Text(device.status, color="green")),
                    ft.DataCell(
                        ft.IconButton(
                            icon="screen_share_outlined",
                            tooltip="Start Mirroring",
                            data=device.udid,
                            on_click=self.start_mirroring
                        )
                    ),
                ])
            )
        # It's safer to check if the page exists before updating
        if self.page:
            self.update()

    def start_mirroring(self, e):
        udid = e.control.data
        app_state.scrcpy_manager.start_mirroring(udid)