from pathlib import Path
from check_file_permission import check_file_permission

def cat_numbered(file_path, config):
    if not check_file_permission(file_path, "read", config):
        raise PermissionError(f"Read access denied for {file_path}")
    file_path = Path(file_path).resolve()
    if not file_path.is_file():
        raise ValueError(f"File not found: {file_path}")
    with open(file_path, "r", encoding="utf-8") as f:
        return "\n".join(f"{i}: {line.rstrip()}" for i, line in enumerate(f, 1))