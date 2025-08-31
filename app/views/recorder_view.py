import flet as ft

class RecorderView(ft.Column):
    """UI for the Scenario Recorder feature (Proof of Concept)."""
    def __init__(self):
        super().__init__(spacing=20, expand=True)
        self.recorded_steps = ft.ListView(expand=True, spacing=5)
        
        # CORRECTED: Use ft.TextStyle for font styling
        self.script_output = ft.TextField(
            multiline=True, 
            read_only=True, 
            expand=True, 
            text_style=ft.TextStyle(font_family="monospace")
        )

        self.controls = [
            ft.Text("Scenario Recorder", size=24),
            ft.Text("1. Start mirroring a device from the 'Devices' tab."),
            ft.Text("2. Use the buttons below to record actions."),
            ft.Row([
                ft.ElevatedButton("Record Tap", on_click=self.record_tap),
                ft.ElevatedButton("Record Swipe", on_click=self.record_swipe),
                ft.ElevatedButton("Record Text", on_click=self.record_text),
            ]),
            ft.Text("Recorded Steps:"),
            self.recorded_steps,
            ft.ElevatedButton("Generate Robot Script", on_click=self.generate_script),
            ft.Text("Generated Script:"),
            self.script_output,
        ]

    def record_action(self, action_text: str):
        self.recorded_steps.controls.append(ft.Text(action_text))
        if self.page:
            self.update()
    
    # These methods would open dialogs to get coordinates/text from the user
    def record_tap(self, e): self.record_action("Tap    x=100    y=200")
    def record_swipe(self, e): self.record_action("Swipe  x1=100  y1=800  x2=100  y2=200")
    def record_text(self, e): self.record_action("Input Text    my_element    'Hello World'")

    def generate_script(self, e):
        header = "*** Settings ***\nLibrary    AppiumLibrary\n\n*** Test Cases ***\nRecorded Scenario\n"
        body = ""
        for control in self.recorded_steps.controls:
            # Assuming control is a Text control with a 'value' attribute
            step_text = control.value
            parts = step_text.split()
            keyword = parts[0]
            # Join all other parts, preserving spaces if any were intended in arguments
            args = "    ".join(parts[1:])
            body += f"    {keyword.ljust(12)}{args}\n"
        
        self.script_output.value = header + body
        if self.page:
            self.update()