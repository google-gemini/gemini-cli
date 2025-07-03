from pathlib import Path
from check_file_permission import check_file_permission

def rmdir_dir(dir_path, config):
    if not check_file_permission(dir_path, "write", config):
        raise PermissionError(f"Write access denied for {dir_path}")
    dir_path = Path(dir_path).resolve()
    if not dir_path.is_dir():
        raise ValueError(f"Directory not found: {dir_path}")
    dir_path.rmdir()
    return f"Removed directory {dir_path}"