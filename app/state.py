from app.models.settings import AppSettings
from app.core.scrcpy_manager import ScrcpyManager

class AppState:
    """A singleton-like class to hold the application's shared state."""
    def __init__(self):
        self.settings = AppSettings.load()
        self.scrcpy_manager = ScrcpyManager(self.settings.scrcpy_path)
        # Other state variables can be added here
        # e.g., self.devices = []

# Create a single instance to be imported by other modules
app_state = AppState()