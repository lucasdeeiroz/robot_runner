import flet as ft
import sys
import pygetwindow as gw
from pathlib import Path

# --- Add Project Root to sys.path ---
PROJECT_ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(PROJECT_ROOT))
# --- End of Solution ---

from app.views.execution_view import ExecutionView
from app.state import app_state

def main(page: ft.Page):
    """The main entry point for the execution window application."""
    if len(sys.argv) != 4:
        page.add(ft.Text("Error: Invalid arguments. Required: <udid> <run_mode> <run_path>"))
        return

    udid = sys.argv[1]
    run_mode = sys.argv[2]
    run_path = sys.argv[3]

    page.title = f"Executing Test on {udid}"
    page.window_width = 1000
    page.window_height = 700
    page.theme_mode = ft.ThemeMode.DARK if app_state.settings.theme == "dark" else ft.ThemeMode.LIGHT

    def close_window(e=None):
        try:
            win = gw.getWindowsWithTitle(page.title)[0]
            win.close()
        except Exception as e:
            print(f"Error closing window: {e}")

    # This handles the OS window close button.
    page.on_window_event = lambda e: close_window() if e.data == "close" else None

    # The ExecutionView will be passed the close_window function.
    execution_view = ExecutionView(page, run_mode, udid, run_path, close_window_callback=close_window)
    
    page.add(execution_view)
    page.update()

if __name__ == "__main__":
    # This allows the script to be run as a separate process.
    ft.app(target=main)
