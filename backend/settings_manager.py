"""
Settings manager for application configuration.
"""
import json
from pathlib import Path
from typing import Dict, Any, Tuple


class SettingsManager:
    """Handles application settings persistence."""
    
    DEFAULT_SETTINGS = {
        "paths": {
            "robot_path": "",
            "appium_path": "",
            "scrcpy_path": "",
            "suites_dir": "",
            "tests_dir": "",
            "logs_dir": "",
            "screenshots_dir": "",
            "recordings_dir": ""
        },
        "options": {
            "timestamp_logs": True,
            "scrcpy_options": "--always-on-top --turn-screen-off",
            "robot_options": "",
            "max_recording_duration": 180
        },
        "appearance": {
            "theme": "dark",
            "language": "en"
        },
        "performance": {
            "app_packages": [
                "com.android.chrome",
                "com.google.android.youtube",
                "com.whatsapp"
            ]
        },
        "common_adb_commands": []
    }
    
    def __init__(self, settings_file: Path):
        self.settings_file = settings_file
        self.settings_file.parent.mkdir(exist_ok=True, parents=True)
        
        # Initialize settings file if it doesn't exist
        if not self.settings_file.exists():
            self._save_settings(self.DEFAULT_SETTINGS)
    
    def get_settings(self) -> Dict[str, Any]:
        """Get all current settings."""
        try:
            if self.settings_file.exists():
                with open(self.settings_file, 'r', encoding='utf-8') as f:
                    settings = json.load(f)
                    # Merge with defaults to ensure all keys exist
                    return self._merge_with_defaults(settings)
            return self.DEFAULT_SETTINGS.copy()
        except Exception as e:
            print(f"Error loading settings: {e}")
            return self.DEFAULT_SETTINGS.copy()
    
    def update_settings(self, updates: Dict[str, Any]) -> Tuple[bool, str]:
        """
        Update settings with new values.
        
        Args:
            updates: Dictionary with settings updates (can be partial)
            
        Returns:
            Tuple of (success: bool, message: str)
        """
        try:
            current = self.get_settings()
            
            # Deep merge updates into current settings
            merged = self._deep_merge(current, updates)
            
            # Save merged settings
            self._save_settings(merged)
            
            return (True, "Settings updated successfully")
            
        except Exception as e:
            return (False, f"Error updating settings: {str(e)}")
    
    def reset_settings(self) -> Tuple[bool, str]:
        """Reset settings to defaults."""
        try:
            self._save_settings(self.DEFAULT_SETTINGS)
            return (True, "Settings reset to defaults")
        except Exception as e:
            return (False, f"Error resetting settings: {str(e)}")
    
    def _save_settings(self, settings: Dict[str, Any]):
        """Save settings to file."""
        with open(self.settings_file, 'w', encoding='utf-8') as f:
            json.dump(settings, f, indent=2)
    
    def _merge_with_defaults(self, settings: Dict[str, Any]) -> Dict[str, Any]:
        """Merge settings with defaults to ensure all keys exist."""
        return self._deep_merge(self.DEFAULT_SETTINGS.copy(), settings)
    
    def _deep_merge(self, base: Dict[str, Any], updates: Dict[str, Any]) -> Dict[str, Any]:
        """Deep merge two dictionaries."""
        result = base.copy()
        
        for key, value in updates.items():
            if key in result and isinstance(result[key], dict) and isinstance(value, dict):
                result[key] = self._deep_merge(result[key], value)
            else:
                result[key] = value
        
        return result
