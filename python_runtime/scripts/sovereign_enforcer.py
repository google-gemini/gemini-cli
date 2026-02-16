import ast
import os
import sys

def normalize(p):
    return p.replace("\\", "/")

def is_under(filename, fragment):
    return fragment in normalize(filename)

class SovereignEnforcer(ast.NodeVisitor):
    def __init__(self, filename):
        self.filename = normalize(filename)
        self.errors = []

    def visit_Import(self, node):
        self.check_imports(node)
        self.generic_visit(node)

    def visit_ImportFrom(self, node):
        self.check_imports(node)
        # RULE 1: Block access to the raw nervous system
        if node.module and "_raw" in node.module:
            is_wrapper_file = is_under(self.filename, "/src/tools/") and not is_under(self.filename, "/src/tools/_raw/")
            if not is_wrapper_file:
                self.errors.append(f"{self.filename}:{node.lineno} SOVEREIGNTY VIOLATION: Direct access to raw tools is forbidden (Rule 1).")
        self.generic_visit(node)

    def check_imports(self, node):
        # Identify imported modules
        modules = []
        if isinstance(node, ast.Import):
            modules = [n.name for n in node.names]
        elif isinstance(node, ast.ImportFrom):
            if node.module:
                modules = [node.module]

        # Sensitive Modules (The "Hand" Tools)
        SENSITIVE_MODULES = {'os', 'subprocess', 'socket', 'sys'}

        # Contexts
        is_raw_dir = is_under(self.filename, "/src/tools/_raw/")
        is_public_tools_dir = is_under(self.filename, "/src/tools/") and not is_raw_dir
        is_interface = self.filename.endswith("/src/main.py")

        for module in modules:
            base_module = module.split('.')[0]

            # RULE 3: Import Guardian - Block sensitive modules in Public Tools (The Conscience)
            if is_public_tools_dir:
                if base_module in SENSITIVE_MODULES:
                    self.errors.append(f"{self.filename}:{node.lineno} SOVEREIGNTY VIOLATION: Public tools cannot import sensitive module '{base_module}'. Use the Raw layer (Rule 3).")

            # RULE 4: Raw Layer Restrictions
            if is_raw_dir:
                if base_module == 'subprocess':
                    self.errors.append(f"{self.filename}:{node.lineno} SOVEREIGNTY WARNING: Raw tool imports 'subprocess'. Manual review required (Rule 4).")

            # RULE 5: Interface Restrictions
            if is_interface:
                if "_raw" in module:
                     self.errors.append(f"{self.filename}:{node.lineno} SOVEREIGNTY VIOLATION: Interface cannot import from '_raw' directly (Rule 5).")


    def visit_Assign(self, node):
        # RULE 2: Mandate the Kernel Gate
        if not is_under(self.filename, "/src/tools/") or is_under(self.filename, "/src/tools/_raw/"):
            return

        if isinstance(node.value, ast.Call):
            func_name = ""
            if isinstance(node.value.func, ast.Name):
                func_name = node.value.func.id

            if func_name == "with_sovereign_gate":
                return # Safe

        # Heuristic check: if we are exporting a function (assigning to variable), it should likely be wrapped.
        # This is a loose check for the prototype.

def run_enforcer(target_dir):
    all_errors = []
    for root, _, files in os.walk(target_dir):
        for file in files:
            if file.endswith(".py"):
                path = os.path.join(root, file)
                with open(path, "r", encoding="utf-8") as f:
                    try:
                        tree = ast.parse(f.read(), filename=path)
                        enforcer = SovereignEnforcer(path)
                        enforcer.visit(tree)
                        all_errors.extend(enforcer.errors)
                    except SyntaxError as e:
                        all_errors.append(f"{path}: SyntaxError - {e}")

    if all_errors:
        print("SOVEREIGNTY VIOLATIONS DETECTED:")
        for err in all_errors:
            print(err)
        sys.exit(1)
    else:
        print("Sovereignty Check Passed.")

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: sovereign_enforcer.py <directory>")
        sys.exit(1)
    run_enforcer(sys.argv[1])
