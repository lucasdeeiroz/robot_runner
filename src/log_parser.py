import datetime
import re
from pathlib import Path
from typing import Optional


def get_generation_time(xml_file: Path) -> Optional[datetime.datetime]:
    """
    Quickly gets the 'generated' timestamp from an output.xml file using regex for performance.
    Falls back to the file's modification time if regex fails.
    """
    try:
        with open(xml_file, 'r', encoding='utf-8', errors='ignore') as f:
            # Read only the first 512 bytes, as the 'generated' attribute is near the start.
            chunk = f.read(512)
            match = re.search(r'generated="(\d{8} \d{2}:\d{2}:\d{2}\.\d{3,})"', chunk)
            if match:
                generated_str = match.group(1)
                return datetime.datetime.strptime(generated_str, '%Y%m%d %H:%M:%S.%f')
    except (IOError, ValueError):
        pass  # Ignore errors and fall back to mtime.

    try:
        return datetime.datetime.fromtimestamp(xml_file.stat().st_mtime)
    except Exception:
        return None