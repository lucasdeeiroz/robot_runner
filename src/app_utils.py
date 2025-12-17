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

CONFIG_DIR = BASE_DIR / "config"
SETTINGS_FILE = BASE_DIR / "config" / "settings.json"

# --- Encoding for subprocess output ---
OUTPUT_ENCODING = 'mbcs' if sys.platform == "win32" else 'utf-8'


import shlex
import shutil

def execute_command(command: str | list) -> Tuple[bool, str]:
    """Executes a shell command and returns its success status and output."""
    try:
        if isinstance(command, str):
            # Split the command string into a list of arguments, handling quotes
            # posix=False is generally better for Windows paths with backslashes if not using shell=True
            args = shlex.split(command, posix=(sys.platform != "win32"))
        else:
            args = command

        # Fix for Windows: .cmd and .bat files cannot be executed directly with shell=False
        if sys.platform == "win32" and args:
            executable = args[0]
            full_path = shutil.which(executable)
            if full_path:
                ext = Path(full_path).suffix.lower()
                if ext in ['.cmd', '.bat']:
                    args = ["cmd", "/c"] + args

        process = subprocess.run(
            args,
            shell=False,
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
        cmd_name = args[0] if isinstance(args, list) and args else str(command)
        return False, f"Error: Command not found. Make sure '{cmd_name}' is in your system's PATH."
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