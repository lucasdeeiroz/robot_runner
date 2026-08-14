import sys
import json
import os
import re
from robot.api import get_model, TestSuiteBuilder
from robot.parsing.model.statements import Variable, ResourceImport
from robot.parsing.model.blocks import Keyword, KeywordSection, VariableSection, SettingSection

def normalize_kw_name(name):
    clean = re.sub(r'^\$\{[a-zA-Z0-9_]+\}\s*', '', name.strip())
    clean = re.sub(r'^(dado que|dado|quando|então|entao|e)\s+', '', clean, flags=re.IGNORECASE)
    return clean.strip().lower()

def collect_resources(file_path, visited=None):
    if visited is None:
        visited = set()
    norm = os.path.normpath(os.path.abspath(file_path))
    if norm in visited or not os.path.exists(norm):
        return {}, {}
    visited.add(norm)
    
    base_dir = os.path.dirname(norm)
    try:
        model = get_model(norm)
    except Exception:
        return {}, {}
    
    variables = {}
    keywords = {}
    
    for section in model.sections:
        if isinstance(section, SettingSection):
            for stmt in section.body:
                if isinstance(stmt, ResourceImport) and stmt.name:
                    res_path = os.path.normpath(os.path.join(base_dir, stmt.name))
                    sub_vars, sub_kws = collect_resources(res_path, visited)
                    variables.update(sub_vars)
                    keywords.update(sub_kws)
        elif isinstance(section, VariableSection):
            for stmt in section.body:
                if isinstance(stmt, Variable) and stmt.name:
                    var_name = stmt.name.replace("${", "").replace("}", "").replace("@{", "").replace("&{", "").strip()
                    val = stmt.value if hasattr(stmt, 'value') and stmt.value else ''
                    if isinstance(val, (list, tuple)):
                        val = ' '.join([str(v) for v in val])
                    variables[var_name] = str(val)
        elif isinstance(section, KeywordSection):
            for kw in section.body:
                if isinstance(kw, Keyword):
                    kw_name = kw.name.strip()
                    keywords[kw_name] = kw
                    keywords[kw_name.lower()] = kw
                    keywords[normalize_kw_name(kw_name)] = kw
                    
    return variables, keywords

def expand_statement(stmt, local_vars, global_vars, keywords_dict, package_name, depth=0):
    if depth > 10:
        return []
    
    kw_name = getattr(stmt, 'keyword', getattr(stmt, 'name', '')) or ''
    args = getattr(stmt, 'args', ()) or ()
    
    resolved_args = []
    for arg in args:
        val = str(arg)
        for var_match in re.findall(r'\$\{([a-zA-Z0-9_]+)\}', val):
            if var_match in local_vars:
                val = val.replace(f"${{{var_match}}}", str(local_vars[var_match]))
            elif var_match in global_vars:
                val = val.replace(f"${{{var_match}}}", str(global_vars[var_match]))
        resolved_args.append(val)
    
    norm_name = normalize_kw_name(kw_name)
    low_name = kw_name.lower().strip()
    
    actions = []
    
    # Check primitive Robot / Appium Library keywords
    if low_name in ["abrir app", "open application", "activate application", "iniciar sessão no appium"]:
        pkg = package_name
        for a in resolved_args:
            if "app_id=" in a:
                pkg = a.replace("app_id=", "").strip()
            elif "com." in a and not a.startswith("http"):
                pkg = a.strip()
        actions.append({"action": "launch_app", "package": pkg})
        return actions

    if low_name in ["fechar app", "terminate application", "close all applications", "close application", "terminar aplicativo", "terminar aplicacao", "quit application"]:
        pkg = package_name
        for a in resolved_args:
            if "app_id=" in a:
                pkg = a.replace("app_id=", "").strip()
            elif "com." in a and not a.startswith("http"):
                pkg = a.strip()
        actions.append({"action": "close_app", "package": pkg})
        return actions

    if low_name in ["click element", "click text", "click button"]:
        if resolved_args:
            actions.append({"action": "click", "target": resolved_args[0]})
        return actions

    if low_name in ["wait until element is visible", "wait until page contains element"]:
        target = resolved_args[0] if resolved_args else ""
        timeout = 15
        if len(resolved_args) > 1:
            try:
                timeout = int(re.sub(r'[^0-9]', '', resolved_args[1]))
            except Exception:
                timeout = 15
        actions.append({"action": "wait_visible", "target": target, "timeout": timeout})
        return actions

    if low_name in ["wait until page contains", "text should be visible", "page should contain", "element should contain text"]:
        text = resolved_args[0] if resolved_args else ""
        timeout = 15
        if len(resolved_args) > 1:
            try:
                timeout = int(re.sub(r'[^0-9]', '', resolved_args[1]))
            except Exception:
                timeout = 15
        actions.append({"action": "assert_text", "text": text, "timeout": timeout})
        return actions

    if low_name in ["input text", "input value"]:
        target = resolved_args[0] if len(resolved_args) > 0 else ""
        text = resolved_args[1] if len(resolved_args) > 1 else ""
        actions.append({"action": "input_text", "target": target, "text": text})
        return actions

    if low_name in ["sleep"]:
        sec = 1.0
        if resolved_args:
            try:
                sec = float(re.sub(r'[^0-9.]', '', resolved_args[0]))
            except Exception:
                sec = 1.0
        actions.append({"action": "sleep", "seconds": sec})
        return actions

    if low_name in ["press keycode"]:
        kc = 4
        if resolved_args:
            try:
                kc = int(resolved_args[0])
            except Exception:
                kc = 4
        actions.append({"action": "press_key", "keycode": kc})
        return actions

    if low_name in ["capture page screenshot", "hide keyboard"]:
        return []

    # If it's a User Defined Keyword in the resources
    target_kw = keywords_dict.get(kw_name) or keywords_dict.get(low_name) or keywords_dict.get(norm_name)
    if target_kw:
        kw_local_vars = dict(local_vars)
        # Parse arguments definition
        kw_arg_names = []
        for kw_stmt in getattr(target_kw, 'body', []):
            if kw_stmt.__class__.__name__ == 'Arguments':
                for a in getattr(kw_stmt, 'values', ()):
                    clean_a = re.sub(r'[\$\{\}\@]|=.*', '', a).strip()
                    if clean_a:
                        kw_arg_names.append(clean_a)
        
        for idx, arg_name in enumerate(kw_arg_names):
            if idx < len(resolved_args):
                kw_local_vars[arg_name] = resolved_args[idx]
        
        for sub_stmt in getattr(target_kw, 'body', []):
            cls_name = sub_stmt.__class__.__name__
            if cls_name in ['KeywordCall', 'Statement', 'If', 'IfHeader']:
                actions.extend(expand_statement(sub_stmt, kw_local_vars, global_vars, keywords_dict, package_name, depth + 1))
            elif cls_name == 'For':
                for for_sub in getattr(sub_stmt, 'body', []):
                    if for_sub.__class__.__name__ in ['KeywordCall', 'Statement']:
                        actions.extend(expand_statement(for_sub, kw_local_vars, global_vars, keywords_dict, package_name, depth + 1))
        return actions

    return actions

