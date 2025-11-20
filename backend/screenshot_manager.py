"""
Screenshot and Screen Recording manager for Android devices.
"""
import subprocess
import time
import uuid
from pathlib import Path
from typing import Optional, Tuple


class ScreenshotManager:
    """Handles screenshot capture and screen recording for Android devices."""
    
    def __init__(self, screenshots_dir: Path, recordings_dir: Path):
        self.screenshots_dir = screenshots_dir
        self.recordings_dir = recordings_dir
        self.screenshots_dir.mkdir(exist_ok=True, parents=True)
        self.recordings_dir.mkdir(exist_ok=True, parents=True)
        self.active_recordings = {}  # udid -> process
    
    def take_screenshot(self, udid: str) -> Tuple[bool, str, Optional[str]]:
        """
        Capture a screenshot from the device.
        
        Args:
            udid: Device UDID
            
        Returns:
            Tuple of (success: bool, message: str, filename: Optional[str])
        """
        try:
            timestamp = time.strftime("%Y%m%d_%H%M%S")
            filename = f"screenshot_{udid.replace(':', '-')}_{timestamp}.png"
            filepath = self.screenshots_dir / filename
            
            # Use exec-out for direct screenshot capture (faster than pull)
            cmd = f'adb -s {udid} exec-out screencap -p > "{filepath}"'
            result = subprocess.run(
                cmd,
                shell=True,
                capture_output=True,
                timeout=10
            )
            
            if result.returncode == 0 and filepath.exists() and filepath.stat().st_size > 0:
                return (True, f"Screenshot saved: {filename}", filename)
            else:
                return (False, "Failed to capture screenshot", None)
                
        except subprocess.TimeoutExpired:
            return (False, "Screenshot timeout", None)
        except Exception as e:
            return (False, f"Error: {str(e)}", None)
    
    def start_recording(self, udid: str, max_duration: int = 180) -> Tuple[bool, str]:
        """
        Start screen recording on the device.
        
        Args:
            udid: Device UDID
            max_duration: Maximum recording duration in seconds (default 180 = 3 min)
            
        Returns:
            Tuple of (success: bool, message: str)
        """
        if udid in self.active_recordings:
            return (False, "Recording already in progress for this device")
        
        try:
            device_path = f"/sdcard/recording_{int(time.time())}.mp4"
            
            # Start recording in background
            cmd = f"adb -s {udid} shell screenrecord --time-limit {max_duration} {device_path}"
            process = subprocess.Popen(
                cmd,
                shell=True,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE
            )
            
            self.active_recordings[udid] = {
                'process': process,
                'device_path': device_path
            }
            
            return (True, f"Recording started (max {max_duration}s)")
            
        except Exception as e:
            return (False, f"Error starting recording: {str(e)}")
    
    def stop_recording(self, udid: str) -> Tuple[bool, str, Optional[str]]:
        """
        Stop screen recording and pull the file.
        
        Args:
            udid: Device UDID
            
        Returns:
            Tuple of (success: bool, message: str, filename: Optional[str])
        """
        if udid not in self.active_recordings:
            return (False, "No active recording for this device", None)
        
        try:
            recording_info = self.active_recordings[udid]
            process = recording_info['process']
            device_path = recording_info['device_path']
            
            # Stop recording by terminating process
            process.terminate()
            try:
                process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                process.kill()
            
            # Wait a bit for file to finalize
            time.sleep(2)
            
            # Pull the recording
            timestamp = time.strftime("%Y%m%d_%H%M%S")
            filename = f"recording_{udid.replace(':', '-')}_{timestamp}.mp4"
            filepath = self.recordings_dir / filename
            
            pull_cmd = f'adb -s {udid} pull {device_path} "{filepath}"'
            pull_result = subprocess.run(
                pull_cmd,
                shell=True,
                capture_output=True,
                timeout=30
            )
            
            # Clean up device storage
            subprocess.run(
                f"adb -s {udid} shell rm {device_path}",
                shell=True,
                capture_output=True,
                timeout=5
            )
            
            # Clean up tracking
            del self.active_recordings[udid]
            
            if pull_result.returncode == 0 and filepath.exists():
                return (True, f"Recording saved: {filename}", filename)
            else:
                return (False, "Failed to pull recording from device", None)
                
        except Exception as e:
            # Clean up on error
            if udid in self.active_recordings:
                del self.active_recordings[udid]
            return (False, f"Error stopping recording: {str(e)}", None)
    
    def is_recording(self, udid: str) -> bool:
        """Check if a device is currently recording."""
        return udid in self.active_recordings
