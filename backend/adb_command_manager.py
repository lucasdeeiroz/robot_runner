"""
ADB Command manager for executing custom commands and managing favorites.
"""
import subprocess
import json
from pathlib import Path
from typing import List, Tuple


class ADBCommandManager:
    """Handles execution of custom ADB commands and favorite command management."""
    
    def __init__(self, settings_file: Path):
        self.settings_file = settings_file
        self.settings_file.parent.mkdir(exist_ok=True, parents=True)
    
    def execute(self, udid: str, command: str) -> Tuple[bool, str]:
        """
        Execute an ADB command on a specific device.
        
        Args:
            udid: Device UDID
            command: ADB command (without 'adb -s {udid}' prefix)
            
        Returns:
            Tuple of (success: bool, output: str)
        """
        try:
            # Sanitize command - ensure it doesn't start with 'adb'
            cmd = command.strip()
            if cmd.lower().startswith('adb'):
                # User included 'adb', extract just the command part
                parts = cmd.split(maxsplit=1)
                if len(parts) > 1:
                    cmd = parts[1]
                else:
                    return (False, "Invalid command")
            
            # Build full command
            full_cmd = f"adb -s {udid} {cmd}"
            
            result = subprocess.run(
                full_cmd,
                shell=True,
                capture_output=True,
                text=True,
                timeout=30
            )
            
            output = result.stdout + result.stderr
            success = result.returncode == 0
            
            return (success, output.strip() if output else "Command executed successfully")
            
        except subprocess.TimeoutExpired:
            return (False, "Command timed out after 30 seconds")
        except Exception as e:
            return (False, f"Error: {str(e)}")
    
    def get_common_commands(self) -> List[str]:
        """Get list of saved common commands."""
        try:
            if self.settings_file.exists():
                with open(self.settings_file, 'r', encoding='utf-8') as f:
                    settings = json.load(f)
                    return settings.get('common_adb_commands', [])
        except Exception:
            pass
        return []
    
    def save_common_command(self, command: str) -> Tuple[bool, str]:
        """
        Add a command to the common commands list.
        
        Args:
            command: Command to save
            
        Returns:
            Tuple of (success: bool, message: str)
        """
        try:
            command = command.strip()
            if not command:
                return (False, "Command cannot be empty")
            
            # Load existing settings
            settings = {}
            if self.settings_file.exists():
                with open(self.settings_file, 'r', encoding='utf-8') as f:
                    settings = json.load(f)
            
            commands = settings.get('common_adb_commands', [])
            
            # Check if already exists
            if command in commands:
                return (False, "Command already exists in favorites")
            
            # Add new command
            commands.append(command)
            settings['common_adb_commands'] = commands
            
            # Save settings
            with open(self.settings_file, 'w', encoding='utf-8') as f:
                json.dump(settings, f, indent=2)
            
            return (True, f"Command saved to favorites")
            
        except Exception as e:
            return (False, f"Error saving command: {str(e)}")
    
    def remove_common_command(self, command: str) -> Tuple[bool, str]:
        """
        Remove a command from common commands.
        
        Args:
            command: Command to remove
            
        Returns:
            Tuple of (success: bool, message: str)
        """
        try:
            if not self.settings_file.exists():
                return (False, "No saved commands found")
            
            with open(self.settings_file, 'r', encoding='utf-8') as f:
                settings = json.load(f)
            
            commands = settings.get('common_adb_commands', [])
            
            if command not in commands:
                return (False, "Command not found in favorites")
            
            commands.remove(command)
            settings['common_adb_commands'] = commands
            
            with open(self.settings_file, 'w', encoding='utf-8') as f:
                json.dump(settings, f, indent=2)
            
            return (True, "Command removed from favorites")
            
        except Exception as e:
            return (False, f"Error removing command: {str(e)}")
