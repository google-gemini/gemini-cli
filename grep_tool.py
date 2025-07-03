import re
from pathlib import Path
from check_file_permission import check_file_permission

def grep_files(file_path, pattern, config, regex=False):
    if not check_file_permission(file_path, "read", config):
        raise PermissionError(f"Read access denied for {file_path}")
    file_path = Path(file_path).resolve()
    if not file_path.is_file():
        raise ValueError(f"File not found: {file_path}")
    result = []
    with open(file_path, "r", encoding="utf-8") as f:
        for i, line in enumerate(f, 1):
            if regex and re.search(pattern, line):
                result.append(f"{file_path}:{i}:{line.rstrip()}")
            elif pattern in line:
                result.append(f"{file_path}:{i}:{line.rstrip()}")
    return "\n".join(result) if result else "No matches found"