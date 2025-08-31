from pydantic import BaseModel
from typing import Optional

class Device(BaseModel):
    """Represents a connected Android device."""
    udid: str
    model: str
    release: str
    status: str = "Online"
    battery: Optional[str] = None