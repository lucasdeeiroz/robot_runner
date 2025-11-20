"""
File browser for navigating test suites and robot files.
"""
from pathlib import Path
from typing import List, Dict, Optional


class FileBrowser:
    """Handles file system navigation for test selection."""
    
    def __init__(self, base_suites_dir: Path, base_tests_dir: Path):
        self.base_suites_dir = base_suites_dir
        self.base_tests_dir = base_tests_dir
    
    def list_directory(self, current_path: str, mode: str = "suite") -> Dict:
        """
        Lists contents of a directory for test/suite selection.
        
        Args:
            current_path: Relative path from base directory
            mode: "suite" for .txt files, "test" for .robot files
            
        Returns:
            Dict with 'items', 'current_path', and 'can_go_up'
        """
        base_dir = self.base_suites_dir if mode == "suite" else self.base_tests_dir
        
        # Resolve the target directory
        if current_path == "" or current_path == ".":
            target_dir = base_dir
        else:
            target_dir = base_dir / current_path
        
        # Security: ensure target is within base directory
        try:
            target_dir = target_dir.resolve()
            base_dir = base_dir.resolve()
            if not str(target_dir).startswith(str(base_dir)):
                raise ValueError("Path traversal attempt detected")
        except (ValueError, OSError):
            # Return base directory on error
            target_dir = base_dir
            current_path = ""
        
        if not target_dir.exists() or not target_dir.is_dir():
            target_dir = base_dir
            current_path = ""
        
        # Determine file extension to filter
        file_ext = ".txt" if mode == "suite" else ".robot"
        
        # List directory contents
        items = []
        try:
            for item in sorted(target_dir.iterdir(), key=lambda p: (not p.is_dir(), p.name.lower())):
                if item.is_dir():
                    items.append({
                        "name": item.name,
                        "type": "directory",
                        "path": str(Path(current_path) / item.name) if current_path else item.name
                    })
                elif item.suffix == file_ext:
                    items.append({
                        "name": item.name,
                        "type": "file",
                        "path": str(Path(current_path) / item.name) if current_path else item.name
                    })
        except PermissionError:
            pass
        
        # Check if can navigate up
        can_go_up = target_dir != base_dir
        
        return {
            "items": items,
            "current_path": current_path,
            "can_go_up": can_go_up,
            "base_dir": str(base_dir)
        }
    
    def get_absolute_path(self, relative_path: str, mode: str = "suite") -> Optional[Path]:
        """
        Converts a relative path to absolute path.
        
        Args:
            relative_path: Relative path from base directory
            mode: "suite" or "test"
            
        Returns:
            Absolute Path object or None if invalid
        """
        base_dir = self.base_suites_dir if mode == "suite" else self.base_tests_dir
        
        try:
            abs_path = (base_dir / relative_path).resolve()
            # Security check
            if not str(abs_path).startswith(str(base_dir.resolve())):
                return None
            if abs_path.exists():
                return abs_path
        except (ValueError, OSError):
            pass
        
        return None
