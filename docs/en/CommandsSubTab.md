# Toolbox: Custom ADB Commands

The Commands tab acts as an integrated terminal specialized in sending direct ADB instructions to the selected device.

### Key Features

- **Direct Shell Execution:** Bypass the command line and send raw `adb shell` commands directly to the device.
- **Saved Snippets:** Save frequently used commands as snippets for quick execution (e.g., deep linking, broadcasting intents, triggering notifications).
- **Output Parsing:** Displays the stdout/stderr return logs cleanly within the UI.

### How to Use
Type your command (e.g., `am start -a android.intent.action.VIEW -d 'myapp://home'`) and press 'Execute'. The result will be instantly displayed.
