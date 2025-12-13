import threading
import tkinter as tk
import ttkbootstrap as ttk
from ttkbootstrap.constants import BOTH, YES, WORD, DISABLED, END, X, NORMAL, LEFT, RIGHT
from ttkbootstrap.scrolled import ScrolledText
from src.locales.i18n import gettext as translate

class AiTabPage(ttk.Frame):
    """UI for the AI Assistant features."""
    def __init__(self, parent, app):
        super().__init__(parent, padding=10)
        self.app = app
        self._setup_widgets()

    def _setup_widgets(self):
        # Title
        ttk.Label(self, text="AI Assistant", font="-weight bold").pack(anchor="w", pady=(0, 10))

        # Prompt Input
        ttk.Label(self, text="Requirement / Prompt:").pack(anchor="w", pady=(0, 5))
        
        input_frame = ttk.Frame(self)
        input_frame.pack(fill=X, pady=(0, 10))
        
        # Content Type Selection
        type_frame = ttk.Frame(input_frame)
        type_frame.pack(fill=X, pady=(0, 5))
        
        ttk.Label(type_frame, text="Content Type:").pack(side="left", padx=(0, 5))
        
        # Map translated strings to internal keys
        self.type_mapping = {
            translate("ai_content_automated_test"): "automated_test",
            translate("ai_content_manual_test"): "manual_test",
            translate("ai_content_bug_report"): "bug_report"
        }
        
        display_values = list(self.type_mapping.keys())
        self.content_type_var = tk.StringVar(value=display_values[0])
        type_combo = ttk.Combobox(type_frame, textvariable=self.content_type_var, state="readonly", width=20)
        type_combo['values'] = display_values
        type_combo.pack(side="left")
        
        self.prompt_text = tk.Text(input_frame, height=3, wrap=WORD)
        self.prompt_text.pack(fill=X, expand=YES, pady=(5, 0))
        
        # Action Buttons Frame
        action_frame = ttk.Frame(input_frame)
        action_frame.pack(fill=X, pady=5)

        # Left aligned buttons
        self.map_project_button = ttk.Button(action_frame, text=translate("ai_map_project"), command=self._map_project, bootstyle="info")
        self.map_project_button.pack(side=LEFT, padx=(0, 5))
        
        self.capture_screen_button = ttk.Button(action_frame, text="Capture Screen", command=self._capture_screen, bootstyle="warning")
        self.capture_screen_button.pack(side=LEFT, padx=5)

        # Right aligned button
        self.gen_test_button = ttk.Button(action_frame, text="Generate Content", command=self._generate_content, bootstyle="success")
        self.gen_test_button.pack(side=RIGHT)

        # Output Area
        ttk.Label(self, text="Output:").pack(anchor="w", pady=(10, 5))
        
        output_frame = ttk.Frame(self)
        output_frame.pack(fill=BOTH, expand=YES)
        
        self.output_text = ScrolledText(output_frame, wrap=WORD, state=DISABLED, autohide=False)
        self.output_text.pack(fill=BOTH, expand=YES)

    def _map_project(self):
        self._log("Mapping project structure...")
        self.map_project_button.config(state=DISABLED)
        
        def run_map():
            try:
                # Collect target directories from settings
                target_dirs = [
                    self.app.tests_dir,
                    self.app.suites_dir,
                    self.app.resources_dir
                ]
                
                self.app.ai_assistant.initialize_project_analyzer(self.app.current_path, cache_dir=self.app.logs_dir, target_directories=target_dirs)
                context = self.app.ai_assistant.analyze_project()
                
                # Count items
                files_count = len(context.get("files", {}))
                self.app.root.after(0, lambda: self._log(f"Project mapped successfully. Analyzed {files_count} files."))
            except Exception as e:
                self.app.root.after(0, lambda: self._log(f"Error mapping project: {e}"))
            finally:
                self.app.root.after(0, lambda: self.map_project_button.config(state=NORMAL))

        threading.Thread(target=run_map, daemon=True).start()

    def _capture_screen(self):
        # Get selected device from Run Tab
        try:
            selected_indices = self.app.run_tab.device_listbox.curselection()
            if not selected_indices:
                self._log("Error: No device selected in Run tab.")
                return
            
            device_str = self.app.run_tab.device_listbox.get(selected_indices[0])
            udid = device_str.split(" | ")[-1].split(" ")[0]
        except Exception as e:
             self._log(f"Error getting selected device: {e}")
             return

        self._log(f"Capturing screen from {udid}...")
        self.capture_screen_button.config(state=DISABLED)

        def run_capture():
            try:
                result = self.app.ai_assistant.capture_screen(udid, self.app.logs_dir)
                self.app.root.after(0, lambda: self._log(result))
            except Exception as e:
                self.app.root.after(0, lambda: self._log(f"Error capturing screen: {e}"))
            finally:
                self.app.root.after(0, lambda: self.capture_screen_button.config(state=NORMAL))

        threading.Thread(target=run_capture, daemon=True).start()

    def _generate_content(self):
        requirement = self.prompt_text.get("1.0", END).strip()
        selected_text = self.content_type_var.get()
        content_type = self.type_mapping.get(selected_text, "automated_test")
        
        if not requirement:
            self._log("Please enter a requirement.")
            return

        self._log(f"Generating {content_type} for: {requirement}...")
        self.gen_test_button.config(state=DISABLED)
        
        def run_gen():
            try:
                result = self.app.ai_assistant.generate_ai_content(requirement, content_type)
                self.app.root.after(0, lambda: self._log("Generation Complete:\n" + "-"*20 + "\n" + result + "\n" + "-"*20))
            except Exception as e:
                self.app.root.after(0, lambda: self._log(f"Error generating content: {e}"))
            finally:
                self.app.root.after(0, lambda: self.gen_test_button.config(state=NORMAL))

        threading.Thread(target=run_gen, daemon=True).start()

    def _log(self, message: str):
        self.output_text.text.config(state=NORMAL)
        self.output_text.text.insert(END, message + "\n")
        self.output_text.text.config(state=DISABLED)
        self.output_text.text.see(END)
