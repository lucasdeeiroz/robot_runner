import json
import os
from typing import Dict, Any

translations: Dict[str, Any] = {}
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

def load_language(language_code: str = "en_US"):
    """Loads the translation file for the specified language."""
    global translations
    path = os.path.join(BASE_DIR, 'locales', f"{language_code}.json")
    
    try:
        with open(path, "r", encoding="utf-8") as f:
            translations = json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        # Fallback to English if the language file is not found or is invalid
        if language_code != "en_US":
            load_language("en_US")
        else:
            # If en_US is also missing, translations will be empty.
            translations = {}

def gettext(key: str, **kwargs) -> str:
    """
    Returns the translated string for the given key.
    If the key is not found, it returns the key itself.
    Supports placeholder replacement.
    """
    text = translations.get(key, key)
    if kwargs:
        try:
            return text.format(**kwargs)
        except (KeyError, TypeError):
            # Return the raw string if formatting fails
            return text
    return text
 
# Alias for clarity, allowing `translate()` to be used in the code.
translate = gettext
