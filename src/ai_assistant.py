import os
import json
from pathlib import Path
from typing import List, Dict, Optional
import google.generativeai as genai
from src.ai.project_analyzer import ProjectAnalyzer
from src.ai.app_explorer import AppExplorer
from src.app_utils import CONFIG_DIR

class AIAssistant:
    """
    Handles AI-powered features for Robot Runner using Google Gemini.
    """
    def __init__(self, api_key: str, model_name: str = "gemini-2.5-flash"):
        self.api_key = api_key
        self.model_name = model_name
        self.project_analyzer: Optional[ProjectAnalyzer] = None
        self.app_explorer: Optional[AppExplorer] = None
        
        if self.api_key:
            try:
                genai.configure(api_key=self.api_key)
                self.model = genai.GenerativeModel(self.model_name)
            except Exception as e:
                print(f"Error configuring Gemini: {e}")
                self.model = None
        else:
            self.model = None

    def initialize_project_analyzer(self, project_root: Path, cache_dir: Path, target_directories: List[Path] = None):
        """Initializes the ProjectAnalyzer."""
        self.project_analyzer = ProjectAnalyzer(project_root, cache_dir)
        if target_directories:
            self.project_analyzer.set_target_directories(target_directories)

    def initialize_app_explorer(self, cache_dir: Path):
        """Initializes the AppExplorer."""
        self.app_explorer = AppExplorer(cache_dir)

    def analyze_project(self) -> Dict:
        """Runs project analysis and returns the context."""
        if self.project_analyzer:
            return self.project_analyzer.analyze_project()
        return {}

    def capture_screen(self, device_id: str, cache_dir: Path = CONFIG_DIR) -> str:
        """Captures the current screen state."""
        if not self.app_explorer:
            self.initialize_app_explorer(cache_dir)
        if self.app_explorer:
            return self.app_explorer.capture_screen_state(device_id)
        return "Error: App Explorer not initialized."

    def generate_ai_content(self, requirement: str, content_type: str = "automated_test") -> str:
        """
        Generates content based on a requirement, project context, and app context.
        content_type: 'automated_test', 'manual_test', or 'bug_report'
        """
        if not self.model:
            return "Error: Gemini API Key not configured or invalid."

        project_summary = ""
        if self.project_analyzer:
            project_summary = self.project_analyzer.get_context_summary()

        app_summary = ""
        if self.app_explorer:
            app_summary = self.app_explorer.get_context_summary()

        system_instruction = ""
        if content_type == "automated_test":
            system_instruction = """
You are an expert Robot Framework QA Engineer.
Your task is to generate a Robot Framework test case.
Use the Project Context to use existing keywords.
Use the App Context to identify locators.
Return ONLY the Robot Framework code.
"""
        elif content_type == "manual_test":
            system_instruction = """
You are an expert QA Engineer.
Your task is to generate a detailed manual test case.
Include: Title, Preconditions, Steps, and Expected Results.
Use the App Context to describe specific UI elements to interact with.
"""
        elif content_type == "bug_report":
            system_instruction = """
You are an expert QA Engineer.
Your task is to generate a bug report template based on the description.
Include: Title, Description, Steps to Reproduce, Expected Result, Actual Result.
Use the App Context to reference specific screens or elements involved.
"""

        prompt = f"""
{system_instruction}

Requirement/Description:
"{requirement}"

Project Context:
{project_summary}

App Context:
{app_summary}
"""
        try:
            response = self.model.generate_content(prompt)
            return response.text.strip()
        except Exception as e:
            return f"Error generating content: {e}"

    def generate_bug_report(self, logs: str, screenshot_path: str) -> str:
        """
        Generates a bug report based on logs and a screenshot.
        """
        # Placeholder for future implementation with multimodal capabilities
        return "Bug Report generation not yet implemented."
