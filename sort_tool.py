from pathlib import Path
from check_file_permission import check_file_permission

def sort_file(file_path, config, reverse=False):
    if not check_file_permission(file_path, "write", config):
        raise PermissionError(f"Write access denied for {file_path}")
    file_path = Path(file_path).resolve()
    if not file_path.is_file():
        raise ValueError(f"File not found: {file_path}")
    with open(file_path, "r", encoding="utf-8") as f:
        lines = f.readlines()
    lines.sort(reverse=reverse)
    with open(file_path, "w", encoding="utf-8") as f:
        f.writelines(lines)
    return f"Sorted {file_path}"