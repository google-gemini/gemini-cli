import minimatch
from pathlib import Path

def check_file_permission(file_path, operation, config):
    # Ensure file_path is a string for minimatch
    file_path_str = str(file_path)
    rules = config.get("filePermissions", [])
    for rule in rules:
        if minimatch.minimatch(file_path_str, rule["pattern"]):
            if operation in rule["operations"]:
                return rule["effect"] == "allow"
    return False  # Default-deny policy