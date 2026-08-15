import sys
import json
import os
import re
import argparse
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
    
    if os.path.isdir(norm):
        variables = {}
        keywords = {}
        for root, _, files in os.walk(norm):
            for f in files:
                if f.endswith('.resource') or f.endswith('.robot'):
                    sub_v, sub_k = collect_resources(os.path.join(root, f), visited)
                    variables.update(sub_v)
                    keywords.update(sub_k)
        return variables, keywords

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

def resolve_variables(text, local_vars, global_vars):
    val = str(text)
    for _ in range(3):
        replaced = False
        for var_match in re.findall(r'\$\{([a-zA-Z0-9_]+)\}', val):
            if var_match in local_vars:
                val = val.replace(f"${{{var_match}}}", str(local_vars[var_match]))
                replaced = True
            elif var_match in global_vars:
                val = val.replace(f"${{{var_match}}}", str(global_vars[var_match]))
                replaced = True
        if not replaced:
            break
    return val

def expand_statement(stmt, local_vars, global_vars, keywords_dict, package_name, depth=0):
    if depth > 12:
        return []
    
    cls_name = stmt.__class__.__name__

    # 1. FOR loop AST
    if cls_name == 'For':
        var_list = getattr(stmt, 'assign', getattr(stmt, 'variables', ()))
        var_name = var_list[0] if var_list else '${i}'
        values = [resolve_variables(str(v), local_vars, global_vars) for v in getattr(stmt, 'values', ())]
        flavor = getattr(stmt, 'flavor', 'IN')
        start, end, step = '0', '1', '1'
        if flavor == 'IN RANGE':
            if len(values) == 1:
                start, end, step = '0', values[0], '1'
            elif len(values) == 2:
                start, end, step = values[0], values[1], '1'
            elif len(values) >= 3:
                start, end, step = values[0], values[1], values[2]
        
        for_body = []
        for sub in getattr(stmt, 'body', []):
            for_body.extend(expand_statement(sub, local_vars, global_vars, keywords_dict, package_name, depth + 1))
        
        return [{
            "action": "for_loop",
            "var": str(var_name),
            "start": str(start),
            "end": str(end),
            "step": str(step),
            "body": for_body
        }]

    # 2. IF / ELSE IF / ELSE AST
    if cls_name == 'If':
        branches = []
        curr = stmt
        while curr:
            hdr = getattr(curr, 'header', None)
            b_type = getattr(hdr, 'type', 'IF').upper() if hdr else 'IF'
            raw_cond = getattr(hdr, 'condition', '') if hdr else ''
            if isinstance(raw_cond, (list, tuple)):
                b_cond = ' '.join([resolve_variables(str(c), local_vars, global_vars) for c in raw_cond])
            else:
                b_cond = resolve_variables(str(raw_cond or ''), local_vars, global_vars)
            
            b_body = []
            for bs in getattr(curr, 'body', []):
                b_body.extend(expand_statement(bs, local_vars, global_vars, keywords_dict, package_name, depth + 1))
            
            branches.append({
                "type": b_type,
                "condition": b_cond,
                "body": b_body
            })
            curr = getattr(curr, 'orelse', None)
            
        return [{"action": "if", "branches": branches}]

    # 3. BREAK / CONTINUE AST
    if cls_name == 'Break':
        return [{"action": "break"}]
    if cls_name == 'Continue':
        return [{"action": "continue"}]

    kw_name = getattr(stmt, 'keyword', getattr(stmt, 'name', '')) or ''
    assign = getattr(stmt, 'assign', ()) or ()
    args = getattr(stmt, 'args', ()) or ()
    resolved_args = [resolve_variables(arg, local_vars, global_vars) for arg in args]
    
    norm_name = normalize_kw_name(kw_name)
    low_name = kw_name.lower().strip()
    assign_var = assign[0] if assign else None

    # Control Flow Keywords
    if low_name == 'break':
        return [{"action": "break"}]
    if low_name == 'continue':
        return [{"action": "continue"}]

    # Run Keyword And Return Status
    if low_name == 'run keyword and return status':
        if resolved_args:
            inner_name = resolved_args[0]
            inner_args = resolved_args[1:]
            class MockStmt:
                pass
            mock = MockStmt()
            mock.keyword = inner_name
            mock.name = inner_name
            mock.args = inner_args
            mock.assign = ()
            inner_actions = expand_statement(mock, local_vars, global_vars, keywords_dict, package_name, depth + 1)
            nested = inner_actions[0] if inner_actions else {"action": "sleep", "seconds": 0}
            return [{
                "action": "run_keyword_and_return_status",
                "assign": assign_var or "${status}",
                "nested_action": nested
            }]
        return []

    # Get Element Rect / Location / Size / Text / Attribute
    if low_name in ["get element rect"]:
        target = resolved_args[0] if resolved_args else ""
        return [{"action": "get_element_rect", "target": target, "assign": assign_var or "${rect}"}]

    if low_name in ["get element location"]:
        target = resolved_args[0] if resolved_args else ""
        return [{"action": "get_element_location", "target": target, "assign": assign_var or "${location}"}]

    if low_name in ["get element size"]:
        target = resolved_args[0] if resolved_args else ""
        return [{"action": "get_element_size", "target": target, "assign": assign_var or "${size}"}]

    if low_name in ["get text"]:
        target = resolved_args[0] if resolved_args else ""
        return [{"action": "get_text", "target": target, "assign": assign_var or "${text}"}]

    if low_name in ["get element attribute"]:
        target = resolved_args[0] if resolved_args else ""
        attr = resolved_args[1] if len(resolved_args) > 1 else "content-desc"
        return [{"action": "get_element_attribute", "target": target, "attribute": attr, "assign": assign_var or "${attr}"}]

    # Evaluate
    if low_name in ["evaluate"]:
        expr = resolved_args[0] if resolved_args else ""
        return [{"action": "evaluate", "expression": expr, "assign": assign_var or "${result}"}]

    # Type conversions
    if low_name in ["convert to integer", "convert to int"]:
        val = resolved_args[0] if resolved_args else ""
        return [{"action": "convert_to_integer", "value": val, "assign": assign_var or val}]

    if low_name in ["convert to number", "convert to float"]:
        val = resolved_args[0] if resolved_args else ""
        return [{"action": "convert_to_number", "value": val, "assign": assign_var or val}]

    if low_name in ["convert to string", "convert to text"]:
        val = resolved_args[0] if resolved_args else ""
        return [{"action": "convert_to_string", "value": val, "assign": assign_var or val}]

    if low_name in ["set variable", "set test variable", "set suite variable", "set global variable", "set local variable"]:
        val = resolved_args[0] if resolved_args else ""
        return [{"action": "set_variable", "value": val, "assign": assign_var or "${var}"}]

    if low_name in ["fail"]:
        msg = resolved_args[0] if resolved_args else "Test failed explicitly"
        return [{"action": "fail", "message": msg}]

    # Appium Lifecycle
    if low_name in ["abrir app", "open application", "activate application", "iniciar sessão no appium", "iniciar sessao no appium"]:
        pkg = package_name
        for a in resolved_args:
            if "app_id=" in a:
                pkg = a.replace("app_id=", "").strip()
            elif "com." in a and not a.startswith("http"):
                pkg = a.strip()
        return [{"action": "launch_app", "package": pkg}]

    if low_name in ["fechar app", "terminate application", "close all applications", "close application", "terminar aplicativo", "terminar aplicacao", "quit application"]:
        pkg = package_name
        for a in resolved_args:
            if "app_id=" in a:
                pkg = a.replace("app_id=", "").strip()
            elif "com." in a and not a.startswith("http"):
                pkg = a.strip()
        return [{"action": "close_app", "package": pkg}]

    # Click / Tap
    if low_name in ["click element", "click text", "click button", "tap"]:
        if resolved_args:
            return [{"action": "click", "target": resolved_args[0]}]
        return []

    # Visibility & Assertions
    if low_name in [
        "wait until element is visible", "wait until page contains element",
        "element should be visible", "page should contain element"
    ]:
        target = resolved_args[0] if resolved_args else ""
        timeout = 15
        if len(resolved_args) > 1:
            try:
                timeout = int(re.sub(r'[^0-9]', '', resolved_args[1]))
            except Exception:
                timeout = 15
        return [{"action": "wait_visible", "target": target, "timeout": timeout}]

    if low_name in ["wait until element is not visible", "element should not be visible", "page should not contain element"]:
        target = resolved_args[0] if resolved_args else ""
        timeout = 15
        if len(resolved_args) > 1:
            try:
                timeout = int(re.sub(r'[^0-9]', '', resolved_args[1]))
            except Exception:
                timeout = 15
        return [{"action": "wait_not_visible", "target": target, "timeout": timeout}]

    if low_name in ["wait until page contains", "text should be visible", "page should contain", "element should contain text", "element text should be"]:
        text = resolved_args[0] if resolved_args else ""
        timeout = 15
        if len(resolved_args) > 1:
            try:
                timeout = int(re.sub(r'[^0-9]', '', resolved_args[1]))
            except Exception:
                timeout = 15
        return [{"action": "assert_text", "text": text, "timeout": timeout}]

    if low_name in ["input text", "input value", "input password"]:
        target = resolved_args[0] if len(resolved_args) > 0 else ""
        text = resolved_args[1] if len(resolved_args) > 1 else ""
        return [{"action": "input_text", "target": target, "text": text}]

    if low_name in ["clear text"]:
        target = resolved_args[0] if resolved_args else ""
        return [{"action": "input_text", "target": target, "text": ""}]

    if low_name in ["sleep"]:
        sec = 1.0
        if resolved_args:
            try:
                sec = float(re.sub(r'[^0-9.]', '', resolved_args[0]))
            except Exception:
                sec = 1.0
        return [{"action": "sleep", "seconds": sec}]

    if low_name in ["press keycode"]:
        kc = 4
        if resolved_args:
            try:
                kc = int(resolved_args[0])
            except Exception:
                kc = 4
        return [{"action": "press_key", "keycode": kc}]

    if low_name in ["go back", "voltar"]:
        return [{"action": "press_key", "keycode": 4}]

    if low_name in ["scroll down", "scroll forward", "scroll"]:
        target = resolved_args[0] if resolved_args else ""
        return [{"action": "scroll", "target": target}]

    if low_name in ["scroll up", "scroll backward"]:
        target = resolved_args[0] if resolved_args else ""
        return [{"action": "scroll_up", "target": target}]

    if low_name in ["scroll element into view", "scroll to element", "scroll until element is visible"]:
        target = resolved_args[0] if resolved_args else ""
        container = resolved_args[1] if len(resolved_args) > 1 else ""
        return [{"action": "scroll_to_element", "target": target, "container": container, "max_scrolls": 10}]

    if low_name in ["swipe", "swipe by percent"]:
        swipe_data = {"action": "swipe"}
        pos_keys = ["start_x", "start_y", "offset_x", "offset_y", "duration"]
        for idx, a in enumerate(resolved_args):
            if "=" in a:
                k, v = a.split("=", 1)
                swipe_data[k.strip()] = v.strip()
            elif idx < len(pos_keys):
                swipe_data[pos_keys[idx]] = a.strip()
        return [swipe_data]

    if low_name in ["capture page screenshot", "hide keyboard", "log", "log to console", "comment", "pass execution"]:
        return []

    # If it's a User Defined Keyword in the resources
    target_kw = keywords_dict.get(kw_name) or keywords_dict.get(low_name) or keywords_dict.get(norm_name)
    if target_kw:
        kw_local_vars = dict(local_vars)
        # Parse arguments definition and defaults
        kw_args_info = [] # list of (arg_name, default_value)
        for kw_stmt in getattr(target_kw, 'body', []):
            if kw_stmt.__class__.__name__ == 'Arguments':
                for a in getattr(kw_stmt, 'values', ()):
                    a_str = str(a).strip()
                    if '=' in a_str:
                        raw_k, raw_v = a_str.split('=', 1)
                        clean_k = re.sub(r'[\$\{\}\@\&]', '', raw_k).strip()
                        clean_v = resolve_variables(raw_v.strip(), kw_local_vars, global_vars)
                        kw_args_info.append((clean_k, clean_v))
                    else:
                        clean_k = re.sub(r'[\$\{\}\@\&]', '', a_str).strip()
                        kw_args_info.append((clean_k, None))

        # 1. Apply default values
        for arg_name, def_val in kw_args_info:
            if def_val is not None:
                kw_local_vars[arg_name] = def_val

        # 2. Apply passed positional or named arguments
        pos_idx = 0
        for arg_val in resolved_args:
            arg_str = str(arg_val).strip()
            # Check if it is a named argument e.g. margem=0.05
            if '=' in arg_str and not arg_str.startswith('//') and not arg_str.startswith('xpath=') and not arg_str.startswith('android=') and not arg_str.startswith('id=') and not arg_str.startswith('accessibility_id='):
                k, v = arg_str.split('=', 1)
                clean_k = re.sub(r'[\$\{\}\@\&]', '', k).strip()
                if any(clean_k == name for name, _ in kw_args_info):
                    kw_local_vars[clean_k] = v.strip()
                    continue
            
            # Otherwise, positional argument
            if pos_idx < len(kw_args_info):
                kw_local_vars[kw_args_info[pos_idx][0]] = arg_val
                pos_idx += 1

        kw_actions = []
        for sub_stmt in getattr(target_kw, 'body', []):
            kw_actions.extend(expand_statement(sub_stmt, kw_local_vars, global_vars, keywords_dict, package_name, depth + 1))
        return kw_actions

    return []

    return actions

