import json
from pathlib import Path
from typing import Dict

# --- Module-level state ---

# This will hold the loaded translation strings.
_translations: Dict[str, str] = {}

# This will be set by the main application entry point. It tells us where to find the 'locales' folder.
_base_path: Path = Path(__file__).resolve().parent

def set_language_base_path(path: Path):
    """
    Sets the base path for finding language files.
    This is crucial for the compiled version to find its data files.
    """
    global _base_path
    _base_path = path

def load_language(language: str):
    """
    Loads a language file (.json) into the global translations dictionary.
    It uses the _base_path to construct the correct path to the locales folder.
    """
    global _translations
    
    # Construct the path to the language file relative to the base path.
    lang_file = _base_path / "src" / "locales" / f"{language}.json"
    
    if lang_file.exists():
        with open(lang_file, 'r', encoding='utf-8') as f:
            _translations = json.load(f)
    else:
        # Fallback to an empty dictionary if the language file is not found.
        _translations = {}
        print(f"Warning: Language file not found at '{lang_file}'")

def gettext(key: str, **kwargs) -> str:
    """Retrieves a translated string by its key, falling back to the key itself."""
    translated = _translations.get(key, key)
    return translated.format(**kwargs) if kwargs else translated