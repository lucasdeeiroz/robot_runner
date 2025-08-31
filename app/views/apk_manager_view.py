import flet as ft

class ApkManagerView(ft.Column):
    """UI for the APK Manager feature."""
    def __init__(self):
        super().__init__(spacing=20, expand=True)
        self.file_picker = ft.FilePicker(on_result=self.on_apk_selected)
        self.selected_apk_path = ft.Text("No APK selected.")
        
        self.device_list = ft.ListView(expand=True, spacing=10)
        self.package_name_input = ft.TextField(label="Package Name (e.g., com.example.app)")

        self.controls = [
            ft.Text("APK Manager", size=24),
            ft.Row([
                # CORRECTED: Use string name for the icon
                ft.ElevatedButton("Select APK", icon="upload_file", on_click=lambda _: self.file_picker.pick_files()),
                self.selected_apk_path,
            ]),
            self.file_picker, # Don't forget to add the picker to the page's overlay or controls
            ft.Text("Target Devices (Select one or more)"),
            self.device_list,
            self.package_name_input,
            ft.Row([
                # CORRECTED: Use string names for icons
                ft.ElevatedButton("Install", on_click=self.install, icon="install_mobile"),
                ft.ElevatedButton("Uninstall", on_click=self.uninstall, icon="delete"),
                ft.ElevatedButton("Clear Data", on_click=self.clear_data, icon="cleaning_services"),
            ]),
            ft.Text("Output:", weight=ft.FontWeight.BOLD),
            ft.ListView(expand=True)
        ]
    
    def on_apk_selected(self, e: ft.FilePickerResultEvent):
        if e.files:
            self.selected_apk_path.value = e.files[0].path
            self.update()
    
    def install(self, e): print("Install clicked")
    def uninstall(self, e): print("Uninstall clicked")
    def clear_data(self, e): print("Clear Data clicked")