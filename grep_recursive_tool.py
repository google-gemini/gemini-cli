import re
from pathlib import Path
from check_file_permission import check_file_permission

def grep_recursive(dir_path, pattern, config, regex=False):
    if not check_file_permission(dir_path, "read", config):
        raise PermissionError(f"Read access denied for {dir_path}")
    dir_path = Path(dir_path).resolve()
    result = []
    for file_path in dir_path.rglob("*"):
        if file_path.is_file() and check_file_permission(str(file_path), "read", config):
            with open(file_path, "r", encoding="utf-8") as f:
                for i, line in enumerate(f, 1):
                    if regex and re.search(pattern, line):
                        result.append(f"{file_path}:{i}:{line.rstrip()}")
                    elif pattern in line:
                        result.append(f"{file_path}:{i}:{line.rstrip()}")
    return "\n".join(result) if result else "No matches found"