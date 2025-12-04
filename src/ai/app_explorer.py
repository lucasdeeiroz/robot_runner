import json
import subprocess
import os
import xml.etree.ElementTree as ET
from pathlib import Path
from typing import Dict, Optional, List

class AppExplorer:
    """
    Explores the application state (via screenshots/XML) to build a context for AI generation.
    """
    def __init__(self, cache_dir: Path):
        self.cache_dir = cache_dir
        self.context_file = self.cache_dir / "app_context.json"
        self.context = self._load_context()

    def _load_context(self) -> Dict:
        """Loads existing context from file if available."""
        if self.context_file.exists():
            try:
                with open(self.context_file, 'r', encoding='utf-8') as f:
                    return json.load(f)
            except Exception:
                return {}
        return {}

    def _save_context(self):
        """Saves the current context to file."""
        self.cache_dir.mkdir(parents=True, exist_ok=True)
        with open(self.context_file, 'w', encoding='utf-8') as f:
            json.dump(self.context, f, indent=2, ensure_ascii=False)

    def capture_screen_state(self, device_id: str) -> str:
        """
        Captures the screen state for the given device.
        Uses adb to get the XML hierarchy and parses it.
        """
        try:
            # 1. Dump UI hierarchy
            dump_cmd = f"adb -s {device_id} shell uiautomator dump /sdcard/window_dump.xml"
            subprocess.run(dump_cmd, shell=True, check=True, capture_output=True)

            # 2. Pull the XML file
            local_xml_path = self.cache_dir / f"dump_{device_id}.xml"
            pull_cmd = f"adb -s {device_id} pull /sdcard/window_dump.xml \"{local_xml_path}\""
            subprocess.run(pull_cmd, shell=True, check=True, capture_output=True)

            # 3. Parse XML
            if local_xml_path.exists():
                ui_elements = self._parse_ui_hierarchy(local_xml_path)
                
                # Update context
                self.context["last_device"] = device_id
                self.context["ui_elements"] = ui_elements
                self.context["last_capture_time"] = str(os.path.getmtime(local_xml_path))
                
                self._save_context()
                
                # Cleanup
                os.remove(local_xml_path)
                
                return f"Screen state captured for {device_id}. Found {len(ui_elements)} interactive elements."
            else:
                return f"Error: Failed to pull UI dump from {device_id}."

        except subprocess.CalledProcessError as e:
            return f"Error communicating with device {device_id}: {e}"
        except Exception as e:
            return f"Error capturing screen state: {e}"

    def _parse_ui_hierarchy(self, xml_path: Path) -> List[Dict]:
        """Parses the UI XML and returns a list of simplified elements."""
        elements = []
        try:
            tree = ET.parse(xml_path)
            root = tree.getroot()
            
            for node in root.iter('node'):
                # Extract relevant attributes
                resource_id = node.get('resource-id', '')
                text = node.get('text', '')
                content_desc = node.get('content-desc', '')
                class_name = node.get('class', '')
                bounds = node.get('bounds', '')
                checked = node.get('checked', 'false') == 'true'
                enabled = node.get('enabled', 'false') == 'true'
                
                # Filter for useful elements (must have some identifier or text)
                if resource_id or text or content_desc:
                    elements.append({
                        "resource_id": resource_id,
                        "text": text,
                        "content_desc": content_desc,
                        "class": class_name,
                        "bounds": bounds,
                        "checked": checked,
                        "enabled": enabled
                    })
        except Exception as e:
            print(f"Error parsing XML: {e}")
            
        return elements

    def get_context_summary(self) -> str:
        """Returns a summary string of the app context."""
        device = self.context.get('last_device', 'None')
        element_count = len(self.context.get('ui_elements', []))
        return f"App Context: Last captured device {device}. {element_count} UI elements identified."
