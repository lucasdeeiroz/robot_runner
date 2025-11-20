import subprocess
import sys
import os
import xml.etree.ElementTree as ET
from pathlib import Path
import uuid
from typing import Dict, List, Optional, Tuple

# Add src to path
sys.path.append(str(Path(__file__).parent.parent))
from src.app_utils import execute_command

class InspectorManager:
    def __init__(self, static_dir: Path):
        self.static_dir = static_dir
        self.static_dir.mkdir(parents=True, exist_ok=True)

    def capture(self, udid: str) -> Dict:
        """
        Captures screenshot and UI hierarchy, returns paths and parsed elements.
        """
        filename_base = f"inspector_{udid.replace(':', '-')}_{uuid.uuid4().hex[:8]}"
        
        # 1. Screenshot
        dev_sc_path = f"/sdcard/{filename_base}.png"
        local_sc_name = f"{filename_base}.png"
        local_sc_path = self.static_dir / local_sc_name
        
        execute_command(f"adb -s {udid} shell screencap -p {dev_sc_path}")
        execute_command(f"adb -s {udid} pull {dev_sc_path} \"{local_sc_path}\"")
        execute_command(f"adb -s {udid} shell rm {dev_sc_path}")

        # 2. UI Dump
        dev_dump_path = f"/sdcard/{filename_base}.xml"
        local_dump_path = self.static_dir / f"{filename_base}.xml"
        
        # Try standard dump
        success, _ = execute_command(f"adb -s {udid} shell uiautomator dump {dev_dump_path}")
        if not success or "ERROR" in _:
             # Fallback or retry logic could go here
             return {"error": "Failed to dump UI hierarchy"}

        execute_command(f"adb -s {udid} pull {dev_dump_path} \"{local_dump_path}\"")
        execute_command(f"adb -s {udid} shell rm {dev_dump_path}")

        # 3. Parse XML
        elements = []
        if local_dump_path.exists():
            try:
                tree = ET.parse(local_dump_path)
                root = tree.getroot()
                elements = self._parse_nodes(root)
                # Clean up XML file, keep screenshot
                local_dump_path.unlink()
            except Exception as e:
                print(f"Error parsing XML: {e}")

        return {
            "screenshot": f"/static/{local_sc_name}",
            "elements": elements
        }

    def _parse_nodes(self, root) -> List[Dict]:
        elements = []
        for node in root.iter():
            if node.tag == 'node':
                bounds = node.get('bounds')
                if bounds:
                    # Parse bounds [x1,y1][x2,y2]
                    try:
                        coords = bounds.replace('][', ',').replace('[', '').replace(']', '').split(',')
                        x1, y1, x2, y2 = map(int, coords)
                        
                        elements.append({
                            "class": node.get('class'),
                            "resource-id": node.get('resource-id'),
                            "text": node.get('text'),
                            "content-desc": node.get('content-desc'),
                            "bounds": [x1, y1, x2, y2],
                            "package": node.get('package'),
                            "checkable": node.get('checkable') == 'true',
                            "checked": node.get('checked') == 'true',
                            "clickable": node.get('clickable') == 'true',
                            "enabled": node.get('enabled') == 'true',
                            "focusable": node.get('focusable') == 'true',
                            "focused": node.get('focused') == 'true',
                            "scrollable": node.get('scrollable') == 'true',
                            "long-clickable": node.get('long-clickable') == 'true',
                            "password": node.get('password') == 'true',
                            "selected": node.get('selected') == 'true'
                        })
                    except:
                        pass
        return elements
