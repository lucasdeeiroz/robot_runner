import ttkbootstrap as ttk
from ttkbootstrap.constants import *

class Toast(ttk.Toplevel):
    """
    A non-intrusive notification window (toast) that appears at the
    bottom-right of the parent window and fades out after a delay.
    """
    def __init__(self, parent, title: str, message: str, bootstyle: str = "default", duration: int = 3000):
        super().__init__(alpha=0.0)
        self.parent = parent
        self.duration = duration
        self.bootstyle = bootstyle

        self.withdraw() # Remain hidden until we are ready to show
        self.overrideredirect(True) # No window decorations

        # Create widgets
        main_frame = ttk.Frame(self, bootstyle=self.bootstyle, padding=10)
        main_frame.pack(fill=BOTH, expand=YES)

        title_label = ttk.Label(main_frame, text=title, font="-weight bold", bootstyle=f"{self.bootstyle}-inverse")
        title_label.pack(fill=X)

        message_label = ttk.Label(main_frame, text=message, bootstyle=f"{self.bootstyle}-inverse")
        message_label.pack(fill=X, pady=(5, 0))

        self.update_idletasks() # Ensure widgets are created and sized

        self._set_position()
        self.deiconify() # Show the window
        self.after(10, self._fade_in)

    def _set_position(self):
        parent_x = self.parent.winfo_x()
        parent_y = self.parent.winfo_y()
        parent_w = self.parent.winfo_width()
        parent_h = self.parent.winfo_height()

        self_w = self.winfo_width()
        self_h = self.winfo_height()

        x = parent_x + parent_w - self_w - 20
        y = parent_y + parent_h - self_h - 20
        self.geometry(f"+{x}+{y}")

    def _fade_in(self):
        self.attributes("-alpha", 1.0)
        self.after(self.duration, self.destroy)