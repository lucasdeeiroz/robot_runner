import ttkbootstrap as ttk
from ttkbootstrap.scrolled import ScrolledText
from ttkbootstrap.constants import BOTH, END, YES, WORD, DISABLED, LEFT, X, W
from ttkbootstrap.tooltip import ToolTip

from src.locales.i18n import gettext as translate


class AboutTabPage(ttk.Frame):
    """UI and logic for the 'About' tab."""
    def __init__(self, parent, app):
        super().__init__(parent, padding=10)
        self.app = app
        self._setup_widgets()

    def _setup_widgets(self):
        about_frame = ttk.Frame(self)
        about_frame.pack(fill=BOTH, expand=YES, padx=10, pady=5)

        title_label = ttk.Label(about_frame, text=translate("about_title"), font="-size 24 -weight bold")
        title_label.pack(pady=(0, 10))
        ToolTip(title_label, translate("app_author_tooltip"))

        desc_label = ttk.Label(about_frame, text=translate("about_subtitle"), wraplength=500)
        desc_label.pack(pady=(0, 20))

        ttk.Label(about_frame, text=translate("acknowledgements"), font="-weight bold").pack(anchor=W, pady=(10, 5))
        ttk.Label(about_frame, text=translate("acknowledgements_text"), justify=LEFT).pack(anchor=W, fill=X)

        ttk.Label(about_frame, text=translate("license"), font="-weight bold").pack(anchor=W, pady=(20, 5))
        license_frame = ttk.Frame(about_frame, padding=0, borderwidth=0)
        license_frame.pack(fill=BOTH, expand=YES)
        
        license_text_widget = ScrolledText(license_frame, wrap=WORD, autohide=True)
        license_text_widget.pack(fill=BOTH, expand=YES)
        license_text_widget.text.insert(END, translate("mit_license_text"))
        license_text_widget.text.config(state=DISABLED)