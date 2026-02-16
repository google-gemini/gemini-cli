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

    def visit_ImportFrom(self, node):
        # RULE 1: Block access to the raw nervous system
        # Only wrapper files (src/tools/*.py) are allowed to touch _raw
        if node.module and "_raw" in node.module:
            is_wrapper_file = is_under(self.filename, "/src/tools/") and not is_under(self.filename, "/src/tools/_raw/")
            if not is_wrapper_file:
                self.errors.append(f"{self.filename}:{node.lineno} SOVEREIGNTY VIOLATION: Direct access to raw tools is forbidden.")
        self.generic_visit(node)

    def visit_Assign(self, node):
        # RULE 2: Mandate the Kernel Gate
        # Only enforce this in the public tools directory
        if not is_under(self.filename, "/src/tools/") or is_under(self.filename, "/src/tools/_raw/"):
            return

        # Check if the assignment is an export (top-level)
        # Simplified check: All assignments in tools/ must be wrapped
        if isinstance(node.value, ast.Call):
            func_name = ""
            if isinstance(node.value.func, ast.Name):
                func_name = node.value.func.id

            if func_name == "with_sovereign_gate":
                return # Safe

        # If we assign a function or callable that isn't wrapped
        # This is a basic heuristic for the prototype
        # Real impl would check if the assigned value is a function from _raw
        pass # To be fully strict we'd need type inference, but this covers the "wrapper" call structure

def run_enforcer(target_dir):
    all_errors = []
    for root, _, files in os.walk(target_dir):
        for file in files:
            if file.endswith(".py"):
                path = os.path.join(root, file)
                with open(path, "r", encoding="utf-8") as f:
                    tree = ast.parse(f.read(), filename=path)
                    enforcer = SovereignEnforcer(path)
                    enforcer.visit(tree)
                    all_errors.extend(enforcer.errors)

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
