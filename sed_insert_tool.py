from pathlib import Path
from check_file_permission import check_file_permission

def sed_insert(file_path, line_num, content, config):
    if not check_file_permission(file_path, "write", config):
        raise PermissionError(f"Write access denied for {file_path}")
    file_path = Path(file_path).resolve()
    if not file_path.is_file():
        raise ValueError(f"File not found: {file_path}")
    with open(file_path, "r", encoding="utf-8") as f:
        lines = f.readlines()
    lines.insert(line_num - 1, content + "\n")
    with open(file_path, "w", encoding="utf-8") as f:
        f.writelines(lines)
    return f"Inserted line at {line_num} in {file_path}"