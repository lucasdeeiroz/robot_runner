import json
from pathlib import Path
from pydantic import BaseModel, Field
from typing import Optional

# Define the base directory for default paths
BASE_DIR = Path.cwd()
CONFIG_DIR = BASE_DIR / "config"
SETTINGS_FILE = CONFIG_DIR / "settings.json"

class AppSettings(BaseModel):
    """Defines the application's configuration structure using Pydantic."""
    appium_command: str = "appium --base-path=/wd/hub --relaxed-security"
    scrcpy_path: str = "scrcpy"
    scrcpy_args: str = "-m 1024 -b 2M --max-fps=30 --no-audio"
    suites_dir: Path = Field(default_factory=lambda: BASE_DIR / "suites")
    tests_dir: Path = Field(default_factory=lambda: BASE_DIR / "tests")
    logs_dir: Path = Field(default_factory=lambda: BASE_DIR / "logs")
    screenshots_dir: Path = Field(default_factory=lambda: BASE_DIR / "screenshots")
    recordings_dir: Path = Field(default_factory=lambda: BASE_DIR / "recordings")
    theme: str = "dark" # Flet uses 'light' or 'dark'
    app_packages: str = "com.android.chrome"

    def save(self) -> None:
        """Saves the current settings to the JSON file."""
        CONFIG_DIR.mkdir(exist_ok=True)
        # Pydantic's model_dump_json handles serialization correctly
        with open(SETTINGS_FILE, 'w') as f:
            f.write(self.model_dump_json(indent=4))

    @classmethod
    def load(cls) -> 'AppSettings':
        """Loads settings from the JSON file, or returns default if not found."""
        if not SETTINGS_FILE.exists():
            return cls()
        try:
            with open(SETTINGS_FILE, 'r') as f:
                data = json.load(f)
            return cls(**data)
        except (json.JSONDecodeError, TypeError) as e:
            print(f"Error loading settings: {e}. Using defaults.")
            return cls()