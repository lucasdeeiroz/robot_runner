import threading
import time
import subprocess
from queue import Queue
from dataclasses import dataclass, field
from typing import List, Callable

@dataclass
class ScheduledJob:
    """Represents a single test execution job."""
    id: int
    suite_path: str
    devices: List[str]
    run_time: str  # Format "HH:MM"
    frequency: str # "Daily", "Once"
    last_run: float = 0.0
    is_enabled: bool = True

class Scheduler:
    """Manages scheduling and execution of test jobs in a background thread."""
    def __init__(self, status_callback: Callable):
        self.jobs: List[ScheduledJob] = []
        self.status_callback = status_callback
        self._lock = threading.Lock()
        self._stop_event = threading.Event()
        self._thread: threading.Thread = None
        self.next_id = 1

    def start(self):
        """Starts the scheduler's background thread."""
        if self._thread is None or not self._thread.is_alive():
            self._stop_event.clear()
            self._thread = threading.Thread(target=self._run, daemon=True)
            self._thread.start()
            self.log_status("Scheduler started.")

    def stop(self):
        """Stops the scheduler's background thread."""
        if self._thread and self._thread.is_alive():
            self._stop_event.set()
            self._thread.join() # Wait for the thread to finish
            self.log_status("Scheduler stopped.")

    def add_job(self, suite_path: str, devices: List[str], run_time: str, frequency: str):
        """Adds a new job to the schedule."""
        with self._lock:
            job = ScheduledJob(
                id=self.next_id,
                suite_path=suite_path,
                devices=devices,
                run_time=run_time,
                frequency=frequency
            )
            self.jobs.append(job)
            self.next_id += 1
            self.log_status(f"Added job #{job.id} for suite {suite_path}.")

    def remove_job(self, job_id: int):
        """Removes a job from the schedule by its ID."""
        with self._lock:
            job_to_remove = next((j for j in self.jobs if j.id == job_id), None)
            if job_to_remove:
                self.jobs.remove(job_to_remove)
                self.log_status(f"Removed job #{job_id}.")

    def log_status(self, message: str):
        """Sends a status message to the UI via the callback."""
        timestamp = time.strftime("%Y-%m-%d %H:%M:%S")
        self.status_callback(f"[{timestamp}] {message}")

    def _run(self):
        """The main loop for the scheduler thread."""
        while not self._stop_event.is_set():
            now = time.localtime()
            current_time_str = time.strftime("%H:%M", now)
            
            with self._lock:
                for job in self.jobs:
                    if not job.is_enabled or job.run_time != current_time_str:
                        continue

                    # Check if it has already run today
                    is_already_run_today = time.strftime('%Y-%m-%d', time.localtime(job.last_run)) == time.strftime('%Y-%m-%d', now)
                    if is_already_run_today:
                        continue

                    # Execute the job
                    self.log_status(f"Executing job #{job.id}: {job.suite_path}")
                    self._execute_job(job)
                    job.last_run = time.time()
                    
                    if job.frequency == "Once":
                        job.is_enabled = False
                        self.log_status(f"Job #{job.id} was a one-time job and is now disabled.")

            # Wait for 30 seconds before checking again to avoid busy-waiting
            time.sleep(30)

    def _execute_job(self, job: ScheduledJob):
        """
        Placeholder for the actual Robot Framework execution logic.
        In a real implementation, this would build and run the 'robot' command.
        """
        for device_udid in job.devices:
            self.log_status(f"  -> Running on device {device_udid}...")
            # Example command structure (to be replaced with real execution)
            command = f'robot -d logs/{job.id} -v udid:"{device_udid}" "{job.suite_path}"'
            self.log_status(f"  -> Command: {command}")
            # In a real app, you would use subprocess.Popen and handle output.
            time.sleep(5) # Simulate test run time
        self.log_status(f"Finished job #{job.id}.")