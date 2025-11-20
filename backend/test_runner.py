import asyncio
import subprocess
import sys
from pathlib import Path
from typing import AsyncGenerator, Optional

# Add src to path to import existing utils
sys.path.append(str(Path(__file__).parent.parent))
from src.device_utils import get_device_properties

class TestRunner:
    def __init__(self):
        self.process: Optional[subprocess.Popen] = None

    async def run_test(self, test_path: str, udid: str, mode: str = "Suite") -> AsyncGenerator[str, None]:
        """
        Runs a Robot Framework test and yields output lines.
        """
        device_info = get_device_properties(udid)
        if not device_info:
            yield f"Error: Could not get device info for {udid}\n"
            return

        suite_name = Path(test_path).stem
        
        # Base command
        # Use sys.executable -m robot to ensure we use the same environment as the running process
        cmd = f'"{sys.executable}" -m robot --logtitle "{device_info["release"]} - {device_info["model"]}" -v udid:"{udid}" -v deviceName:"{device_info["model"]}" -v versao_OS:"{device_info["release"]}" --outputdir "logs/{suite_name}" --name "{suite_name}"'
        
        if mode == "Suite":
            cmd += f' --argumentfile "{test_path}"'
        else:
            cmd += f' "{test_path}"'

        yield f"Executing: {cmd}\n"

        try:
            # Use synchronous Popen with asyncio.to_thread for reading
            # This avoids asyncio.create_subprocess_shell issues on Windows
            creationflags = subprocess.CREATE_NO_WINDOW if sys.platform == "win32" else 0
            
            self.process = subprocess.Popen(
                cmd,
                shell=True,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                encoding='utf-8',
                errors='replace',
                creationflags=creationflags,
                cwd=str(Path(__file__).parent.parent)
            )

            # Read stdout line by line in a thread to avoid blocking the event loop
            while True:
                if self.process.poll() is not None:
                    # Process ended, read remaining output
                    remaining = await asyncio.to_thread(self.process.stdout.read)
                    if remaining:
                        yield remaining
                    break

                line = await asyncio.to_thread(self.process.stdout.readline)
                if line:
                    yield line
                else:
                    # No line read, check if process is still running
                    if self.process.poll() is not None:
                        break
                    await asyncio.sleep(0.1)

            return_code = self.process.wait()
            yield f"Test finished with return code {return_code}\n"

        except Exception as e:
            import traceback
            yield f"Error running test: {repr(e)}\n"
            yield f"Traceback: {traceback.format_exc()}\n"
        finally:
            self.process = None

    async def stop_test(self):
        if self.process:
            self.process.terminate()
            # Wait for it to actually terminate
            try:
                await asyncio.to_thread(self.process.wait)
            except Exception:
                pass
