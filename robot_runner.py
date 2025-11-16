import sys
import ctypes
import ttkbootstrap as ttk
from pathlib import Path

# Adds the project directory to sys.path to allow relative imports
if __name__ == '__main__':
    # Determine the base path for resources, works for dev and for PyInstaller
    if getattr(sys, 'frozen', False):
        # Running in a bundle
        BASE_DIR = Path(sys._MEIPASS)
    else:
        # Running in a normal Python environment
        BASE_DIR = Path(__file__).resolve().parent
    sys.path.insert(0, str(BASE_DIR.parent))
from src.locales.i18n import load_language
from src.locales.i18n import set_language_base_path
from src.app_utils import load_language_setting, load_theme_setting
from main import RobotRunnerApp

# --- Main Execution ---
if __name__ == "__main__":
    # High DPI awareness for Windows
    if sys.platform == "win32":
        try:
            ctypes.windll.shcore.SetProcessDpiAwareness(1)
        except Exception:
            pass

    set_language_base_path(BASE_DIR)
    language = load_language_setting()
    load_language(language)
    theme = load_theme_setting()

    app = ttk.Window(themename=theme)
    app.minsize(1000, 700)  # Set the minimum size of the window
    gui = RobotRunnerApp(app)
    app.mainloop()