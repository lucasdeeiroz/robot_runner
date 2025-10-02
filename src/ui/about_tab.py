import ttkbootstrap as ttk
from ttkbootstrap.scrolled import ScrolledText
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
        about_frame.pack(fill=ttk.BOTH, expand=ttk.YES, padx=10, pady=5)

        title_label = ttk.Label(about_frame, text=translate("about_title"), font="-size 20 -weight bold")
        title_label.pack(pady=(0, 10))
        ToolTip(title_label, translate("app_author_tooltip"))

        desc_label = ttk.Label(about_frame, text=translate("about_subtitle"), wraplength=500)
        desc_label.pack(pady=(0, 20))

        tools_frame = ttk.LabelFrame(about_frame, text=translate("acknowledgements"), padding=10)
        tools_frame.pack(fill=ttk.X, pady=5)

        tools_text = translate("acknowledgements_text")
        ttk.Label(tools_frame, text=tools_text, justify=ttk.LEFT).pack(anchor=ttk.W)

        license_frame = ttk.LabelFrame(about_frame, text=translate("license"), padding=10)
        license_frame.pack(fill=ttk.BOTH, expand=ttk.YES, pady=5)
        
        license_text_widget = ScrolledText(license_frame, wrap=ttk.WORD, autohide=True)
        license_text_widget.pack(fill=ttk.BOTH, expand=ttk.YES)
        license_text_widget.text.insert(ttk.END, translate("mit_license_text"))
        license_text_widget.text.config(state=ttk.DISABLED)