import os
import json
import hashlib
from pathlib import Path
from typing import Dict, List, Any
try:
    from robot.api import get_model
    from robot.parsing.model.visitor import ModelVisitor
    from robot.parsing.model.blocks import Keyword, TestCase
    from robot.parsing.model.statements import Documentation, Arguments, LibraryImport, ResourceImport, Variable
except ImportError:
    # Fallback or handle missing robot framework (should be installed)
    get_model = None
    ModelVisitor = object

class ContextVisitor(ModelVisitor):
    """Visits the Robot Framework model to extract context."""
    def __init__(self):
        self.keywords = []
        self.tests = []
        self.variables = []
        self.libraries = []
        self.resources = []

    def visit_Keyword(self, node):
        args = []
        doc = ""
        for statement in node.body:
            if isinstance(statement, Arguments):
                args = [str(arg) for arg in statement.values]
            elif isinstance(statement, Documentation):
                doc = statement.value

        self.keywords.append({
            "name": node.name,
            "args": args,
            "doc": doc
        })

    def visit_TestCase(self, node):
        tags = []
        doc = ""
        # Note: In RF 4.0+, tags are in node.tags, but let's check body for Documentation
        for statement in node.body:
            if isinstance(statement, Documentation):
                doc = statement.value
        
        # Try to get tags if available (RF 4+)
        if hasattr(node, 'tags'):
            tags = list(node.tags)

        self.tests.append({
            "name": node.name,
            "tags": tags,
            "doc": doc
        })
    
    def visit_Variable(self, node):
        # node.name is like ${VAR}, node.value is a list of values
        self.variables.append({
            "name": node.name,
            "value": node.value
        })

    def visit_LibraryImport(self, node):
        self.libraries.append({
            "name": node.name,
            "args": [str(arg) for arg in node.args]
        })

    def visit_ResourceImport(self, node):
        self.resources.append({
            "name": node.name
        })

class ProjectAnalyzer:
    """
    Analyzes the Robot Framework project structure to build a context for AI generation.
    Parses .resource and .robot files to extract keywords, variables, and test cases.
    """
    def __init__(self, project_root: Path, cache_dir: Path):
        self.project_root = project_root
        self.cache_dir = cache_dir
        self.context_file = self.cache_dir / "project_context.json"
        self.context = self._load_context()
        self.target_directories: List[Path] = []

    def set_target_directories(self, directories: List[Path]):
        """Sets the specific directories to analyze."""
        self.target_directories = directories

    def _load_context(self) -> Dict:
        """Loads existing context from file if available."""
        if self.context_file.exists():
            try:
                with open(self.context_file, 'r', encoding='utf-8') as f:
                    return json.load(f)
            except Exception:
                return {"files": {}}
        return {"files": {}}

    def _save_context(self):
        """Saves the current context to file."""
        self.cache_dir.mkdir(parents=True, exist_ok=True)
        with open(self.context_file, 'w', encoding='utf-8') as f:
            json.dump(self.context, f, indent=2, ensure_ascii=False)

    def _calculate_file_hash(self, file_path: Path) -> str:
        """Calculates MD5 hash of a file to detect changes."""
        try:
            with open(file_path, 'rb') as f:
                return hashlib.md5(f.read()).hexdigest()
        except Exception:
            return ""

    def analyze_project(self) -> Dict:
        """
        Scans the project and updates the context.
        Returns the full project context.
        """
        if not get_model:
            return {"error": "Robot Framework not installed."}

        # Directories to scan: either explicit target directories or default to project root
        dirs_to_scan = self.target_directories if self.target_directories else [self.project_root]

        for directory in dirs_to_scan:
            if not directory.exists():
                continue
            
            # Walk through the directory
            for root, _, files in os.walk(directory):
                for file in files:
                    if file.endswith(('.resource', '.robot', '.txt')):
                        file_path = Path(root) / file
                        self._analyze_file(file_path, directory)
        
        self._save_context()
        return self.context

    def _analyze_file(self, file_path: Path, scan_root: Path = None):
        """Parses a single file and updates its entry in the context."""
        current_hash = self._calculate_file_hash(file_path)
        
        try:
            # Try relative to project root first
            rel_path = str(file_path.relative_to(self.project_root)).replace("\\", "/")
        except ValueError:
            try:
                # Try relative to the scan root
                if scan_root:
                    rel_path = str(file_path.relative_to(scan_root)).replace("\\", "/")
                else:
                    raise ValueError
            except ValueError:
                # Fallback to absolute path string if all else fails
                rel_path = str(file_path).replace("\\", "/")
        
        # Check if file needs re-analysis
        if rel_path in self.context["files"] and self.context["files"][rel_path].get("hash") == current_hash:
            return

        try:
            model = get_model(file_path)
            visitor = ContextVisitor()
            model.visit(visitor)
            
            file_info = {
                "hash": current_hash,
                "keywords": visitor.keywords,
                "variables": visitor.variables,
                "tests": visitor.tests,
                "libraries": visitor.libraries,
                "resources": visitor.resources
            }
            
            self.context["files"][rel_path] = file_info
            
        except Exception as e:
            print(f"Error analyzing {file_path}: {e}")

    def get_context_summary(self) -> str:
        """Returns a summary string of the project context."""
        file_count = len(self.context.get("files", {}))
        total_keywords = sum(len(f.get("keywords", [])) for f in self.context.get("files", {}).values())
        total_tests = sum(len(f.get("tests", [])) for f in self.context.get("files", {}).values())
        return f"Project Context: {file_count} files, {total_keywords} keywords, {total_tests} tests."
