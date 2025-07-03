from pathlib import Path
from check_file_permission import check_file_permission

def uniq_file(file_path, config):
    if not check_file_permission(file_path, "write", config):
        raise PermissionError(f"Write access denied for {file_path}")
    file_path = Path(file_path).resolve()
    if not file_path.is_file():
        raise ValueError(f"File not found: {file_path}")
    with open(file_path, "r", encoding="utf-8") as f:
        lines = f.readlines()
    unique_lines = list(dict.fromkeys(lines))
    with open(file_path, "w", encoding="utf-8") as f:
        f.writelines(unique_lines)
    return f"Removed duplicates from {file_path}"