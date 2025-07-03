import re
from pathlib import Path
from check_file_permission import check_file_permission

def sed_delete(file_path, pattern, config):
    if not check_file_permission(file_path, "write", config):
        raise PermissionError(f"Write access denied for {file_path}")
    file_path = Path(file_path).resolve()
    if not file_path.is_file():
        raise ValueError(f"File not found: {file_path}")
    with open(file_path, "r", encoding="utf-8") as f:
        lines = f.readlines()
    new_lines = [line for line in lines if not re.search(pattern, line)]
    with open(file_path, "w", encoding="utf-8") as f:
        f.writelines(new_lines)
    return f"Deleted matching lines in {file_path}"