import re
import threading
import time
from queue import Queue
from typing import Set

from .shell_manager import AdbShellManager


def get_surface_view_name(shell_manager: AdbShellManager, udid: str, app_package: str) -> str:
    """Finds the full name of the SurfaceView layer for the app package using a persistent shell."""
    output = shell_manager.execute(udid, "dumpsys SurfaceFlinger --list")
    blast_match = re.search(r'(SurfaceView\[.*?{}\S*?\(BLAST\)#\d+)'.format(re.escape(app_package)), output)
    if blast_match:
        return blast_match.group(1)
    match = re.search(r'(SurfaceView\[.*?{}.*?#\d+)'.format(re.escape(app_package)), output)
    return match.group(1) if match else ""

def get_surface_fps(shell_manager: AdbShellManager, udid: str, surface_name: str, last_timestamps: Set[int]) -> tuple[str, Set[int]]:
    """Calculates FPS by comparing frame timestamps using a persistent shell."""
    if not surface_name:
        return "N/A", last_timestamps
    output = shell_manager.execute(udid, f"dumpsys SurfaceFlinger --latency '{surface_name}'")
    lines = output.splitlines()
    current_timestamps = {int(parts[2]) for line in lines[1:] if len(parts := line.split()) == 3 and parts[0] != '0'}
    if not last_timestamps:
        return "0.00", current_timestamps
    new_frames_count = len(current_timestamps - last_timestamps)
    return f"{float(new_frames_count):.2f}", current_timestamps

def run_performance_monitor(shell_manager: AdbShellManager, udid: str, app_package: str, output_queue: Queue, stop_event: threading.Event):
    """Continuously monitors app performance and puts the output in a queue."""
    try:
        output_queue.put(f"Starting monitoring for app '{app_package}' on device '{udid}'...\n")
        header = f"{'Timestamp':<10} | {'Elapsed':<10} | {'CPU':<5} | {'RAM':<7} | {'GPU':<10} | {'Missed Vsync':<1} | {'Janky':<15} | {'FPS':<4}\n"
        output_queue.put(header)
        output_queue.put("-" * len(header) + "\n")

        # Reset gfxinfo once at the beginning
        shell_manager.execute(udid, f"dumpsys gfxinfo {app_package} reset")
        time.sleep(0.2)

        last_timestamps = set()
        start_time = time.time()

        while not stop_event.is_set():
            # --- RAM Usage ---
            ram_output = shell_manager.execute(udid, f"dumpsys meminfo {app_package}")
            ram_mb = "N/A"
            if "TOTAL" in ram_output and (match := re.search(r"TOTAL\s+(\d+)", ram_output)):
                ram_mb = f"{int(match.group(1)) / 1024:.2f}"

            # --- CPU Usage ---
            cpu_output = shell_manager.execute(udid, "top -n 1 -b")
            cpu_percent = "N/A"
            if "Error" not in cpu_output and "not found" not in cpu_output:
                for line in cpu_output.splitlines():
                    if app_package in line:
                        parts = line.strip().split()
                        cpu_percent = parts[8] if len(parts) > 8 else "N/A"
                        break
            
            # --- Graphics Info (Jank, GPU, Vsync) ---
            gfx_output = shell_manager.execute(udid, f"dumpsys gfxinfo {app_package}")
            jank_info = "0.00% (0/0)"
            if jank_match := re.search(r"Janky frames: (\d+) \(([\d.]+)%\)", gfx_output):
                total_frames_match = re.search(r"Total frames rendered: (\d+)", gfx_output)
                total_frames = total_frames_match.group(1) if total_frames_match else '?'
                jank_info = f"{jank_match.group(2)}% ({jank_match.group(1)}/{total_frames})"

            gpu_mem_kb = "N/A"
            if gpu_mem_match := re.search(r"Total GPU memory usage:\s+\d+ bytes, ([\d.]+) (KB|MB)", gfx_output):
                value, unit = float(gpu_mem_match.group(1)), gpu_mem_match.group(2)
                gpu_mem_kb = f"{value * 1024:.2f}" if unit == "MB" else f"{value:.2f}"

            missed_vsync_match = re.search(r"Number Missed Vsync: (\d+)", gfx_output)
            missed_vsync = missed_vsync_match.group(1) if missed_vsync_match else "N/A"

            # --- FPS Calculation ---
            surface_name = get_surface_view_name(shell_manager, udid, app_package)
            surface_fps, last_timestamps = get_surface_fps(shell_manager, udid, surface_name, last_timestamps)

            perf_data = {
                "ts": time.strftime("%H:%M:%S"),
                "elapsed": time.strftime(
                    "%M:%S", time.gmtime(time.time() - start_time)
                ),
                "cpu": cpu_percent,
                "ram": ram_mb,
                "gpu": gpu_mem_kb,
                "vsync": missed_vsync,
                "janky": jank_info,
                "fps": surface_fps
            }
            output_queue.put(perf_data)
            
            time.sleep(1)

    except Exception as e:
        output_queue.put(f"ERROR in monitoring loop: {e}. Retrying...\n")