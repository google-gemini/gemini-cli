from pathlib import Path
from check_file_permission import check_file_permission

def touch_file(file_path, config):
    if not check_file_permission(file_path, "write", config):
        raise PermissionError(f"Write access denied for {file_path}")
    file_path = Path(file_path).resolve()
    file_path.touch()
    return f"Touched {file_path}"