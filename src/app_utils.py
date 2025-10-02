import json
import subprocess
import sys
from pathlib import Path
from typing import Tuple

# --- Constants ---
if getattr(sys, 'frozen', False):
    BASE_DIR = Path(sys.executable).parent
else:
    BASE_DIR = Path(__file__).resolve().parent.parent

SETTINGS_FILE = BASE_DIR / "config" / "settings.json"

# --- Encoding for subprocess output ---
OUTPUT_ENCODING = 'mbcs' if sys.platform == "win32" else 'utf-8'


def execute_command(command: str) -> Tuple[bool, str]:
    """Executes a shell command and returns its success status and output."""
    try:
        process = subprocess.run(
            command,
            shell=True,
            check=True,
            capture_output=True,
            text=True,
            encoding=OUTPUT_ENCODING,
            errors='replace',
            creationflags=subprocess.CREATE_NO_WINDOW if sys.platform == "win32" else 0
        )
        return True, process.stdout.strip()
    except subprocess.CalledProcessError as e:
        return False, e.stdout.strip() + "\n" + e.stderr.strip()
    except FileNotFoundError:
        return False, f"Error: Command not found. Make sure '{command.split()[0]}' is in your system's PATH."
    except Exception as e:
        return False, f"An unexpected error occurred: {e}"


def execute_on_persistent_shell(process: subprocess.Popen, command: str) -> str:
    """
    Executes a command on a persistent adb shell process and reads the output.
    """
    if process.poll() is not None:
        return "Error: Shell process is not running."

    # A unique marker to signal the end of a command's output
    end_marker = "ROBOT_RUNNER_CMD_DONE"

    # Write the command, followed by the end marker, to the shell's stdin
    process.stdin.write(f"{command}\n")
    process.stdin.write(f"echo {end_marker}\n")
    process.stdin.flush()

    output_lines = []
    while True:
        try:
            # Use a timeout to prevent blocking indefinitely if the shell hangs
            line = process.stdout.readline()
            if not line:  # Shell closed
                break
            if end_marker in line:
                break
            output_lines.append(line)
        except (IOError, ValueError):  # Catches errors if the pipe is closed
            break

    return "".join(output_lines).strip()


def load_theme_setting():
    """Loads the theme from settings.json before the main window is created."""
    try:
        if SETTINGS_FILE.exists():
            with open(SETTINGS_FILE, 'r') as f:
                settings = json.load(f)
                return settings.get("theme", "darkly")
        return "darkly"
    except Exception:
        return "darkly"


def load_language_setting():
    """Loads the language from settings.json before the main window is created."""
    try:
        if SETTINGS_FILE.exists():
            with open(SETTINGS_FILE, 'r') as f:
                settings = json.load(f)
                return settings.get("language", "en_US")
        return "en_US"
    except Exception:
        return "en_US"