from pydantic import BaseModel
from typing import List, Optional

class Device(BaseModel):
    udid: str
    model: str
    status: str
    release: Optional[str] = None

class TestRunRequest(BaseModel):
    devices: List[str]
    test_path: str
    mode: str