def parse_args_file(args_file_path, base_dir=None):
    if not os.path.exists(args_file_path):
        return [], {}
    
    if base_dir is None:
        base_dir = os.path.dirname(os.path.abspath(args_file_path))
        
    paths = []
    variables = {}
    
    with open(args_file_path, 'r', encoding='utf-8', errors='ignore') as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith('#'):
                continue
            
            # Sub-argument file
            if line.startswith('-A ') or line.startswith('--argumentfile '):
                parts = line.split(maxsplit=1)
                if len(parts) > 1:
                    sub_path = os.path.normpath(os.path.join(base_dir, parts[1].strip()))
                    sub_paths, sub_vars = parse_args_file(sub_path, os.path.dirname(sub_path))
                    paths.extend(sub_paths)
                    variables.update(sub_vars)
                continue
                
            # Variables
            if line.startswith('-v ') or line.startswith('--variable '):
                parts = line.split(maxsplit=1)
                if len(parts) > 1:
                    var_expr = parts[1].strip()
                    if ':' in var_expr:
                        k, v = var_expr.split(':', 1)
                        variables[k.strip()] = v.strip()
                    elif '=' in var_expr:
                        k, v = var_expr.split('=', 1)
                        variables[k.strip()] = v.strip()
                continue
            
            # Flags to ignore
            if line.startswith('-') or line.startswith('--'):
                continue
            
            # File or directory path
            candidate_path = os.path.normpath(os.path.join(base_dir, line))
            if os.path.exists(candidate_path):
                paths.append(candidate_path)
            elif os.path.exists(line):
                paths.append(os.path.normpath(os.path.abspath(line)))
                
    return paths, variables

