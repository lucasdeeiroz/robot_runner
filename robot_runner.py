import sys
import ctypes
import ttkbootstrap as ttk

# Adiciona o diretório do projeto ao sys.path para permitir importações relativas
if __name__ == '__main__':
    # Garante que o diretório 'src' seja encontrado, não importa como o script é executado
    from pathlib import Path
    project_dir = Path(__file__).resolve().parent
    sys.path.insert(0, str(project_dir))

from src.locales.i18n import load_language
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

    language = load_language_setting()
    load_language(language)
    theme = load_theme_setting()

    app = ttk.Window(themename=theme)
    gui = RobotRunnerApp(app)
    app.mainloop()