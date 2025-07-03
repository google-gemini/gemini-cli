from pathlib import Path
from check_file_permission import check_file_permission

def rm_file(file_path, config):
    if not check_file_permission(file_path, "write", config):
        raise PermissionError(f"Write access denied for {file_path}")
    file_path = Path(file_path).resolve()
    if not file_path.is_file():
        raise ValueError(f"File not found: {file_path}")
    file_path.unlink()
    return f"Removed {file_path}"