def compile_test(robot_file_path):
    norm_path = os.path.normpath(os.path.abspath(robot_file_path))
    suite = TestSuiteBuilder().build(norm_path)
    
    global_vars, keywords_dict = collect_resources(norm_path)
    
    # Try to find target package name
    package_name = "com.positivo.casainteligente"
    for k, v in global_vars.items():
        if "app_id" in k or "com.positivo" in v:
            m = re.search(r'(com\.[a-zA-Z0-9_\.]+)', v)
            if m and "whatsapp" not in m.group(1):
                package_name = m.group(1)
                break
    
    payload = {
        "type": "TEST_SUITE",
        "suite_name": suite.name,
        "target_package": package_name,
        "tests": []
    }
    
    suite_setup_actions = []
    if hasattr(suite, 'setup') and suite.setup and suite.setup.name:
        suite_setup_actions = expand_statement(suite.setup, {}, global_vars, keywords_dict, package_name)
    
    suite_teardown_actions = []
    if hasattr(suite, 'teardown') and suite.teardown and suite.teardown.name:
        suite_teardown_actions = expand_statement(suite.teardown, {}, global_vars, keywords_dict, package_name)
        
    for test in suite.tests:
        test_setup = []
        if hasattr(test, 'setup') and test.setup and test.setup.name:
            test_setup = expand_statement(test.setup, {}, global_vars, keywords_dict, package_name)
        elif suite_setup_actions:
            test_setup = list(suite_setup_actions)
            
        test_teardown = []
        if hasattr(test, 'teardown') and test.teardown and test.teardown.name:
            test_teardown = expand_statement(test.teardown, {}, global_vars, keywords_dict, package_name)
        elif suite_teardown_actions:
            test_teardown = list(suite_teardown_actions)
            
        test_payload = {
            "name": test.name,
            "setup": test_setup,
            "steps": [],
            "teardown": test_teardown
        }
        
        for kw in test.body:
            kw_name = getattr(kw, 'name', '') or ''
            args = list(getattr(kw, 'args', ())) if hasattr(kw, 'args') else []
            
            resolved_args = []
            for arg in args:
                val = str(arg)
                for var_match in re.findall(r'\$\{([a-zA-Z0-9_]+)\}', val):
                    if var_match in global_vars:
                        val = val.replace(f"${{{var_match}}}", global_vars[var_match])
                resolved_args.append(val)
            
            actions = expand_statement(kw, {}, global_vars, keywords_dict, package_name)
            
            test_payload["steps"].append({
                "keyword": kw_name,
                "args": resolved_args,
                "actions": actions
            })
        
        payload["tests"].append(test_payload)
        
    return json.dumps(payload, indent=2)

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({"error": "No robot file path provided"}))
        sys.exit(1)
        
    print(compile_test(sys.argv[1]))
