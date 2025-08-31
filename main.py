import flet as ft
import pygetwindow as gw
import time
import sys
from pathlib import Path

# --- Add Project Root to sys.path ---
PROJECT_ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(PROJECT_ROOT))
# --- End of Solution ---

from app.state import app_state
from app.views.main_view import MainView
from app.views.execution_view import ExecutionView

def main(page: ft.Page):
    # --- Page and Window Configuration ---
    page.title = "Robot Runner NG"
    page.window_width = 1200
    page.window_height = 800
    page.theme_mode = ft.ThemeMode.DARK if app_state.settings.theme == "dark" else ft.ThemeMode.LIGHT
    
    # --- ROUTING LOGIC ---
    def route_change(route):
        page.views.clear()
        
        # Main View Route
        if page.route == "/":
            page.views.append(
                ft.View(
                    route="/",
                    controls=[MainView(page)],
                    padding=0,
                    # CORRECTED HERE: Use the theme color string name
                    appbar=ft.AppBar(title=ft.Text("Robot Runner NG"), bgcolor="surfacevariant")
                )
            )
        # Execution View Route
        elif page.route.startswith("/execute"):
            udid = page.route.split("/")[-1] 
            run_mode = page.route.split("/")[-2]
            run_path = page.client_storage.get("run_path") 
            if udid and run_path:
                page.views.append(
                    ExecutionView(page=page, udid=udid, run_path=run_path, run_mode=run_mode)
                )

        page.update()

    def view_pop(view):
        page.views.pop()
        top_view = page.views[-1]
        page.go(top_view.route)

    page.on_route_change = route_change
    page.on_view_pop = view_pop
    
    def on_window_event(e: ft.WindowEvent):
        """Handles window events to keep scrcpy positioned."""
        if e.data in ("move", "resize"):
            try:
                time.sleep(0.1)
                main_window = gw.getWindowsWithTitle(page.title)[0]
                app_state.scrcpy_manager.position_and_resize_window(main_window)
            except IndexError:
                pass
            except Exception as ex:
                print(f"Error during window event handler: {ex}")

    page.on_window_event = on_window_event
    
    page.go(page.route or "/")

    page.update()

if __name__ == "__main__":
    ft.app(target=main)