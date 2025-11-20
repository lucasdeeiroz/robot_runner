"""
ADB Wireless connection manager for pairing and connecting devices over Wi-Fi.
"""
import subprocess
from typing import Optional, Tuple


class ADBWireless:
    """Handles wireless ADB operations (pair, connect, disconnect)."""
    
    def pair(self, ip: str, port: str, code: str) -> Tuple[bool, str]:
        """
        Pair with a device over wireless ADB.
        
        Args:
            ip: IP address of the device
            port: Pairing port (usually 6 digits in Developer Options)
            code: Pairing code (6 digits shown in Developer Options)
            
        Returns:
            Tuple of (success: bool, message: str)
        """
        try:
            cmd = f"adb pair {ip}:{port} {code}"
            result = subprocess.run(
                cmd, 
                shell=True, 
                capture_output=True, 
                text=True, 
                timeout=30
            )
            
            output = result.stdout + result.stderr
            success = result.returncode == 0 and ("Successfully paired" in output or "already paired" in output.lower())
            
            return (success, output.strip())
        except subprocess.TimeoutExpired:
            return (False, "Pairing timed out after 30 seconds")
        except Exception as e:
            return (False, f"Error during pairing: {str(e)}")
    
    def connect(self, ip: str, port: str = "5555") -> Tuple[bool, str]:
        """
        Connect to a device over wireless ADB.
        
        Args:
            ip: IP address of the device
            port: Connection port (usually 5555)
            
        Returns:
            Tuple of (success: bool, message: str)
        """
        try:
            cmd = f"adb connect {ip}:{port}"
            result = subprocess.run(
                cmd,
                shell=True,
                capture_output=True,
                text=True,
                timeout=30
            )
            
            output = result.stdout + result.stderr
            success = result.returncode == 0 and ("connected" in output.lower() or "already connected" in output.lower())
            
            return (success, output.strip())
        except subprocess.TimeoutExpired:
            return (False, "Connection timed out after 30 seconds")
        except Exception as e:
            return (False, f"Error during connection: {str(e)}")
    
    def disconnect(self, ip_port: str) -> Tuple[bool, str]:
        """
        Disconnect from a wireless ADB device.
        
        Args:
            ip_port: Full address in format "ip:port" (e.g. "192.168.1.100:5555")
            
        Returns:
            Tuple of (success: bool, message: str)
        """
        try:
            cmd = f"adb disconnect {ip_port}"
            result = subprocess.run(
                cmd,
                shell=True,
                capture_output=True,
                text=True,
                timeout=10
            )
            
            output = result.stdout + result.stderr
            success = result.returncode == 0
            
            return (success, output.strip())
        except subprocess.TimeoutExpired:
            return (False, "Disconnection timed out")
        except Exception as e:
            return (False, f"Error during disconnection: {str(e)}")
