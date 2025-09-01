import flet as ft
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
    
    def on_window_destroy(e):
        """Cleanup when the app is closed."""
        app_state.scrcpy_manager.stop_all_mirroring()

    page.on_window_destroy = on_window_destroy

    # --- ROUTING LOGIC ---
    def route_change(route):
        page.views.clear()
        
        if page.route == "/":
            page.views.append(
                ft.View(
                    route="/",
                    controls=[MainView(page)],
                    padding=0,
                    appbar=ft.AppBar(title=ft.Text("Robot Runner NG"), bgcolor="surfacevariant")
                )
            )

        page.update()

    def view_pop(view):
        page.views.pop()
        top_view = page.views[-1]
        page.go(top_view.route)

    page.on_route_change = route_change
    page.on_view_pop = view_pop
    
    page.go(page.route or "/")

if __name__ == "__main__":
    ft.app(target=main, name="Robot Runner NG")