def collect_tests_from_suite(suite, parent_setup_actions, parent_teardown_actions, global_vars, keywords_dict, package_name, selected_tests=None):
    tests_payload = []
    
    suite_setup = list(parent_setup_actions)
    if hasattr(suite, 'setup') and suite.setup and suite.setup.name:
        suite_setup = expand_statement(suite.setup, {}, global_vars, keywords_dict, package_name)
        
    suite_teardown = list(parent_teardown_actions)
    if hasattr(suite, 'teardown') and suite.teardown and suite.teardown.name:
        suite_teardown = expand_statement(suite.teardown, {}, global_vars, keywords_dict, package_name)

    # 1. Direct tests in this suite
    for test in getattr(suite, 'tests', []):
        if selected_tests and test.name not in selected_tests:
            continue
            
        test_setup = []
        if hasattr(test, 'setup') and test.setup and test.setup.name:
            test_setup = expand_statement(test.setup, {}, global_vars, keywords_dict, package_name)
        elif suite_setup:
            test_setup = list(suite_setup)
            
        test_teardown = []
        if hasattr(test, 'teardown') and test.teardown and test.teardown.name:
            test_teardown = expand_statement(test.teardown, {}, global_vars, keywords_dict, package_name)
        elif suite_teardown:
            test_teardown = list(suite_teardown)
            
        test_payload = {
            "name": test.name,
            "suite": suite.name,
            "setup": test_setup,
            "steps": [],
            "teardown": test_teardown
        }
        
        for kw in getattr(test, 'body', []):
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
            
        tests_payload.append(test_payload)
        
    # 2. Nested sub-suites (hierarchical suites / directory suites)
    for sub_suite in getattr(suite, 'suites', []):
        sub_tests = collect_tests_from_suite(
            sub_suite,
            suite_setup,
            suite_teardown,
            global_vars,
            keywords_dict,
            package_name,
            selected_tests
        )
        tests_payload.extend(sub_tests)
        
    return tests_payload

