import threading
from queue import Queue, Empty
from pathlib import Path
from typing import Optional

class LogWriter:
    """
    A thread-safe log writer that processes write requests in a background thread.
    This prevents file I/O operations from blocking the main UI thread.
    """
    def __init__(self):
        self._write_queue = Queue()
        self._stop_event = threading.Event()
        self._writer_thread: Optional[threading.Thread] = None

    def start(self):
        """Starts the background writer thread."""
        if self._writer_thread and self._writer_thread.is_alive():
            return
        self._stop_event.clear()
        self._writer_thread = threading.Thread(target=self._process_queue, daemon=True, name="LogWriterThread")
        self._writer_thread.start()

    def stop(self):
        """Stops the background writer thread after processing remaining items."""
        self._stop_event.set()
        if self._writer_thread:
            self._writer_thread.join(timeout=2.0)

    def write(self, file_path: Path, content: str, mode: str = 'a', encoding: str = 'utf-8'):
        """
        Queues a write operation.
        
        Args:
            file_path: The Path to the file.
            content: The string content to write.
            mode: File open mode ('a' for append, 'w' for write). Default is 'a'.
            encoding: File encoding. Default is 'utf-8'.
        """
        self._write_queue.put({
            'path': file_path,
            'content': content,
            'mode': mode,
            'encoding': encoding
        })

    def _process_queue(self):
        """The main loop for the writer thread."""
        while not self._stop_event.is_set() or not self._write_queue.empty():
            try:
                # Wait for an item, but timeout occasionally to check stop_event
                item = self._write_queue.get(timeout=0.5)
            except Empty:
                continue

            try:
                # optimization: Check if the *next* item is for the same file and mode, 
                # and batch them if possible. 
                # (Simple implementation for now: just write one by one to ensure safety)
                
                with open(item['path'], item['mode'], encoding=item['encoding']) as f:
                    f.write(item['content'])
                    
                    # Opportunistic batching: see if more items for the same file are immediately available
                    while not self._write_queue.empty():
                        try:
                            # Peek at the next item without removing yet? No, queue doesn't support peek easily.
                            # We can just get it. If it doesn't match, we put it back or handle it.
                            # For simplicity and robustness, let's keep it simple: one open/write per item 
                            # unless we implement a more complex buffering strategy.
                            # Given OS file caching, opening/closing frequently is okay-ish, 
                            # but holding the file open would be better.
                            pass
                        except Exception:
                            break
            
            except Exception as e:
                print(f"LogWriter Error writing to {item.get('path')}: {e}")
            finally:
                self._write_queue.task_done()