def compile_all(paths, cli_vars=None, selected_tests=None):
    if cli_vars is None:
        cli_vars = {}
        
    global_vars = dict(cli_vars)
    keywords_dict = {}
    
    # 1. Collect all resources & variables across all input paths
    for p in paths:
        if os.path.exists(p):
            sub_v, sub_k = collect_resources(p)
            global_vars.update(sub_v)
            keywords_dict.update(sub_k)
            
    # Also collect common workspace resources if present
    common_res_dir = os.path.normpath(os.path.abspath("resources"))
    if os.path.exists(common_res_dir):
        sub_v, sub_k = collect_resources(common_res_dir)
        for k, v in sub_v.items():
            if k not in global_vars:
                global_vars[k] = v
        for k, v in sub_k.items():
            if k not in keywords_dict:
                keywords_dict[k] = v

    # 2. Determine target package
    package_name = "com.positivo.casainteligente"
    for k, v in global_vars.items():
        if "app_id" in k or "com.positivo" in v:
            m = re.search(r'(com\.[a-zA-Z0-9_\.]+)', v)
            if m and "whatsapp" not in m.group(1):
                package_name = m.group(1)
                break
                
    all_tests = []
    primary_suite_name = "RRT Execution"
    
    for p in paths:
        if not os.path.exists(p):
            continue
        try:
            suite = TestSuiteBuilder().build(p)
            if len(paths) == 1:
                primary_suite_name = suite.name
            tests = collect_tests_from_suite(suite, [], [], global_vars, keywords_dict, package_name, selected_tests)
            all_tests.extend(tests)
        except Exception as e:
            sys.stderr.write(f"Warning: Failed to parse suite at {p}: {e}\n")

    payload = {
        "type": "TEST_SUITE",
        "suite_name": primary_suite_name,
        "target_package": package_name,
        "variables": global_vars,
        "tests": all_tests
    }
    
    return json.dumps(payload, indent=2)

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Robot Runner RRT Compiler")
    parser.add_argument("positional_paths", nargs="*", help="Paths to .robot files, directories, or .args/.txt files")
    parser.add_argument("--path", "-p", action="append", default=[], help="Explicit path to file or directory")
    parser.add_argument("--args-file", "-A", action="append", default=[], help="Arguments file (.args or .txt)")
    parser.add_argument("--selected", "-s", action="append", default=[], help="Selected test names")
    parser.add_argument("--variable", "-v", action="append", default=[], help="CLI variable in VAR:VAL format")

    args = parser.parse_args()
    
    raw_paths = list(args.positional_paths) + list(args.path)
    cli_vars = {}
    
    for var_entry in args.variable:
        if ':' in var_entry:
            k, v = var_entry.split(':', 1)
            cli_vars[k.strip()] = v.strip()
        elif '=' in var_entry:
            k, v = var_entry.split('=', 1)
            cli_vars[k.strip()] = v.strip()

    final_paths = []
    
    # Process explicit args files
    for af in args.args_file:
        parsed_paths, parsed_vars = parse_args_file(af)
        final_paths.extend(parsed_paths)
        cli_vars.update(parsed_vars)
        
    # Process raw paths (which could also be .args or .txt)
    for p in raw_paths:
        if p.endswith('.args') or (p.endswith('.txt') and not p.endswith('.robot')):
            parsed_paths, parsed_vars = parse_args_file(p)
            final_paths.extend(parsed_paths)
            cli_vars.update(parsed_vars)
        else:
            final_paths.append(p)
            
    if not final_paths:
        # Default fallback to current dir or tests dir
        if os.path.exists("tests"):
            final_paths.append("tests")
        else:
            final_paths.append(".")
            
    selected = args.selected if args.selected else None
    print(compile_all(final_paths, cli_vars=cli_vars, selected_tests=selected))
